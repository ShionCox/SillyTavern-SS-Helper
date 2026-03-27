import type { MemoryEntry } from '../types';
import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';
import type { ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { parseColdStartDocument } from './bootstrap-parser';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';

/**
 * 功能：冷启动编排依赖。
 */
export interface BootstrapOrchestratorDependencies {
    ensureActorProfile(input: {
        actorKey: string;
        displayName?: string;
        memoryStat?: number;
    }): Promise<unknown>;
    saveEntry(input: Partial<MemoryEntry> & { title: string; entryType: string }): Promise<MemoryEntry>;
    bindRoleToEntry(actorKey: string, entryId: string): Promise<unknown>;
    putWorldProfileBinding(input: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
        detectedFrom: string[];
    }): Promise<unknown>;
    appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<unknown>;
}

/**
 * 功能：冷启动编排输入。
 */
export interface RunBootstrapOrchestratorInput {
    dependencies: BootstrapOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    sourceBundle: ColdStartSourceBundle;
}

/**
 * 功能：冷启动编排结果。
 */
export interface RunBootstrapOrchestratorResult {
    ok: boolean;
    reasonCode: string;
    worldProfile?: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
}

/**
 * 功能：执行冷启动编排。
 * @param input 编排输入。
 * @returns 编排结果。
 */
export async function runBootstrapOrchestrator(input: RunBootstrapOrchestratorInput): Promise<RunBootstrapOrchestratorResult> {
    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_started',
        payload: {
            reason: input.sourceBundle.reason,
            sourceTextCount: sourceTexts.length,
        },
    });
    if (!input.llm) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'llm_unavailable' },
        });
        return { ok: false, reasonCode: 'llm_unavailable' };
    }
    const promptPack = await loadPromptPackSections();
    const coldStartSchema = parseJsonSection(promptPack.COLD_START_SCHEMA);
    const sourcePayload = { sourceBundle: input.sourceBundle };
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(sourcePayload, null, 2),
        JSON.stringify(coldStartSchema ?? {}, null, 2),
    );
    const result = await input.llm.runTask<ColdStartDocument>({
        consumer: input.pluginId,
        taskId: 'memory_cold_start',
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: promptPack.COLD_START_SYSTEM },
                { role: 'user', content: userPayload },
            ],
        },
        schema: coldStartSchema,
        budget: { maxLatencyMs: 12_000 },
        enqueue: { displayMode: 'compact' },
    });
    if (!result.ok) {
        const reasonCode = result.reasonCode || 'cold_start_failed';
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode },
        });
        return { ok: false, reasonCode };
    }
    const parsed = parseColdStartDocument(result.data);
    if (!parsed) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'invalid_cold_start_document' },
        });
        return { ok: false, reasonCode: 'invalid_cold_start_document' };
    }
    await input.dependencies.ensureActorProfile({
        actorKey: parsed.identity.actorKey,
        displayName: parsed.identity.displayName,
    });
    const actorProfileEntry = await input.dependencies.saveEntry({
        entryType: 'actor_profile',
        title: parsed.identity.displayName || parsed.identity.actorKey,
        summary: dedupeStrings([
            ...parsed.identity.identityFacts,
            ...parsed.identity.originFacts,
            ...parsed.identity.traits,
        ]).join('；'),
        detailPayload: {
            fields: {
                aliases: dedupeStrings(parsed.identity.aliases),
                identityFacts: dedupeStrings(parsed.identity.identityFacts),
                originFacts: dedupeStrings(parsed.identity.originFacts),
                traits: dedupeStrings(parsed.identity.traits),
            },
        },
        tags: ['cold_start', 'actor_profile'],
    });
    await input.dependencies.bindRoleToEntry(parsed.identity.actorKey, actorProfileEntry.entryId);

    for (const worldEntry of parsed.worldBase) {
        await input.dependencies.saveEntry({
            entryType: normalizeWorldBaseType(worldEntry.schemaId),
            title: worldEntry.title,
            summary: worldEntry.summary,
            detailPayload: {
                scope: worldEntry.scope,
            },
            tags: ['cold_start', 'world_base'],
        });
    }
    for (const relation of parsed.relationships) {
        const relationEntry = await input.dependencies.saveEntry({
            entryType: 'relationship',
            title: `${relation.sourceActorKey} -> ${relation.targetActorKey}`,
            summary: relation.summary,
            detailPayload: {
                trust: relation.trust,
                affection: relation.affection,
                tension: relation.tension,
            },
            tags: ['cold_start', 'relationship'],
        });
        await input.dependencies.bindRoleToEntry(relation.sourceActorKey, relationEntry.entryId);
    }
    for (const memoryRecord of parsed.memoryRecords) {
        const saved = await input.dependencies.saveEntry({
            entryType: memoryRecord.schemaId,
            title: memoryRecord.title,
            summary: memoryRecord.summary,
            detailPayload: {
                importance: memoryRecord.importance,
            },
            tags: ['cold_start'],
        });
        await input.dependencies.bindRoleToEntry(parsed.identity.actorKey, saved.entryId);
    }
    const worldProfile = resolveBootstrapWorldProfile(parsed, input.sourceBundle);
    await input.dependencies.putWorldProfileBinding({
        primaryProfile: worldProfile.primaryProfile,
        secondaryProfiles: worldProfile.secondaryProfiles,
        confidence: worldProfile.confidence,
        reasonCodes: worldProfile.reasonCodes,
        detectedFrom: sourceTexts.slice(0, 24),
    });
    await input.dependencies.appendMutationHistory({
        action: 'world_profile_bound',
        payload: {
            primaryProfile: worldProfile.primaryProfile,
            secondaryProfiles: worldProfile.secondaryProfiles,
            confidence: worldProfile.confidence,
            reasonCodes: worldProfile.reasonCodes,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_succeeded',
        payload: {
            actorKey: parsed.identity.actorKey,
            worldProfile,
            worldBaseCount: parsed.worldBase.length,
            relationshipCount: parsed.relationships.length,
            memoryRecordCount: parsed.memoryRecords.length,
        },
    });
    return {
        ok: true,
        reasonCode: 'ok',
        worldProfile,
    };
}

