import type {
    InjectionIntent,
    InjectionSectionName,
    PromptInjectionProfile,
    PromptSoftPersonaMode,
    RecallCandidate,
} from '../types';

function countTokens(text: string): number {
    if (!text) {
        return 0;
    }
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
    return Math.max(1, Math.ceil(cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25));
}

function canAppend(lines: string[], line: string, tokenBudget: number, headerReserve: number): boolean {
    const draft = lines.concat([line]).join('\n');
    return countTokens(draft) + headerReserve <= tokenBudget;
}

/**
 * 功能：读取分区标题。
 * 参数：
 *   section：分区名称。
 * 返回：分区标题。
 */
export function readSectionTitle(section: InjectionSectionName): string {
    if (section === 'WORLD_STATE') {
        return '【世界状态】';
    }
    if (section === 'FACTS') {
        return '【事实】';
    }
    if (section === 'EVENTS') {
        return '【最近事件】';
    }
    if (section === 'SUMMARY') {
        return '【摘要】';
    }
    if (section === 'CHARACTER_FACTS') {
        return '【角色事实】';
    }
    if (section === 'RELATIONSHIPS') {
        return '【关系】';
    }
    if (section === 'LAST_SCENE') {
        return '【最近场景】';
    }
    return '【短摘要】';
}

/**
 * 功能：读取分区标题的预留 token。
 * 参数：
 *   section：分区名称。
 * 返回：标题预留 token。
 */
export function readSectionHeaderReserve(section: InjectionSectionName): number {
    if (section === 'WORLD_STATE') {
        return 20;
    }
    if (section === 'FACTS') {
        return 24;
    }
    if (section === 'EVENTS') {
        return 16;
    }
    if (section === 'SHORT_SUMMARY') {
        return 18;
    }
    return 20;
}

/**
 * 功能：根据软注入模式生成引导标题。
 * 参数：
 *   mode：软注入模式。
 *   intent：当前注入意图。
 * 返回：引导标题。
 */
export function buildSoftLead(mode: PromptSoftPersonaMode, intent: InjectionIntent): string {
    if (mode === 'scene_note') {
        return '场景注记';
    }
    if (mode === 'character_anchor') {
        return '角色锚点';
    }
    if (mode === 'hidden_context_summary') {
        return intent === 'tool_qa' ? '隐藏工作上下文' : '隐藏上下文摘要';
    }
    return '连续性注记';
}

/**
 * 功能：按照不同注入风格渲染最终注入文本。
 * 参数：
 *   rawText：原始文本。
 *   promptProfile：注入画像。
 *   intent：当前意图。
 * 返回：渲染后的文本。
 */
export function renderInjectedContext(
    rawText: string,
    promptProfile: PromptInjectionProfile,
    intent: InjectionIntent,
): string {
    const body = String(rawText ?? '').trim();
    if (!body) {
        return '';
    }
    const lead = buildSoftLead(promptProfile.softPersonaMode, intent);
    if (promptProfile.renderStyle === 'markdown') {
        return [`## ${lead}`, body].filter(Boolean).join('\n\n');
    }
    if (promptProfile.renderStyle === 'comment') {
        return `/* ${lead}\n${body}\n*/`;
    }
    if (promptProfile.renderStyle === 'compact_kv') {
        const compactBody = body
            .split('\n')
            .map((line: string): string => line.replace(/^\s*[-*#]+\s*/, '').trim())
            .filter(Boolean)
            .join(' | ');
        return `${lead}: ${compactBody}`;
    }
    if (promptProfile.renderStyle === 'minimal_bullets') {
        const bulletBody = body
            .split('\n')
            .map((line: string): string => line.trim())
            .filter(Boolean)
            .map((line: string): string => (line.startsWith('-') ? line : `- ${line}`));
        return [`${lead}:`, ...bulletBody].join('\n');
    }
    return `\n<${promptProfile.wrapTag}>\n<MODE>${lead}</MODE>\n${body}\n</${promptProfile.wrapTag}>\n`;
}

/**
 * 功能：把候选行装配成一个可注入的分区文本。
 * 参数：
 *   title：分区标题。
 *   lines：分区行列表。
 *   tokenBudget：分区预算。
 *   headerReserve：标题预留 token。
 * 返回：分区文本。
 */
export function assembleSection(title: string, lines: string[], tokenBudget: number, headerReserve: number): string {
    if (!Array.isArray(lines) || lines.length <= 0 || tokenBudget <= 0) {
        return '';
    }
    const kept: string[] = [];
    for (const line of lines) {
        const trimmed = String(line ?? '').trim();
        if (!trimmed) {
            continue;
        }
        if (!canAppend(kept, trimmed, tokenBudget, headerReserve)) {
            break;
        }
        kept.push(trimmed);
    }
    return kept.length > 0 ? `${title}\n${kept.join('\n')}` : '';
}

/**
 * 功能：根据候选列表构建最终分区文本。
 * 参数：
 *   section：分区名称。
 *   candidates：候选列表。
 *   tokenBudget：分区预算。
 *   promptProfile：注入画像。
 * 返回：分区文本。
 */
export function buildSectionText(
    section: InjectionSectionName,
    candidates: RecallCandidate[],
    tokenBudget: number,
    _promptProfile: PromptInjectionProfile,
): string {
    if (tokenBudget <= 0 || candidates.length <= 0) {
        return '';
    }
    const title = readSectionTitle(section);
    const headerReserve = readSectionHeaderReserve(section);
    const sortedCandidates = [...candidates].sort((left: RecallCandidate, right: RecallCandidate): number => right.finalScore - left.finalScore);
    const lines = sortedCandidates
        .map((candidate: RecallCandidate): string => String(candidate.renderedLine ?? candidate.rawText).trim())
        .filter((line: string): boolean => line.length > 0);
    return assembleSection(title, lines, tokenBudget, headerReserve);
}
