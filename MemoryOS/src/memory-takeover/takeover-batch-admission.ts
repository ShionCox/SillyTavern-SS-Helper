import { isStrictActorKey, normalizeStrictActorKeySyntax } from '../core/actor-key';
import { collectMemoryNaturalLanguageFields, findMemoryTextPollution } from '../core/memory-quality-guard';
import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverBindings,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
} from '../types';

export interface TakeoverBatchAdmissionOutcome {
    accepted: boolean;
    result: MemoryTakeoverBatchResult;
    validationErrors: string[];
    repairActions: string[];
}

const NATURAL_LANGUAGE_FIELD_NAMES = new Set([
    'summary',
    'state',
    'reason',
    'displayName',
    'identityFacts',
    'originFacts',
    'traits',
    'title',
    'description',
    'from',
    'to',
]);

/**
 * 功能：在 takeover 主链进入 reducer 前执行批次准入校验。
 * 允许一次确定性本地修复；无法修复时隔离批次。
 * @param input 原始批次结果。
 * @returns 准入结果。
 */
export function admitTakeoverBatchResult(input: MemoryTakeoverBatchResult): TakeoverBatchAdmissionOutcome {
    const firstPass = validateTakeoverBatchResult(input);
    if (firstPass.validationErrors.length <= 0) {
        return {
            accepted: true,
            result: {
                ...input,
                validated: true,
                repairedOnce: false,
                isolated: false,
                validationErrors: [],
                repairActions: [],
            },
            validationErrors: [],
            repairActions: [],
        };
    }

    const repaired = repairTakeoverBatchResult(input);
    const secondPass = validateTakeoverBatchResult(repaired);
    if (secondPass.validationErrors.length <= 0) {
        return {
            accepted: true,
            result: {
                ...repaired,
                validated: true,
                repairedOnce: true,
                isolated: false,
                validationErrors: [],
                repairActions: repaired.repairActions ?? [],
            },
            validationErrors: [],
            repairActions: repaired.repairActions ?? [],
        };
    }

    return {
        accepted: false,
        result: {
            ...repaired,
            validated: false,
            repairedOnce: true,
            isolated: true,
            validationErrors: secondPass.validationErrors,
            repairActions: repaired.repairActions ?? [],
        },
        validationErrors: secondPass.validationErrors,
        repairActions: repaired.repairActions ?? [],
    };
}

function validateTakeoverBatchResult(result: MemoryTakeoverBatchResult): { validationErrors: string[] } {
    const validationErrors: string[] = [];

    result.actorCards.forEach((actorCard: MemoryTakeoverActorCardCandidate, index: number): void => {
        if (!isStrictActorKey(actorCard.actorKey) || String(actorCard.actorKey ?? '').trim().toLowerCase() === 'user') {
            validationErrors.push(`actorCards[${index}].actorKey:${String(actorCard.actorKey ?? '').trim() || '<empty>'}`);
        }
    });
    validationErrors.push(...validateDuplicateTakeoverKeys(result));
    validationErrors.push(...validateTakeoverTextQuality(result));

    result.relationships.forEach((relationship: MemoryTakeoverRelationshipCard, index: number): void => {
        if (!isStrictActorKey(relationship.sourceActorKey)) {
            validationErrors.push(`relationships[${index}].sourceActorKey:${String(relationship.sourceActorKey ?? '').trim() || '<empty>'}`);
        }
        if (!isStrictActorKey(relationship.targetActorKey)) {
            validationErrors.push(`relationships[${index}].targetActorKey:${String(relationship.targetActorKey ?? '').trim() || '<empty>'}`);
        }
        (relationship.participants ?? []).forEach((participant: string, participantIndex: number): void => {
            if (!isStrictActorKey(participant)) {
                validationErrors.push(`relationships[${index}].participants[${participantIndex}]:${String(participant ?? '').trim() || '<empty>'}`);
            }
        });
    });

    result.relationTransitions.forEach((transition: MemoryTakeoverRelationTransition, index: number): void => {
        if (transition.targetType === 'actor' && !isStrictActorKey(transition.target)) {
            validationErrors.push(`relationTransitions[${index}].target:${String(transition.target ?? '').trim() || '<empty>'}`);
        }
        collectBindingActorErrors(transition.bindings, `relationTransitions[${index}].bindings.actors`, validationErrors);
    });

    result.entityCards.forEach((entity: MemoryTakeoverEntityCardCandidate, index: number): void => {
        collectBindingActorErrors(entity.bindings, `entityCards[${index}].bindings.actors`, validationErrors);
    });
    result.entityTransitions.forEach((entity: MemoryTakeoverEntityTransition, index: number): void => {
        collectBindingActorErrors(entity.bindings, `entityTransitions[${index}].bindings.actors`, validationErrors);
    });
    result.stableFacts.forEach((fact: MemoryTakeoverStableFact, index: number): void => {
        collectBindingActorErrors(fact.bindings, `stableFacts[${index}].bindings.actors`, validationErrors);
    });
    result.taskTransitions.forEach((task: MemoryTakeoverTaskTransition, index: number): void => {
        collectBindingActorErrors(task.bindings, `taskTransitions[${index}].bindings.actors`, validationErrors);
    });
    result.worldStateChanges.forEach((change: MemoryTakeoverWorldStateChange, index: number): void => {
        collectBindingActorErrors(change.bindings, `worldStateChanges[${index}].bindings.actors`, validationErrors);
    });

    return {
        validationErrors: Array.from(new Set(validationErrors)),
    };
}

