import { describe, expect, it } from 'vitest';
import { extractTavernMessageTextEvent, getTavernMessageTextEvent } from '../../SDK/tavern';

describe('酒馆消息正文抽取兼容层', (): void => {
    it('应读取 mes 字符串正文', (): void => {
        const result = extractTavernMessageTextEvent({
            mes: '助手回复',
        });

        expect(result.text).toBe('助手回复');
        expect(result.textSource).toBe('mes');
        expect(result.isEmpty).toBe(false);
    });

    it('应读取 mes.message 结构正文', (): void => {
        const result = extractTavernMessageTextEvent({
            mes: {
                message: '导入后的助手回复',
            },
        });

        expect(result.text).toBe('导入后的助手回复');
        expect(result.textSource).toBe('mes.message');
        expect(result.normalizedShapeHint).toBe('object.message');
    });

    it('应读取 content.text 结构正文', (): void => {
        const result = extractTavernMessageTextEvent({
            content: {
                text: '结构化正文',
            },
        });

        expect(result.text).toBe('结构化正文');
        expect(result.textSource).toBe('content.text');
        expect(result.isEmpty).toBe(false);
    });

    it('应读取 swipe 对象中的 message 字段', (): void => {
        const result = extractTavernMessageTextEvent({
            swipe_id: 1,
            swipes: [
                '旧回复',
                {
                    message: '当前生效回复',
                },
            ],
        });

        expect(result.text).toBe('当前生效回复');
        expect(result.textSource).toBe('swipes[1].message');
    });

    it('遇到不支持结构时应返回空结果并带上诊断标记', (): void => {
        const result = extractTavernMessageTextEvent({
            extra: {
                nested: true,
            },
        });

        expect(result.text).toBe('');
        expect(result.isEmpty).toBe(true);
        expect(result.textSource).toBe('message.unsupported');
        expect(result.normalizedShapeHint).toBe('unsupported_message_shape');
    });

    it('旧接口应继续返回抽取出的正文', (): void => {
        const text = getTavernMessageTextEvent({
            mes: {
                message: '兼容旧调用点',
            },
        });

        expect(text).toBe('兼容旧调用点');
    });
});
