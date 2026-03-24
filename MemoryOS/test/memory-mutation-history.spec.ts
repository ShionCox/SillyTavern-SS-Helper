import { beforeEach, describe, expect, it, vi } from 'vitest';

const historyRecords = vi.hoisted(() => [] as any[]);

vi.mock('../src/db/db', () => ({
    db: {
        memory_mutation_history: {
            add: async (record: any): Promise<void> => {
                historyRecords.push(record);
            },
            where: (indexName: string) => ({
                between: (start: [string, number], end: [string, number]) => {
                    if (indexName !== '[chatKey+ts]') {
                        throw new Error(`unexpected index ${indexName}`);
                    }
                    const [chatKey, sinceTs] = start;
                    const [endChatKey] = end;
                    const rows = historyRecords.filter((record: any): boolean => {
                        return String(record.chatKey) === String(chatKey)
                            && String(record.chatKey) === String(endChatKey)
                            && Number(record.ts ?? 0) >= Number(sinceTs ?? 0);
                    });
                    return {
                        reverse: () => ({
                            toArray: async (): Promise<any[]> => [...rows].sort((left: any, right: any): number => Number(right.ts ?? 0) - Number(left.ts ?? 0)),
                        }),
                    };
                },
            }),
        },
    },
}));

import { MemoryMutationHistoryManager } from '../src/core/memory-mutation-history';

describe('memory mutation history manager', (): void => {
    beforeEach((): void => {
        historyRecords.length = 0;
    });

    it('会按时间倒序返回当前聊天的历史记录', async (): Promise<void> => {
        const manager = new MemoryMutationHistoryManager('chat-1');
        await manager.append({
            mutationId: 'history-1',
            ts: 100,
            source: 'proposal_apply',
            consumerPluginId: 'tester',
            targetKind: 'fact',
            action: 'ADD',
            title: 'Alice profile',
            compareKey: 'character::alice::profile',
            targetRecordKey: 'fact-1',
            before: null,
            after: { factKey: 'fact-1' },
        });
        await manager.append({
            mutationId: 'history-2',
            ts: 300,
            source: 'row_operations',
            consumerPluginId: 'tester',
            targetKind: 'summary',
            action: 'UPDATE',
            title: 'Scene summary',
            compareKey: 'summary::scene',
            targetRecordKey: 'summary-1',
            before: { summaryId: 'summary-1', content: 'old' },
            after: { summaryId: 'summary-1', content: 'new' },
        });

        const rows = await manager.list();

        expect(rows.map((row) => row.mutationId)).toEqual(['history-2', 'history-1']);
        expect(rows[0].targetKind).toBe('summary');
        expect(rows[1].targetKind).toBe('fact');
    });

    it('会按记录键、目标类型和动作过滤历史', async (): Promise<void> => {
        const manager = new MemoryMutationHistoryManager('chat-1');
        await manager.append({
            mutationId: 'history-1',
            ts: 100,
            source: 'proposal_apply',
            consumerPluginId: 'tester',
            targetKind: 'fact',
            action: 'MERGE',
            title: 'Alice fact merge',
            compareKey: 'character::alice::trait',
            targetRecordKey: 'fact-1',
            before: { factKey: 'fact-old' },
            after: { factKey: 'fact-1' },
            reasonCodes: ['compare_key_match'],
        });
        await manager.append({
            mutationId: 'history-2',
            ts: 200,
            source: 'proposal_apply',
            consumerPluginId: 'tester',
            targetKind: 'state',
            action: 'DELETE',
            title: 'Scene weather',
            compareKey: 'scene.weather',
            targetRecordKey: 'scene.weather',
            before: { path: 'scene.weather', value: 'rain' },
            after: { path: 'scene.weather', deleted: true },
        });
        await manager.append({
            mutationId: 'history-3',
            ts: 300,
            source: 'proposal_apply',
            consumerPluginId: 'tester',
            targetKind: 'fact',
            action: 'UPDATE',
            title: 'Alice fact update',
            compareKey: 'character::alice::trait',
            targetRecordKey: 'fact-1',
            before: { factKey: 'fact-1', value: 'brave' },
            after: { factKey: 'fact-1', value: 'calm' },
        });

        const byRecord = await manager.listByRecord('fact-1');
        const byAction = await manager.list({ action: 'MERGE' });
        const byKind = await manager.list({ targetKind: 'state' });

        expect(byRecord.map((row) => row.mutationId)).toEqual(['history-3', 'history-1']);
        expect(byAction.map((row) => row.mutationId)).toEqual(['history-1']);
        expect(byKind.map((row) => row.mutationId)).toEqual(['history-2']);
    });

    it('不会回退到历史分支，没有记录时返回空数组', async (): Promise<void> => {
        const manager = new MemoryMutationHistoryManager('chat-empty');

        await new MemoryMutationHistoryManager('chat-other').append({
            mutationId: 'history-other',
            ts: 50,
            source: 'proposal_apply',
            consumerPluginId: 'tester',
            targetKind: 'fact',
            action: 'ADD',
            title: 'Other chat fact',
            compareKey: 'character::bob::profile',
            targetRecordKey: 'fact-other',
            before: null,
            after: { factKey: 'fact-other' },
        });

        const rows = await manager.list({ limit: 20 });

        expect(rows).toEqual([]);
    });
});
