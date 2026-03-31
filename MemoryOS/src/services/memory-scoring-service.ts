/**
 * 功能：秘书层 / 蒸馏服务。
 * 说明：参考 PeroCore 的 ScorerService，对原始对话做前处理：
 *       清洗噪音 → 批次拆分 → 提炼摘要 → 提取线索 → 输出蒸馏结果。
 *       第一阶段不直接生成 embedding，不直接写向量索引。
 */

/**
 * 功能：蒸馏服务输入。
 */
export interface MemoryScoringInput {
    /** 原始对话批次 */
    messages: Array<{
        role?: string;
        content?: string;
        name?: string;
    }>;
    /** 输入来源标识 */
    source: 'summary_pipeline' | 'takeover_batch' | 'manual_import';
    /** 最大单批处理字符数 */
    maxBatchChars?: number;
    /** 已知角色键 */
    knownActorKeys?: string[];
}

/**
 * 功能：蒸馏输出结果。
 */
export interface MemoryScoringResult {
    /** 蒸馏后文本 */
    distillationText: string;
    /** 摘要候选 */
    summaryCandidate: string;
    /** 提取的实体线索 */
    entityClues: MemoryEntityClues;
    /** 变更建议 */
    mutationSuggestions: MemoryMutationSuggestion[];
    /** 审计追踪 */
    auditTrace: MemoryScoringAuditEntry[];
    /** 拆分后的子批次（当输入过长时） */
    subBatches: MemoryScoringSubBatch[];
}

/**
 * 功能：实体线索。
 */
export interface MemoryEntityClues {
    actorKeys: string[];
    relationshipHints: string[];
    entityMentions: string[];
}

/**
 * 功能：变更建议。
 */
export interface MemoryMutationSuggestion {
    type: 'create' | 'update' | 'merge' | 'archive';
    reason: string;
    targetKey?: string;
    suggestedContent?: string;
}

/**
 * 功能：审计日志条目。
 */
export interface MemoryScoringAuditEntry {
    ts: number;
    action: string;
    detail: string;
}

/**
 * 功能：拆分后的子批次。
 */
export interface MemoryScoringSubBatch {
    index: number;
    messages: Array<{ role?: string; content?: string }>;
    charCount: number;
}

/**
 * 功能：需要清洗的噪音模式。
 */
const NOISE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /<thinking>[\s\S]*?<\/thinking>/gi, label: 'thinking_block' },
    { pattern: /<monologue>[\s\S]*?<\/monologue>/gi, label: 'monologue_block' },
    { pattern: /\[tool_call\][\s\S]*?\[\/tool_call\]/gi, label: 'tool_call_block' },
    { pattern: /\[tool_result\][\s\S]*?\[\/tool_result\]/gi, label: 'tool_result_block' },
    { pattern: /```json\s*\{[\s\S]*?\}\s*```/gi, label: 'json_code_block' },
    { pattern: /\[System Note:[\s\S]*?\]/gi, label: 'system_note' },
    { pattern: /\[OOC:[\s\S]*?\]/gi, label: 'ooc_block' },
];

/**
 * 功能：秘书层 / 蒸馏服务。
 */
export class MemoryScoringService {
    /**
     * 功能：对原始对话批次执行蒸馏处理。
     * @param input 蒸馏输入。
     * @returns 蒸馏结果。
     */
    public process(input: MemoryScoringInput): MemoryScoringResult {
        const auditTrace: MemoryScoringAuditEntry[] = [];
        const maxBatchChars = Math.max(1000, Number(input.maxBatchChars ?? 12000) || 12000);

        auditTrace.push({
            ts: Date.now(),
            action: 'start',
            detail: `开始蒸馏处理，来源：${input.source}，消息数：${input.messages.length}。`,
        });

        const filteredMessages = this.filterSystemMessages(input.messages);
        auditTrace.push({
            ts: Date.now(),
            action: 'filter_system',
            detail: `过滤系统消息后剩余 ${filteredMessages.length} 条。`,
        });

        const cleanedMessages = filteredMessages.map((msg) => ({
            role: msg.role,
            content: this.cleanNoise(msg.content ?? '', auditTrace),
            name: msg.name,
        }));

        const subBatches = this.splitIntoBatches(cleanedMessages, maxBatchChars);
        auditTrace.push({
            ts: Date.now(),
            action: 'split_batches',
            detail: `已拆分为 ${subBatches.length} 个子批次。`,
        });

        const distillationText = this.buildDistillationText(cleanedMessages);
        const summaryCandidate = this.buildSummaryCandidate(distillationText);
        const entityClues = this.extractEntityClues(distillationText, input.knownActorKeys ?? []);
        const mutationSuggestions = this.buildMutationSuggestions(entityClues);

        auditTrace.push({
            ts: Date.now(),
            action: 'complete',
            detail: `蒸馏完成，提取 ${entityClues.actorKeys.length} 个角色线索、${entityClues.entityMentions.length} 个实体提及。`,
        });

        return {
            distillationText,
            summaryCandidate,
            entityClues,
            mutationSuggestions,
            auditTrace,
            subBatches,
        };
    }

