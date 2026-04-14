import { stripRollHelperArtifactsEvent } from '../../../SDK/tavern';
import { logger } from "../../index";
import {
    getActiveSwipeExtraContainerEvent,
    getMessageInteractiveTriggersEvent,
    getMessageInteractiveTriggerLifecycleMetaEvent,
    getMessageTriggerPackEvent,
    parseInteractiveTriggerMetadataFromTextEvent,
    setMessageInteractiveTriggerLifecycleMetaEvent,
    setMessageInteractiveTriggersEvent,
    setMessageTriggerPackEvent,
    stripInteractiveTriggerMarkupFromTextEvent,
} from "./interactiveTriggerMetadataEvent";
import type { DiceEventSpecEvent, InteractiveTriggerEvent, TavernMessageEvent, TriggerPackEvent } from "../types/eventDomainEvent";

const RH_ORIGINAL_SOURCE_KEY_Event = "rollhelper_original_source_v1";
const RH_ORIGINAL_SOURCE_ENABLED_KEY_Event = "rollhelper_original_source_enabled_v1";
const RH_ORIGINAL_SOURCE_META_KEY_Event = "rollhelper_original_source_meta_v1";

export type AssistantOriginalSourceMetaEvent = {
    source: "host" | "plugin_snapshot" | "fallback";
    capturedAt: number;
    richnessScore: number;
    containsRollJson: boolean;
    containsEventEnvelope: boolean;
    containsInteractiveTrigger: boolean;
};

export function getMessageTextSafe(message: any): string {
    if (!message) return '';

    // 优先读取当前 swipe
    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
        const id = message.swipe_id;
        if (id >= 0 && id < message.swipes.length) {
            const swipe = message.swipes[id];

            if (typeof swipe === 'string') return swipe;
            if (swipe && typeof swipe === 'object') {
                if (typeof swipe.mes === 'string') return swipe.mes;
                if (typeof swipe.content === 'string') return swipe.content;
                if (typeof swipe.text === 'string') return swipe.text;
            }
        }
    }

    if (typeof message.mes === 'string') return message.mes;
    if (typeof message.content === 'string') return message.content;
    if (typeof message.text === 'string') return message.text;

    return '';
}

export function setMessageTextSafe(message: any, newText: string) {
    if (!message) return message;

    if (typeof message.mes !== 'undefined') {
        message.mes = newText;
    }

    if (typeof message.content !== 'undefined') {
        message.content = newText;
    }

    if (typeof message.text !== 'undefined') {
        message.text = newText;
    }

    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
        const id = message.swipe_id;
        if (id >= 0 && id < message.swipes.length) {
            const swipe = message.swipes[id];

            if (typeof swipe === 'string') {
                message.swipes[id] = newText;
            } else if (swipe && typeof swipe === 'object') {
                if (typeof swipe.mes !== 'undefined') swipe.mes = newText;
                if (typeof swipe.content !== 'undefined') swipe.content = newText;
                if (typeof swipe.text !== 'undefined') swipe.text = newText;
            }
        }
    }

    return message;
}

export function isDiceLikeJson(body: string): boolean {
    if (!body) return false;
    return [
        /"type"\s*:\s*"dice_events"/i,
        /"rolls"\s*:/i,
        /"check_result"\s*:/i,
        /"dice"\s*:/i,
        /"dc"\s*:/i,
    ].some((re) => re.test(body));
}

