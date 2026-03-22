import { describe, expect, it, vi, beforeEach } from 'vitest';

const { runEmbedMock, loggerWarnMock } = vi.hoisted(() => ({
    runEmbedMock: vi.fn(),
    loggerWarnMock: vi.fn(),
}));

vi.mock('../src/llm/memoryLlmBridge', () => ({
    runEmbed: runEmbedMock,
}));

vi.mock('../src/index', () => ({
    logger: {
        warn: loggerWarnMock,
        info: vi.fn(),
    },
}));

vi.mock('../src/db/db', () => {
    const embeddings = [
        {
            embeddingId: 'embedding-1',
            cardId: 'card-1',
            chatKey: 'chat-cache',
            vector: [1, 0],
            model: 'test-model',
            createdAt: 1,
        },
        {
            embeddingId: 'embedding-2',
            cardId: 'card-2',
            chatKey: 'chat-cache',
            vector: [0, 1],
            model: 'test-model',
            createdAt: 1,
        },
    ];
    const cards = [
        {
            cardId: 'card-1',
            chatKey: 'chat-cache',
            status: 'active',
            memoryText: '乾清宫是女帝寝宫。',
            sourceRecordKey: 'fact-1',
            sourceRecordKind: 'fact',
            ownerActorKey: null,
            scope: 'world',
            lane: 'rule',
            ttl: 'long',
            participantActorKeys: [],
            createdAt: 1,
            updatedAt: 2,
        },
        {
            cardId: 'card-2',
            chatKey: 'chat-cache',
            status: 'active',
            memoryText: '太和殿用于朝会。',
            sourceRecordKey: 'fact-2',
            sourceRecordKind: 'fact',
            ownerActorKey: null,
            scope: 'world',
            lane: 'rule',
            ttl: 'long',
            participantActorKeys: [],
            createdAt: 1,
            updatedAt: 2,
        },
    ];

    return {
        db: {
            memory_card_embeddings: {
                where: (field: string) => ({
                    equals: (_value: unknown) => ({
                        toArray: async (): Promise<unknown[]> => field === 'chatKey' ? embeddings : [],
                    }),
                }),
            },
            memory_cards: {
                where: (field: string) => ({
                    equals: (_value: unknown) => ({
                        toArray: async (): Promise<unknown[]> => field === '[chatKey+status]' ? cards : [],
                    }),
                }),
            },
            memory_card_meta: {
                get: async (): Promise<null> => null,
            },
        },
    };
});

import { VectorManager } from '../src/vector/vector-manager';

describe('VectorManager 查询向量复用', (): void => {
    beforeEach((): void => {
        runEmbedMock.mockReset();
        loggerWarnMock.mockReset();
    });

    it('会在并发的相同查询之间复用同一次 embedding 请求', async (): Promise<void> => {
        runEmbedMock.mockImplementation(async (): Promise<{ ok: boolean; vectors: number[][]; model: string }> => {
            await new Promise((resolve): void => {
                setTimeout(resolve, 10);
            });
            return {
                ok: true,
                vectors: [[1, 0]],
                model: 'test-model',
            };
        });

        const manager = new VectorManager('chat-cache');
        const [first, second, third] = await Promise.all([
            manager.search('乾清宫是什么', 5),
            manager.search('乾清宫是什么', 5),
            new VectorManager('chat-cache').search('乾清宫是什么', 5),
        ]);

        expect(runEmbedMock).toHaveBeenCalledTimes(1);
        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBeGreaterThan(0);
        expect(third.length).toBeGreaterThan(0);
    });

    it('会在短时间内复用同一句查询的缓存向量', async (): Promise<void> => {
        runEmbedMock.mockResolvedValue({
            ok: true,
            vectors: [[1, 0]],
            model: 'test-model',
        });

        const manager = new VectorManager('chat-cache-second');
        await manager.search('未央宫在哪里', 5);
        await manager.search('未央宫在哪里', 5);

        expect(runEmbedMock).toHaveBeenCalledTimes(1);
    });
});
