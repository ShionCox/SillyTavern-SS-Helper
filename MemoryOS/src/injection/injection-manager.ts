import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';

type SectionName = 'WORLD_STATE' | 'FACTS' | 'EVENTS' | 'SUMMARY';

type BuildContextOptions = {
    maxTokens?: number;
    sections?: SectionName[];
    query?: string;
    sectionBudgets?: Partial<Record<SectionName, number>>;
    preferSummary?: boolean;
};

type AnchorPolicy = {
    allowSystem: boolean;
    allowUser: boolean;
    defaultInsert: 'top' | 'beforeStart' | 'customAnchor';
};

/**
 * 功能：注入管理器，按预算构建 Prompt 上下文。
 */
export class InjectionManager {
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private stateManager: StateManager;
    private summariesManager: SummariesManager;
    private anchorPolicy: AnchorPolicy = {
        allowSystem: false,
        allowUser: true,
        defaultInsert: 'top',
    };

    constructor(
        _chatKey: string,
        eventsManager: EventsManager,
        factsManager: FactsManager,
        stateManager: StateManager,
        summariesManager: SummariesManager
    ) {
        this.eventsManager = eventsManager;
        this.factsManager = factsManager;
        this.stateManager = stateManager;
        this.summariesManager = summariesManager;
    }

    /**
     * 功能：构建供 Prompt 使用的上下文文本。
     * @param opts 注入构建参数。
     * @returns 拼接后的上下文文本。
     */
    async buildContext(opts?: BuildContextOptions): Promise<string> {
        const maxTokens: number = Math.max(200, opts?.maxTokens ?? 1200);
        const preferSummary: boolean = opts?.preferSummary !== false;
        const sections: SectionName[] = this.resolveSectionOrder(opts?.sections, preferSummary);
        const budgets: Record<SectionName, number> = await this.resolveSectionBudgets(
            maxTokens,
            sections,
            opts?.sectionBudgets
        );
        const keywords: string[] = this.extractKeywords(opts?.query || '');

        const sectionTexts: Record<SectionName, string> = {
            WORLD_STATE: '',
            FACTS: '',
            EVENTS: '',
            SUMMARY: '',
        };

        for (const section of sections) {
            if (section === 'WORLD_STATE') {
                sectionTexts.WORLD_STATE = await this.buildWorldStateSection(budgets.WORLD_STATE, keywords);
            } else if (section === 'FACTS') {
                sectionTexts.FACTS = await this.buildFactsSection(budgets.FACTS, keywords);
            } else if (section === 'EVENTS') {
                sectionTexts.EVENTS = await this.buildEventsSection(budgets.EVENTS);
            } else if (section === 'SUMMARY') {
                sectionTexts.SUMMARY = await this.buildSummarySection(budgets.SUMMARY, keywords);
            }
        }

        const result: string = sections
            .map((section: SectionName) => sectionTexts[section])
            .filter((text: string) => text.trim().length > 0)
            .join('\n\n')
            .trim();

        return this.trimToBudget(result, maxTokens);
    }

    /**
     * 功能：设置注入锚点策略。
     * @param opts 锚点策略参数。
     * @returns 无返回值。
     */
    async setAnchorPolicy(opts: {
        allowSystem?: boolean;
        allowUser?: boolean;
        defaultInsert?: 'top' | 'beforeStart' | 'customAnchor';
    }): Promise<void> {
        if (opts.allowSystem !== undefined) this.anchorPolicy.allowSystem = opts.allowSystem;
        if (opts.allowUser !== undefined) this.anchorPolicy.allowUser = opts.allowUser;
        if (opts.defaultInsert !== undefined) this.anchorPolicy.defaultInsert = opts.defaultInsert;
    }

    /**
     * 功能：读取当前锚点策略。
     * @returns 锚点策略对象。
     */
    getAnchorPolicy(): AnchorPolicy {
        return { ...this.anchorPolicy };
    }