export function stripRollJsonBlocks(text: string): string {
    return stripInteractiveTriggerMarkupFromTextEvent(stripRollHelperArtifactsEvent(text))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getMessageExtraContainerEvent(message: TavernMessageEvent, create = false): Record<string, unknown> | null {
    if (!message || typeof message !== "object") return null;
    const record = message as Record<string, unknown>;
    let extra = record.extra;
    if (!extra || typeof extra !== "object") {
        if (!create) return null;
        extra = {};
        record.extra = extra;
    }
    return extra as Record<string, unknown>;
}

function getAssistantOriginalSourceContainerEvent(
    message: TavernMessageEvent,
    create = false
): Record<string, unknown> | null {
    const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
    if (Number.isFinite(swipeId) && swipeId >= 0) {
        return getActiveSwipeExtraContainerEvent(message, create);
    }
    return getMessageExtraContainerEvent(message, create);
}

function clearAssistantOriginalSourceMetaEvent(message: TavernMessageEvent): boolean {
    const container = getAssistantOriginalSourceContainerEvent(message, false);
    if (!container) return false;
    let changed = false;
    if (RH_ORIGINAL_SOURCE_KEY_Event in container) {
        delete container[RH_ORIGINAL_SOURCE_KEY_Event];
        changed = true;
    }
    if (RH_ORIGINAL_SOURCE_ENABLED_KEY_Event in container) {
        delete container[RH_ORIGINAL_SOURCE_ENABLED_KEY_Event];
        changed = true;
    }
    if (RH_ORIGINAL_SOURCE_META_KEY_Event in container) {
        delete container[RH_ORIGINAL_SOURCE_META_KEY_Event];
        changed = true;
    }
    return changed;
}

function setAssistantOriginalSourceMetaEvent(
    message: TavernMessageEvent,
    originalSourceText: string,
    enabled: boolean,
    meta?: AssistantOriginalSourceMetaEvent
): boolean {
    const normalizedText = String(originalSourceText ?? "");
    const normalizedEnabled = Boolean(enabled && normalizedText.trim());
    if (!normalizedEnabled) {
        return clearAssistantOriginalSourceMetaEvent(message);
    }
    const container = getAssistantOriginalSourceContainerEvent(message, true);
    if (!container) return false;
    let changed = false;
    const previousText = String(container[RH_ORIGINAL_SOURCE_KEY_Event] ?? "");
    const previousEnabled = container[RH_ORIGINAL_SOURCE_ENABLED_KEY_Event] === true;
    if (previousText !== normalizedText) {
        container[RH_ORIGINAL_SOURCE_KEY_Event] = normalizedText;
        changed = true;
    }
    if (!previousEnabled) {
        container[RH_ORIGINAL_SOURCE_ENABLED_KEY_Event] = true;
        changed = true;
    }
    const previousMeta = container[RH_ORIGINAL_SOURCE_META_KEY_Event];
    if (meta) {
        const nextMetaJson = JSON.stringify(meta);
        const previousMetaJson = previousMeta == null ? "" : JSON.stringify(previousMeta);
        if (previousMetaJson !== nextMetaJson) {
            container[RH_ORIGINAL_SOURCE_META_KEY_Event] = meta;
            changed = true;
        }
    }
    return changed;
}

export function rememberAssistantOriginalSourceTextEvent(
    message: TavernMessageEvent,
    originalSourceText: string,
    enabled = true,
    meta?: AssistantOriginalSourceMetaEvent
): boolean {
    return setAssistantOriginalSourceMetaEvent(message, originalSourceText, enabled, meta);
}

export function resetAssistantSwipeRuntimeStateEvent(message: TavernMessageEvent): boolean {
    return clearAssistantOriginalSourceMetaEvent(message);
}

export function getPersistedAssistantOriginalSourceTextEvent(message: TavernMessageEvent | undefined): string {
    if (!message || typeof message !== "object") return "";
    const container = getAssistantOriginalSourceContainerEvent(message, false);
    const enabled = container?.[RH_ORIGINAL_SOURCE_ENABLED_KEY_Event] === true;
    const text = String(container?.[RH_ORIGINAL_SOURCE_KEY_Event] ?? "");
    if (enabled && text.trim()) return text;
    return "";
}

export function getPersistedAssistantOriginalSourceMetaEvent(
    message: TavernMessageEvent | undefined
): AssistantOriginalSourceMetaEvent | null {
    if (!message || typeof message !== "object") return null;
    const container = getAssistantOriginalSourceContainerEvent(message, false);
    const meta = container?.[RH_ORIGINAL_SOURCE_META_KEY_Event];
    if (!meta || typeof meta !== "object") return null;
    return meta as AssistantOriginalSourceMetaEvent;
}

type AssistantOriginalSourceCandidateDepsEvent = Pick<
    SanitizeAssistantMessageArtifactsDepsEvent,
    | "getHostOriginalSourceTextEvent"
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
    | "parseEventEnvelopesEvent"
>;

function normalizeAssistantOriginalSourceCandidatesEvent(sourceCandidates: string[]): string[] {
    return sourceCandidates
        .map((item) => String(item ?? "").trim())
        .filter((item, candidateIndex, array) => item && array.indexOf(item) === candidateIndex);
}

export function scoreAssistantOriginalSourceRichnessEvent(
    text: string,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent">
): number {
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) return 0;

    let score = 1;
    if (/<rh-trigger\b/i.test(normalizedText)) {
        score += 10;
    }
    if (/"type"\s*:\s*"trigger_pack"/i.test(normalizedText)) {
        score += 10;
    }
    if (deps.parseEventEnvelopesEvent) {
        const parsed = deps.parseEventEnvelopesEvent(normalizedText);
        if (parsed.events.length > 0 || parsed.ranges.length > 0) {
            score += 20;
        }
    }
    if (stripRollJsonBlocks(normalizedText) !== normalizedText) {
        score += 20;
    }
    score += Math.min(5, Math.floor(normalizedText.length / 400));
    return score;
}