/**
 * 功能：检查 takeover 批次中的重复主键风险。
 * @param result 批次结果。
 * @returns 验证错误。
 */
function validateDuplicateTakeoverKeys(result: MemoryTakeoverBatchResult): string[] {
    const errors: string[] = [];
    const actorKeys = new Map<string, number>();
    result.actorCards.forEach((actorCard: MemoryTakeoverActorCardCandidate): void => {
        const key = String(actorCard.actorKey ?? '').trim();
        if (key) {
            actorKeys.set(key, (actorKeys.get(key) ?? 0) + 1);
        }
    });
    for (const [key, count] of actorKeys.entries()) {
        if (count > 1) {
            errors.push(`duplicate_actor_key:${key}`);
        }
    }
    const entityKeys = new Map<string, number>();
    result.entityCards.forEach((entity: MemoryTakeoverEntityCardCandidate): void => {
        const key = String(entity.entityKey ?? '').trim();
        if (key) {
            entityKeys.set(key, (entityKeys.get(key) ?? 0) + 1);
        }
    });
    for (const [key, count] of entityKeys.entries()) {
        if (count > 1) {
            errors.push(`duplicate_entity_key:${key}`);
        }
    }
    return errors;
}

/**
 * 功能：检查 takeover 输出是否包含系统腔或用户指代污染。
 * @param result 批次结果。
 * @returns 验证错误。
 */
function validateTakeoverTextQuality(result: MemoryTakeoverBatchResult): string[] {
    const errors: string[] = [];
    const textMap = collectMemoryNaturalLanguageFields(result, NATURAL_LANGUAGE_FIELD_NAMES);
    for (const issue of findMemoryTextPollution(textMap, { includeSecondPersonAlias: false })) {
        if (issue.kind === 'system_tone') {
            errors.push(`system_tone_pollution:${issue.path}`);
        } else {
            errors.push(`user_alias_pollution:${issue.path}`);
        }
    }
    return errors;
}

