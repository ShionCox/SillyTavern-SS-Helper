import type { MemoryProcessingLevel, PostGenerationGateDecision } from '../../types';

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

function resolveScopeHint(scope: MemoryProcessingLevel): string {
    if (scope === 'light') {
        return '轻处理只保留稳定 facts、必要 world_state、极明确 relation 变化，窗口只看最近一小段。';
    }
    if (scope === 'medium') {
        return '中处理允许 facts、relations、world_state，并可补充少量短摘要线索。';
    }
    if (scope === 'heavy') {
        return '重处理允许完整 facts、relations、world_state，并优先修复结构不一致。';
    }
    return '本轮不执行抽取。';
}

function resolveWorldHint(allowWorldFacts: boolean, postGate: PostGenerationGateDecision): string {
    return postGate.shouldExtractWorldState && allowWorldFacts
        ? '允许抽取世界设定类事实，但必须区分“聊天确认”和“仅世界书支持”。'
        : '不要扩张世界设定类抽取，优先保留聊天里显式确认的信息。';
}

function resolveRelationHint(postGate: PostGenerationGateDecision, strict: boolean): string {
    if (postGate.shouldExtractRelations) {
        return '允许抽取关系变化、情绪变化和目标变化。';
    }
    return strict
        ? '不要主动创建新的关系变化事实，除非文本明确出现。'
        : '不要创建新的关系变化事实，除非文本明确出现强关系变动。';
}

/**
 * 功能：构建短总结任务提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param postGate 生成后 gate 结果。
 * @param attachedSkillText 已渲染的摘要保存技能文本。
 * @returns 短总结提示词。
 */
export function buildShortSummarizeTaskPrompt(
    lorebookMode: string,
    postGate: PostGenerationGateDecision,
    attachedSkillText: string,
): string {
    return [
        attachedSkillText,
        '你是短总结助手，只总结当前小阶段，不重写历史。',
        '输出必须是纯 JSON，格式如下：',
        'summary 数组里的每一项都必须是对象，至少包含 level（只能是 message 或 scene）和 content（字符串）。',
        '可选字段只有 title（字符串）和 keywords（字符串数组）。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Should rebuild summary: ${postGate.rebuildSummary}.`,
        resolveLorebookHint(lorebookMode, 'short'),
        '短总结只描述当前窗口里真正推动后续生成的内容，不要复写长历史。',
        'memoryCards 负责长期记忆，summaries 只负责浏览与压缩；不要把摘要原文镜像成冗长记忆卡。',
        '{ "ok": true, "proposal": { "summaries": [...], "memoryCards": [...] }, "confidence": 0.0~1.0 }',
    ].join('\n');
}

/**
 * 功能：构建长总结任务提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param postGate 生成后 gate 结果。
 * @param attachedSkillText 已渲染的摘要保存技能文本。
 * @returns 长总结提示词。
 */
export function buildLongSummarizeTaskPrompt(
    lorebookMode: string,
    postGate: PostGenerationGateDecision,
    attachedSkillText: string,
): string {
    return [
        attachedSkillText,
        '你是长总结助手，只在关键节点整理整段时间线。',
        '输出必须是纯 JSON，格式如下：',
        'summary 数组里的每一项都必须是对象，至少包含 level（只能是 message、scene 或 arc）和 content（字符串）。',
        '可选字段只有 title（字符串）和 keywords（字符串数组）。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Should rebuild summary: ${postGate.rebuildSummary}.`,
        resolveLorebookHint(lorebookMode, 'long'),
        '长总结可以归并重复信息，整合阶段变化，并保留时间线上的稳定锚点。',
        '不要输出 markdown，不要输出解释性正文，只返回单个 JSON 对象。',
        'memoryCards 负责可保存的长期记忆，summaries 负责阶段浏览；不要把大段摘要原文直接塞进单卡。',
        '{ "ok": true, "proposal": { "summaries": [...], "memoryCards": [...] }, "confidence": 0.0~1.0 }',
    ].join('\n');
}

/**
 * 功能：构建常规摘要任务提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param postGate 生成后 gate 结果。
 * @param attachedSkillText 已渲染的摘要保存技能文本。
 * @returns 常规摘要提示词。
 */