export function buildAssistantOriginalSourceMetaEvent(
    text: string,
    source: AssistantOriginalSourceMetaEvent["source"],
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent">
): AssistantOriginalSourceMetaEvent {
    const normalizedText = String(text ?? "").trim();
    const parsed = deps.parseEventEnvelopesEvent?.(normalizedText);
    return {
        source,
        capturedAt: Date.now(),
        richnessScore: scoreAssistantOriginalSourceRichnessEvent(normalizedText, deps),
        containsRollJson: stripRollJsonBlocks(normalizedText) !== normalizedText,
        containsEventEnvelope: Boolean(parsed && (parsed.events.length > 0 || parsed.ranges.length > 0)),
        containsInteractiveTrigger: /<rh-trigger\b/i.test(normalizedText) || /"type"\s*:\s*"trigger_pack"/i.test(normalizedText),
    };
}

function collectAssistantSourceCandidatesEvent(
    message: TavernMessageEvent,
    deps: Pick<
        SanitizeAssistantMessageArtifactsDepsEvent,
        | "getHostOriginalSourceTextEvent"
        | "getPreferredAssistantSourceTextEvent"
        | "getMessageTextEvent"
    >
): string[] {
    const getStableText = (target: TavernMessageEvent | undefined) => getPersistedAssistantOriginalSourceTextEvent(target);
    const getOriginalText = deps.getHostOriginalSourceTextEvent ?? ((target) => "");
    const getPreferredText = deps.getPreferredAssistantSourceTextEvent ?? ((target) => getMessageTextSafe(target));
    const getFallbackText = deps.getMessageTextEvent ?? ((target) => getMessageTextSafe(target));
    return normalizeAssistantOriginalSourceCandidatesEvent([
        getStableText(message),
        getOriginalText(message),
        getPreferredText(message),
        getFallbackText(message),
    ]);
}

export interface SanitizeAssistantMessageArtifactsDepsEvent {
    getSettingsEvent?: () => {
        defaultBlindSkillsText?: string;
    };
    getHostOriginalSourceTextEvent?: (message: TavernMessageEvent | undefined) => string;
    getPreferredAssistantSourceTextEvent?: (message: TavernMessageEvent | undefined) => string;
    getMessageTextEvent?: (message: TavernMessageEvent | undefined) => string;
    parseEventEnvelopesEvent?: (text: string) => {
        events: DiceEventSpecEvent[];
        ranges: Array<{ start: number; end: number }>;
        shouldEndRound?: boolean;
    };
    removeRangesEvent?: (text: string, ranges: Array<{ start: number; end: number }>) => string;
    setMessageTextEvent?: (message: TavernMessageEvent, text: string) => void;
    resolveSourceMessageIdEvent?: (message: TavernMessageEvent, index?: number) => string;
    sourceState?: "display_text" | "raw_source" | "edited_source";
}

