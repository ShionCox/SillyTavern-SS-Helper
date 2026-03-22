import type { RecordEditorViewMeta } from '../types';

/**
 * 功能：提供世界状态页的展示元数据。
 */
export const WORLD_PAGE_META: RecordEditorViewMeta = {
    label: '世界状态',
    icon: 'fa-solid fa-scroll-old',
    title: '世界状态总览',
    subtitle: '按子表拆分显示，并在每个子表内继续按分类标签切换，只呈现已经识别并生效的内容。',
    tip: '按结构化分类查看当前聊天的世界状态，包括城市、地点、规则、局势与子表内分类切换。',
};
