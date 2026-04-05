import { describe, expect, it } from 'vitest';
import { buildActorVisibleMemoryContext } from '../src/memory-injection/actor-visible-context-builder';
import { renderMemoryContextXmlMarkdown } from '../src/memory-injection/xml-markdown-renderer';
import { buildPromptTimeMeta } from '../src/memory-time/time-ranking';
import { detectTimelineProfile } from '../src/memory-time/timeline-profile';
import type { MemoryTimeContext } from '../src/memory-time/time-types';

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

        expect(meta.primaryLabel).toBe('第3天上午');
        expect(meta.anchorLabel).toBe('火锅后的厨房');
        expect(meta.anchorRelationLabel).toBe('之后');
        expect(meta.sequenceLabel).toBe('182-186层');
        expect(meta.relativeToNowLabel).toBe('较当前早14层');
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
            totalChars: 1200,
        });

        expect(rendered).toContain('## 当前事件时间线');
        expect(rendered).toContain('E1：第3天深夜，火锅后的厨房');
    });
});
