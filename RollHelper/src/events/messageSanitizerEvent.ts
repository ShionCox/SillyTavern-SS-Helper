import { stripRollHelperArtifactsEvent } from '../../../SDK/tavern';
import { logger } from "../../index";
import {
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
import {
    getAssistantFloorRecordByMessageEvent,
    mutateAssistantFloorRecordByMessageEvent,
} from "../settings/storeEvent";

export type AssistantOriginalSourceMetaEvent = {
    source: "host" | "plugin_snapshot" | "fallback";
    capturedAt: number;
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

function clearAssistantOriginalSourceMetaEvent(message: TavernMessageEvent): boolean {
    return mutateAssistantFloorRecordByMessageEvent(message, (floor) => {
        floor.content.raw = "";
    });
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
    void meta;
    return mutateAssistantFloorRecordByMessageEvent(message, (floor) => {
        floor.content.raw = normalizedText;
    });
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
    return String(getAssistantFloorRecordByMessageEvent(message, false)?.content.raw ?? "").trim();
}

export function getPersistedAssistantOriginalSourceMetaEvent(
    message: TavernMessageEvent | undefined
): AssistantOriginalSourceMetaEvent | null {
    if (!message || typeof message !== "object") return null;
    const rawText = String(getAssistantFloorRecordByMessageEvent(message, false)?.content.raw ?? "").trim();
    if (!rawText) return null;
    return {
        source: "plugin_snapshot",
        capturedAt: 0,
        containsRollJson: stripRollJsonBlocks(rawText) !== rawText,
        containsEventEnvelope: /"type"\s*:\s*"dice_events"/i.test(rawText) || /<eventjson>/i.test(rawText),
        containsInteractiveTrigger: /<rh-trigger\b/i.test(rawText) || /"type"\s*:\s*"trigger_pack"/i.test(rawText),
    };
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

function looksLikeIncompleteAssistantStructuredSourceEvent(text: string): boolean {
    const normalized = String(text ?? "");
    if (!normalized.trim()) return false;
    const hasStructuredHead =
        /"type"\s*:\s*"dice_events"/i.test(normalized)
        || /```(?:rolljson|json|triggerjson|triggerpack)\b/i.test(normalized)
        || /<eventjson>/i.test(normalized)
        || /<rh-trigger\b/i.test(normalized)
        || /"type"\s*:\s*"trigger_pack"/i.test(normalized);
    if (!hasStructuredHead) return false;
    const openCurlyCount = (normalized.match(/\{/g) || []).length;
    const closeCurlyCount = (normalized.match(/\}/g) || []).length;
    const openSquareCount = (normalized.match(/\[/g) || []).length;
    const closeSquareCount = (normalized.match(/\]/g) || []).length;
    return openCurlyCount > closeCurlyCount || openSquareCount > closeSquareCount;
}

function hasStructuredAssistantArtifactsEvent(
    text: string,
    deps: Pick<SanitizeAssistantMessageArtifactsDepsEvent, "parseEventEnvelopesEvent">
): boolean {
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) return false;
    if (looksLikeIncompleteAssistantStructuredSourceEvent(normalizedText)) return false;
    if (/<rh-trigger\b/i.test(normalizedText) || /"type"\s*:\s*"trigger_pack"/i.test(normalizedText)) {
        return true;
    }
    if (deps.parseEventEnvelopesEvent) {
        const parsed = deps.parseEventEnvelopesEvent(normalizedText);
        if (parsed.events.length > 0 || parsed.ranges.length > 0) {
            return true;
        }
    }
    return stripRollJsonBlocks(normalizedText) !== normalizedText;
}

function resolveCanonicalAssistantOriginalSourceEvent(
    message: TavernMessageEvent,
    deps: AssistantOriginalSourceCandidateDepsEvent
): { text: string; source: AssistantOriginalSourceMetaEvent["source"] } | null {
    const persistedText = getPersistedAssistantOriginalSourceTextEvent(message).trim();
    const hostText = String(deps.getHostOriginalSourceTextEvent?.(message) ?? "").trim();
    const preferredText = String(deps.getPreferredAssistantSourceTextEvent?.(message) ?? getMessageTextSafe(message)).trim();
    const fallbackText = String(deps.getMessageTextEvent?.(message) ?? getMessageTextSafe(message)).trim();

    if (hostText && hasStructuredAssistantArtifactsEvent(hostText, deps)) {
        return { text: hostText, source: "host" };
    }
    if (persistedText) {
        return { text: persistedText, source: "plugin_snapshot" };
    }
    if (hostText) {
        return { text: hostText, source: "host" };
    }
    if (preferredText) {
        return { text: preferredText, source: "fallback" };
    }
    if (fallbackText) {
        return { text: fallbackText, source: "fallback" };
    }
    return null;
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
    const canonical = resolveCanonicalAssistantOriginalSourceEvent(message, deps);
    if (!canonical?.text.trim()) {
        return false;
    }
    const currentStableTrimmed = getPersistedAssistantOriginalSourceTextEvent(message).trim();
    if (canonical.text === currentStableTrimmed) {
        return false;
    }
    return setAssistantOriginalSourceMetaEvent(
        message,
        canonical.text,
        true,
        buildAssistantOriginalSourceMetaEvent(canonical.text, canonical.source, deps)
    );
}

export function getStableAssistantOriginalSourceTextEvent(
    message: TavernMessageEvent | undefined,
    deps?: AssistantOriginalSourceCandidateDepsEvent
): string {
    if (message && deps) {
        ensureAssistantOriginalSnapshotPersistedEvent(message, deps);
    }
    const persistedText = getPersistedAssistantOriginalSourceTextEvent(message).trim();
    if (persistedText) {
        return persistedText;
    }
    const hostText = String(deps?.getHostOriginalSourceTextEvent?.(message) ?? "").trim();
    if (hostText) {
        return hostText;
    }
    const preferredText = String(
        deps?.getPreferredAssistantSourceTextEvent?.(message) ?? getMessageTextSafe(message)
    ).trim();
    if (preferredText) {
        return preferredText;
    }
    const fallbackText = String(
        deps?.getMessageTextEvent?.(message) ?? getMessageTextSafe(message)
    ).trim();
    return fallbackText;
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
