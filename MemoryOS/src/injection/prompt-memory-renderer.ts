import type {
    InjectionSectionName,
    MemoryContextBlockUsage,
    RecallCandidate,
    RecallPlan,
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

function canAppend(lines: string[], line: string, tokenBudget: number, headerReserve: number): boolean {
    const draft = lines.concat([line]).join('\n');
    return countTokens(draft) + headerReserve <= tokenBudget;
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
 * 功能：根据候选列表构建单个分区文本。
 * 参数：
 *   section：分区名称。
 *   candidates：候选列表。
 *   tokenBudget：分区预算。
 * 返回：分区文本。
 */
export function buildSectionText(
    section: InjectionSectionName,
    candidates: RecallCandidate[],
    tokenBudget: number,
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

function hasCandidateInPool(candidates: RecallCandidate[], pool: 'global' | 'actor'): boolean {
    return candidates.some((candidate: RecallCandidate): boolean => candidate.visibilityPool === pool && candidate.selected);
}

function collectSectionHints(candidates: RecallCandidate[]): InjectionSectionName[] {
    const seen = new Set<InjectionSectionName>();
    const hints: InjectionSectionName[] = [];
    for (const candidate of candidates) {
        if (!candidate.sectionHint || seen.has(candidate.sectionHint)) {
            continue;
        }
        seen.add(candidate.sectionHint);
        hints.push(candidate.sectionHint);
    }
    return hints;
}

function buildBlockHeader(kind: 'director_context' | 'active_character_memory', actorKey: string | null): string {
    if (kind === 'director_context') {
        return '<director_context>';
    }
    const normalizedActorKey = String(actorKey ?? '').trim();
    return `<active_character_memory actor="${normalizedActorKey}">`;
}

function buildBlockFooter(kind: 'director_context' | 'active_character_memory'): string {
    return kind === 'director_context' ? '</director_context>' : '</active_character_memory>';
}

function resolveBlockBudget(plan: RecallPlan, kind: 'director_context' | 'active_character_memory'): number {
    const focusShare = plan.viewpoint.focus.budgetShare;
    const share = kind === 'director_context'
        ? Number(focusShare.global ?? 0)
        : Number(focusShare.primaryActor ?? 0) + Number(focusShare.secondaryActors ?? 0);
    return Math.max(0, Math.floor(plan.maxTokens * share));
}

/**
 * 功能：按 director / actor 两层渲染 Memory Context。
 * 参数：
 *   input：渲染输入。
 * 返回：最终渲染结果。
 */
export function buildLayeredMemoryContext(input: {
    candidates: RecallCandidate[];
    plan: RecallPlan;
}): {
    text: string;
    blocksUsed: MemoryContextBlockUsage[];
} {
    const globalCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.selected && candidate.visibilityPool === 'global');
    const actorCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.selected && candidate.visibilityPool === 'actor');
    const blocks: Array<{ kind: 'director_context' | 'active_character_memory'; actorKey: string | null; candidates: RecallCandidate[] }> = [];

    if (hasCandidateInPool(globalCandidates, 'global')) {
        blocks.push({
            kind: 'director_context',
            actorKey: null,
            candidates: globalCandidates,
        });
    }
    if (input.plan.viewpoint.mode === 'actor_bounded' && hasCandidateInPool(actorCandidates, 'actor')) {
        blocks.push({
            kind: 'active_character_memory',
            actorKey: input.plan.viewpoint.activeActorKey ?? input.plan.viewpoint.focus.primaryActorKey ?? null,
            candidates: actorCandidates,
        });
    }

    const renderedBlocks: string[] = [];
    const blocksUsed: MemoryContextBlockUsage[] = [];

    for (const block of blocks) {
        const sectionMap = new Map<InjectionSectionName, RecallCandidate[]>();
        for (const candidate of block.candidates) {
            if (!candidate.sectionHint) {
                continue;
            }
            const bucket = sectionMap.get(candidate.sectionHint) ?? [];
            bucket.push(candidate);
            sectionMap.set(candidate.sectionHint, bucket);
        }
        const sectionHints = collectSectionHints(block.candidates);
        const blockBudget = resolveBlockBudget(input.plan, block.kind);
        const sectionTexts: string[] = [];
        let spentBudget = 0;
        for (const section of input.plan.sections) {
            const sectionCandidates = sectionMap.get(section) ?? [];
            if (sectionCandidates.length <= 0) {
                continue;
            }
            const sectionBudget = Math.max(24, Math.floor(blockBudget / Math.max(1, sectionHints.length || 1)));
            const text = buildSectionText(section, sectionCandidates, sectionBudget);
            if (!text) {
                continue;
            }
            spentBudget += countTokens(text);
            sectionTexts.push(text);
        }
        const body = sectionTexts.join('\n\n').trim();
        if (!body) {
            continue;
        }
        renderedBlocks.push([
            buildBlockHeader(block.kind, block.actorKey),
            body,
            buildBlockFooter(block.kind),
        ].join('\n'));
        blocksUsed.push({
            kind: block.kind,
            actorKey: block.actorKey,
            candidateCount: block.candidates.length,
            sectionHints,
            reasonCodes: [
                block.kind === 'director_context' ? 'block:director_context' : 'block:active_character_memory',
                ...(block.actorKey ? [`actor:${block.actorKey}`] : []),
                `candidates:${block.candidates.length}`,
                `sections:${sectionHints.join(',') || 'none'}`,
                `budget:${spentBudget}`,
            ],
        });
    }

    return {
        text: renderedBlocks.length > 0 ? ['[Memory Context]', ...renderedBlocks].join('\n') : '',
        blocksUsed,
    };
}