export type AssistantMessageSanitizeResultEvent = {
    cleanText: string;
    events: DiceEventSpecEvent[];
    triggers: InteractiveTriggerEvent[];
    triggerPack: TriggerPackEvent | null;
    shouldEndRound: boolean;
    hasRollArtifacts: boolean;
    hasTriggerArtifacts: boolean;
    changedText: boolean;
    changedMetadata: boolean;
};

function stripEventArtifactsFromTextEvent(
    text: string,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent" | "removeRangesEvent">
): { cleanText: string; hasRollArtifacts: boolean } {
    const rawText = String(text ?? "");
    if (!rawText.trim()) {
        return {
            cleanText: "",
            hasRollArtifacts: false,
        };
    }
    if (deps.parseEventEnvelopesEvent && deps.removeRangesEvent) {
        const parsed = deps.parseEventEnvelopesEvent(rawText);
        return {
            cleanText: parsed.ranges.length > 0 ? deps.removeRangesEvent(rawText, parsed.ranges) : rawText,
            hasRollArtifacts: parsed.ranges.length > 0,
        };
    }
    const cleanedText = stripRollJsonBlocks(rawText);
    return {
        cleanText: cleanedText,
        hasRollArtifacts: cleanedText !== rawText,
    };
}

function selectArtifactSourceTextEvent(
    sourceCandidates: string[],
    getSettingsEvent: SanitizeAssistantMessageArtifactsDepsEvent["getSettingsEvent"],
    sourceMessageId: string,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent" | "removeRangesEvent">
): string {
    for (const candidate of sourceCandidates) {
        const envelope = stripEventArtifactsFromTextEvent(candidate, deps);
        const triggerParsed = parseInteractiveTriggerMetadataFromTextEvent(envelope.cleanText, {
            settings: getSettingsEvent?.(),
            sourceMessageId,
        });
        if (envelope.hasRollArtifacts || triggerParsed.foundTriggerMarkup || triggerParsed.foundTriggerPack) {
            return candidate;
        }
    }
    return sourceCandidates[0] ?? "";
}

function parseEventEnvelopeArtifactsEvent(
    text: string,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent" | "removeRangesEvent">
): {
    events: DiceEventSpecEvent[];
    shouldEndRound: boolean;
    cleanText: string;
    hasRollArtifacts: boolean;
} {
    const rawText = String(text ?? "");
    if (!rawText.trim()) {
        return {
            events: [],
            shouldEndRound: false,
            cleanText: "",
            hasRollArtifacts: false,
        };
    }
    if (deps.parseEventEnvelopesEvent && deps.removeRangesEvent) {
        const parsed = deps.parseEventEnvelopesEvent(rawText);
        return {
            events: Array.isArray(parsed.events) ? parsed.events : [],
            shouldEndRound: Boolean(parsed.shouldEndRound),
            cleanText: parsed.ranges.length > 0 ? deps.removeRangesEvent(rawText, parsed.ranges) : rawText,
            hasRollArtifacts: parsed.ranges.length > 0,
        };
    }
    const stripped = stripRollJsonBlocks(rawText);
    return {
        events: [],
        shouldEndRound: false,
        cleanText: stripped,
        hasRollArtifacts: stripped !== rawText,
    };
}

