import { describe, expect, it } from 'vitest';
import { getTavernMessageTextEvent, stripRollHelperArtifactsEvent } from '../../SDK/tavern';
import { filterRecordText } from '../src/core/record-filter';

describe('RollHelper compatibility normalization', () => {
    it('共享 SDK 清理规则会保留普通 json 代码块', () => {
        const text = '结果如下：\n\n```json\n{"type":"summary","value":"ok"}\n```';

        expect(stripRollHelperArtifactsEvent(text)).toBe(text);
    });

    it('会从消息正文中剥离 rolljson 事件块', () => {
        const message = {
            message: '你听见门后传来轻响。\n\n```rolljson\n{"type":"dice_events","events":[{"id":"lockpick_gate"}]}\n```',
        };

        expect(getTavernMessageTextEvent(message)).toBe('你听见门后传来轻响。');
    });

    it('也会剥离 json 围栏里的 dice_events 与内部注释块', () => {
        const result = filterRecordText(
            '门被轻轻推开。\n\n```json\n{"type":"dice_events","events":[{"id":"push_door"}]}\n```\n<!-- ROLLHELPER_INTERNAL_START -->debug<!-- ROLLHELPER_INTERNAL_END -->',
        );

        expect(result.dropped).toBe(false);
        expect(result.filteredText).toBe('门被轻轻推开。');
    });
});