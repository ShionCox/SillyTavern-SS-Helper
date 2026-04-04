import { describe, expect, it } from 'vitest';
import { buildActorVisibleMemoryContext } from '../src/memory-injection/actor-visible-context-builder';
import { renderMemoryContextXmlMarkdown } from '../src/memory-injection/xml-markdown-renderer';
import type { MemoryEntry, PromptAssemblyRoleEntry } from '../src/types';

describe('injection renderer', () => {
    it('uses layered budget and does not leak numeric retention internals', () => {
        const entries: MemoryEntry[] = [
            {
                entryId: 'w1',
                chatKey: 'chat',
                title: '世界规则',
                entryType: 'world_hard_rule',
                category: '世界基础',
                tags: [],
                summary: '夜间宵禁',
                detail: '',
                detailSchemaVersion: 1,
                detailPayload: {},
                sourceSummaryIds: [],
                createdAt: 1,
                updatedAt: 2,
            },
            {
                entryId: 's1',
                chatKey: 'chat',
                title: '街区状态',
                entryType: 'scene_shared_state',
                category: '地点',
                tags: [],
                summary: '巡逻加强',
                detail: '',
                detailSchemaVersion: 1,
                detailPayload: {},
                sourceSummaryIds: [],
                createdAt: 1,
                updatedAt: 3,
            },
        ];
        const roleEntries: PromptAssemblyRoleEntry[] = [
            {
                actorKey: 'char_erin',
                actorLabel: '艾琳',
                entryId: 'a1',
                title: '角色画像',
                entryType: 'actor_profile',
                memoryPercent: 42,
                forgotten: false,
                renderedText: '艾琳：谨慎且善于观察',
                retentionStage: 'clear',
                retentionReasonCodes: [],
                renderMode: 'clear',
            },
            {
                actorKey: 'char_erin',
                actorLabel: '艾琳',
                entryId: 'e1',
                title: '可见事件',
                entryType: 'actor_visible_event',
                memoryPercent: 42,
                forgotten: false,
                renderedText: '桥头发生争执',
                retentionStage: 'clear',
                retentionReasonCodes: [],
                renderMode: 'clear',
            },
            {
                actorKey: 'char_luna',
                actorLabel: '露娜',
                entryId: 'e2',
                title: '可见事件',
                entryType: 'actor_visible_event',
                memoryPercent: 90,
                forgotten: false,
                renderedText: '露娜目击了市场冲突',
                retentionStage: 'clear',
                retentionReasonCodes: [],
                renderMode: 'clear',
            },
        ];

        const context = buildActorVisibleMemoryContext({
            entries,
            roleEntries,
            activeActorKey: 'char_erin',
        });
        const rendered = renderMemoryContextXmlMarkdown(context, 'narrative_default', {
            worldBaseChars: 70,
            sceneSharedChars: 50,
            actorViewChars: 80,
            totalChars: 180,
        });

        expect(rendered.length).toBeLessThanOrEqual(320);
        expect(rendered.includes('memoryPercent')).toBe(false);
        expect(rendered.includes('forgetProbability')).toBe(false);
        expect(rendered.includes('42%')).toBe(false);
        expect(rendered.includes('露娜目击了市场冲突')).toBe(false);
    });

    it('会把影子唤起记忆单独放进 actor_view 的影子小节', () => {
        const context = buildActorVisibleMemoryContext({
            entries: [],
            roleEntries: [
                {
                    actorKey: 'char_erin',
                    actorLabel: '艾琳',
                    entryId: 'e-normal',
                    title: '正常事件',
                    entryType: 'actor_visible_event',
                    memoryPercent: 72,
                    forgotten: false,
                    renderedText: '桥头发生争执',
                    retentionStage: 'clear',
                    retentionReasonCodes: [],
                    renderMode: 'clear',
                },
                {
                    actorKey: 'char_erin',
                    actorLabel: '艾琳',
                    entryId: 'e-shadow',
                    title: '影子事件',
                    entryType: 'event',
                    memoryPercent: 12,
                    forgotten: true,
                    forgettingTier: 'shadow_forgotten',
                    shadowTriggered: true,
                    shadowRecallPenalty: 0.42,
                    renderedText: '桥头曾有人在雨里低声争吵',
                    retentionStage: 'blur',
                    retentionReasonCodes: [],
                    renderMode: 'blur',
                },
            ],
            activeActorKey: 'char_erin',
        });

        const rendered = renderMemoryContextXmlMarkdown(context, 'narrative_default', {
            actorViewChars: 600,
            totalChars: 1200,
        });

        expect(rendered).toContain('### 被问题唤起的影子记忆');
        expect(rendered).toContain('这是被问题唤起的模糊记忆线索');
        expect(rendered).toContain('### 当前可见事件');
        expect(rendered).toContain('她清楚记得：桥头发生争执');
        expect(rendered.indexOf('### 被问题唤起的影子记忆')).toBeGreaterThan(rendered.indexOf('<actor_view actor="char_erin">'));
        expect(rendered.indexOf('### 被问题唤起的影子记忆')).toBeGreaterThan(rendered.indexOf('### 当前可见事件'));
    });
});