function repairTakeoverBatchResult(result: MemoryTakeoverBatchResult): MemoryTakeoverBatchResult {
    const repairActions: string[] = [];
    return {
        ...result,
        actorCards: result.actorCards.map((actorCard: MemoryTakeoverActorCardCandidate): MemoryTakeoverActorCardCandidate => {
            const normalizedActorKey = normalizeStrictActorKeySyntax(actorCard.actorKey);
            if (normalizedActorKey !== String(actorCard.actorKey ?? '').trim()) {
                repairActions.push(`normalize_actor_key:${String(actorCard.actorKey ?? '').trim()}=>${normalizedActorKey}`);
            }
            return {
                ...actorCard,
                actorKey: normalizedActorKey,
            };
        }),
        relationships: result.relationships.map((relationship: MemoryTakeoverRelationshipCard): MemoryTakeoverRelationshipCard => {
            const sourceActorKey = normalizeStrictActorKeySyntax(relationship.sourceActorKey);
            const targetActorKey = normalizeStrictActorKeySyntax(relationship.targetActorKey);
            const participants = repairActorKeyList([
                sourceActorKey,
                targetActorKey,
                ...(relationship.participants ?? []),
            ], 'relationship.participants', repairActions);
            return {
                ...relationship,
                sourceActorKey,
                targetActorKey,
                participants,
            };
        }),
        entityCards: result.entityCards.map((entity: MemoryTakeoverEntityCardCandidate): MemoryTakeoverEntityCardCandidate => ({
            ...entity,
            bindings: repairBindings(entity.bindings, 'entityCards.bindings.actors', repairActions),
        })),
        entityTransitions: result.entityTransitions.map((entity: MemoryTakeoverEntityTransition): MemoryTakeoverEntityTransition => ({
            ...entity,
            bindings: repairBindings(entity.bindings, 'entityTransitions.bindings.actors', repairActions),
        })),
        stableFacts: result.stableFacts.map((fact: MemoryTakeoverStableFact): MemoryTakeoverStableFact => ({
            ...fact,
            bindings: repairBindings(fact.bindings, 'stableFacts.bindings.actors', repairActions),
        })),
        relationTransitions: result.relationTransitions.map((transition: MemoryTakeoverRelationTransition): MemoryTakeoverRelationTransition => ({
            ...transition,
            target: transition.targetType === 'actor' ? normalizeStrictActorKeySyntax(transition.target) : String(transition.target ?? '').trim(),
            bindings: repairBindings(transition.bindings, 'relationTransitions.bindings.actors', repairActions),
        })),
        taskTransitions: result.taskTransitions.map((task: MemoryTakeoverTaskTransition): MemoryTakeoverTaskTransition => ({
            ...task,
            bindings: repairBindings(task.bindings, 'taskTransitions.bindings.actors', repairActions),
        })),
        worldStateChanges: result.worldStateChanges.map((change: MemoryTakeoverWorldStateChange): MemoryTakeoverWorldStateChange => ({
            ...change,
            bindings: repairBindings(change.bindings, 'worldStateChanges.bindings.actors', repairActions),
        })),
        repairActions,
    };
}

function collectBindingActorErrors(bindings: MemoryTakeoverBindings | undefined, fieldPath: string, validationErrors: string[]): void {
    (bindings?.actors ?? []).forEach((actorKey: string, index: number): void => {
        if (!isStrictActorKey(actorKey)) {
            validationErrors.push(`${fieldPath}[${index}]:${String(actorKey ?? '').trim() || '<empty>'}`);
        }
    });
}

function repairBindings(bindings: MemoryTakeoverBindings | undefined, fieldPath: string, repairActions: string[]): MemoryTakeoverBindings | undefined {
    if (!bindings) {
        return bindings;
    }
    return {
        ...bindings,
        actors: repairActorKeyList(bindings.actors ?? [], fieldPath, repairActions),
    };
}

function repairActorKeyList(values: string[], fieldPath: string, repairActions: string[]): string[] {
    const repaired: string[] = [];
    values.forEach((value: string): void => {
        const normalized = normalizeStrictActorKeySyntax(value);
        if (!isStrictActorKey(normalized)) {
            repairActions.push(`drop_invalid_actor_key:${fieldPath}:${String(value ?? '').trim() || '<empty>'}`);
            return;
        }
        if (!repaired.includes(normalized)) {
            if (normalized !== String(value ?? '').trim()) {
                repairActions.push(`normalize_actor_key:${fieldPath}:${String(value ?? '').trim()}=>${normalized}`);
            }
            repaired.push(normalized);
        }
    });
    return repaired;
}
