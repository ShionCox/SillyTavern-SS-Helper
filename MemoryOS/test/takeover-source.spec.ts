import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoistedMocks = vi.hoisted((): { loggerInfo: ReturnType<typeof vi.fn> } => {
    return {
        loggerInfo: vi.fn(),
    };
});

vi.mock('../../SDK/tavern', (): Record<string, unknown> => {
    return {
        getCurrentTavernCharacterEvent: (): Record<string, unknown> => ({ name: '角色' }),
        getCurrentTavernUserSnapshotEvent: (): Record<string, unknown> => ({ userName: '用户' }),
        getTavernSemanticSnapshotEvent: (): Record<string, unknown> => ({ roleKey: 'role:test' }),
        getTavernRuntimeContextEvent: vi.fn(),
        extractTavernMessageOriginalTextEvent: vi.fn(() => ({ text: '', source: 'message.empty' })),
        extractTavernMessageTextEvent: vi.fn(),
        stripRuntimePlaceholderArtifactsEvent: vi.fn((text: string) => String(text ?? '')),
    };
});

vi.mock('../src/runtime/runtime-services', (): Record<string, unknown> => {
    return {
        logger: {
            info: hoistedMocks.loggerInfo,
        },
    };
});

import { extractTavernMessageTextEvent, getTavernRuntimeContextEvent } from '../../SDK/tavern';
import { collectTakeoverSourceBundle } from '../src/memory-takeover/takeover-source';

/**
 * 功能：构造接管测试使用的正文抽取结果。
 * @param text 正文文本。
 * @param textSource 正文来源。
 * @param normalizedShapeHint 结构提示。
 * @returns 兼容抽取结果。
 */
function createExtractionResult(
    text: string,
    textSource: string,
    normalizedShapeHint?: string,
): { text: string; textSource: string; isEmpty: boolean; normalizedShapeHint?: string } {
    return {
        text,
        textSource,
        isEmpty: text.trim().length === 0,
        normalizedShapeHint,
    };
}

describe('旧聊天接管源收集', (): void => {
    beforeEach((): void => {
        hoistedMocks.loggerInfo.mockReset();
        vi.mocked(getTavernRuntimeContextEvent).mockReturnValue({
            chat: [],
        });
        vi.mocked(extractTavernMessageTextEvent).mockReset();
    });

    it('应保留导入格式中的 assistant 楼层', (): void => {
        vi.mocked(getTavernRuntimeContextEvent).mockReturnValue({
            chat: [
                { is_user: true, name: '用户', mes: '你好' },
                { is_user: false, name: '角色', mes: { message: '我是助手' } },
            ],
        });
        vi.mocked(extractTavernMessageTextEvent)
            .mockReturnValueOnce(createExtractionResult('你好', 'mes'))
            .mockReturnValueOnce(createExtractionResult('我是助手', 'mes.message', 'object.message'));

        const bundle = collectTakeoverSourceBundle();

        expect(bundle.totalFloors).toBe(2);
        expect(bundle.messages).toHaveLength(2);
        expect(bundle.messages[1]?.role).toBe('assistant');
        expect(bundle.messages[1]?.content).toBe('我是助手');
        expect(bundle.messages[1]?.contentSource).toBe('mes.message');
    });

    it('应跳过 system 消息与不支持结构的空消息', (): void => {
        vi.mocked(getTavernRuntimeContextEvent).mockReturnValue({
            chat: [
                { role: 'system', mes: '系统消息' },
                { is_user: false, name: '角色', extra: { unsupported: true } },
                { is_user: true, name: '用户', mes: '保留消息' },
            ],
        });
        vi.mocked(extractTavernMessageTextEvent)
            .mockReturnValueOnce(createExtractionResult('', 'message.unsupported', 'unsupported_message_shape'))
            .mockReturnValueOnce(createExtractionResult('保留消息', 'mes'));

        const bundle = collectTakeoverSourceBundle();

        expect(bundle.totalFloors).toBe(1);
        expect(bundle.messages).toHaveLength(1);
        expect(bundle.messages[0]?.role).toBe('user');
        expect(hoistedMocks.loggerInfo).toHaveBeenCalledWith('[takeover][source] 跳过统计=', {
            system_message: 1,
            empty_after_normalize: 0,
            unsupported_shape: 1,
        });
    });

    it('应把误带 is_system 标记的普通助手回复纠正为 assistant', (): void => {
        vi.mocked(getTavernRuntimeContextEvent).mockReturnValue({
            chat: [
                { is_user: true, is_system: true, name: '用户', mes: '开场设定' },
                { is_user: false, is_system: true, name: '旁白器', mes: '这是普通回复，不是系统隐藏消息' },
                { is_user: false, is_system: true, name: '系统', mes: '这条应跳过', extra: { type: 'assistant_note' } },
            ],
        });
        vi.mocked(extractTavernMessageTextEvent)
            .mockReturnValueOnce(createExtractionResult('开场设定', 'mes'))
            .mockReturnValueOnce(createExtractionResult('这是普通回复，不是系统隐藏消息', 'mes'))
            .mockReturnValueOnce(createExtractionResult('这条应跳过', 'mes'));

        const bundle = collectTakeoverSourceBundle();

        expect(bundle.messages).toHaveLength(2);
        expect(bundle.messages[0]?.role).toBe('user');
        expect(bundle.messages[1]?.role).toBe('assistant');
        expect(bundle.messages[1]?.normalizedFrom).toBe('is_system_fallback_assistant');
    });
});
