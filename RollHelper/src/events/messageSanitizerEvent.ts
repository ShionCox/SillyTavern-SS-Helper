import { stripRollHelperArtifactsEvent } from '../../../SDK/tavern';
import { logger } from "../../index";
import {
    getActiveSwipeExtraContainerEvent,
    sanitizeMessageInteractiveTriggersEvent,
    stripInteractiveTriggerMarkupFromTextEvent,
} from "./interactiveTriggerMetadataEvent";
import type { DiceEventSpecEvent, TavernMessageEvent } from "../types/eventDomainEvent";

const RH_ORIGINAL_SOURCE_KEY_Event = "rollhelper_original_source_v1";
const RH_ORIGINAL_SOURCE_ENABLED_KEY_Event = "rollhelper_original_source_enabled_v1";

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
    return changed;
}

function setAssistantOriginalSourceMetaEvent(
    message: TavernMessageEvent,
    originalSourceText: string,
    enabled: boolean
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
    return changed;
}

/**
 * 功能：判断一段文本是否包含值得保留的原始控制块或交互标记。
 * 参数：
 *   text：待判断的文本。
 *   deps：清理依赖。
 * 返回：
 *   boolean：若文本包含 rolljson、裸事件块或交互触发标记则返回 true。
 */
function isRichAssistantOriginalSourceEvent(
    text: string,
    deps: SanitizeAssistantMessageArtifactsDepsEvent
): boolean {
    const normalizedText = String(text ?? "").trim();
    if (!normalizedText) return false;
    if (/<rh-trigger\b/i.test(normalizedText)) return true;
    if (deps.parseEventEnvelopesEvent) {
        const parsed = deps.parseEventEnvelopesEvent(normalizedText);
        if (parsed.events.length > 0 || parsed.ranges.length > 0) {
            return true;
        }
    }
    return stripRollJsonBlocks(normalizedText) !== normalizedText;
}

/**
 * 功能：在清理前保留一份最有价值的原始文本快照，供“复制原格式”复用。
 * 参数：
 *   message：目标助手消息。
 *   sourceCandidates：候选原始文本列表。
 *   deps：清理依赖。
 * 返回：
 *   boolean：若快照实际发生变化则返回 true。
 */
function rememberAssistantOriginalSnapshotBeforeSanitizeEvent(
    message: TavernMessageEvent,
    sourceCandidates: string[],
    deps: SanitizeAssistantMessageArtifactsDepsEvent
): boolean {
    const existingText = getAssistantOriginalSourceTextEvent(message);
    const existingIsRich = isRichAssistantOriginalSourceEvent(existingText, deps);
    for (const candidate of sourceCandidates) {
        const normalizedCandidate = String(candidate ?? "").trim();
        if (!normalizedCandidate) continue;
        const candidateIsRich = isRichAssistantOriginalSourceEvent(normalizedCandidate, deps);
        if (!candidateIsRich && existingIsRich) {
            continue;
        }
        if (normalizedCandidate === existingText.trim()) {
            return false;
        }
        return setAssistantOriginalSourceMetaEvent(message, normalizedCandidate, true);
    }
    return false;
}

export function rememberAssistantOriginalSourceTextEvent(
    message: TavernMessageEvent,
    originalSourceText: string,
    enabled = true
): boolean {
    return setAssistantOriginalSourceMetaEvent(message, originalSourceText, enabled);
}

export function resetAssistantSwipeRuntimeStateEvent(message: TavernMessageEvent): boolean {
    return clearAssistantOriginalSourceMetaEvent(message);
}

export function getAssistantOriginalSourceTextEvent(message: TavernMessageEvent | undefined): string {
    if (!message || typeof message !== "object") return "";
    const container = getAssistantOriginalSourceContainerEvent(message, false);
    const enabled = container?.[RH_ORIGINAL_SOURCE_ENABLED_KEY_Event] === true;
    const text = String(container?.[RH_ORIGINAL_SOURCE_KEY_Event] ?? "");
    if (enabled && text.trim()) return text;
    return "";
}

export function hasAssistantOriginalSourceTextEvent(message: TavernMessageEvent | undefined): boolean {
    return Boolean(getAssistantOriginalSourceTextEvent(message).trim());
}

function resolveAssistantOriginalSourceCandidateEvent(
    sourceCandidates: string[],
    deps: SanitizeAssistantMessageArtifactsDepsEvent
): string {
    for (const sourceText of sourceCandidates) {
        if (!String(sourceText ?? "").trim()) continue;
        if (/<rh-trigger\b/i.test(sourceText)) {
            return sourceText;
        }
        if (deps.parseEventEnvelopesEvent) {
            const parsed = deps.parseEventEnvelopesEvent(sourceText);
            if (parsed.events.length > 0 || parsed.ranges.length > 0) {
                return sourceText;
            }
        }
        if (stripRollJsonBlocks(sourceText) !== sourceText.trim()) {
            return sourceText;
        }
    }
    return "";
}

