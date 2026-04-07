import { describe, expect, it } from 'vitest';
import type { DreamUiPhase, DreamUiStateSnapshot } from '../src/ui/dream-ui-state-service';

/**
 * 功能：验证 DreamUiStateSnapshot 结构的正确性（纯类型与数据层面测试）。
 * DreamUiStateService 依赖真实 DB，这里仅测试 snapshot 的结构兼容性。
 */
describe('DreamUiStateSnapshot 结构测试', () => {
    it('空快照结构应合法', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'test-chat',
            activeTask: { exists: false },
            inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
        };
        expect(snapshot.chatKey).toBe('test-chat');
        expect(snapshot.activeTask.exists).toBe(false);
        expect(snapshot.inbox.pendingApprovalCount).toBe(0);
        expect(snapshot.latestCompleted).toBeUndefined();
        expect(snapshot.latestFailed).toBeUndefined();
        expect(snapshot.latestRolledBack).toBeUndefined();
    });

    it('运行中快照可正确构建', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-1',
            activeTask: {
                exists: true,
                dreamId: 'dream:chat-1:abc',
                triggerReason: 'generation_ended',
                executionMode: 'silent',
                runProfile: 'auto_light',
                phase: 'running',
                startedAt: Date.now(),
                holderId: 'holder-1',
            },
            inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
        };
        expect(snapshot.activeTask.exists).toBe(true);
        expect(snapshot.activeTask.phase).toBe('running');
        expect(snapshot.activeTask.executionMode).toBe('silent');
        expect(snapshot.activeTask.runProfile).toBe('auto_light');
    });

    it('待审批快照可正确构建', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-2',
            activeTask: { exists: false },
            inbox: {
                pendingApprovalCount: 3,
                pendingDreamIds: ['dream-1', 'dream-2', 'dream-3'],
            },
        };
        expect(snapshot.inbox.pendingApprovalCount).toBe(3);
        expect(snapshot.inbox.pendingDreamIds).toHaveLength(3);
    });

    it('已完成快照可正确构建', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-3',
            activeTask: { exists: false },
            inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
            latestCompleted: {
                dreamId: 'dream-completed-1',
                executionMode: 'silent',
                runProfile: 'auto_light',
                outputKind: 'light',
                completedAt: Date.now(),
                summaryText: '梦境已完成：自动应用了 1 条低风险维护',
                highlightCount: 2,
                mutationCount: 0,
                maintenanceAppliedCount: 1,
            },
        };
        expect(snapshot.latestCompleted?.summaryText).toContain('自动应用');
        expect(snapshot.latestCompleted?.maintenanceAppliedCount).toBe(1);
    });

    it('失败快照可正确构建', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-4',
            activeTask: { exists: false },
            inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
            latestFailed: {
                dreamId: 'dream-failed-1',
                failedAt: Date.now(),
                reason: '模型调用超时',
            },
        };
        expect(snapshot.latestFailed?.reason).toBe('模型调用超时');
    });

    it('回滚快照可正确构建', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-5',
            activeTask: { exists: false },
            inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
            latestRolledBack: {
                dreamId: 'dream-rolled-back-1',
                rolledBackAt: Date.now(),
            },
        };
        expect(snapshot.latestRolledBack?.dreamId).toBe('dream-rolled-back-1');
    });

    it('所有 phase 枚举值可赋值', () => {
        const phases: DreamUiPhase[] = [
            'queued', 'running', 'recalling', 'generating',
            'post_processing', 'waiting_approval', 'auto_applying',
            'completed', 'failed', 'rolled_back',
        ];
        phases.forEach((phase) => {
            const snapshot: DreamUiStateSnapshot = {
                chatKey: 'test',
                activeTask: { exists: true, phase },
                inbox: { pendingApprovalCount: 0, pendingDreamIds: [] },
            };
            expect(snapshot.activeTask.phase).toBe(phase);
        });
    });

    it('复合快照：运行中 + 待审批 + 最近完成', () => {
        const snapshot: DreamUiStateSnapshot = {
            chatKey: 'chat-complex',
            activeTask: {
                exists: true,
                dreamId: 'dream-active',
                phase: 'generating',
            },
            inbox: {
                pendingApprovalCount: 1,
                pendingDreamIds: ['dream-pending-1'],
            },
            latestCompleted: {
                dreamId: 'dream-last-completed',
                completedAt: Date.now() - 60_000,
                summaryText: '梦境已完成',
            },
            latestFailed: {
                dreamId: 'dream-last-failed',
                failedAt: Date.now() - 300_000,
                reason: '生成超时',
            },
        };
        expect(snapshot.activeTask.exists).toBe(true);
        expect(snapshot.inbox.pendingApprovalCount).toBe(1);
        expect(snapshot.latestCompleted?.dreamId).toBe('dream-last-completed');
        expect(snapshot.latestFailed?.dreamId).toBe('dream-last-failed');
    });
});
