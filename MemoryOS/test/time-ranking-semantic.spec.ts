import { describe, expect, it } from 'vitest';
import { computeOutcomeLikeBoost, computeStateLikeBoost } from '../src/memory-time/time-ranking';

describe('time ranking semantic consumption', () => {
    it('会通过统一语义识别状态型条目', () => {
        const boost = computeStateLikeBoost({
            candidateId: 'c1',
            entryId: 'e1',
            schemaId: 'scene_shared_state',
            title: '林间空地',
            summary: '小屋周围暂时安全',
            updatedAt: Date.now(),
            memoryPercent: 80,
            detailPayload: {
                fields: {
                    status: '暂时安全',
                },
            },
        });

        expect(boost).toBeGreaterThan(0.2);
    });

    it('会通过统一语义兼容旧 result 字段识别结果型条目', () => {
        const boost = computeOutcomeLikeBoost({
            candidateId: 'c2',
            entryId: 'e2',
            schemaId: 'event',
            title: '森林中的救援',
            summary: '塞拉菲娜把{{user}}带回了小屋',
            updatedAt: Date.now(),
            memoryPercent: 88,
            detailPayload: {
                fields: {
                    result: '救援成功，{{user}}暂时脱离危险',
                },
            },
        });

        expect(boost).toBeGreaterThan(0.2);
    });
});
