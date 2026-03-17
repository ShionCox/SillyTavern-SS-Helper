import { db, type DBWorldState } from '../db/db';
import type { StructuredWorldStateEntry, WorldStateGroupingResult, WorldStateNodeValue, WorldStateScopeType, WorldStateType } from '../types';

function normalizeStateText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inferWorldStateScopeType(path: string, text: string): WorldStateScopeType {
    const normalizedPath = normalizeStateText(path).toLowerCase();
    const normalizedText = normalizeStateText(text).toLowerCase();
    if (/^global\//.test(normalizedPath) || /global|world\//.test(normalizedPath)) return 'global';
    if (/^region\//.test(normalizedPath) || /region|区域/.test(normalizedText)) return 'region';
    if (/^city\//.test(normalizedPath) || /city|城市/.test(normalizedText)) return 'city';
    if (/^location\//.test(normalizedPath) || /location|地点|场所/.test(normalizedText)) return 'location';
    if (/^faction\//.test(normalizedPath) || /faction|派系|阵营|组织/.test(normalizedText)) return 'faction';
    if (/^item\//.test(normalizedPath) || /item|物品|装备|道具|遗物/.test(normalizedText)) return 'item';
    if (/^character\//.test(normalizedPath) || /character|角色|人物/.test(normalizedText)) return 'character';
    return 'scene';
}

function inferWorldStateType(path: string, text: string): WorldStateType {
    const normalizedPath = normalizeStateText(path).toLowerCase();
    const normalizedText = normalizeStateText(text).toLowerCase();
    if (/rule|规则|law|法则/.test(normalizedPath + ' ' + normalizedText)) return 'rule';
    if (/constraint|限制|禁忌|不能|不可/.test(normalizedPath + ' ' + normalizedText)) return 'constraint';
    if (/history|历史|往事|起源/.test(normalizedPath + ' ' + normalizedText)) return 'history';
    if (/capability|能力|技能|效果/.test(normalizedPath + ' ' + normalizedText)) return 'capability';
    if (/ownership|归属|拥有|持有/.test(normalizedPath + ' ' + normalizedText)) return 'ownership';
    if (/culture|文化|习俗|风俗/.test(normalizedPath + ' ' + normalizedText)) return 'culture';
    if (/danger|危险|风险|威胁/.test(normalizedPath + ' ' + normalizedText)) return 'danger';
    if (/relationship|关系|牵连|钩子/.test(normalizedPath + ' ' + normalizedText)) return 'relationship_hook';
    return 'status';
}

function extractWorldStateKeywords(path: string, text: string, value: unknown): string[] {
    const source = `${normalizeStateText(path)} ${normalizeStateText(text)} ${typeof value === 'string' ? value : JSON.stringify(value ?? '')}`.toLowerCase();
    return Array.from(new Set(source.split(/[^a-z0-9\u4e00-\u9fa5]+/).map((item: string): string => item.trim()).filter((item: string): boolean => item.length >= 2))).slice(0, 16);
}

function buildWorldStateNodeValue(record: DBWorldState): WorldStateNodeValue {
    const rawValue = record.value as Record<string, unknown> | string | number | boolean | null | undefined;
    const rawObject = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue as Record<string, unknown>
        : null;
    const rawText = typeof rawValue === 'string'
        ? rawValue
        : rawObject
            ? JSON.stringify(rawObject)
            : String(rawValue ?? '');
    const scopeType = (rawObject?.scopeType as WorldStateScopeType | undefined) ?? inferWorldStateScopeType(record.path, rawText);
    const stateType = (rawObject?.stateType as WorldStateType | undefined) ?? inferWorldStateType(record.path, rawText);
    const keywords = Array.isArray(rawObject?.keywords)
        ? rawObject!.keywords.map((item: unknown): string => normalizeStateText(item)).filter(Boolean).slice(0, 16)
        : extractWorldStateKeywords(record.path, rawText, rawValue);
    const tags = Array.isArray(rawObject?.tags)
        ? rawObject!.tags.map((item: unknown): string => normalizeStateText(item)).filter(Boolean).slice(0, 16)
        : record.path.split('/').map((item: string): string => normalizeStateText(item)).filter(Boolean).slice(0, 8);
    const title = normalizeStateText(rawObject?.title) || record.path.split('/').filter(Boolean).slice(-1)[0] || '未命名状态';
    const summary = normalizeStateText(rawObject?.summary)
        || (typeof rawValue === 'string' ? normalizeStateText(rawValue) : normalizeStateText(JSON.stringify(rawValue ?? '')))
        || '暂无说明';
    return {
        title,
        summary,
        scopeType,
        stateType,
        subjectId: normalizeStateText(rawObject?.subjectId) || undefined,
        regionId: normalizeStateText(rawObject?.regionId) || undefined,
        cityId: normalizeStateText(rawObject?.cityId) || undefined,
        locationId: normalizeStateText(rawObject?.locationId) || undefined,
        itemId: normalizeStateText(rawObject?.itemId) || undefined,
        keywords,
        tags,
        confidence: Number(rawObject?.confidence ?? 0) || undefined,
        sourceRefs: Array.isArray(rawObject?.sourceRefs) ? rawObject!.sourceRefs.map((item: unknown): string => normalizeStateText(item)).filter(Boolean).slice(0, 24) : undefined,
        updatedAt: Math.max(0, Number(rawObject?.updatedAt ?? record.updatedAt ?? 0) || 0),
    };
}

/**
 * 世界状态管理器 —— 物化视图层
 * world_state 可以由 facts/events 重建，这里是快速缓存视图
 */
export class StateManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 构造 stateKey
     */
    private buildStateKey(path: string): string {
        return `${this.chatKey}::${path}`;
    }

    /**
     * 读取指定路径的世界状态
     */
    async get(path: string): Promise<any | null> {
        const stateKey = this.buildStateKey(path);
        const record = await db.world_state.get(stateKey);
        return record?.value ?? null;
    }

    /**
     * 写入/覆盖指定路径的世界状态
     */
    async set(path: string, value: any, meta?: { sourceEventId?: string }): Promise<void> {
        const stateKey = this.buildStateKey(path);
        const record: DBWorldState = {
            stateKey,
            chatKey: this.chatKey,
            path,
            value,
            sourceEventId: meta?.sourceEventId,
            updatedAt: Date.now(),
        };
        await db.world_state.put(record);
    }

    /**
     * 批量 JSON Patch 式更新
     */
    async patch(
        patches: Array<{ op: "add" | "replace" | "remove"; path: string; value?: any }>,
        meta?: any
    ): Promise<void> {
        await db.transaction('rw', db.world_state, async () => {
            for (const p of patches) {
                if (p.op === 'remove') {
                    await db.world_state.delete(this.buildStateKey(p.path));
                } else {
                    // add 和 replace 均为 put
                    await this.set(p.path, p.value, meta);
                }
            }
        });
    }

    /**
     * 按 path 前缀查询（取某实体树）
     */
    async query(prefix: string): Promise<Record<string, any>> {
        const records = await db.world_state
            .where('[chatKey+path]')
            .between(
                [this.chatKey, prefix],
                [this.chatKey, prefix + '\uffff']
            )
            .toArray();

        const result: Record<string, any> = {};
        for (const r of records) {
            result[r.path] = r.value;
        }
        return result;
    }

    async queryStructured(prefix: string = ''): Promise<StructuredWorldStateEntry[]> {
        const records = await db.world_state
            .where('[chatKey+path]')
            .between(
                [this.chatKey, prefix],
                [this.chatKey, prefix + '\uffff']
            )
            .toArray();

        return records.map((record: DBWorldState): StructuredWorldStateEntry => ({
            stateKey: record.stateKey,
            path: record.path,
            rawValue: record.value,
            node: buildWorldStateNodeValue(record),
            sourceEventId: record.sourceEventId,
            updatedAt: Math.max(0, Number(record.updatedAt ?? 0) || 0),
        }));
    }

    async queryGrouped(prefix: string = ''): Promise<WorldStateGroupingResult> {
        const structured = await this.queryStructured(prefix);
        return structured.reduce<WorldStateGroupingResult>((result: WorldStateGroupingResult, entry: StructuredWorldStateEntry): WorldStateGroupingResult => {
            const scopeKey = normalizeStateText(entry.node.scopeType) || 'scene';
            const typeKey = normalizeStateText(entry.node.stateType) || 'status';
            result[scopeKey] = result[scopeKey] ?? {};
            result[scopeKey][typeKey] = result[scopeKey][typeKey] ?? [];
            result[scopeKey][typeKey].push(entry);
            return result;
        }, {});
    }
}
