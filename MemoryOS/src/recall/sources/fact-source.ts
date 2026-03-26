import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    extractEntityFocusTerms,
    isCharacterFact,
    isRelationshipFact,
    loadFacts,
    normalizeText,
    readSourceLimit,
    stringifyValue,
    type FactRecord,
    type RecallSourceContext,
} from './shared';

/**
 * 功能：判断事实条目是否与当前查询中的实体词显式命中。
 * @param query 用户查询。
 * @param fact 事实条目。
 * @returns 命中时返回 `true`。
 */
function isFactEntityMatched(query: string, fact: FactRecord): boolean {
    const terms = extractEntityFocusTerms(query);
    if (terms.length <= 0) {
        return false;
    }
    const haystack = normalizeText([
        fact.type,
        fact.path,
        fact.entity?.kind,
        fact.entity?.id,
        stringifyValue(fact.value),
    ].join(' ')).toLowerCase();
    return terms.some((term: string): boolean => haystack.includes(term.toLowerCase()));
}

/**
 * 功能：按“实体命中优先 + 其余补位”重排事实候选，避免评分前被过早截断。
 * @param query 用户查询。
 * @param facts 原始事实列表。
 * @returns 重排后的事实列表。
 */
function reorderFactsByQuery(query: string, facts: FactRecord[]): FactRecord[] {
    const matched: FactRecord[] = [];
    const rest: FactRecord[] = [];
    facts.forEach((fact: FactRecord): void => {
        if (isFactEntityMatched(query, fact)) {
            matched.push(fact);
        } else {
            rest.push(fact);
        }
    });
    return [...matched, ...rest];
}

export async function collectFactRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const facts = await loadFacts(context);
    const includeCharacterSection = context.plan.sections.includes('CHARACTER_FACTS');
    const includeRelationshipSection = context.plan.sections.includes('RELATIONSHIPS');
    const sourceLimit = readSourceLimit(context, 'facts', 6);
    const orderedFacts = reorderFactsByQuery(context.query, facts);
    const candidates: RecallCandidate[] = [];

    if (context.plan.sections.includes('FACTS')) {
        orderedFacts
            .filter((fact: FactRecord): boolean => {
                if (includeCharacterSection && isCharacterFact(fact)) {
                    return false;
                }
                if (includeRelationshipSection && isRelationshipFact(fact)) {
                    return false;
                }
                return true;
            })
            .slice(0, sourceLimit * 3)
            .forEach((fact: FactRecord): void => {
                const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
                const rawText = `${entityPart}${fact.type}${fact.path ? `.${fact.path}` : ''}: ${stringifyValue(fact.value)}`;
                const candidate = buildScoredCandidate(context, {
                    candidateId: `fact:${normalizeText(fact.factKey || rawText)}`,
                    recordKey: normalizeText(fact.factKey || rawText),
                    recordKind: 'fact',
                    source: 'facts',
                    sectionHint: 'FACTS',
                    title: normalizeText(fact.type || fact.path || 'fact'),
                    rawText,
                    confidence: Number(fact.confidence ?? fact.encodeScore ?? 0.55),
                    updatedAt: Number(fact.updatedAt ?? 0),
                    memoryType: fact.memoryType,
                    memorySubtype: fact.memorySubtype,
                    sourceScope: fact.sourceScope,
                    ownerActorKey: fact.ownerActorKey ?? null,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    if (context.plan.sections.includes('CHARACTER_FACTS')) {
        orderedFacts
            .filter((fact: FactRecord): boolean => isCharacterFact(fact))
            .slice(0, sourceLimit * 2)
            .forEach((fact: FactRecord): void => {
                const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
                const rawText = `${entityPart}${fact.path || fact.type}: ${stringifyValue(fact.value)}`;
                const candidate = buildScoredCandidate(context, {
                    candidateId: `character:${normalizeText(fact.factKey || rawText)}`,
                    recordKey: normalizeText(fact.factKey || rawText),
                    recordKind: 'fact',
                    source: 'facts',
                    sectionHint: 'CHARACTER_FACTS',
                    title: normalizeText(fact.path || fact.type || 'character_fact'),
                    rawText,
                    confidence: Number(fact.confidence ?? fact.encodeScore ?? 0.56),
                    updatedAt: Number(fact.updatedAt ?? 0),
                    memoryType: fact.memoryType,
                    memorySubtype: fact.memorySubtype,
                    sourceScope: fact.sourceScope,
                    ownerActorKey: fact.ownerActorKey ?? null,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    return candidates;
}