export function collectAssistantSourceCandidatesEvent(
    message: TavernMessageEvent,
    deps: Pick<
        SanitizeAssistantMessageArtifactsDepsEvent,
        | "getAssistantOriginalSourceTextEvent"
        | "getPreferredAssistantSourceTextEvent"
        | "getMessageTextEvent"
    >
): string[] {
    const getOriginalText = deps.getAssistantOriginalSourceTextEvent ?? ((target) => "");
    const getPreferredText = deps.getPreferredAssistantSourceTextEvent ?? ((target) => getMessageTextSafe(target));
    const getFallbackText = deps.getMessageTextEvent ?? ((target) => getMessageTextSafe(target));
    return [
        getOriginalText(message),
        getPreferredText(message),
        getFallbackText(message),
    ].filter((item, candidateIndex, array) => item && array.indexOf(item) === candidateIndex);
}

export interface SanitizeAssistantMessageArtifactsDepsEvent {
    getSettingsEvent?: () => {
        defaultBlindSkillsText?: string;
    };
    getAssistantOriginalSourceTextEvent?: (message: TavernMessageEvent | undefined) => string;
    getPreferredAssistantSourceTextEvent?: (message: TavernMessageEvent | undefined) => string;
    getMessageTextEvent?: (message: TavernMessageEvent | undefined) => string;
    parseEventEnvelopesEvent?: (text: string) => {
        events: DiceEventSpecEvent[];
        ranges: Array<{ start: number; end: number }>;
    };
    removeRangesEvent?: (text: string, ranges: Array<{ start: number; end: number }>) => string;
    setMessageTextEvent?: (message: TavernMessageEvent, text: string) => void;
    resolveSourceMessageIdEvent?: (message: TavernMessageEvent, index?: number) => string;
}

/**
 * 功能：仅保留助手消息的原始快照，不执行正文清理。
 * 参数：
 *   message：助手消息对象。
 *   deps：原始文本解析依赖。
 * 返回：
 *   boolean：若快照发生变化则返回 true。
 */
export function rememberAssistantOriginalSnapshotEvent(
    message: TavernMessageEvent,
    deps: Pick<
        SanitizeAssistantMessageArtifactsDepsEvent,
        | "getAssistantOriginalSourceTextEvent"
        | "getPreferredAssistantSourceTextEvent"
        | "getMessageTextEvent"
        | "parseEventEnvelopesEvent"
    >
): boolean {
    const sourceCandidates = collectAssistantSourceCandidatesEvent(message, deps);

    let changed = false;
    if (rememberAssistantOriginalSnapshotBeforeSanitizeEvent(message, sourceCandidates, deps)) {
        changed = true;
    }
    const originalSourceText = resolveAssistantOriginalSourceCandidateEvent(sourceCandidates, deps);
    if (originalSourceText.trim() && originalSourceText.trim() !== getAssistantOriginalSourceTextEvent(message).trim()) {
        if (setAssistantOriginalSourceMetaEvent(message, originalSourceText, true)) {
            changed = true;
        }
    }
    return changed;
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
    const getPreferredText = deps.getPreferredAssistantSourceTextEvent ?? ((target) => getMessageTextSafe(target));
    const getFallbackText = deps.getMessageTextEvent ?? ((target) => getMessageTextSafe(target));
    const setText = deps.setMessageTextEvent ?? ((target, text) => {
        setMessageTextSafe(target, text);
    });
    const sourceCandidates = collectAssistantSourceCandidatesEvent(message, deps);
    if (rememberAssistantOriginalSnapshotEvent(message, deps)) {
        changed = true;
    }

    if (deps.parseEventEnvelopesEvent && deps.removeRangesEvent) {
        for (const sourceText of sourceCandidates) {
            const { ranges } = deps.parseEventEnvelopesEvent(sourceText);
            if (ranges.length <= 0) continue;
            logger.info(`[内容处理] 命中事件控制块 source=${sourceMessageId || "unknown"} ranges=${ranges.length}`);
            const cleaned = deps.removeRangesEvent(sourceText, ranges);
            setText(message, cleaned);
            changed = true;
            break;
        }
    } else {
        const rawText = getFallbackText(message);
        const cleanedText = stripRollJsonBlocks(rawText);
        if (cleanedText !== rawText) {
            logger.info(`[内容处理] 命中宿主兜底清理 source=${sourceMessageId || "unknown"}`);
            setText(message, cleanedText);
            changed = true;
        }
    }

    if (deps.getSettingsEvent) {
        const triggerChanged = sanitizeMessageInteractiveTriggersEvent(message, {
            settings: deps.getSettingsEvent(),
            sourceMessageId,
        });
        if (triggerChanged) {
            logger.info(`[内容处理] 命中交互触发标记清理 source=${sourceMessageId || "unknown"}`);
        }
        changed = changed || triggerChanged;
    }

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