function applyAssistantMessageSanitizeResultEvent(
    message: TavernMessageEvent,
    result: AssistantMessageSanitizeResultEvent,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "setMessageTextEvent" | "sourceState" | "getSettingsEvent">
): boolean {
    let changed = false;
    const setText = deps.setMessageTextEvent ?? ((target, text) => {
        setMessageTextSafe(target, text);
    });
    if (result.changedText) {
        setText(message, result.cleanText);
        changed = true;
    }
    if (deps.getSettingsEvent) {
        setMessageInteractiveTriggersEvent(message, result.triggers);
        setMessageTriggerPackEvent(message, result.triggerPack);
        setMessageInteractiveTriggerLifecycleMetaEvent(message, {
            hydratedFrom: result.hasTriggerArtifacts ? "markup" : "metadata",
            sanitizedAt: Date.now(),
            lastSourceKind: deps.sourceState || "display_text",
        });
        changed = changed || result.changedMetadata;
    }
    return changed;
}

export function sanitizeAssistantMessageArtifactsOnceEvent(
    message: TavernMessageEvent,
    index: number | undefined,
    deps: SanitizeAssistantMessageArtifactsDepsEvent
): AssistantMessageSanitizeResultEvent {
    const sourceMessageId = deps.resolveSourceMessageIdEvent?.(message, index) || "";
    const getPreferredText = deps.getPreferredAssistantSourceTextEvent ?? ((target) => getMessageTextSafe(target));
    const getFallbackText = deps.getMessageTextEvent ?? ((target) => getMessageTextSafe(target));
    const stableSourceText = getStableAssistantOriginalSourceTextEvent(message, {
        getHostOriginalSourceTextEvent: deps.getHostOriginalSourceTextEvent,
        getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
        getMessageTextEvent: deps.getMessageTextEvent,
        parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent ?? (() => ({ events: [], ranges: [] })),
    });
    const displayCandidates = normalizeAssistantOriginalSourceCandidatesEvent([
        getPreferredText(message),
        getFallbackText(message),
    ]);
    const sourceCandidates = normalizeAssistantOriginalSourceCandidatesEvent([
        stableSourceText,
        ...displayCandidates,
    ]);
    const envelopeSource = selectArtifactSourceTextEvent(
        sourceCandidates,
        deps.getSettingsEvent,
        sourceMessageId,
        deps
    );
    const envelopeParsed = parseEventEnvelopeArtifactsEvent(envelopeSource, deps);
    const displayTextSource = selectArtifactSourceTextEvent(
        displayCandidates.length > 0 ? displayCandidates : sourceCandidates,
        deps.getSettingsEvent,
        sourceMessageId,
        deps
    );
    const metadataSource = selectArtifactSourceTextEvent(
        sourceCandidates,
        deps.getSettingsEvent,
        sourceMessageId,
        deps
    );
    const strippedDisplayArtifacts = stripEventArtifactsFromTextEvent(displayTextSource, deps);
    const displayParsed = parseInteractiveTriggerMetadataFromTextEvent(strippedDisplayArtifacts.cleanText, {
        settings: deps.getSettingsEvent?.(),
        sourceMessageId,
    });
    const strippedMetadataArtifacts = stripEventArtifactsFromTextEvent(metadataSource, deps);
    const metadataParsed = parseInteractiveTriggerMetadataFromTextEvent(strippedMetadataArtifacts.cleanText, {
        settings: deps.getSettingsEvent?.(),
        sourceMessageId,
    });
    const nextCleanText = displayParsed.cleanText;
    const previousText = getFallbackText(message);
    const previousTriggers = getMessageInteractiveTriggersEvent(message);
    const previousTriggerPack = getMessageTriggerPackEvent(message);
    const previousLifecycleMeta = getMessageInteractiveTriggerLifecycleMetaEvent(message);
    const hasTriggerArtifacts = metadataParsed.foundTriggerMarkup || metadataParsed.foundTriggerPack;

    let nextTriggers = metadataParsed.foundTriggerMarkup ? metadataParsed.triggers : [];
    let nextTriggerPack = metadataParsed.foundTriggerPack ? metadataParsed.triggerPack : null;
    let hydratedFrom: "markup" | "metadata" = hasTriggerArtifacts ? "markup" : "metadata";

    if (!hasTriggerArtifacts) {
        const stableStrippedArtifacts = stripEventArtifactsFromTextEvent(stableSourceText, deps);
        const stableParsed = parseInteractiveTriggerMetadataFromTextEvent(stableStrippedArtifacts.cleanText, {
            settings: deps.getSettingsEvent?.(),
            sourceMessageId,
        });
        if (stableParsed.foundTriggerMarkup || stableParsed.foundTriggerPack) {
            nextTriggers = stableParsed.foundTriggerMarkup ? stableParsed.triggers : [];
            nextTriggerPack = stableParsed.foundTriggerPack ? stableParsed.triggerPack : null;
        } else if (deps.sourceState === "display_text") {
            nextTriggers = previousTriggers;
            nextTriggerPack = previousTriggerPack;
        }
    }

    const changedText = nextCleanText !== previousText;
    const nextTriggersJson = JSON.stringify(nextTriggers);
    const prevTriggersJson = JSON.stringify(previousTriggers);
    const nextPackJson = JSON.stringify(nextTriggerPack);
    const prevPackJson = JSON.stringify(previousTriggerPack);
    const nextLifecycleJson = JSON.stringify({
        hydratedFrom,
        lastSourceKind: deps.sourceState || "display_text",
    });
    const prevLifecycleJson = JSON.stringify({
        hydratedFrom: previousLifecycleMeta?.hydratedFrom || "metadata",
        lastSourceKind: previousLifecycleMeta?.lastSourceKind || "display_text",
    });

    return {
        cleanText: nextCleanText,
        events: envelopeParsed.events,
        triggers: nextTriggers,
        triggerPack: nextTriggerPack,
        shouldEndRound: envelopeParsed.shouldEndRound,
        hasRollArtifacts: envelopeParsed.hasRollArtifacts || strippedDisplayArtifacts.hasRollArtifacts || strippedMetadataArtifacts.hasRollArtifacts,
        hasTriggerArtifacts,
        changedText,
        changedMetadata: nextTriggersJson !== prevTriggersJson || nextPackJson !== prevPackJson || nextLifecycleJson !== prevLifecycleJson,
    };
}

