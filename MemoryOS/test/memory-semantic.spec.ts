import { describe, expect, it } from 'vitest';
import { projectMemorySemanticRecord } from '../src/core/memory-semantic';

describe('memory semantic projection', () => {
    it('会把事件类条目统一映射为角色可见事件', () => {
        const semantic = projectMemorySemanticRecord({
            entryType: 'event',
            ongoing: false,
            detailPayload: {
                fields: {
                    outcome: '袭击已被击退',
                    lifecycle: 'resolved',
                },
            },
        });

        expect(semantic).toMatchObject({
            semanticKind: 'event',
            visibilityScope: 'actor_visible',
            isCharacterVisible: true,
            isOngoing: false,
            currentState: 'resolved',
            finalOutcome: '袭击已被击退',
            sourceEntryType: 'event',
        });
    });

    it('会兼容旧记录里的 result/status 字段', () => {
        const semantic = projectMemorySemanticRecord({
            entryType: 'actor_visible_event',
            detailPayload: {
                fields: {
                    status: '余波未平',
                    result: '塞拉菲娜把{{user}}带回了林间小屋',
                },
            },
        });

        expect(semantic?.currentState).toBe('余波未平');
        expect(semantic?.finalOutcome).toBe('塞拉菲娜把{{user}}带回了林间小屋');
    });

    it('会把世界与场景状态统一映射为状态语义并区分可见级别', () => {
        const worldState = projectMemorySemanticRecord({
            entryType: 'world_global_state',
            detailPayload: { state: '整片森林正在被黑暗侵蚀' },
        });
        const sceneState = projectMemorySemanticRecord({
            entryType: 'scene_shared_state',
            detailPayload: {
                fields: {
                    status: '林间空地暂时安全',
                },
            },
        });

        expect(worldState).toMatchObject({
            semanticKind: 'state',
            visibilityScope: 'global_shared',
        });
        expect(sceneState).toMatchObject({
            semanticKind: 'state',
            visibilityScope: 'scene_shared',
            currentState: '林间空地暂时安全',
        });
    });

    it('会把任务统一映射为任务推进并归并 objective/goal', () => {
        const semantic = projectMemorySemanticRecord({
            entryType: 'task',
            ongoing: true,
            detailPayload: {
                fields: {
                    status: '进行中',
                    goal: '确保{{user}}顺利恢复伤势',
                },
                objective: '护送{{user}}穿过森林',
            },
        });

        expect(semantic).toMatchObject({
            semanticKind: 'task_progress',
            visibilityScope: 'actor_visible',
            isOngoing: true,
            currentState: '进行中',
            goalOrObjective: '护送{{user}}穿过森林',
        });
    });
});
