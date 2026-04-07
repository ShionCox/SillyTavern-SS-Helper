import { describe, expect, it } from 'vitest';
import { parseTakeoverFormDraft, resolveTakeoverFieldVisibility } from '../src/ui/takeoverFormShared';

describe('旧聊天接管表单辅助', (): void => {
    it('应根据模式返回正确的字段显隐状态', (): void => {
        expect(resolveTakeoverFieldVisibility('full')).toEqual({
            showRecentFloors: false,
            showCustomRange: false,
            showActiveSnapshotFloors: true,
        });
        expect(resolveTakeoverFieldVisibility('recent')).toEqual({
            showRecentFloors: true,
            showCustomRange: false,
            showActiveSnapshotFloors: true,
        });
        expect(resolveTakeoverFieldVisibility('custom_range')).toEqual({
            showRecentFloors: false,
            showCustomRange: true,
            showActiveSnapshotFloors: true,
        });
    });

    it('应正确解析 recent 模式输入', (): void => {
        const parsed = parseTakeoverFormDraft({
            mode: 'recent',
            startFloor: '',
            endFloor: '',
            recentFloors: '48',
            batchSize: '12',
            useActiveSnapshot: true,
            activeSnapshotFloors: '12',
        });

        expect(parsed.validationError).toBeUndefined();
        expect(parsed.config).toEqual({
            mode: 'recent',
            recentFloors: 48,
            batchSize: 12,
            useActiveSnapshot: true,
            activeSnapshotFloors: 12,
        });
    });

    it('应在自定义区间反向时返回错误', (): void => {
        const parsed = parseTakeoverFormDraft({
            mode: 'custom_range',
            startFloor: '40',
            endFloor: '10',
            recentFloors: '',
            batchSize: '20',
            useActiveSnapshot: false,
            activeSnapshotFloors: '',
        });

        expect(parsed.validationError).toBe('起始楼层不能大于结束楼层。');
    });
});
