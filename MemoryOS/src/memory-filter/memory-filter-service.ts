import { getMemoryFilterSettings } from './memory-filter-config';
import { splitMemoryFilterBlocks } from './memory-filter-splitter';
import type {
    MemoryFilterBlock,
    MemoryFilterDiagnostic,
    MemoryFilterFloorRecord,
    MemoryFilterMessage,
    MemoryFilterPreparedResult,
    MemoryFilterScopeKey,
    MemoryFilterSettings,
} from './memory-filter-types';

export function filterMemoryMessages<T extends MemoryFilterMessage>(
    messages: T[],
    settings: MemoryFilterSettings = getMemoryFilterSettings(),
    options?: { scope?: MemoryFilterScopeKey },
): MemoryFilterPreparedResult<T> {
    const normalizedMessages = Array.isArray(messages) ? messages : [];
    const scopeEnabled = options?.scope ? settings.scope[options.scope] !== false : true;
    if (!settings.enabled || !scopeEnabled) {
        return buildDisabledFilterResult(normalizedMessages, settings, options?.scope);
    }

    const records = normalizedMessages.map((message, index): MemoryFilterFloorRecord => {
        const floor = resolveMessageFloor(message, index);
        const role = normalizeRoleString(String(message.role ?? 'unknown'));
        const originalText = String(message.content ?? '');
        const blocks = splitMemoryFilterBlocks(floor, originalText, settings);
        return buildMemoryFilterFloorRecord(floor, role, originalText, blocks);
    });

    return assembleMemoryFilterPreparedResult(normalizedMessages, records, settings);
}

export function buildDisabledFilterResult<T extends MemoryFilterMessage>(
    messages: T[],
    settings: MemoryFilterSettings,
    scope?: MemoryFilterScopeKey,
): MemoryFilterPreparedResult<T> {
    return {
        enabled: false,
        mode: settings.mode,
        messagesForMemory: messages.map((message) => ({ ...message })),
        contextText: '',
        excludedText: '',
        records: [],
        diagnostics: scope && settings.enabled ? [{
            level: 'info',
            code: 'scope_disabled',
            message: `记忆过滤器未作用于 ${scope} 链路。`,
        }] : [],
    };
}

export function buildMemoryFilterFloorRecord(
    floor: number,
    role: MemoryFilterFloorRecord['role'],
    originalText: string,
    blocks: MemoryFilterBlock[],
): MemoryFilterFloorRecord {
    const hasMemoryContent = blocks.some((block) => block.channel === 'memory' && Boolean(block.rawText.trim()));
    const hasContext = blocks.some((block) => block.channel === 'context' && Boolean(block.rawText.trim()));
    const hasExcluded = blocks.length > 0 && blocks.every((block) => block.channel === 'excluded' || !block.rawText.trim());
    return {
        floor,
        role,
        originalText,
        blocks,
        hasMemoryContent,
        hasContextOnly: !hasMemoryContent && hasContext,
        hasExcludedOnly: hasExcluded,
    };
}

export function assembleMemoryFilterPreparedResult<T extends MemoryFilterMessage>(
    messages: T[],
    records: MemoryFilterFloorRecord[],
    settings: MemoryFilterSettings,
): MemoryFilterPreparedResult<T> {
    const contextParts: string[] = [];
    const excludedParts: string[] = [];
    const diagnostics: MemoryFilterDiagnostic[] = [];
    const recordsByFloor = new Map(records.map((record): [number, MemoryFilterFloorRecord] => [record.floor, record]));

    for (const record of records) {
        for (const block of record.blocks) {
            if (block.channel === 'context') {
                contextParts.push(block.rawText);
            } else if (block.channel === 'excluded') {
                excludedParts.push(`[Floor ${record.floor}][${block.title}] ${block.rawText}`);
            }
            for (const message of block.diagnostics ?? []) {
                diagnostics.push({
                    level: 'warn',
                    code: 'block_diagnostic',
                    message,
                    floor: record.floor,
                });
            }
        }
    }

    const messagesForMemory = messages
        .map((message, index): T => {
            const floor = resolveMessageFloor(message, index);
            const record = recordsByFloor.get(floor);
            const memoryText = record
                ? record.blocks
                    .filter((block) => block.channel === 'memory')
                    .map((block) => block.rawText)
                    .filter((text) => Boolean(text.trim()))
                    .join('\n\n')
                : '';
            return {
                ...message,
                content: memoryText,
            };
        })
        .filter((message): boolean => Boolean(String(message.content ?? '').trim()));

    return {
        enabled: true,
        mode: settings.mode,
        messagesForMemory,
        contextText: contextParts.filter(Boolean).join('\n\n'),
        excludedText: excludedParts.filter(Boolean).join('\n'),
        records,
        diagnostics,
    };
}

function resolveMessageFloor(message: MemoryFilterMessage, index: number): number {
    return Math.max(1, Math.trunc(Number(message.floor ?? message.turnIndex ?? index + 1) || index + 1));
}

function normalizeRoleString(role: string): MemoryFilterFloorRecord['role'] {
    const normalized = String(role ?? '').trim().toLowerCase();
    if (normalized === 'user') return 'user';
    if (normalized === 'assistant') return 'assistant';
    if (normalized === 'system') return 'system';
    if (normalized === 'tool') return 'tool';
    return 'unknown';
}
