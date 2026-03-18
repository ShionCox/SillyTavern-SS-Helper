import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    isCharacterFact,
    isRelationshipFact,
    loadFacts,
    normalizeText,
    readSourceLimit,
    stringifyValue,
    type FactRecord,
    type RecallSourceContext,
} from './shared';

export async function collectFactRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const facts = await loadFacts(context);
    const includeCharacterSection = context.plan.sections.includes('CHARACTER_FACTS');
    const includeRelationshipSection = context.plan.sections.includes('RELATIONSHIPS');
    const sourceLimit = readSourceLimit(context, 'facts', 6);
    const candidates: RecallCandidate[] = [];

    if (context.plan.sections.includes('FACTS')) {
        facts
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
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    if (context.plan.sections.includes('CHARACTER_FACTS')) {
        facts
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
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    return candidates;
}