export function ensureAssistantOriginalSnapshotPersistedEvent(
    message: TavernMessageEvent,
    deps: AssistantOriginalSourceCandidateDepsEvent
): boolean {
    const currentStableText = getPersistedAssistantOriginalSourceTextEvent(message);
    const currentStableTrimmed = currentStableText.trim();
    let bestText = currentStableTrimmed;
    let bestScore = scoreAssistantOriginalSourceRichnessEvent(currentStableTrimmed, deps);
    let bestSource: AssistantOriginalSourceMetaEvent["source"] = currentStableTrimmed ? "plugin_snapshot" : "fallback";

    const sourceCandidates = [
        {
            text: String(deps.getHostOriginalSourceTextEvent?.(message) ?? "").trim(),
            source: "host" as const,
        },
        {
            text: String(deps.getPreferredAssistantSourceTextEvent?.(message) ?? getMessageTextSafe(message)).trim(),
            source: "fallback" as const,
        },
        {
            text: String(deps.getMessageTextEvent?.(message) ?? getMessageTextSafe(message)).trim(),
            source: "fallback" as const,
        },
    ].filter((item, candidateIndex, array) => item.text && array.findIndex((candidate) => candidate.text === item.text) === candidateIndex);

    for (const candidate of sourceCandidates) {
        const candidateScore = scoreAssistantOriginalSourceRichnessEvent(candidate.text, deps);
        const shouldReplace =
            candidateScore > bestScore
            || (candidateScore === bestScore && candidate.text.length > bestText.length);
        if (!shouldReplace) continue;
        bestText = candidate.text;
        bestScore = candidateScore;
        bestSource = candidate.source;
    }

    if (!bestText.trim()) {
        return false;
    }
    if (bestText === currentStableTrimmed) {
        return false;
    }
    return setAssistantOriginalSourceMetaEvent(
        message,
        bestText,
        true,
        buildAssistantOriginalSourceMetaEvent(bestText, bestSource, deps)
    );
}