export function buildSummarizeTaskPrompt(
    lorebookMode: string,
    postGate: PostGenerationGateDecision,
    attachedSkillText: string,
): string {
    return [
        attachedSkillText,
        '你是对话摘要助手，请根据事件窗口生成可写入的摘要提议。',
        '输出必须是纯 JSON，格式如下：',
        '所有摘要中的 title、content、keywords 等自然语言内容都必须使用简体中文。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Should rebuild summary: ${postGate.rebuildSummary}.`,
        resolveLorebookHint(lorebookMode, 'normal'),
        'summaries 数组中的每一项都必须是对象，且至少包含 level（只能是 message、scene 或 arc）和 content（字符串）。',
        '可选字段只有 title（字符串）和 keywords（字符串数组）。不要输出纯字符串数组，不要输出 markdown。',
        '{ "ok": true, "proposal": { "summaries": [...] }, "confidence": 0.0~1.0 }',
    ].join('\n');
}

/**
 * 功能：构建按范围分级的抽取提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param allowWorldFacts 是否允许抽取世界事实。
 * @param postGate 生成后 gate 结果。
 * @param scope 抽取范围档位。
 * @returns 抽取提示词。
 */
export function buildExtractPromptByScopeTaskPrompt(
    lorebookMode: string,
    allowWorldFacts: boolean,
    postGate: PostGenerationGateDecision,
    scope: MemoryProcessingLevel,
): string {
    return [
        '你是结构化记忆提取助手，只能返回 facts 与 patches。',
        '输出必须是纯 JSON，格式如下：',
        'facts 数组里的每一项都必须是对象，至少包含 type（字符串）和 value（任意 JSON 值）。',
        'patches 数组里的每一项都必须是对象，至少包含 op（add、replace、remove）和 path（字符串）。',
        '当 op 不是 remove 时，必须提供 value。',
        '不要输出 summaries，不要输出解释性正文，不要输出 markdown。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Persist long term: ${postGate.shouldPersistLongTerm}.`,
        `Extract facts: ${postGate.shouldExtractFacts}.`,
        `Extract relations: ${postGate.shouldExtractRelations}.`,
        `Extract world state: ${postGate.shouldExtractWorldState}.`,
        `Processing scope: ${scope}.`,
        resolveScopeHint(scope),
        resolveWorldHint(allowWorldFacts, postGate),
        resolveRelationHint(postGate, true),
        'facts 数组的每一项都必须是对象，且至少包含 type 与 value。可选字段包括 factKey、entity、path、confidence。',
        'patches 数组只允许 add、replace、remove，且尽量只表达必要差异。',
        '{ "ok": true, "proposal": { "facts": [...], "patches": [...] }, "confidence": 0.0~1.0 }',
    ].join('\n');
}

/**
 * 功能：构建标准事实抽取提示词。
 * @param lorebookMode 当前世界书裁剪模式。
 * @param allowWorldFacts 是否允许抽取世界事实。
 * @param postGate 生成后 gate 结果。
 * @returns 标准抽取提示词。
 */
export function buildExtractTaskPrompt(
    lorebookMode: string,
    allowWorldFacts: boolean,
    postGate: PostGenerationGateDecision,
): string {
    const retentionHint = postGate.shouldPersistLongTerm
        ? '允许写入长期记忆。'
        : '本轮只保留必要短期信息，不要扩张长期事实。';
    return [
        '你是结构化记忆提取助手，请提取 facts 与 patches。',
        '输出必须是纯 JSON，格式如下：',
        '所有 notes、summaries.content、summaries.title，以及 value 中的自然语言文本都必须使用简体中文。',
        `Lorebook gate mode: ${lorebookMode}.`,
        `Post gate class: ${postGate.valueClass}.`,
        `Persist long term: ${postGate.shouldPersistLongTerm}.`,
        `Extract facts: ${postGate.shouldExtractFacts}.`,
        `Extract relations: ${postGate.shouldExtractRelations}.`,
        `Extract world state: ${postGate.shouldExtractWorldState}.`,
        resolveWorldHint(allowWorldFacts, postGate),
        resolveRelationHint(postGate, false),
        retentionHint,
        'facts 数组中的每一项都必须是对象，且至少包含 type（字符串）和 value（任意 JSON 值）。可选字段包括 factKey、entity={kind,id}、path、confidence。',
        'patches 数组中的每一项都必须是对象，且必须包含 op（只能是 add、replace、remove）和 path（字符串）。当 op 不是 remove 时，必须提供 value。',
        'summaries 如果返回，也必须是对象数组，每项字段同摘要任务要求。不要输出字符串数组，不要输出额外解释文本。',
        '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
    ].join('\n');
}
