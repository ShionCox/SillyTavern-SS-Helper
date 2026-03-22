import { stripRollHelperArtifactsEvent } from '../../../SDK/tavern';
import { logger } from "../../index";

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
    return stripRollHelperArtifactsEvent(text)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function sanitizeAssistantMessageForSummary(message: any, options?: { blockInternalTags?: boolean }) {
    if (!message) return message;

    try {
        const rawText = getMessageTextSafe(message);
        const cleanedText = stripRollJsonBlocks(rawText);

        setMessageTextSafe(message, cleanedText);

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