    /**
     * 功能：解析 section 顺序。
     * @param sections 外部指定 section 顺序。
     * @param preferSummary 是否摘要优先。
     * @returns 最终 section 顺序。
     */
    private resolveSectionOrder(sections?: SectionName[], preferSummary = true): SectionName[] {
        if (Array.isArray(sections) && sections.length > 0) {
            return sections;
        }
        return preferSummary
            ? ['WORLD_STATE', 'FACTS', 'SUMMARY', 'EVENTS']
            : ['WORLD_STATE', 'FACTS', 'EVENTS', 'SUMMARY'];
    }

    /**
     * 功能：解析 section 预算，优先外部预算，其次模板预算，最后默认比例预算。
     * @param maxTokens 总预算。
     * @param sections 参与注入的 section。
     * @param override 外部覆盖预算。
     * @returns 每个 section 的 token 预算。
     */
    private async resolveSectionBudgets(
        maxTokens: number,
        sections: SectionName[],
        override?: Partial<Record<SectionName, number>>
    ): Promise<Record<SectionName, number>> {
        const templateBudget: Partial<Record<SectionName, number>> = await this.readTemplateBudgets();
        const ratioDefaults: Record<SectionName, number> = {
            WORLD_STATE: 0.2,
            FACTS: 0.4,
            EVENTS: 0.1,
            SUMMARY: 0.3,
        };

        const result: Record<SectionName, number> = {
            WORLD_STATE: 0,
            FACTS: 0,
            EVENTS: 0,
            SUMMARY: 0,
        };

        let allocated: number = 0;
        const missing: SectionName[] = [];
        for (const section of sections) {
            const fromOverride = Number(override?.[section] ?? 0);
            const fromTemplate = Number(templateBudget?.[section] ?? 0);
            const chosen = fromOverride > 0 ? fromOverride : fromTemplate > 0 ? fromTemplate : 0;
            if (chosen > 0) {
                result[section] = Math.floor(chosen);
                allocated += result[section];
            } else {
                missing.push(section);
            }
        }

        if (missing.length > 0) {
            const remaining: number = Math.max(0, maxTokens - allocated);
            const ratioSum: number = missing.reduce((sum: number, section: SectionName) => sum + ratioDefaults[section], 0) || 1;
            for (const section of missing) {
                result[section] = Math.max(40, Math.floor((remaining * ratioDefaults[section]) / ratioSum));
            }
        }

        const total: number = sections.reduce((sum: number, section: SectionName) => sum + result[section], 0);
        if (total > maxTokens && total > 0) {
            const scale: number = maxTokens / total;
            for (const section of sections) {
                result[section] = Math.max(20, Math.floor(result[section] * scale));
            }
        }

        return result;
    }

    /**
     * 功能：读取当前激活模板中的 section 预算定义。
     * @returns 模板中的 section 预算映射。
     */
    private async readTemplateBudgets(): Promise<Partial<Record<SectionName, number>>> {
        try {
            const stxMemory = (window as any)?.STX?.memory;
            if (!stxMemory?.template?.getActive) {
                return {};
            }
            const template = await stxMemory.template.getActive();
            const layout = template?.injectionLayout || {};
            const eventsMaxItems = Number(layout?.EVENTS?.maxItems ?? 0);
            return {
                WORLD_STATE: Number(layout?.WORLD_STATE?.maxTokens ?? 0) || undefined,
                FACTS: Number(layout?.FACTS?.maxTokens ?? 0) || undefined,
                SUMMARY: Number(layout?.SUMMARY?.maxTokens ?? 0) || undefined,
                EVENTS: eventsMaxItems > 0 ? eventsMaxItems * 80 : undefined,
            };
        } catch {
            return {};
        }
    }

