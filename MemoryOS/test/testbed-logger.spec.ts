import { describe, expect, it } from 'vitest';
import { createTestbedLogger } from '../testbed/logger';

describe('testbed logger', () => {
    it('writes unified chinese logs into single sink', () => {
        let sink = '';
        const logger = createTestbedLogger((text: string): void => {
            sink = text;
        });
        logger.section('读取测试包');
        logger.info('测试包读取成功', { mode: 'exact_replay' });
        logger.warn('未找到 world_profile_binding');
        logger.error('严格一致性校验失败', { mismatchCount: 2 });
        logger.dump('最终报告', { pass: false });

        expect(sink).toContain('读取测试包');
        expect(sink).toContain('测试包读取成功');
        expect(sink).toContain('未找到 world_profile_binding');
        expect(sink).toContain('严格一致性校验失败');
        expect(sink).toContain('最终报告');
        expect(logger.getEntries().length).toBeGreaterThan(0);
    });
});
