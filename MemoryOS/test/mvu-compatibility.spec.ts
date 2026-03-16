import { describe, expect, it } from 'vitest';
import { getTavernMessageTextEvent } from '../../SDK/tavern/prompt';
import { filterRecordText } from '../src/core/record-filter';

describe('mvu compatibility normalization', () => {
    it('从消息正文中剥离 MVU 追加的 UpdateVariable 控制块', () => {
        const message = {
            message: '欢迎回来，旅行者。\n\n<UpdateVariable>\n_.set("状态.好感", 1)\n</UpdateVariable>',
        };

        expect(getTavernMessageTextEvent(message)).toBe('欢迎回来，旅行者。');
    });

    it('在记录过滤阶段也忽略 UpdateVariable 与状态占位符尾巴', () => {
        const result = filterRecordText(
            '欢迎回来，旅行者。\n\n<UpdateVariable>\n_.set("状态.好感", 1)\n</UpdateVariable><StatusPlaceHolderImpl/>',
        );

        expect(result.dropped).toBe(false);
        expect(result.filteredText).toBe('欢迎回来，旅行者。');
    });
});