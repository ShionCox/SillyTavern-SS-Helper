import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../SDK/tavern', () => {
    return {
        getCurrentTavernUserNameEvent: vi.fn(() => '林远'),
    };
});

describe('buildTakeoverStructuredTaskRequest 用户占位符', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('会把历史批次请求中的真实用户名统一替换为 {{user}}', async () => {
        const { buildTakeoverStructuredTaskRequest } = await import('../src/memory-takeover/takeover-llm');
        const request = await buildTakeoverStructuredTaskRequest({
            systemSection: 'TAKEOVER_BATCH_SYSTEM',
            schemaSection: 'TAKEOVER_BATCH_SCHEMA',
            sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
            payload: {
                batchId: 'takeover:test:history:0001',
                batchCategory: 'history',
                range: { startFloor: 1, endFloor: 2 },
                knownContext: {
                    actorHints: ['林远', '何盈'],
                    stableFacts: ['林远回到村子。'],
                    relationState: ['何盈仍记着林远。'],
                    taskState: [],
                    worldState: [],
                    knownEntities: {
                        actors: [{ actorKey: 'user', displayName: '林远' }],
                        organizations: [],
                        cities: [],
                        nations: [],
                        locations: [],
                        tasks: [],
                        worldStates: [],
                    },
                    updateHint: '主角刚回村。',
                },
                messages: [
                    { floor: 1, role: 'user', name: '林远', content: '林远推开灵堂的门。' },
                    { floor: 2, role: 'assistant', name: '何盈', content: '何盈看着林远，没有说话。' },
                ],
                hintContext: '当前用户林远被多次提及。',
            },
        });

        const promptText = request.messages.map((item) => item.content).join('\n');
        expect(promptText).toContain('{{user}}');
        expect(promptText).not.toContain('林远');
        expect(promptText).not.toContain('{{userDisplayName}}');
    });

    it('会把静态基线请求中的 userSnapshot.userName 替换为 {{user}}', async () => {
        const { buildTakeoverStructuredTaskRequest } = await import('../src/memory-takeover/takeover-llm');
        const request = await buildTakeoverStructuredTaskRequest({
            systemSection: 'TAKEOVER_BASELINE_SYSTEM',
            schemaSection: 'TAKEOVER_BASELINE_SCHEMA',
            sampleSection: 'TAKEOVER_BASELINE_OUTPUT_SAMPLE',
            payload: {
                characterCard: {
                    name: '何盈',
                    description: '她一直守在山上。',
                },
                semanticSnapshot: {
                    systemPrompt: '林远会在今夜返村。',
                    authorNote: '',
                    instruct: '',
                },
                userSnapshot: {
                    userName: '林远',
                    personaDescription: '林远一向会主动追问真相。',
                    metadataPersona: '',
                },
                totalFloors: 32,
            },
        });

        const promptText = request.messages.map((item) => item.content).join('\n');
        expect(promptText).toContain('{{user}}');
        expect(promptText).not.toContain('林远');
        expect(promptText).not.toContain('{{userDisplayName}}');
    });
});