    /**
     * 功能：过滤系统消息。
     */
    private filterSystemMessages(
        messages: MemoryScoringInput['messages'],
    ): MemoryScoringInput['messages'] {
        return messages.filter((msg) => {
            const role = String(msg.role ?? '').trim().toLowerCase();
            return role !== 'system';
        });
    }

    /**
     * 功能：清洗噪音内容。
     */
    private cleanNoise(content: string, auditTrace: MemoryScoringAuditEntry[]): string {
        let cleaned = content;
        for (const { pattern, label } of NOISE_PATTERNS) {
            const before = cleaned.length;
            cleaned = cleaned.replace(pattern, '');
            if (cleaned.length < before) {
                auditTrace.push({
                    ts: Date.now(),
                    action: 'clean_noise',
                    detail: `移除 ${label} 噪音片段，减少 ${before - cleaned.length} 字符。`,
                });
            }
        }
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
        return cleaned;
    }

    /**
     * 功能：将消息列表拆分为不超过最大字符数的子批次。
     */
    private splitIntoBatches(
        messages: Array<{ role?: string; content?: string }>,
        maxChars: number,
    ): MemoryScoringSubBatch[] {
        const batches: MemoryScoringSubBatch[] = [];
        let currentBatch: Array<{ role?: string; content?: string }> = [];
        let currentChars = 0;
        let batchIndex = 0;

        for (const msg of messages) {
            const msgChars = (msg.content ?? '').length;
            if (currentChars + msgChars > maxChars && currentBatch.length > 0) {
                batches.push({
                    index: batchIndex,
                    messages: currentBatch,
                    charCount: currentChars,
                });
                batchIndex += 1;
                currentBatch = [];
                currentChars = 0;
            }
            currentBatch.push(msg);
            currentChars += msgChars;
        }

        if (currentBatch.length > 0) {
            batches.push({
                index: batchIndex,
                messages: currentBatch,
                charCount: currentChars,
            });
        }

        return batches;
    }

    /**
     * 功能：构建蒸馏文本。
     */
    private buildDistillationText(messages: Array<{ role?: string; content?: string }>): string {
        return messages
            .filter((msg) => (msg.content ?? '').trim().length > 0)
            .map((msg) => {
                const role = String(msg.role ?? 'unknown').trim();
                const content = String(msg.content ?? '').trim();
                return `[${role}] ${content}`;
            })
            .join('\n');
    }

    /**
     * 功能：构建摘要候选。
     */
    private buildSummaryCandidate(distillationText: string): string {
        if (distillationText.length <= 200) {
            return distillationText;
        }
        return distillationText.slice(0, 800);
    }

    /**
     * 功能：提取实体线索。
     */
    private extractEntityClues(
        text: string,
        knownActorKeys: string[],
    ): MemoryEntityClues {
        const actorKeys: string[] = [];
        for (const key of knownActorKeys) {
            if (key && text.toLowerCase().includes(key.toLowerCase())) {
                actorKeys.push(key);
            }
        }

        const relationshipHints: string[] = [];
        const relationKeywords = ['关系', '好感', '信任', '敌意', '态度', '喜欢', '讨厌', '忠诚', '背叛'];
        for (const keyword of relationKeywords) {
            if (text.includes(keyword)) {
                relationshipHints.push(keyword);
            }
        }

        const entityMentions: string[] = [];
        const entityPattern = /[「『【《]([^」』】》]{2,20})[」』】》]/g;
        let match: RegExpExecArray | null;
        while ((match = entityPattern.exec(text)) !== null) {
            if (match[1] && !entityMentions.includes(match[1])) {
                entityMentions.push(match[1]);
            }
        }

        return { actorKeys, relationshipHints, entityMentions };
    }

    /**
     * 功能：基于实体线索构建变更建议。
     */
    private buildMutationSuggestions(clues: MemoryEntityClues): MemoryMutationSuggestion[] {
        const suggestions: MemoryMutationSuggestion[] = [];

        if (clues.relationshipHints.length > 0) {
            suggestions.push({
                type: 'update',
                reason: `检测到关系相关关键词：${clues.relationshipHints.slice(0, 3).join('、')}`,
            });
        }

        for (const entity of clues.entityMentions.slice(0, 5)) {
            suggestions.push({
                type: 'create',
                reason: `检测到实体提及：${entity}`,
                targetKey: entity,
            });
        }

        return suggestions;
    }
}
