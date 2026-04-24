import { filterMemoryMessages } from './memory-filter-service';
import type { MemoryFilterMessage, MemoryFilterPreparedResult, MemoryFilterSettings } from './memory-filter-types';

export interface MemoryFilterFinalPreview {
    memoryText: string;
    contextText: string;
    excludedText: string;
    finalPromptText: string;
}

export function buildMemoryFilterPreview<T extends MemoryFilterMessage>(
    messages: T[],
    settings: MemoryFilterSettings,
): MemoryFilterPreparedResult<T> & { preview: MemoryFilterFinalPreview } {
    const prepared = filterMemoryMessages(messages, settings);
    const memoryText = prepared.messagesForMemory
        .map((message): string => String(message.content ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
    const contextText = prepared.contextText.trim();
    const finalPromptText = [
        memoryText,
        contextText ? `仅作参考：\n${contextText}` : '',
    ].filter(Boolean).join('\n\n');
    return {
        ...prepared,
        preview: {
            memoryText,
            contextText,
            excludedText: prepared.excludedText,
            finalPromptText,
        },
    };
}
