import { describe, expect, it } from 'vitest';
import { TOPIC_REGISTRY } from '../../SDK/bus/registry';
import {
    advanceMemoryTraceContext,
    createMemoryTraceContext,
    normalizeMemoryMainlineTraceSnapshot,
    touchMemoryMainlineTraceSnapshot,
} from '../src/core/memory-trace';

describe('mainline trace', (): void => {
    it('不会再注册外部回写 RPC', (): void => {
        expect(TOPIC_REGISTRY['plugin:request:memory_append_outcome']).toBeUndefined();
    });

    it('会正确推进主链 trace 快照', (): void => {
        const trace = createMemoryTraceContext({
            chatKey: 'chat-1',
            source: 'prompt_injection',
            stage: 'memory_recall_started',
            sourceMessageId: 'msg-1',
            requestId: 'request-1',
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
        });

        expect(nextSnapshot.lastTrace?.stage).toBe('memory_prompt_insert_success');
        expect(nextSnapshot.lastSuccessTrace?.stage).toBe('memory_prompt_insert_success');
        expect(nextSnapshot.lastPromptInjectionTrace?.stage).toBe('memory_prompt_insert_success');
        expect(nextSnapshot.recentTraces.length).toBeGreaterThan(0);
    });
});