    /**
     * 功能：构建世界状态 section。
     * @param tokenBudget 本段 token 预算。
     * @param keywords 相关性关键词。
     * @returns section 文本。
     */
    private async buildWorldStateSection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) return '';
        const states = await this.stateManager.query('');
        const entries = Object.entries(states);
        if (!entries.length) return '';

        const ranked = entries
            .map(([path, value]) => {
                const plain = `${path} ${this.stringifyValue(value)}`.toLowerCase();
                const hit = this.countKeywordHit(plain, keywords);
                return { path, value, score: hit };
            })
            .sort((left, right) => right.score - left.score);

        const lines: string[] = [];
        for (const item of ranked) {
            const line = `- ${item.path}: ${this.stringifyValue(item.value)}`;
            if (!this.canAppend(lines, line, tokenBudget, 20)) break;
            lines.push(line);
        }
        return lines.length ? `【世界状态】\n${lines.join('\n')}` : '';
    }

    /**
     * 功能：构建事实 section，按 query 相关性优先。
     * @param tokenBudget 本段 token 预算。
     * @param keywords 相关性关键词。
     * @returns section 文本。
     */
    private async buildFactsSection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) return '';
        const facts = await this.factsManager.query({ limit: 120 });
        if (!facts.length) return '';

        const ranked = facts
            .map((fact: any) => {
                const searchable = `${fact.type} ${fact.path || ''} ${fact.entity?.kind || ''} ${fact.entity?.id || ''} ${this.stringifyValue(fact.value)}`.toLowerCase();
                const keywordScore = this.countKeywordHit(searchable, keywords) * 3;
                const confidenceScore = Number(fact.confidence ?? 0) * 2;
                const updatedAt = Number(fact.updatedAt ?? 0);
                const ageHours = Math.max(0, (Date.now() - updatedAt) / 3_600_000);
                const recencyScore = 1 / (1 + ageHours / 24);
                return { fact, score: keywordScore + confidenceScore + recencyScore };
            })
            .sort((left, right) => right.score - left.score);

        const lines: string[] = [];
        for (const item of ranked) {
            const fact = item.fact;
            const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}]` : '';
            const line = `- ${entityPart} ${fact.type}${fact.path ? `.${fact.path}` : ''}: ${this.stringifyValue(fact.value)}`;
            if (!this.canAppend(lines, line, tokenBudget, 24)) break;
            lines.push(line);
        }
        return lines.length ? `【关键事实】\n${lines.join('\n')}` : '';
    }

    /**
     * 功能：构建近期事件 section，仅保留最新窗口。
     * @param tokenBudget 本段 token 预算。
     * @returns section 文本。
     */
    private async buildEventsSection(tokenBudget: number): Promise<string> {
        if (tokenBudget <= 0) return '';
        const events = await this.eventsManager.query({ limit: 24 });
        if (!events.length) return '';

        const latest = [...events].sort((left, right) => right.ts - left.ts);
        const lines: string[] = [];
        for (const event of latest) {
            const time = new Date(event.ts).toLocaleTimeString();
            const line = `- [${time}] ${event.type}: ${this.readEventPayloadText(event.payload)}`;
            if (!this.canAppend(lines, line, tokenBudget, 16)) break;
            lines.push(line);
        }
        return lines.length ? `【近期事件】\n${lines.join('\n')}` : '';
    }

    /**
     * 功能：构建摘要 section，优先 arc/scene。
     * @param tokenBudget 本段 token 预算。
     * @param keywords 相关性关键词。
     * @returns section 文本。
     */
    private async buildSummarySection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) return '';
        const [arc, scene, message] = await Promise.all([
            this.summariesManager.query({ level: 'arc', limit: 8 }),
            this.summariesManager.query({ level: 'scene', limit: 10 }),
            this.summariesManager.query({ level: 'message', limit: 10 }),
        ]);
        const allSummaries = [...arc, ...scene, ...message];
        if (!allSummaries.length) return '';

        const levelWeight: Record<string, number> = { arc: 3, scene: 2, message: 1 };
        const ranked = allSummaries
            .map((summary: any) => {
                const text = `${summary.title || ''} ${summary.content || ''}`.toLowerCase();
                const keywordScore = this.countKeywordHit(text, keywords) * 2;
                const levelScore = levelWeight[String(summary.level || '').toLowerCase()] || 0;
                const createdAt = Number(summary.createdAt ?? 0);
                const ageHours = Math.max(0, (Date.now() - createdAt) / 3_600_000);
                const recencyScore = 1 / (1 + ageHours / 48);
                return { summary, score: keywordScore + levelScore + recencyScore };
            })
            .sort((left, right) => right.score - left.score);

        const lines: string[] = [];
        for (const item of ranked) {
            const summary = item.summary;
            const line = `- [${summary.level}] ${summary.title ? `${summary.title}: ` : ''}${summary.content}`;
            if (!this.canAppend(lines, line, tokenBudget, 20)) break;
            lines.push(line);
        }
        return lines.length ? `【摘要】\n${lines.join('\n')}` : '';
    }

    /**
     * 功能：提取查询关键词。
     * @param query 原始查询文本。
     * @returns 关键词数组。
     */
    private extractKeywords(query: string): string[] {
        const normalized = String(query || '').toLowerCase().trim();
        if (!normalized) return [];
        const words = normalized
            .split(/[\s,，。！？;；:：()\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
            .map((item: string) => item.trim())
            .filter((item: string) => item.length >= 2);
        return Array.from(new Set(words)).slice(0, 12);
    }

    /**
     * 功能：统计关键词命中次数。
     * @param text 待匹配文本。
     * @param keywords 关键词数组。
     * @returns 命中计数。
     */
    private countKeywordHit(text: string, keywords: string[]): number {
        if (!keywords.length) return 0;
        return keywords.reduce((count: number, keyword: string) => {
            return count + (text.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * 功能：判断追加一行文本后是否超预算。
     * @param lines 已收集文本行。
     * @param line 新行文本。
     * @param tokenBudget 本段预算。
     * @param headerReserve 标题预留 token。
     * @returns 是否允许追加。
     */
    private canAppend(lines: string[], line: string, tokenBudget: number, headerReserve: number): boolean {
        const draft = lines.concat([line]).join('\n');
        const token = this.estimateTokens(draft) + headerReserve;
        return token <= tokenBudget;
    }

    /**
     * 功能：按预算裁剪最终上下文文本。
     * @param text 原始文本。
     * @param maxTokens 最大 token。
     * @returns 裁剪后的文本。
     */
    private trimToBudget(text: string, maxTokens: number): string {
        if (!text.trim()) return '';
        if (this.estimateTokens(text) <= maxTokens) return text;

        const lines = text.split('\n');
        const kept: string[] = [];
        for (const line of lines) {
            const draft = kept.concat([line]).join('\n');
            if (this.estimateTokens(draft) > maxTokens - 6) {
                break;
            }
            kept.push(line);
        }
        return `${kept.join('\n')}\n...（已按预算裁剪）`;
    }

    /**
     * 功能：估算文本 token 数量（中英文混合近似）。
     * @param text 文本内容。
     * @returns 估算 token 数量。
     */
    private estimateTokens(text: string): number {
        if (!text) return 0;
        const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
        const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
        const estimate = cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25;
        return Math.max(1, Math.ceil(estimate));
    }

    /**
     * 功能：将任意值转换为可读字符串。
     * @param value 任意值。
     * @returns 字符串表示。
     */
    private stringifyValue(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }
        if (value === null || value === undefined) {
            return '';
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    /**
     * 功能：读取事件 payload 的优先文本。
     * @param payload 事件 payload。
     * @returns 事件文本。
     */
    private readEventPayloadText(payload: unknown): string {
        if (typeof payload === 'string') {
            return payload;
        }
        if (payload && typeof payload === 'object' && typeof (payload as { text?: unknown }).text === 'string') {
            return String((payload as { text: string }).text);
        }
        return this.stringifyValue(payload);
    }
}