export function getStableAssistantOriginalSourceTextEvent(
    message: TavernMessageEvent | undefined,
    deps?: AssistantOriginalSourceCandidateDepsEvent
): string {
    const stableText = getPersistedAssistantOriginalSourceTextEvent(message);
    if (stableText.trim()) {
        return stableText;
    }
    if (message && deps) {
        ensureAssistantOriginalSnapshotPersistedEvent(message, deps);
        const persistedText = getPersistedAssistantOriginalSourceTextEvent(message);
        if (persistedText.trim()) {
            return persistedText;
        }
    }
    const sourceCandidates = normalizeAssistantOriginalSourceCandidatesEvent([
        deps?.getHostOriginalSourceTextEvent?.(message) ?? "",
        deps?.getPreferredAssistantSourceTextEvent?.(message) ?? getMessageTextSafe(message),
        deps?.getMessageTextEvent?.(message) ?? getMessageTextSafe(message),
    ]);
    return sourceCandidates[0] ?? "";
}

export function hasInteractiveTriggerMarkupInStableSourceEvent(
    message: TavernMessageEvent | undefined,
    deps?: AssistantOriginalSourceCandidateDepsEvent
): boolean {
    const stableText = getStableAssistantOriginalSourceTextEvent(message, deps);
    return /<rh-trigger\b/i.test(stableText) || /"type"\s*:\s*"trigger_pack"/i.test(stableText);
}

/**
 * 功能：统一清理助手消息中的 RollHelper 控制块与交互触发标记。
 * 参数：
 *   message：助手消息对象。
 *   index：消息在当前聊天中的索引。
 *   deps：清理依赖。
 * 返回：
 *   boolean：有任意文本或标记发生变化时返回 true。
 */
export function sanitizeAssistantMessageArtifactsEvent(
    message: TavernMessageEvent,
    index: number | undefined,
    deps: SanitizeAssistantMessageArtifactsDepsEvent
): boolean {
    let changed = false;
    const sourceMessageId = deps.resolveSourceMessageIdEvent?.(message, index) || "";
    const sourceState = deps.sourceState || "display_text";
    const setText = deps.setMessageTextEvent ?? ((target, text) => {
        setMessageTextSafe(target, text);
    });
    if (ensureAssistantOriginalSnapshotPersistedEvent(message, deps)) {
        changed = true;
    }
    const result = sanitizeAssistantMessageArtifactsOnceEvent(message, index, deps);
    if (result.hasRollArtifacts) {
        logger.info(`[内容处理] 命中事件控制块 source=${sourceMessageId || "unknown"}`);
    }
    if (result.hasTriggerArtifacts) {
        logger.info(`[内容处理] 命中交互触发标记清理 source=${sourceMessageId || "unknown"}`);
    }
    changed = applyAssistantMessageSanitizeResultEvent(message, result, {
        setMessageTextEvent: setText,
        sourceState,
        getSettingsEvent: deps.getSettingsEvent,
    }) || changed;
    return changed;
}

export function sanitizeAssistantMessageForSummary(message: any, options?: { blockInternalTags?: boolean }) {
    if (!message) return message;

    try {
        sanitizeAssistantMessageArtifactsEvent(message as TavernMessageEvent, undefined, {});

        // 追加兼容其他系统读取行为的跳过标识
        message._skipHorae = true;
        message.extra = {
            ...(message.extra || {}),
            rollhelper_sanitized: true,
            skip_summary: true,
            skip_memory: true,
        };
    } catch (err) {
        logger.warn("[RollHelper] sanitizeAssistantMessageForSummary caught an error", err);
    }

    return message;
}
