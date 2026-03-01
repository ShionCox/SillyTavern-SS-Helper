import type { WorldInfoEntry, WorldContextBundle } from './types';

/**
 * WorldInfo 读取器 —— 负责读取世界书并生成 hash
 * 用于检测世界书是否变更，决定是否需要重建模板
 */
export class WorldInfoReader {
    /**
     * 从外部传入的世界书条目构建 WorldContextBundle
     */
    buildContextBundle(
        chatKey: string,
        worldInfo: WorldInfoEntry[],
        characterCard?: { name: string; desc: string; tags?: string[] },
        recentMessages?: Array<{ role: string; content: string }>
    ): WorldContextBundle {
        return {
            chatKey,
            worldInfo,
            characterCard,
            recentMessages,
        };
    }

    /**
     * 计算世界书内容的 hash（用于缓存命中判断）
     * 使用简单的字符串哈希，如运行环境支持 crypto 则使用 SHA-256
     */
    async computeHash(worldInfo: WorldInfoEntry[]): Promise<string> {
        const raw = JSON.stringify(worldInfo);

        // 优先使用 Web Crypto API
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(raw);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // 降级为简单字符串哈希
        return this.simpleHash(raw);
    }

    /**
     * 简单的字符串哈希（djb2 算法变体）
     */
    private simpleHash(str: string): string {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash; // 转为 32 位整数
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * 将世界书条目压缩为适合 LLM 输入的文本块
     * 按 book 分组，每个 entry 以简洁格式呈现
     */
    compressForPrompt(worldInfo: WorldInfoEntry[], maxChars: number = 4000): string {
        const bookMap = new Map<string, WorldInfoEntry[]>();
        for (const entry of worldInfo) {
            const list = bookMap.get(entry.book) || [];
            list.push(entry);
            bookMap.set(entry.book, list);
        }

        const parts: string[] = [];
        for (const [book, entries] of bookMap) {
            parts.push(`## ${book}`);
            for (const entry of entries) {
                const keywords = entry.keywords.length ? `[${entry.keywords.join(', ')}]` : '';
                parts.push(`- ${entry.entry} ${keywords}: ${entry.content}`);
            }
        }

        let result = parts.join('\n');
        if (result.length > maxChars) {
            result = result.slice(0, maxChars) + '\n...（内容已截断）';
        }
        return result;
    }
}