/**
 * 功能：归一化世界基础条目类型。
 * @param schemaId 原始 schemaId。
 * @returns 可落库 entryType。
 */
function normalizeWorldBaseType(schemaId: string): string {
    const normalized = String(schemaId ?? '').trim().toLowerCase();
    if (normalized === 'world_core_setting' || normalized === 'world_hard_rule' || normalized === 'world_global_state') {
        return normalized;
    }
    return 'world_global_state';
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：从结构化冷启动输入中展开可用于追踪的文本切片。
 * @param sourceBundle 冷启动源数据包。
 * @returns 去重后的文本列表。
 */
function collectBundleSourceTexts(sourceBundle: ColdStartSourceBundle): string[] {
    return dedupeStrings([
        sourceBundle.reason,
        sourceBundle.characterCard.name,
        sourceBundle.characterCard.description,
        sourceBundle.characterCard.personality,
        sourceBundle.characterCard.scenario,
        sourceBundle.characterCard.firstMessage,
        sourceBundle.characterCard.messageExample,
        sourceBundle.characterCard.creatorNotes,
        ...sourceBundle.characterCard.tags,
        sourceBundle.semantic.systemPrompt,
        sourceBundle.semantic.firstMessage,
        sourceBundle.semantic.authorNote,
        sourceBundle.semantic.jailbreak,
        sourceBundle.semantic.instruct,
        ...sourceBundle.semantic.activeLorebooks,
        sourceBundle.user.userName,
        sourceBundle.user.counterpartName,
        sourceBundle.user.personaDescription,
        sourceBundle.user.metadataPersona,
        sourceBundle.worldbooks.mainBook,
        ...sourceBundle.worldbooks.extraBooks,
        ...sourceBundle.worldbooks.activeBooks,
        ...sourceBundle.worldbooks.entries.map((entry): string => `${entry.entry} ${entry.content}`),
        ...sourceBundle.recentEvents,
    ]);
}

/**
 * 功能：从 section 文本解析 JSON。
 * @param section section 文本。
 * @returns 解析结果。
 */
function parseJsonSection(section: string): unknown {
    const source = String(section ?? '').trim();
    if (!source) {
        return null;
    }
    const fenced = source.match(/```json[\s\S]*?```/i);
    const jsonText = fenced
        ? fenced[0].replace(/```json/i, '').replace(/```/g, '').trim()
        : source;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}
