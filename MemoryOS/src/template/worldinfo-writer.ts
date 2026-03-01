import type { WorldInfoEntry } from './types';
import { FactsManager } from '../core/facts-manager';
import { SummariesManager } from '../core/summaries-manager';

/**
 * 世界书写回兼容层 —— 将稳定事实/摘要写回 ST WorldInfo
 *
 * 目的：
 * - 能被 ST 原生 worldinfo 引擎触发注入（兼容性强）
 * - 用户可在 ST UI 手动编辑/查看
 *
 * 策略：
 * - 只写 summary 型条目（信息密度高、避免指令性文本）
 * - 对每 chatKey 建一个条目前缀: [MEMORY_OS][chatKeyShort]
 */
export class WorldInfoWriter {
    private chatKey: string;
    private factsManager: FactsManager;
    private summariesManager: SummariesManager;

    /** 条目前缀 */
    private readonly PREFIX = '[MEMORY_OS]';

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        this.factsManager = new FactsManager(chatKey);
        this.summariesManager = new SummariesManager(chatKey);
    }

    /**
     * 将稳定事实导出为 WorldInfo 条目格式
     * 每个事实类型生成一条条目
     */
    async exportFactsAsEntries(): Promise<WorldInfoEntry[]> {
        const facts = await this.factsManager.query({ limit: 200 });
        if (!facts.length) return [];

        // 按 type 分组
        const byType = new Map<string, typeof facts>();
        for (const f of facts) {
            const list = byType.get(f.type) || [];
            list.push(f);
            byType.set(f.type, list);
        }

        const entries: WorldInfoEntry[] = [];
        const chatShort = this.chatKey.slice(0, 12);

        for (const [type, typeFacts] of byType) {
            const keywords = this.extractFactKeywords(typeFacts);
            const content = this.formatFactContent(type, typeFacts);

            entries.push({
                book: `${this.PREFIX}${chatShort}`,
                entry: `${type} (${typeFacts.length} 条)`,
                keywords,
                content,
            });
        }

        return entries;
    }

    /**
     * 将最新摘要导出为 WorldInfo 条目格式
     */
    async exportSummariesAsEntries(): Promise<WorldInfoEntry[]> {
        const summaries = await this.summariesManager.query({ limit: 20 });
        if (!summaries.length) return [];

        const chatShort = this.chatKey.slice(0, 12);
        const entries: WorldInfoEntry[] = [];

        for (const s of summaries) {
            entries.push({
                book: `${this.PREFIX}${chatShort}`,
                entry: s.title || `${s.level} 摘要`,
                keywords: s.keywords || [],
                content: s.content,
            });
        }

        return entries;
    }

    /**
     * 完整导出：事实 + 摘要
     */
    async exportAll(): Promise<WorldInfoEntry[]> {
        const [facts, summaries] = await Promise.all([
            this.exportFactsAsEntries(),
            this.exportSummariesAsEntries(),
        ]);
        return [...facts, ...summaries];
    }

    /**
     * 生成用于 ST 回写 API 的数据格式
     * 返回一个可直接传递给 ST 的批量写入结构
     */
    async buildWritebackPayload(): Promise<{
        bookName: string;
        entries: Array<{
            key: string[];
            content: string;
            comment: string;
            disable: boolean;
        }>;
    }> {
        const allEntries = await this.exportAll();
        const chatShort = this.chatKey.slice(0, 12);

        return {
            bookName: `${this.PREFIX}${chatShort}`,
            entries: allEntries.map(e => ({
                key: e.keywords,
                content: e.content,
                comment: `${this.PREFIX} ${e.entry}`,
                disable: false,
            })),
        };
    }

    // --- 内部格式化 ---

    /**
     * 将记忆数据实际写回到 SillyTavern 的 WorldInfo 系统
     * 利用 ST 全局 context 的 worldInfo API
     * @param mode 'facts' | 'summaries' | 'all'
     * @returns 成功写入的条目数量
     */
    async writebackToST(mode: 'facts' | 'summaries' | 'all' = 'all'): Promise<{ written: number; bookName: string }> {
        const stContext = (window as any).SillyTavern?.getContext?.();
        if (!stContext) {
            throw new Error('SillyTavern context unavailable — cannot write back WorldInfo');
        }

        // 生成写回数据
        const payload = await this.buildWritebackPayload();
        const { bookName, entries: allEntries } = payload;

        // 按 mode 过滤（facts 来自 exportFactsAsEntries，summaries 来自 exportSummariesAsEntries）
        let entriesToWrite = allEntries;
        if (mode === 'facts') {
            const factEntries = await this.exportFactsAsEntries();
            entriesToWrite = factEntries.map(e => ({ key: e.keywords, content: e.content, comment: `${this.PREFIX} ${e.entry}`, disable: false }));
        } else if (mode === 'summaries') {
            const summaryEntries = await this.exportSummariesAsEntries();
            entriesToWrite = summaryEntries.map(e => ({ key: e.keywords, content: e.content, comment: `${this.PREFIX} ${e.entry}`, disable: false }));
        }

        if (entriesToWrite.length === 0) {
            return { written: 0, bookName };
        }

        // 先清除同名 book 的旧条目（防止重复堆积）
        await this.clearSTBook(bookName, stContext);

        // 调用 ST 的 WorldInfo 写入接口
        // ST 通过 context.worldInfo 或 window.createWorldInfoEntry 等方式操作
        let written = 0;
        for (const entry of entriesToWrite) {
            try {
                // SillyTavern 标准接口：context.saveWorldInfo(bookName, entry)
                if (stContext.saveWorldInfo) {
                    await stContext.saveWorldInfo(bookName, {
                        key: entry.key,
                        keysecondary: [],
                        comment: entry.comment,
                        content: entry.content,
                        constant: false,
                        selective: false,
                        selectiveLogic: 0,
                        addMemo: true,
                        order: 100,
                        position: 0,
                        disable: false,
                        excludeRecursion: false,
                    });
                    written++;
                } else if ((window as any).createWorldInfoEntry) {
                    // 降级：通过全局函数创建
                    (window as any).createWorldInfoEntry(bookName, entry.content, entry.key);
                    written++;
                }
            } catch { /* 单条失败不影响整体 */ }
        }

        return { written, bookName };
    }

    /**
     * 清除 ST WorldInfo 中此 chatKey 对应的旧条目
     */
    async clearSTBook(bookName: string, stContext?: any): Promise<void> {
        const ctx = stContext ?? (window as any).SillyTavern?.getContext?.();
        if (!ctx) return;
        try {
            // ST 可能提供 deleteWorldInfoEntry / clearWorldInfoBook 等接口
            if (ctx.deleteWorldInfoBook) {
                await ctx.deleteWorldInfoBook(bookName);
            } else if (ctx.getWorldInfoBook) {
                const book = await ctx.getWorldInfoBook(bookName);
                if (book?.entries) {
                    for (const entry of Object.values(book.entries) as any[]) {
                        if (entry?.comment?.startsWith(this.PREFIX)) {
                            ctx.deleteWorldInfoEntry?.(bookName, entry.uid);
                        }
                    }
                }
            }
        } catch { /* 清理失败静默 */ }
    }

    /**
     * 预览将会写回 ST WorldInfo 的数据（不实际写入）
     */
    async previewWriteback(): Promise<Array<{ entry: string; keywords: string[]; contentLength: number }>> {
        const entries = await this.exportAll();
        return entries.map(e => ({
            entry: e.entry,
            keywords: e.keywords,
            contentLength: e.content.length,
        }));
    }

    // --- 内部格式化 ---

    private extractFactKeywords(facts: Array<{ type: string; entity?: { kind: string; id: string }; path?: string }>): string[] {
        const keywords = new Set<string>();
        for (const f of facts) {
            keywords.add(f.type);
            if (f.entity) {
                keywords.add(f.entity.id);
                keywords.add(f.entity.kind);
            }
        }
        return Array.from(keywords).slice(0, 10);
    }

    private formatFactContent(type: string, facts: Array<{ entity?: { kind: string; id: string }; path?: string; value: any }>): string {
        const lines = facts.map(f => {
            const entityStr = f.entity ? `[${f.entity.kind}:${f.entity.id}]` : '';
            const val = typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value);
            return `${entityStr} ${f.path || ''}: ${val}`;
        });
        return `[${type}]\n${lines.join('\n')}`;
    }
}
