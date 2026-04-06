import { describe, expect, it } from 'vitest';
import { buildActorVisibleMemoryContext } from '../src/memory-injection/actor-visible-context-builder';
import { renderMemoryContextXmlMarkdown } from '../src/memory-injection/xml-markdown-renderer';
import { buildPromptTimeMeta } from '../src/memory-time/time-ranking';
import { enhanceMemoryTimeContextWithText, mapBatchToMemoryTimeContext } from '../src/memory-time/fallback-time-engine';
import { detectTimelineProfile } from '../src/memory-time/timeline-profile';
import type { MemoryTimeContext } from '../src/memory-time/time-types';
import type { MemoryEntry } from '../src/types';

describe('time prompt display', () => {
    it('会为复合时间头生成第几天、事件锚点、顺序与相对当前标签', () => {
        const timeContext: MemoryTimeContext = {
            mode: 'story_explicit',
            storyTime: {
                absoluteText: '第三天上午',
                storyDayIndex: 3,
                normalized: { partOfDay: 'morning' },
                anchorEventLabel: '火锅后的厨房',
                anchorRelation: 'after',
            },
            sequenceTime: {
                firstFloor: 182,
                lastFloor: 186,
                orderIndex: 186,
            },
            source: 'summary_batch',
            confidence: 0.82,
        };

        const meta = buildPromptTimeMeta(timeContext, 200);

        expect(meta.primaryLabel).toBe('第三天上午');
        expect(meta.anchorLabel).toBe('火锅后的厨房');
        expect(meta.anchorRelationLabel).toBe('后');
        expect(meta.sequenceLabel).toBe('182-186层');
        expect(meta.relativeToNowLabel).toBe('14层前');
    });

    it('会优先保留 richer 的显式时间而不是退化成粗粒度时段', () => {
        const timeContext: MemoryTimeContext = {
            mode: 'story_explicit',
            storyTime: {
                absoluteText: '上午到中午',
                relativeText: '稍后',
                storyDayIndex: 3,
                normalized: { partOfDay: 'morning' },
            },
            sequenceTime: {
                firstFloor: 182,
                lastFloor: 186,
                orderIndex: 186,
            },
            source: 'summary_batch',
            confidence: 0.82,
        };

        const meta = buildPromptTimeMeta(timeContext, 200);

        expect(meta.primaryLabel).toBe('第3天上午到中午');
    });

    it('会在时间画像中积累事件锚点与故事日序', () => {
        const profile = detectTimelineProfile({
            texts: ['第三天深夜，火锅后的厨房里，她靠在门边轻声说话。'],
            anchorFloor: 186,
        });

        expect(profile.currentStoryDayIndex).toBe(3);
        expect(profile.eventAnchors?.[0]?.label).toContain('火锅后的厨房');
        expect(profile.eventAnchors?.[0]?.firstFloor).toBe(186);
    });

    it('会在注入文本顶部渲染当前事件时间线', () => {
        const context = buildActorVisibleMemoryContext({
            entries: [],
            roleEntries: [],
            activeActorKey: 'char_test',
            timelineProfile: {
                profileId: 'tp_1',
                mode: 'implicit_world_time',
                calendarKind: 'floating',
                anchorFloor: 186,
                currentStoryDayIndex: 3,
                eventAnchors: [
                    {
                        eventId: 'E4',
                        label: '火锅后的厨房',
                        storyDayIndex: 3,
                        partOfDay: 'midnight',
                        firstFloor: 182,
                        lastFloor: 186,
                        confidence: 0.8,
                    },
                ],
                confidence: 0.78,
                fallbackRules: {
                    sameSceneAdvance: { value: 0, unit: 'scene' },
                    sceneBreakAdvance: { value: 1, unit: 'scene' },
                    sleepAdvance: { value: 8, unit: 'hour' },
                    hardCutAdvance: { value: 1, unit: 'day' },
                },
                version: 1,
                updatedAt: 1,
            },
        });

        const rendered = renderMemoryContextXmlMarkdown(context, 'narrative_default', {
            timelineMaxItems: 1,
        });

        expect(rendered).toContain('## 当前时间线');
        expect(rendered).toContain('T1：第3天深夜，火锅后的厨房');
    });

    it('会从批次正文补出 richer 的 absoluteText，而不是只剩 partOfDay', () => {
        const timeContext = mapBatchToMemoryTimeContext({
            assessment: {
                batchId: 'batch_1',
                floorRange: { startFloor: 10, endFloor: 12 },
                explicitMentions: ['第三天'],
                anchorBefore: '第三天',
                anchorAfter: '第三天',
                storyDayIndex: 3,
                partOfDay: 'morning',
                eventAnchors: [],
                sceneTransitions: [],
                fallbackRecommended: false,
                source: 'hybrid',
                confidence: 0.86,
            },
            firstFloor: 10,
            lastFloor: 12,
            source: 'summary_batch',
            sourceText: '第三天上午到中午，她在教室门口等他。',
        });

        expect(timeContext.storyTime?.absoluteText).toBe('第三天上午到中午');
        expect(timeContext.storyTime?.storyDayIndex).toBe(3);
    });

    it('会在条目文本补强时优先保留绝对时间并补齐锚点', () => {
        const baseTimeContext: MemoryTimeContext = {
            mode: 'story_inferred',
            storyTime: {
                relativeText: '第三天',
                storyDayIndex: 3,
                normalized: { partOfDay: 'morning' },
            },
            sequenceTime: {
                firstFloor: 50,
                lastFloor: 52,
                orderIndex: 52,
            },
            source: 'takeover_batch',
            confidence: 0.71,
        };

        const enhanced = enhanceMemoryTimeContextWithText({
            timeContext: baseTimeContext,
            text: '第三天上午到中午，火锅后的厨房里她忽然沉默。',
            sourceFloor: 50,
        });

        expect(enhanced.mode).toBe('story_explicit');
        expect(enhanced.storyTime?.absoluteText).toBe('第三天上午到中午');
        expect(enhanced.storyTime?.relativeText).toBe('第三天');
        expect(enhanced.storyTime?.anchorEventLabel).toContain('火锅后的厨房');
    });

    it('scene 在已有可信 timeContext 时不会再被正文启发式覆盖', () => {
        const sceneEntry: MemoryEntry = {
            entryId: 'scene_1',
            chatKey: 'chat_1',
            title: '教学楼分别',
            entryType: 'scene_shared_state',
            category: 'story',
            tags: [],
            summary: '清晨分别后，夜里回想起她站在楼梯口的样子。',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {},
            sourceSummaryIds: [],
            timeContext: {
                mode: 'story_explicit',
                storyTime: {
                    absoluteText: '第三天上午到中午',
                    storyDayIndex: 3,
                    normalized: { partOfDay: 'morning' },
                },
                sequenceTime: {
                    firstFloor: 88,
                    lastFloor: 90,
                    orderIndex: 90,
                },
                source: 'summary_batch',
                confidence: 0.9,
            },
            createdAt: 1,
            updatedAt: 1,
        };

        const context = buildActorVisibleMemoryContext({
            entries: [sceneEntry],
            roleEntries: [],
            activeActorKey: 'char_test',
            timelineProfile: null,
        });

        expect(context.sceneActiveLines[0]).toContain('[第三天上午到中午');
        expect(context.sceneActiveLines[0]).not.toContain('[第3天清晨');
    });
});
