import type { MemoryProcessingLevel, PostGenerationGateDecision, SummaryExecutionTier } from '../../types';

/**
 * 功能：根据世界书裁剪模式生成提示约束。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param mode 当前摘要档位。
 * @returns 对应的约束提示。
 */
function resolveLorebookHint(lorebookMode: string, mode: 'short' | 'long' | 'normal'): string {
    if (lorebookMode === 'block') {
        return mode === 'long'
            ? '不要把世界书原文写进长总结，只保留已经被聊天确认过的稳定事实。'
            : '不要把世界书原文写进摘要，只保留聊天里明确出现的信息。';
    }
    if (lorebookMode === 'summary_only') {
        return mode === 'long'
            ? '允许整理为稳定设定摘要，但不要复制世界书原文。'
            : '只保留概念级设定，不要复制世界书条目原文。';
    }
    return mode === 'long'
        ? '可以综合世界书，但优先输出可稳定复用的阶段摘要。'
        : '可以吸收世界书信息，但优先保留聊天里明确确认过的内容。';
}

/**
 * 功能：根据处理档位生成抽取范围提示。
 * @param scope 当前处理档位。
 * @returns 范围约束说明。
 */
function resolveScopeHint(scope: MemoryProcessingLevel): string {
    if (scope === 'light') {
        return '轻处理只保留稳定 facts、必要 world_state 和极明确 relation 变化，窗口只看最近一小段。';
    }
    if (scope === 'medium') {
        return '中处理允许 facts、relations、world_state，并可补充少量高价值摘要线索。';
    }
    if (scope === 'heavy') {
        return '重处理允许完整 facts、relations、world_state，并优先修复结构不一致。';
    }
    return '本轮不执行抽取。';
}

/**
 * 功能：根据闸门结果生成世界事实提示。
 * @param allowWorldFacts 是否允许世界事实。
 * @param postGate 生成后闸门结果。
 * @returns 世界事实约束说明。
 */
function resolveWorldHint(allowWorldFacts: boolean, postGate: PostGenerationGateDecision): string {
    return postGate.shouldExtractWorldState && allowWorldFacts
        ? '允许抽取世界设定类事实，但必须区分“聊天确认”和“仅世界书支持”。'
        : '不要扩张世界设定类抽取，优先保留聊天里显式确认的信息。';
}

/**
 * 功能：根据闸门结果生成关系抽取提示。
 * @param postGate 生成后闸门结果。
 * @returns 关系事实约束说明。
 */
function resolveRelationHint(postGate: PostGenerationGateDecision): string {
    return postGate.shouldExtractRelations
        ? '允许抽取关系变化、情绪变化和目标变化。'
        : '不要主动创建新的关系变化事实，除非文本里出现非常明确的关系变动。';
}

/**
 * 功能：构建统一记忆摄取任务提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param allowWorldFacts 是否允许抽取世界事实。
 * @param postGate 生成后闸门结果。
 * @param summaryTier 摘要档位。
 * @param scope 抽取处理档位。
 * @param attachedSkillText 已渲染的记忆保存技能文本。
 * @returns 统一记忆摄取提示词。
 */
export function buildUnifiedIngestTaskPrompt(
    lorebookMode: string,
    allowWorldFacts: boolean,
    postGate: PostGenerationGateDecision,
    summaryTier: SummaryExecutionTier,
    scope: MemoryProcessingLevel,
    attachedSkillText: string,
): string {
    const summaryHint = summaryTier === 'long'
        ? '本轮允许输出阶段级长摘要，并可在单条摘要中附带少量高质量 memoryCards。'
        : summaryTier === 'short'
            ? '本轮只输出短摘要，聚焦最新窗口里的推进内容；如无必要，可少写 memoryCards。'
            : '本轮不生成摘要，summaries 必须返回空数组。';

    return [
        attachedSkillText,
        '你是统一记忆摄取助手，一次性完成 summaries、facts、patches 等提案生成。',
        '你必须输出统一 JSON 外壳，不要输出 Markdown、解释正文、代码块或旧 proposal 包装。',
        '你只允许填写当前窗口中真正出现、且适合落库的内容，不要把同一信息重复拆成很多近义条目。',
        'summaries 中每一项都必须是对象，至少包含 level 和 content；可选字段包括 title、keywords、memoryCards、messageId、range、source。',
        'facts 中每一项都必须是对象，至少包含 type 和 value；只有确实值得长期保留的事实才写入。',
        'patches 中每一项都必须是对象，至少包含 op 和 path；只有真的需要改状态时才返回。',
        '如果需要生成记忆卡，优先挂在 summaries[].memoryCards 下；不要把摘要原文整段复制成低价值记忆卡。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Persist long term: ${postGate.shouldPersistLongTerm}.`,
        `Extract facts: ${postGate.shouldExtractFacts}.`,
        `Extract relations: ${postGate.shouldExtractRelations}.`,
        `Extract world state: ${postGate.shouldExtractWorldState}.`,
        `Summary tier: ${summaryTier}.`,
        `Processing scope: ${scope}.`,
        resolveLorebookHint(lorebookMode, summaryTier === 'long' ? 'long' : 'short'),
        resolveScopeHint(scope),
        resolveWorldHint(allowWorldFacts, postGate),
        resolveRelationHint(postGate),
        summaryHint,
        'summaries[].level 只能是 message、scene 或 arc。',
        '当 summaries、facts 或 patches 没有内容时，必须返回空数组，不要为了凑字段硬写低价值内容。',
        '所有自然语言字段都必须使用简体中文。',
    ].join('\n');
}
