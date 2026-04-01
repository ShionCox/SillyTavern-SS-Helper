import type { MemoryLLMApi } from '../memory-summary';
import type { ContentBlockKind } from '../config/content-tag-registry';
import type { ClassifiedContentBlock } from './content-block-classifier';
import type { RawFloorRecord } from './content-block-pipeline';

/**
 * 功能：定义 AI 兜底分类结果。
 */
export interface AIBlockClassificationResult {
    blockId: string;
    resolvedKind: ContentBlockKind;
    confidence: number;
    reason: string;
}

const AI_ELIGIBLE_KINDS = new Set<ContentBlockKind>(['unknown', 'story_secondary', 'meta_commentary']);
const AI_KIND_ALLOWLIST: ContentBlockKind[] = ['story_primary', 'story_secondary', 'summary', 'tool_artifact', 'thought', 'meta_commentary', 'instruction', 'unknown'];

/**
 * 功能：用 AI 对低置信或未知内容块做兜底分类。
 * @param input 输入参数。
 * @returns 修正后的楼层记录。
 */
export async function classifyFloorRecordsWithAI(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    floorRecords: RawFloorRecord[];
}): Promise<RawFloorRecord[]> {
    if (!input.llm || input.floorRecords.length <= 0) {
        return input.floorRecords;
    }
    const candidates = input.floorRecords.flatMap((record: RawFloorRecord) => record.parsedBlocks)
        .filter((block: ClassifiedContentBlock): boolean => {
            return AI_ELIGIBLE_KINDS.has(block.resolvedKind) && block.rawText.trim().length > 0;
        })
        .slice(0, 24);
    if (candidates.length <= 0) {
        return input.floorRecords;
    }
    const result = await input.llm.runTask<AIBlockClassificationResult[]>({
        consumer: input.pluginId,
        taskId: 'memory_content_block_classifier',
        taskDescription: '内容块 AI 兜底分类',
        taskKind: 'generation',
        input: {
            messages: [
                {
                    role: 'system',
                    content: [
                        '你负责旧聊天内容块兜底分类。',
                        '只判断每个 block 更像哪一类，不负责抽取记忆事实。',
                        '可选分类仅限：story_primary、story_secondary、summary、tool_artifact、thought、meta_commentary、instruction、unknown。',
                        '如果像正文或对话，优先判为 story_primary 或 story_secondary；如果像总结，判为 summary；如果像表格/补丁/命令，判为 tool_artifact 或 instruction；如果像思考链路，判为 thought；如果像说明或注释，判为 meta_commentary。',
                        '只输出 JSON 数组。',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: JSON.stringify(candidates.map((block: ClassifiedContentBlock) => ({
                        blockId: block.blockId,
                        rawTagName: block.rawTagName,
                        rawText: block.rawText,
                        currentKind: block.resolvedKind,
                        currentReasonCodes: block.reasonCodes,
                    })), null, 2),
                },
            ],
        },
        schema: {
            type: 'array',
            items: {
                type: 'object',
                required: ['blockId', 'resolvedKind', 'confidence', 'reason'],
                additionalProperties: false,
                properties: {
                    blockId: { type: 'string' },
                    resolvedKind: { type: 'string', enum: AI_KIND_ALLOWLIST },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                },
            },
        },
        enqueue: {
            displayMode: 'silent',
            autoCloseMs: 0,
        },
    });
    if (!result.ok) {
        return input.floorRecords;
    }
    const resultMap = new Map<string, AIBlockClassificationResult>();
    result.data.forEach((item: AIBlockClassificationResult): void => {
        if (item.blockId) {
            resultMap.set(item.blockId, item);
        }
    });
    return input.floorRecords.map((record: RawFloorRecord): RawFloorRecord => {
        const parsedBlocks = record.parsedBlocks.map((block: ClassifiedContentBlock): ClassifiedContentBlock => {
            const aiResult = resultMap.get(block.blockId);
            if (!aiResult || Number(aiResult.confidence ?? 0) < 0.55) {
                return block;
            }
            return applyAIClassification(block, aiResult);
        });
        const hasPrimaryStory = parsedBlocks.some((block: ClassifiedContentBlock): boolean => block.includeInPrimaryExtraction);
        const hasHintOnly = !hasPrimaryStory && parsedBlocks.some((block: ClassifiedContentBlock): boolean => block.includeAsHint);
        const hasExcludedOnly = parsedBlocks.length > 0 && parsedBlocks.every((block: ClassifiedContentBlock): boolean => !block.includeInPrimaryExtraction && !block.includeAsHint);
        return {
            ...record,
            parsedBlocks,
            hasPrimaryStory,
            hasHintOnly,
            hasExcludedOnly,
        };
    });
}

/**
 * 功能：把 AI 分类结果映射回内容块策略。
 * @param block 原始内容块。
 * @param aiResult AI 结果。
 * @returns 更新后的内容块。
 */
function applyAIClassification(block: ClassifiedContentBlock, aiResult: AIBlockClassificationResult): ClassifiedContentBlock {
    const includeInPrimaryExtraction = aiResult.resolvedKind === 'story_primary' || aiResult.resolvedKind === 'story_secondary';
    const includeAsHint = includeInPrimaryExtraction || aiResult.resolvedKind === 'summary' || aiResult.resolvedKind === 'tool_artifact';
    const allowPromotion = includeInPrimaryExtraction;
    return {
        ...block,
        resolvedKind: aiResult.resolvedKind,
        includeInPrimaryExtraction,
        includeAsHint,
        allowActorPromotion: allowPromotion,
        allowRelationPromotion: allowPromotion,
        reasonCodes: [
            ...block.reasonCodes.filter((code: string): boolean => !code.startsWith('ai_')),
            'ai_fallback',
            `ai_kind:${aiResult.resolvedKind}`,
            `ai_confidence:${Number(aiResult.confidence ?? 0).toFixed(2)}`,
            `ai_reason:${String(aiResult.reason ?? '').trim() || '未说明'}`,
        ],
    };
}
