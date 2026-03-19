import { describe, expect, it } from 'vitest';
import {
    advanceMemoryTraceContext,
    createMemoryTraceContext,
    normalizeMemoryMainlineTraceSnapshot,
    touchMemoryMainlineTraceSnapshot,
} from '../src/core/memory-trace';
import { buildMainlineTraceEvidenceMarkup } from '../src/ui/mainline-trace-view';

describe('mainline trace view', (): void => {
    it('会把主链快照渲染成可读的 AI Health 证据卡', (): void => {
        const trace = createMemoryTraceContext({
            chatKey: 'chat-1',
            source: 'prompt_injection',
            stage: 'memory_recall_started',
            sourceMessageId: 'msg-1',
            requestId: 'request-1',
            ts: 1_700_000_000_000,
        });
        const recalled = advanceMemoryTraceContext(trace, 'memory_context_built', 'recall');
        const injected = advanceMemoryTraceContext(recalled, 'memory_prompt_insert_success', 'prompt_injection');
        const snapshot = touchMemoryMainlineTraceSnapshot(
            normalizeMemoryMainlineTraceSnapshot(null),
            {
                ...trace,
                label: 'memory_recall_started',
                ok: true,
            },
        );
        const nextSnapshot = touchMemoryMainlineTraceSnapshot(snapshot, {
            ...injected,
            label: 'memory_prompt_insert_success',
            ok: true,
            detail: {
                insertIndex: 3,
                promptLength: 84,
                insertedLength: 42,
            },
        });

        const html = buildMainlineTraceEvidenceMarkup(nextSnapshot);

        expect(html).toContain('消息入口');
        expect(html).toContain('trusted write');
        expect(html).toContain('recall 构建');
        expect(html).toContain('prompt 注入');
        expect(html).toContain('最近一轮注入');
        expect(html).toContain('插入位 3');
        expect(html).toContain('注入 42 字符');
        expect(html).toContain('原文 84 字符');
    });
});
