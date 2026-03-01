import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';

/**
 * 注入管理器 —— 负责拼装 Prompt 上下文
 * buildContext 将从 events/facts/state/summaries 中按策略提取并拼接
 */
export class InjectionManager {
    private chatKey: string;
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private stateManager: StateManager;
    private summariesManager: SummariesManager;

    private anchorPolicy: {
        allowSystem: boolean;
        allowUser: boolean;
        defaultInsert: "top" | "beforeStart" | "customAnchor";
    } = {
            allowSystem: false,
            allowUser: true,
            defaultInsert: 'top',
        };

    constructor(
        chatKey: string,
        eventsManager: EventsManager,
        factsManager: FactsManager,
        stateManager: StateManager,
        summariesManager: SummariesManager
    ) {
        this.chatKey = chatKey;
        this.eventsManager = eventsManager;
        this.factsManager = factsManager;
        this.stateManager = stateManager;
        this.summariesManager = summariesManager;
    }

    /**
     * 构造供 Prompt 使用的上下文文本
     */
    async buildContext(opts?: {
        maxTokens?: number;
        sections?: Array<"WORLD_STATE" | "FACTS" | "EVENTS" | "SUMMARY">;
    }): Promise<string> {
        const sections = opts?.sections ?? ["WORLD_STATE", "FACTS", "EVENTS", "SUMMARY"];
        const parts: string[] = [];

        for (const section of sections) {
            switch (section) {
                case 'WORLD_STATE':
                    parts.push(await this.buildWorldStateSection());
                    break;
                case 'FACTS':
                    parts.push(await this.buildFactsSection());
                    break;
                case 'EVENTS':
                    parts.push(await this.buildEventsSection());
                    break;
                case 'SUMMARY':
                    parts.push(await this.buildSummarySection());
                    break;
            }
        }

        let result = parts.filter(Boolean).join('\n\n');

        // 简易的 token 限制（粗估 1 字符 ≈ 1 token，实际应接入 tokenizer）
        if (opts?.maxTokens && result.length > opts.maxTokens) {
            result = result.slice(0, opts.maxTokens) + '\n...（已截断）';
        }

        return result;
    }

    /**
     * 设置注入锚点策略
     */
    async setAnchorPolicy(opts: {
        allowSystem?: boolean;
        allowUser?: boolean;
        defaultInsert?: "top" | "beforeStart" | "customAnchor";
    }): Promise<void> {
        if (opts.allowSystem !== undefined) this.anchorPolicy.allowSystem = opts.allowSystem;
        if (opts.allowUser !== undefined) this.anchorPolicy.allowUser = opts.allowUser;
        if (opts.defaultInsert !== undefined) this.anchorPolicy.defaultInsert = opts.defaultInsert;
    }

    /**
     * 获取当前锚点策略（供外部使用）
     */
    getAnchorPolicy() {
        return { ...this.anchorPolicy };
    }

    // --- 各区段拼装逻辑 ---

    private async buildWorldStateSection(): Promise<string> {
        const states = await this.stateManager.query('');
        if (!Object.keys(states).length) return '';

        const lines = Object.entries(states).map(([path, value]) => {
            return `- ${path}: ${typeof value === 'object' ? JSON.stringify(value) : value}`;
        });
        return `【世界状态】\n${lines.join('\n')}`;
    }

    private async buildFactsSection(): Promise<string> {
        const facts = await this.factsManager.query({ limit: 30 });
        if (!facts.length) return '';

        const lines = facts.map(f => {
            const entityStr = f.entity ? `[${f.entity.kind}:${f.entity.id}]` : '';
            return `- ${entityStr} ${f.type}${f.path ? '.' + f.path : ''}: ${typeof f.value === 'object' ? JSON.stringify(f.value) : f.value}`;
        });
        return `【已知事实】\n${lines.join('\n')}`;
    }

    private async buildEventsSection(): Promise<string> {
        const events = await this.eventsManager.query({ limit: 12 });
        if (!events.length) return '';

        const lines = events.map(e => {
            const time = new Date(e.ts).toLocaleTimeString();
            return `- [${time}] ${e.type}: ${typeof e.payload === 'object' ? JSON.stringify(e.payload) : e.payload}`;
        });
        return `【最近事件】\n${lines.join('\n')}`;
    }

    private async buildSummarySection(): Promise<string> {
        const summaries = await this.summariesManager.query({ limit: 5 });
        if (!summaries.length) return '';

        const lines = summaries.map(s => {
            const title = s.title ? `「${s.title}」` : '';
            return `- ${title}${s.content}`;
        });
        return `【摘要】\n${lines.join('\n')}`;
    }
}
