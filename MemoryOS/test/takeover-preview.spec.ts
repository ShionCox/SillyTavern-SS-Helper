import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/memory-prompts/prompt-loader', () => ({
    loadPromptPackSections: async () => ({
        COLD_START_SYSTEM: '',
        COLD_START_SCHEMA: '{}',
        COLD_START_OUTPUT_SAMPLE: '{}',
        SUMMARY_PLANNER_SYSTEM: '',
        SUMMARY_PLANNER_SCHEMA: '{}',
        SUMMARY_PLANNER_OUTPUT_SAMPLE: '{}',
        SUMMARY_SYSTEM: '',
        SUMMARY_SCHEMA: '{}',
        SUMMARY_OUTPUT_SAMPLE: '{}',
        TAKEOVER_BASELINE_SYSTEM: '基线任务',
        TAKEOVER_BASELINE_SCHEMA: '{}',
        TAKEOVER_BASELINE_OUTPUT_SAMPLE: '{}',
        TAKEOVER_ACTIVE_SYSTEM: '最近活跃快照',
        TAKEOVER_ACTIVE_SCHEMA: '{"type":"object"}',
        TAKEOVER_ACTIVE_OUTPUT_SAMPLE: '{"recentDigest":""}',
        TAKEOVER_BATCH_SYSTEM: '历史批次分析',
        TAKEOVER_BATCH_SCHEMA: '{"type":"object"}',
        TAKEOVER_BATCH_OUTPUT_SAMPLE: '{"summary":""}',
    }),
}));

import { buildTakeoverPreviewEstimate } from '../src/memory-takeover/takeover-preview';
import type { MemoryTakeoverSourceBundle } from '../src/memory-takeover/takeover-source';
import { applyContentLabSettings, resetContentLabSettings } from '../src/config/content-tag-registry';

function createSourceBundle(totalFloors: number, content: string): MemoryTakeoverSourceBundle {
    return {
        characterCard: {},
        semanticSnapshot: {},
        userSnapshot: {},
        totalFloors,
        messages: Array.from({ length: totalFloors }, (_item: unknown, index: number) => ({
            floor: index + 1,
            role: index % 2 === 0 ? 'user' : 'assistant',
            name: index % 2 === 0 ? '用户' : '助手',
            content: `${content} ${index + 1}`,
            contentSource: 'mes',
            normalizedFrom: index % 2 === 0 ? 'is_user' : 'default_fallback',
        })),
    };
}

const DEFAULTS = {
    recentFloors: 20,
    batchSize: 30,
    prioritizeRecent: true,
    autoContinue: true,
    autoConsolidate: true,
    pauseOnError: true,
};

describe('旧聊天接管 token 预估', (): void => {
    beforeEach((): void => {
        vi.clearAllMocks();
        resetContentLabSettings();
    });

    it('应同时预估 active 与 history 批次', async (): Promise<void> => {
        const estimate = await buildTakeoverPreviewEstimate({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            totalFloors: 100,
            defaults: DEFAULTS,
            sourceBundle: createSourceBundle(100, '测试消息'),
        });

        expect(estimate.totalBatches).toBe(3);
        expect(estimate.batches[0]?.category).toBe('active');
        expect(estimate.batches[0]?.range).toEqual({ startFloor: 81, endFloor: 100 });
        expect(estimate.batches[0]?.label).toBe('最近快照');
        expect(estimate.batches.slice(1).every((item) => item.category === 'history')).toBe(true);
        expect(estimate.batches[1]?.label).toBe('第 1 / 2 批');
        expect(estimate.batches[2]?.label).toBe('第 2 / 2 批');
    });

    it('应在批次超过阈值时生成红色预警数据', async (): Promise<void> => {
        const estimate = await buildTakeoverPreviewEstimate({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            totalFloors: 20,
            defaults: {
                ...DEFAULTS,
                recentFloors: 10,
                batchSize: 10,
            },
            config: {
                mode: 'recent',
                recentFloors: 10,
                batchSize: 10,
            },
            sourceBundle: createSourceBundle(20, '很长的测试文本'.repeat(40)),
            threshold: 10,
        });

        expect(estimate.hasOverflow).toBe(true);
        expect(estimate.overflowWarnings.length).toBeGreaterThan(0);
        expect(estimate.batches.some((item) => item.overWarningThreshold)).toBe(true);
    });

    it('内容拆分开关会影响预估时实际发送的楼层数量', async (): Promise<void> => {
        const sourceBundle = createSourceBundle(3, '');
        sourceBundle.messages[0]!.content = '<game>主线剧情推进</game>';
        sourceBundle.messages[1]!.content = '<summary>这是总结提示</summary>';
        sourceBundle.messages[2]!.content = '<details>这是排除内容</details>';

        const disabledEstimate = await buildTakeoverPreviewEstimate({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            totalFloors: 3,
            defaults: DEFAULTS,
            sourceBundle,
        });

        applyContentLabSettings({ enableContentSplit: true });
        const enabledEstimate = await buildTakeoverPreviewEstimate({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            totalFloors: 3,
            defaults: DEFAULTS,
            sourceBundle,
        });

        expect(disabledEstimate.batches[0]?.messageCount).toBe(3);
        expect(enabledEstimate.batches[0]?.messageCount).toBe(1);
    });
});
