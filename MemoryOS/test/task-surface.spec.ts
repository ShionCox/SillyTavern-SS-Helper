import { describe, expect, it } from 'vitest';
import { buildSharedTaskQueueSnapshot, createSharedTaskQueueState, enqueueSharedTaskQueueItem, finishSharedTaskQueueItem } from '../../_Components/sharedTaskSurfaceState';
import {
    enqueueTaskPresentation,
    finishTaskPresentation,
    flushTaskPresentationSurface,
    getTaskQueueSnapshot,
    lockComposer,
    renderSharedTaskSurface,
    unlockComposer,
} from '../../_Components/sharedTaskSurface';
import { normalizeMemoryTaskPresentationSettings } from '../src/llm/task-presentation-settings';

describe('任务显示队列', () => {
    it('阻塞任务连续执行时会直接切到下一项', () => {
        const queue = createSharedTaskQueueState();
        const firstId = enqueueSharedTaskQueueItem(queue, {
            taskId: 'world.template.build',
            title: '模板构建',
            surfaceMode: 'fullscreen_blocking',
            showToast: false,
        }, 1000);
        enqueueSharedTaskQueueItem(queue, {
            taskId: 'world.template.build',
            title: '模板回填',
            surfaceMode: 'fullscreen_blocking',
            showToast: false,
        }, 1001);

        finishSharedTaskQueueItem(queue, firstId, 'done', {}, 1100);
        const snapshot = buildSharedTaskQueueSnapshot(queue, 0, 1100);

        expect(snapshot.fullscreenVisible).toBe(true);
        expect(snapshot.blockingTask?.title).toBe('模板回填');
        expect(snapshot.nextTasks).toHaveLength(0);
    });

    it('带去重键的后台任务会复用同一条展示项', () => {
        const queue = createSharedTaskQueueState();
        const firstId = enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.vector.embed',
            title: '向量索引写入',
            surfaceMode: 'toast_background',
            dedupeVisualKey: 'vector-index',
            showToast: true,
        }, 1000);
        const secondId = enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.vector.embed',
            title: '向量索引续写',
            surfaceMode: 'toast_background',
            dedupeVisualKey: 'vector-index',
            showToast: true,
        }, 1005);

        const snapshot = buildSharedTaskQueueSnapshot(queue, 0, 1005);
        expect(firstId).toBe(secondId);
        expect(snapshot.items).toHaveLength(1);
        expect(snapshot.toastTask?.title).toBe('向量索引续写');
    });

    it('多个后台任务会聚合为当前 1 项和等待队列', () => {
        const queue = createSharedTaskQueueState();
        enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.summarize',
            title: '摘要生成',
            surfaceMode: 'toast_background',
            showToast: true,
        }, 1000);
        enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.extract',
            title: '结构提取',
            surfaceMode: 'toast_background',
            showToast: true,
        }, 1001);
        enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.search.rerank',
            title: '召回重排',
            surfaceMode: 'toast_background',
            showToast: true,
        }, 1002);

        const snapshot = buildSharedTaskQueueSnapshot(queue, 0, 1002);

        expect(snapshot.toastVisible).toBe(true);
        expect(snapshot.toastTask?.title).toBe('摘要生成');
        expect(snapshot.toastNextTasks).toHaveLength(2);
        expect(snapshot.toastNextTasks.map((item) => item.title)).toEqual(['结构提取', '召回重排']);
        expect(snapshot.backgroundCount).toBe(3);
        expect(snapshot.pendingCount).toBe(3);
    });

    it('后台 toast 任务完成后会继续显示到自动关闭时间', () => {
        const queue = createSharedTaskQueueState();
        const requestId = enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.summarize',
            title: '摘要生成',
            surfaceMode: 'toast_background',
            showToast: true,
            autoCloseMs: 3000,
        }, 1000);

        finishSharedTaskQueueItem(queue, requestId, 'done', {}, 1500);

        const visibleSnapshot = buildSharedTaskQueueSnapshot(queue, 0, 2000);
        expect(visibleSnapshot.toastVisible).toBe(true);
        expect(visibleSnapshot.toastTask?.title).toBe('摘要生成');
        expect(visibleSnapshot.toastTask?.state).toBe('done');

        const closedSnapshot = buildSharedTaskQueueSnapshot(queue, 0, 4600);
        expect(closedSnapshot.toastVisible).toBe(false);
        expect(closedSnapshot.items).toHaveLength(0);
    });

    it('后台 toast 任务失败后会显示到错误保留时间结束', () => {
        const queue = createSharedTaskQueueState();
        const requestId = enqueueSharedTaskQueueItem(queue, {
            taskId: 'memory.extract',
            title: '结构提取',
            surfaceMode: 'toast_background',
            showToast: true,
            errorHoldMs: 2400,
        }, 1000);

        finishSharedTaskQueueItem(queue, requestId, 'error', { reason: '上游模型返回异常' }, 1500);

        const visibleSnapshot = buildSharedTaskQueueSnapshot(queue, 0, 3200);
        expect(visibleSnapshot.toastVisible).toBe(true);
        expect(visibleSnapshot.toastTask?.state).toBe('error');
        expect(visibleSnapshot.toastTask?.reason).toBe('上游模型返回异常');

        const closedSnapshot = buildSharedTaskQueueSnapshot(queue, 0, 3901);
        expect(closedSnapshot.toastVisible).toBe(false);
        expect(closedSnapshot.items).toHaveLength(0);
    });
});

describe('任务显示运行时', () => {
    it('会基于引用计数锁定和恢复发送区，即使没有 DOM 也不会报错', () => {
        flushTaskPresentationSurface();
        while (unlockComposer() > 0) {
            // 清空可能残留的锁定计数。
        }

        const requestId = enqueueTaskPresentation({
            taskId: 'world.template.build',
            title: '模板构建',
            surfaceMode: 'toast_blocking',
            showToast: true,
            disableComposer: true,
        });

        expect(renderSharedTaskSurface().composerLocked).toBe(true);
        expect(getTaskQueueSnapshot().composerLockCount).toBe(1);

        expect(lockComposer('manual-test')).toBe(2);
        expect(getTaskQueueSnapshot().composerLockCount).toBe(2);

        finishTaskPresentation(requestId, 'done');
        expect(getTaskQueueSnapshot().composerLockCount).toBe(1);
        expect(getTaskQueueSnapshot().composerLocked).toBe(true);

        expect(unlockComposer()).toBe(0);
        expect(getTaskQueueSnapshot().composerLocked).toBe(false);

        flushTaskPresentationSurface();
    });
});

describe('任务显示设置', () => {
    it('会把非法配置归一化为默认值', () => {
        const settings = normalizeMemoryTaskPresentationSettings({
            blockingDefaultMode: 'toast_background',
            showBackgroundToast: false,
            toastAutoCloseSeconds: 999,
        });

        expect(settings.blockingDefaultMode).toBe('fullscreen_blocking');
        expect(settings.showBackgroundToast).toBe(false);
        expect(settings.toastAutoCloseSeconds).toBe(30);
        expect(settings.disableComposerDuringBlocking).toBe(true);
    });
});
