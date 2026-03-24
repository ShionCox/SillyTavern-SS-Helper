import { db, type DBEvent } from '../db/db';
import { ProposalManager } from '../proposal/proposal-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { advanceMemoryTraceContext, createMemoryTraceContext } from './memory-trace';

/**
 * Compaction 管理器 —— 解决事件流越用越大的问题
 *
 * 功能：
 * 1. 事件流压缩：将旧事件聚合为 scene summary
 * 2. 软归档：标记已摘要覆盖的事件为 archived
 * 3. 事件回放：从事件流重建 world_state（RULE 模式核心能力）
 */
export class CompactionManager {
    private chatKey: string;
    private proposalManager: ProposalManager;

    /** 默认触发阈值（可通过 setThresholds 覆盖） */
    private eventThreshold = 5000;
    private timeThresholdMs = 7 * 24 * 60 * 60 * 1000; // 7 天

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        this.proposalManager = new ProposalManager(chatKey);
    }

    /**
     * 动态设置压缩阈值（从设置页读取后传入）
     */
    /**
     * 检查是否需要执行压缩
     */
    async needsCompaction(): Promise<{ needed: boolean; reason?: string; eventCount?: number }> {
        const count = await db.events.where('[chatKey+ts]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .count();

        if (count >= this.eventThreshold) {
            return { needed: true, reason: `事件数量达到阈值 (${count}/${this.eventThreshold})`, eventCount: count };
        }

        // 检查上次压缩时间
        const meta = await db.meta.get(this.chatKey);
        if (meta?.lastCompactionTs) {
            const elapsed = Date.now() - meta.lastCompactionTs;
            if (elapsed >= this.timeThresholdMs && count > 100) {
                return { needed: true, reason: `距上次压缩已超过 ${Math.floor(elapsed / 86400000)} 天`, eventCount: count };
            }
        }

        return { needed: false, eventCount: count };
    }

    /**
     * 执行 RULE 模式下的事件压缩（无 AI）
     * 将一段事件窗口聚合为 scene summary
     */
    async compactRuleMode(opts?: {
        windowSize?: number;
        archiveProcessed?: boolean;
    }): Promise<{ summariesCreated: number; eventsArchived: number }> {
        const windowSize = opts?.windowSize ?? 1000;
        const archiveProcessed = opts?.archiveProcessed ?? true;
        const trace = createMemoryTraceContext({
            chatKey: this.chatKey,
            source: 'maintenance',
            stage: 'memory_maintenance_started',
            requestId: 'compaction.rule_summary',
        });

        // 取最旧的 N 条非归档事件（排除已归档事件）
        const events = await db.events
            .where('[chatKey+ts]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .filter((e: DBEvent) => !e.tags?.includes('__archived'))
            .limit(windowSize)
            .toArray();

        if (events.length === 0) {
            return { summariesCreated: 0, eventsArchived: 0 };
        }

        // 按类型分组聚合
        const groups = this.groupByType(events);
        let summariesCreated = 0;

        for (const [type, groupEvents] of groups) {
            if (groupEvents.length < 3) continue; // 太少不压缩

            const content = this.buildRuleSummary(type, groupEvents);
            const firstEvent = groupEvents[0]!;
            const lastEvent = groupEvents[groupEvents.length - 1]!;

            const summaryId = this.buildRuleSummaryId(type, groupEvents);
            await this.proposalManager.processWriteRequest({
                source: {
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    version: '1.0.0',
                },
                chatKey: this.chatKey,
                reason: 'compaction.rule_summary',
                trace: advanceMemoryTraceContext(trace, 'memory_maintenance_started', 'maintenance'),
                proposal: {
                    summaries: [{
                        summaryId,
                        targetRecordKey: summaryId,
                        action: 'auto',
                        level: 'scene',
                        title: `${type} 事件聚合 (${groupEvents.length} 条)`,
                        content,
                        keywords: [type, ...this.extractKeywords(groupEvents)],
                        range: {
                            fromMessageId: firstEvent.refs?.messageId,
                            toMessageId: lastEvent.refs?.messageId,
                        },
                        source: { extractor: 'rule' },
                    }],
                },
            });
            summariesCreated++;
        }

        // 软归档已处理的事件
        let eventsArchived = 0;
        if (archiveProcessed) {
            await db.transaction('rw', db.events, async () => {
                for (const event of events) {
                    await db.events.update(event.eventId, {
                        tags: [...(event.tags || []), '__archived'],
                    });
                    eventsArchived++;
                }
            });
        }

        // 更新 meta
        await db.meta.update(this.chatKey, { lastCompactionTs: Date.now() });

        return { summariesCreated, eventsArchived };
    }

    /**
     * RULE 模式核心：从事件流回放重建 world_state
     * 遍历所有事件，按规则累积状态
     */
    async replayToState(opts?: {
        sinceTs?: number;
        rules?: Map<string, (state: Record<string, any>, event: DBEvent) => void>;
    }): Promise<{ statesUpdated: number }> {
        const events = await db.events
            .where('[chatKey+ts]')
            .between([this.chatKey, opts?.sinceTs ?? 0], [this.chatKey, Infinity])
            .toArray();

        // 从空状态开始重建，避免在现有 world_state 上叠加
        const currentState: Record<string, any> = {};
        let statesUpdated = 0;
        const trace = createMemoryTraceContext({
            chatKey: this.chatKey,
            source: 'maintenance',
            stage: 'memory_maintenance_started',
            requestId: 'compaction.replay_to_state',
        });

        // 内置的默认规则集
        const defaultRules = new Map<string, (state: Record<string, any>, event: DBEvent) => void>();

        // 骰子事件 → 记录最新骰子结果
        defaultRules.set('dice.roll', (state, event) => {
            state['lastDice'] = event.payload;
            state[`dice.history.${event.eventId}`] = {
                value: event.payload,
                ts: event.ts,
            };
        });

        // 战斗事件 → 记录伤害/状态
        defaultRules.set('combat.damage', (state, event) => {
            const target = event.payload?.target;
            if (target) {
                const hpPath = `char.${target}.hp`;
                const currentHp = state[hpPath] ?? 100;
                state[hpPath] = currentHp - (event.payload?.amount ?? 0);
            }
        });

        // 移动事件
        defaultRules.set('world.move', (state, event) => {
            const entity = event.payload?.entity;
            const location = event.payload?.to;
            if (entity && location) {
                state[`char.${entity}.location`] = location;
            }
        });

        // 合并外部自定义规则
        const rules = opts?.rules ?? defaultRules;
        if (opts?.rules) {
            for (const [key, rule] of defaultRules) {
                if (!rules.has(key)) rules.set(key, rule);
            }
        }

        // 执行回放
        for (const event of events) {
            const rule = rules.get(event.type);
            if (rule) {
                rule(currentState, event);
            }
        }

        // 将回放结果写入 world_state
        const patches = Object.entries(currentState).map(([path, value]) => ({
            op: 'replace' as const,
            path,
            value,
        }));
        if (patches.length > 0) {
            await this.proposalManager.processWriteRequest({
                source: {
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    version: '1.0.0',
                },
                chatKey: this.chatKey,
                reason: 'compaction.replay_to_state',
                trace: advanceMemoryTraceContext(trace, 'memory_maintenance_started', 'maintenance'),
                proposal: { patches },
            });
            statesUpdated = patches.length;
        }

        return { statesUpdated };
    }

    // --- 内部工具方法 ---

    private groupByType(events: DBEvent[]): Map<string, DBEvent[]> {
        const groups = new Map<string, DBEvent[]>();
        for (const event of events) {
            const list = groups.get(event.type) || [];
            list.push(event);
            groups.set(event.type, list);
        }
        return groups;
    }

    private buildRuleSummary(type: string, events: DBEvent[]): string {
        const first = events[0]!;
        const last = events[events.length - 1]!;
        const startTime = new Date(first.ts).toLocaleString();
        const endTime = new Date(last.ts).toLocaleString();

        const payloadSamples = events.slice(0, 5).map(e => {
            return typeof e.payload === 'object' ? JSON.stringify(e.payload) : String(e.payload);
        });

        return `[${type}] 共 ${events.length} 条事件 (${startTime} ~ ${endTime})\n` +
            `来源: ${first.source.pluginId}\n` +
            `示例: ${payloadSamples.join(' | ')}`;
    }

    private extractKeywords(events: DBEvent[]): string[] {
        const keywords = new Set<string>();
        for (const e of events) {
            if (e.tags) e.tags.forEach(t => keywords.add(t));
            if (e.source?.pluginId) keywords.add(e.source.pluginId);
        }
        return Array.from(keywords).slice(0, 10);
    }

    /**
     * 功能：为压缩生成稳定摘要 ID。
     * @param type 事件类型。
     * @param events 事件分组。
     * @returns 稳定摘要 ID。
     */
    private buildRuleSummaryId(type: string, events: DBEvent[]): string {
        const first = events[0]!;
        const last = events[events.length - 1]!;
        const payload = [
            this.chatKey,
            String(type ?? '').trim(),
            String(first.refs?.messageId ?? '').trim(),
            String(last.refs?.messageId ?? '').trim(),
            String(events.length),
        ].join('::');
        let hash = 5381;
        for (let index = 0; index < payload.length; index += 1) {
            hash = ((hash << 5) + hash) ^ payload.charCodeAt(index);
        }
        return `managed:compaction:${(hash >>> 0).toString(16)}`;
    }
}
