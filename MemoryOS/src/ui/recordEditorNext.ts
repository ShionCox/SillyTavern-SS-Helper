import { db, clearAllMemoryData, clearMemoryChatData, patchSdkChatShared } from '../db/db';
import type { DBMeta } from '../db/db';
import { logger, toast } from '../index';
import { mountThemeHost, initThemeKernel } from '../../../SDK/theme';
import { AuditManager } from '../core/audit-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import { readPluginSignal } from '../../../SDK/db';
import { buildTavernChatEntityKeyEvent, getTavernContextSnapshotEvent, parseAnyTavernChatRefEvent } from '../../../SDK/tavern';
import type { TemplateTableDef } from '../template/types';
import type { LogicTableRow } from '../types';

type RawTableName = 'events' | 'facts' | 'summaries' | 'world_state' | 'audit';
type ViewMode = 'raw' | 'logic';

interface PendingRawUpdate {
    id: string;
    tableName: RawTableName;
    payload: unknown;
}

interface CurrentSort {
    col: string;
    asc: boolean;
}

interface ChatItemMeta {
    chatKey: string;
    canonicalKey: string;
    displayName: string;
    systemName: string;
    avatarHtml: string;
    createdAt: number | null;
    signal: Record<string, unknown> | null;
}

type RawRecord = Record<string, unknown>;

function normalizeRecordTextSignature(value: unknown): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function resolveChatItemCanonicalKey(chatKey: string): string {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return '';
    }
    const scope = getTavernContextSnapshotEvent();
    const ref = parseAnyTavernChatRefEvent(normalizedChatKey, {
        tavernInstanceId: String(scope?.tavernInstanceId ?? '').trim() || undefined,
        scopeType: scope?.scopeType,
        scopeId: String(scope?.scopeId ?? '').trim() || undefined,
    });
    return buildTavernChatEntityKeyEvent(ref) || normalizedChatKey.toLowerCase();
}

function readEventMessageId(record: RawRecord): string {
    const refs = (record.refs as Record<string, unknown> | undefined) || {};
    return String(refs.messageId ?? refs.sourceMessageId ?? '').trim();
}

function readEventPayloadText(record: RawRecord): string {
    const payload = (record.payload as Record<string, unknown> | undefined) || {};
    return String(payload.text ?? payload.content ?? '').trim();
}

function dedupeDisplayEvents(records: RawRecord[]): RawRecord[] {
    const kept: RawRecord[] = [];
    const seenTsByKey = new Map<string, number>();

    for (const record of records) {
        const type = String(record.type ?? '').trim();
        if (type !== 'chat.message.received' && type !== 'chat.message.sent') {
            kept.push(record);
            continue;
        }

        const messageId = readEventMessageId(record);
        const textSignature = normalizeRecordTextSignature(readEventPayloadText(record));
        const dedupeKey = messageId
            ? `${type}|id:${messageId}`
            : textSignature
                ? `${type}|text:${textSignature}`
                : '';

        if (!dedupeKey) {
            kept.push(record);
            continue;
        }

        const currentTs = Number(record.ts ?? 0);
        const previousTs = seenTsByKey.get(dedupeKey);
        const withinDuplicateWindow = previousTs != null && (
            dedupeKey.includes('|id:')
            || Math.abs(currentTs - previousTs) <= 5000
        );
        if (withinDuplicateWindow) {
            continue;
        }

        seenTsByKey.set(dedupeKey, currentTs);
        kept.push(record);
    }

    return kept;
}

/**
 * 功能：标准化消息发送方标签。
 * @param senderType 原始发送方类型
 * @returns 规范化后的标签
 */
function normalizeSenderLabel(senderType: string): '助手' | '用户' | '系统' {
    if (senderType === '系统') {
        return '系统';
    }
    if (senderType === '用户') {
        return '用户';
    }
    return '助手';
}

/**
 * 功能：对文本进行 HTML 转义。
 * @param value 原始文本
 * @returns 转义后的文本
 */
function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：把任意值转换为适合展示的字符串。
 * @param value 任意值
 * @returns 展示字符串
 */
function stringifyDisplayValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * 功能：尝试把输入文本解析为 JSON、数字或布尔值。
 * @param value 输入文本
 * @returns 解析后的值
 */
function parseLooseValue(value: string): unknown {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed === 'null') {
        return null;
    }
    if (!Number.isNaN(Number(trimmed))) {
        return Number(trimmed);
    }
    if (
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))
        || (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

/**
 * 功能：获取原始库表记录的主键。
 * @param tableName 表名
 * @param record 数据记录
 * @returns 记录主键
 */
function getRawRecordId(tableName: RawTableName, record: RawRecord): string {
    if (tableName === 'events') {
        return String(record.eventId ?? '');
    }
    if (tableName === 'facts') {
        return String(record.factKey ?? '');
    }
    if (tableName === 'summaries') {
        return String(record.summaryId ?? '');
    }
    if (tableName === 'world_state') {
        return String(record.stateKey ?? '');
    }
    return String(record.auditId ?? '');
}

/**
 * 功能：返回原始库表记录中可编辑的主载荷字段名。
 * @param tableName 表名
 * @returns 字段名
 */
function getRawPayloadFieldName(tableName: RawTableName): 'payload' | 'value' | 'content' | 'after' {
    if (tableName === 'events') {
        return 'payload';
    }
    if (tableName === 'summaries') {
        return 'content';
    }
    if (tableName === 'audit') {
        return 'after';
    }
    return 'value';
}

/**
 * 功能：创建挂起变更的索引键。
 * @param tableName 表名
 * @param id 记录主键
 * @returns 挂起索引键
 */
function makePendingKey(tableName: RawTableName, id: string): string {
    return `${tableName}::${id}`;
}

/**
 * 功能：解析挂起变更索引键。
 * @param pendingKey 挂起索引键
 * @returns 表名与记录主键
 */
function parsePendingKey(pendingKey: string): { tableName: RawTableName | null; id: string } {
    const separatorIndex = pendingKey.indexOf('::');
    if (separatorIndex < 0) {
        return { tableName: null, id: '' };
    }
    return {
        tableName: pendingKey.slice(0, separatorIndex) as RawTableName,
        id: pendingKey.slice(separatorIndex + 2),
    };
}

/**
 * 功能：格式化时间展示。
 * @param value 时间戳
 * @returns 展示文本
 */
function formatTimeLabel(value: unknown): string {
    const timestamp = Number(value ?? 0);
    if (!timestamp) {
        return '暂无';
    }
    return new Date(timestamp).toLocaleString();
}

/**
 * 功能：构建聊天摘要文本。
 * @param signal MemoryOS 共享信号
 * @returns 摘要文本
 */
function buildChatSummaryLabel(signal: Record<string, unknown> | null): string {
    if (!signal) {
        return '尚无共享摘要';
    }
    const factCount = Number(signal.factCount ?? 0);
    const eventCount = Number(signal.eventCount ?? 0);
    const activeTemplate = String(signal.activeTemplate ?? '').trim();
    const lastSummaryAt = Number(signal.lastSummaryAt ?? 0);
    const parts = [
        activeTemplate ? `模板 ${activeTemplate}` : '模板未绑定',
        `事实 ${factCount}`,
        `事件 ${eventCount}`,
    ];
    if (lastSummaryAt > 0) {
        parts.push(`摘要 ${formatTimeLabel(lastSummaryAt)}`);
    }
    return parts.join(' · ');
}

/**
 * 功能：构造聊天项的展示元数据。
 * @param chatKey 聊天键
 * @param signal MemoryOS 共享信号
 * @returns 界面展示需要的元数据
 */
async function buildChatItemMeta(
    chatKey: string,
    signal: Record<string, unknown> | null,
): Promise<ChatItemMeta> {
    const ctx = (window as any).SillyTavern?.getContext?.() || {};
    const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
    const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
    let displayName = chatKey;
    let avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-user"></i></div>`;

    const firstEvent = await db.events.where('chatKey').equals(chatKey).first();
    const createdAt = firstEvent?.ts ? Number(firstEvent.ts) : null;

    if (chatKey.startsWith('Group_')) {
        const groupId = chatKey.replace(/^Group_/, '').split('_')[0];
        const group = groups.find((item: Record<string, unknown>): boolean => String(item.id ?? '') === groupId);
        if (group) {
            displayName = `[群组] ${String(group.name ?? chatKey)}`;
            avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-users"></i></div>`;
        }
    } else {
        const matchedCharacter = characters.find((item: Record<string, unknown>): boolean => {
            const avatar = String(item.avatar ?? '');
            return Boolean(avatar) && chatKey.startsWith(`${avatar}_`);
        });
        if (matchedCharacter) {
            displayName = String(matchedCharacter.name ?? chatKey);
            avatarHtml = `<img class="stx-re-chat-avatar" src="/characters/${escapeHtml(String(matchedCharacter.avatar ?? ''))}" alt="${escapeHtml(displayName)}" onerror="this.outerHTML='<div class=&quot;stx-re-chat-avatar-icon&quot;><i class=&quot;fa-solid fa-user&quot;></i></div>'">`;
        }
    }

    return {
        chatKey,
        canonicalKey: resolveChatItemCanonicalKey(chatKey),
        displayName,
        systemName: chatKey,
        avatarHtml,
        createdAt,
        signal,
    };
}

const RE_KEY_I18N: Record<string, string> = {
    role: '角色',
    name: '名称',
    content: '内容正文',
    text: '普通文本',
    summary: '摘要内容',
    significance: '显著度',
    importance: '重要度',
    keywords: '关键词',
    type: '类型',
    description: '描述',
    system: '系统设定',
    user: '用户意图',
    assistant: 'AI回复',
    observation: '观察结果',
    resolution: '决议',
    thought: '内部思考',
    context: '背景信息',
    entities: '实体引用',
    ability: '能力',
    abilities: '能力',
    companion: '同伴',
    current_emotion: '当前情绪',
    emotion: '情绪',
    goal: '目标',
    health: '健康',
    hp: '生命值',
    inventory: '物品',
    location: '位置',
    notes: '备注',
    relationship: '关系',
    relationships: '关系',
    scene: '场景',
    status: '状态',
    value: '值',
    world_state: '世界状态',
};

const RE_ENTITY_KIND_I18N: Record<string, string> = {
    user: '用户',
    character: '角色',
    relationship: '关系',
    location: '地点',
    environment: '环境',
    goal: '目标',
    world: '世界',
    item: '物品',
    group: '群组',
    scene: '场景',
    semantic: '语义',
    state: '状态',
    actor: '对象',
};

const RE_EVENT_TYPE_I18N: Record<string, string> = {
    'chat.message.sent': '用户发言',
    'chat.message.received': '角色回复',
    'chat.message.system': '系统消息',
    'chat.message.updated': '消息更新',
    'memory.extract': '记忆抽取',
    'memory.summarize': '摘要生成',
    'memory.vector.embed': '向量写入',
    'memory.search.rerank': '检索重排',
    'world.template.build': '世界模板构建',
    'world_state.update': '世界状态更新',
};

const RE_AUDIT_ACTION_I18N: Record<string, string> = {
    create: '新建',
    upsert: '写入',
    update: '更新',
    patch: '修补',
    delete: '删除',
    restore: '恢复',
    merge: '合并',
    compact: '压缩',
    rebuild: '重建',
    snapshot: '快照',
};

/**
 * 功能：把记录字段键名转换为更友好的中文标签。
 * @param key 原始字段键名。
 * @returns 友好的字段标签。
 */
function formatRecordEditorKeyLabel(key: string): string {
    const trimmed = String(key ?? '').trim();
    if (!trimmed) {
        return '未命名字段';
    }

    const normalized = trimmed.toLowerCase();
    if (RE_KEY_I18N[normalized]) {
        return RE_KEY_I18N[normalized];
    }

    const parts = trimmed.split(/[_./-]+/).filter(Boolean);
    if (parts.length === 0) {
        return trimmed;
    }

    const translatedParts = parts.map((part: string): string => {
        const partKey = part.toLowerCase();
        if (RE_KEY_I18N[partKey]) {
            return RE_KEY_I18N[partKey];
        }
        if (/^(id|uuid)$/i.test(part)) {
            return part.toUpperCase();
        }
        return part;
    });
    const hasTranslatedPart = parts.some((part: string): boolean => Boolean(RE_KEY_I18N[part.toLowerCase()]));
    return hasTranslatedPart ? translatedParts.join('') : trimmed;
}

/**
 * 功能：压缩内部标识的显示长度，避免界面被长键值撑开。
 * @param value 原始内部标识。
 * @param maxLength 最大展示长度。
 * @returns 压缩后的展示文本。
 */
function compactInternalIdentifier(value: string, maxLength: number = 64): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '暂无';
    }
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    const headLength = Math.max(12, Math.floor(maxLength * 0.42));
    const tailLength = Math.max(10, maxLength - headLength - 3);
    return `${trimmed.slice(0, headLength)}...${trimmed.slice(-tailLength)}`;
}

/**
 * 功能：把实体类型转换成更直观的中文称呼。
 * @param kind 实体类型。
 * @returns 中文类型名。
 */
function formatEntityKindLabel(kind: string): string {
    const normalized = String(kind ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未绑定对象';
    }
    if (RE_ENTITY_KIND_I18N[normalized]) {
        return RE_ENTITY_KIND_I18N[normalized];
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：把路径或代码式片段转换成更适合阅读的中文主题。
 * @param value 原始路径或标识片段。
 * @param fallback 兜底文本。
 * @returns 中文化后的主题名。
 */
function formatHumanReadableTopic(value: string, fallback: string = '未命名'): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return fallback;
    }
    const normalized = trimmed.replace(/^\/+/, '').trim();
    if (!normalized) {
        return fallback;
    }
    const segments = normalized.split(/[/.]+/).filter(Boolean);
    if (segments.length === 0) {
        return fallback;
    }
    const translated = segments.map((segment: string): string => formatRecordEditorKeyLabel(segment));
    return translated.join(' / ');
}

/**
 * 功能：把实体对象渲染成更直观的中文说明。
 * @param entity 原始实体对象。
 * @returns 中文实体说明。
 */
function formatEntityDisplayLabel(entity: Record<string, unknown> | undefined): string {
    if (!entity) {
        return '未绑定对象';
    }
    const kind = formatEntityKindLabel(String(entity.kind ?? ''));
    const entityId = String(entity.id ?? '').trim();
    if (!entityId) {
        return kind;
    }
    return `${kind}：${entityId}`;
}

/**
 * 功能：生成实体的原始引用提示，方便需要时核对。
 * @param entity 原始实体对象。
 * @returns 原始引用文本。
 */
function formatEntityRawHint(entity: Record<string, unknown> | undefined): string {
    if (!entity) {
        return '未填写实体引用';
    }
    const kind = String(entity.kind ?? '').trim();
    const entityId = String(entity.id ?? '').trim();
    if (!kind || !entityId) {
        return '实体信息不完整';
    }
    return `[${kind}:${entityId}]`;
}

/**
 * 功能：把事件类型转换成更容易理解的中文名称。
 * @param value 原始事件类型。
 * @returns 中文事件名称。
 */
function formatEventTypeLabel(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '未命名事件';
    }
    if (RE_EVENT_TYPE_I18N[normalized]) {
        return RE_EVENT_TYPE_I18N[normalized];
    }
    return formatHumanReadableTopic(normalized.replace(/\./g, '/'), normalized);
}

/**
 * 功能：把审计动作转换成更自然的中文动词。
 * @param value 原始审计动作。
 * @returns 中文动作名称。
 */
function formatAuditActionLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未命名动作';
    }
    if (RE_AUDIT_ACTION_I18N[normalized]) {
        return RE_AUDIT_ACTION_I18N[normalized];
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：把维护来源模式转换成中文说明。
 * @param value 原始模式值。
 * @returns 中文模式说明。
 */
function formatOperationModeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '常规';
    }
    if (normalized === 'manual') {
        return '手动';
    }
    if (normalized === 'auto') {
        return '自动';
    }
    if (normalized === 'system') {
        return '系统';
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：生成事实记录的主标题，让原始事实更像资料项。
 * @param record 原始事实记录。
 * @returns 主标题文本。
 */
function buildFactHeadline(record: RawRecord): string {
    const path = String(record.path ?? '').trim();
    if (path) {
        return formatHumanReadableTopic(path, '未命名事实');
    }
    const type = String(record.type ?? '').trim();
    if (type) {
        return formatRecordEditorKeyLabel(type);
    }
    return '未命名事实';
}

/**
 * 功能：根据事实记录给出简洁的分类说明。
 * @param record 原始事实记录。
 * @returns 分类说明文本。
 */
function buildFactSummaryLabel(record: RawRecord): string {
    const type = String(record.type ?? '').trim();
    if (type) {
        return `分类：${formatRecordEditorKeyLabel(type)}`;
    }
    return '分类：未标记';
}

/**
 * 功能：生成世界状态记录的主标题。
 * @param path 原始路径。
 * @returns 主标题文本。
 */
function buildWorldStateHeadline(path: string): string {
    return formatHumanReadableTopic(path, '未命名状态');
}

/**
 * 功能：把多个描述片段拼成一行辅助说明。
 * @param parts 片段列表。
 * @returns 合并后的辅助说明。
 */
function joinReadableMeta(parts: string[]): string {
    return parts.map((part: string): string => String(part ?? '').trim()).filter(Boolean).join(' · ');
}

/**
 * 功能：判断事实记录是否存在结构信息缺失。
 * @param record 原始事实记录。
 * @returns 是否需要提示结构待整理。
 */
function isFactStructurallyIncomplete(record: RawRecord): boolean {
    const entity = record.entity as Record<string, unknown> | undefined;
    const entityKind = String(entity?.kind ?? '').trim();
    const entityId = String(entity?.id ?? '').trim();
    const path = String(record.path ?? '').trim();
    return !entityKind || !entityId || !path;
}

/**
 * 功能：渲染带标题、说明和内部提示的记录摘要块。
 * @param title 主标题。
 * @param subtitle 辅助说明。
 * @param internalLabel 内部信息标签。
 * @param internalValue 内部信息原值。
 * @param flagText 右上角提示文案。
 * @returns HTML 字符串。
 */
function renderRecordSummaryMarkup(
    title: string,
    subtitle: string,
    internalLabel: string,
    internalValue: string,
    flagText: string = '',
): string {
    const normalizedTitle = String(title ?? '').trim() || '未命名';
    const normalizedSubtitle = String(subtitle ?? '').trim() || '暂无补充说明';
    const normalizedInternalValue = String(internalValue ?? '').trim();
    return `
        <div class="stx-re-record-main">
            <div class="stx-re-record-title-row">
                <div class="stx-re-record-title">${escapeHtml(normalizedTitle)}</div>
                ${flagText ? `<span class="stx-re-record-flag">${escapeHtml(flagText)}</span>` : ''}
            </div>
            <div class="stx-re-record-sub">${escapeHtml(normalizedSubtitle)}</div>
            ${normalizedInternalValue ? `<div class="stx-re-record-code" title="${escapeHtml(normalizedInternalValue)}">${escapeHtml(internalLabel)}：${escapeHtml(compactInternalIdentifier(normalizedInternalValue))}</div>` : ''}
        </div>
    `.trim();
}

/**
 * 功能：渲染原始值的查看或编辑 HTML。
 * @param value 原始值
 * @param isEditing 是否处于编辑态
 * @returns HTML 字符串
 */
function renderRawValueHtml(value: unknown, isEditing: boolean): string {
    if (typeof value !== 'object' || value === null) {
        const text = escapeHtml(stringifyDisplayValue(value));
        if (isEditing) {
            return `<div contenteditable="true" class="stx-re-kv-input" data-key="__primitive__">${text}</div>`;
        }
        return `<div style="word-break: break-all;">${text}</div>`;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
        return isEditing
            ? '<div contenteditable="true" class="stx-re-kv-input" data-key="__primitive__">{}</div>'
            : '<div>{}</div>';
    }

    return `
        <div class="stx-re-kv">
            ${entries.map(([key, itemValue]: [string, unknown]): string => {
                const renderedValue = escapeHtml(stringifyDisplayValue(itemValue));
                const displayKey = formatRecordEditorKeyLabel(key);
                if (isEditing) {
                    return `<div class="stx-re-kv-row"><div class="stx-re-kv-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}:</div><div contenteditable="true" class="stx-re-kv-input" data-key="${escapeHtml(key)}">${renderedValue}</div></div>`;
                }
                return `<div class="stx-re-kv-row"><div class="stx-re-kv-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}:</div><div class="stx-re-kv-val">${renderedValue}</div></div>`;
            }).join('')}
        </div>
    `;
}

/**
 * 功能：从原始行编辑 DOM 中读取用户编辑后的值。
 * @param editableDiv 编辑容器
 * @param dataType 数据类型
 * @returns 解析后的值
 */
function readRawEditedValue(editableDiv: HTMLElement, dataType: string | null): unknown {
    if (dataType !== 'object') {
        const input = editableDiv.querySelector('.stx-re-kv-input') as HTMLElement | null;
        return parseLooseValue(input?.textContent ?? '');
    }

    const inputs = editableDiv.querySelectorAll('.stx-re-kv-input');
    if (inputs.length === 1 && inputs[0].getAttribute('data-key') === '__primitive__') {
        return parseLooseValue(inputs[0].textContent ?? '');
    }

    const result: Record<string, unknown> = {};
    inputs.forEach((item: Element): void => {
        const element = item as HTMLElement;
        const key = String(element.dataset.key ?? '').trim();
        if (!key || key === '__primitive__') {
            return;
        }
        result[key] = parseLooseValue(element.textContent ?? '');
    });
    return result;
}

/**
 * 功能：打开 MemoryOS 记录编辑器。
 * @returns 无返回值
 */
export async function openRecordEditor(): Promise<void> {
    initThemeKernel();

    const overlay = document.createElement('div');
    overlay.className = 'stx-record-editor-overlay ui-widget';
    mountThemeHost(overlay);

    const panel = document.createElement('div');
    panel.className = 'stx-record-editor';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease-in-out';
    setTimeout((): void => {
        overlay.style.opacity = '1';
    }, 10);

    panel.innerHTML = `
        <div class="stx-re-header">
            <div class="stx-re-title">
                <i class="fa-solid fa-database"></i>
                <span>MemoryOS 记录编辑器</span>
            </div>
            <div class="stx-re-header-actions">
                <button class="stx-re-btn danger" id="stx-re-btn-clear-db"><i class="fa-solid fa-radiation"></i> 一键清空数据库</button>
                <div class="stx-re-close" id="stx-re-close-btn" title="关闭 (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </div>
            </div>
        </div>
        <div class="stx-re-body">
            <div class="stx-re-sidebar">
                <div class="stx-re-sidebar-title"><i class="fa-regular fa-comments"></i> 会话列表</div>
                <div class="stx-re-sidebar-list" id="stx-re-chat-list"></div>
            </div>
            <div class="stx-re-main">
                <div class="stx-re-view-tabs" id="stx-re-view-tabs">
                    <div class="stx-re-tab is-active" data-view="raw">原始库表</div>
                    <div class="stx-re-tab" data-view="logic">逻辑表</div>
                </div>
                <div class="stx-re-tabs" id="stx-re-raw-tabs">
                    <div class="stx-re-tab is-active" data-table="events">事件流</div>
                    <div class="stx-re-tab" data-table="facts">事实表</div>
                    <div class="stx-re-tab" data-table="summaries">摘要集</div>
                    <div class="stx-re-tab" data-table="world_state">世界状态</div>
                    <div class="stx-re-tab" data-table="audit">审计日志</div>
                </div>
                <div class="stx-re-content" id="stx-re-content-area"><div class="stx-re-empty">正在加载数据...</div></div>
                <div class="stx-re-footer" id="stx-re-footer">
                    <div class="stx-re-footer-left">
                        <button class="stx-re-btn danger is-hidden" id="stx-re-btn-batch-del">批量删除选中</button>
                    </div>
                    <div class="stx-re-footer-right">
                        <div class="stx-re-pending-msg" id="stx-re-pending-msg"><i class="fa-solid fa-triangle-exclamation"></i> 有未保存的修改</div>
                        <button class="stx-re-btn save" id="stx-re-btn-save" disabled>保存修改</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const contentArea = panel.querySelector('#stx-re-content-area') as HTMLElement;
    const closeBtn = panel.querySelector('#stx-re-close-btn') as HTMLElement | null;
    const rawTabsContainer = panel.querySelector('#stx-re-raw-tabs') as HTMLElement;
    const viewTabsContainer = panel.querySelector('#stx-re-view-tabs') as HTMLElement;
    const chatListContainer = panel.querySelector('#stx-re-chat-list') as HTMLElement;
    const btnSave = panel.querySelector('#stx-re-btn-save') as HTMLButtonElement;
    const btnBatchDelete = panel.querySelector('#stx-re-btn-batch-del') as HTMLButtonElement;
    const pendingMsg = panel.querySelector('#stx-re-pending-msg') as HTMLElement;
    const btnClearDb = panel.querySelector('#stx-re-btn-clear-db') as HTMLButtonElement;
    const footer = panel.querySelector('#stx-re-footer') as HTMLElement;

    let currentViewMode: ViewMode = 'raw';
    let currentRawTable: RawTableName = 'events';
    let currentChatKey = '';
    let currentSort: CurrentSort = { col: '', asc: false };
    let currentLogicTableKey = '';
    let logicCreateExpanded = false;
    let recordMemory: MemorySDKImpl | null = null;
    let recordMemoryChatKey = '';
    const selectedLogicRowIds = new Set<string>();
    const pendingChanges = {
        deletes: new Set<string>(),
        updates: new Map<string, PendingRawUpdate>(),
    };

    /**
     * 功能：同步指定聊天的共享摘要。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    async function syncChatSignal(chatKey: string): Promise<void> {
        if (!chatKey) {
            return;
        }
        const [factCount, eventCount, activeTemplateId, latestSummary] = await Promise.all([
            db.facts.where('[chatKey+updatedAt]').between([chatKey, 0], [chatKey, Infinity]).count(),
            db.events.where('[chatKey+ts]').between([chatKey, 0], [chatKey, Infinity]).count(),
            db.meta.get(chatKey).then((meta: DBMeta | undefined): string | null => {
                return String(meta?.activeTemplateId ?? '').trim() || null;
            }),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([chatKey, '', 0], [chatKey, '\uffff', Infinity])
                .last(),
        ]);
        await patchSdkChatShared(chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: {
                    activeTemplate: activeTemplateId,
                    eventCount,
                    factCount,
                    lastSummaryAt: latestSummary?.createdAt ?? null,
                },
            },
        });
    }

    /**
     * 功能：释放当前记录编辑器持有的 MemorySDK 实例。
     * @returns 无返回值
     */
    async function disposeRecordMemory(): Promise<void> {
        if (!recordMemory) {
            return;
        }
        try {
            await recordMemory.chatState.destroy();
        } catch (error) {
            logger.warn('释放记录编辑器 chatState 失败', error);
        }
        try {
            recordMemory.template.destroy();
        } catch (error) {
            logger.warn('释放记录编辑器 template 失败', error);
        }
        recordMemory = null;
        recordMemoryChatKey = '';
    }

    /**
     * 功能：确保当前聊天存在临时 MemorySDK 实例。
     * @returns MemorySDK 实例；未选中聊天时返回 null
     */
    async function ensureRecordMemory(): Promise<MemorySDKImpl | null> {
        if (!currentChatKey) {
            await disposeRecordMemory();
            return null;
        }
        if (recordMemory && recordMemoryChatKey === currentChatKey) {
            return recordMemory;
        }
        await disposeRecordMemory();
        recordMemory = new MemorySDKImpl(currentChatKey);
        await recordMemory.init();
        recordMemoryChatKey = currentChatKey;
        return recordMemory;
    }

    /**
     * 功能：刷新底部保存区状态。
     * @returns 无返回值
     */
    function updateFooterState(): void {
        const hasChanges = pendingChanges.deletes.size > 0 || pendingChanges.updates.size > 0;
        btnSave.disabled = !hasChanges;
        pendingMsg.classList.toggle('visible', hasChanges);
    }

    /**
     * 功能：根据当前视图模式更新界面显隐。
     * @returns 无返回值
     */
    function updateChromeState(): void {
        rawTabsContainer.style.display = currentViewMode === 'raw' ? '' : 'none';
        footer.style.display = currentViewMode === 'raw' ? '' : 'none';
        viewTabsContainer.querySelectorAll('.stx-re-tab').forEach((tab: Element): void => {
            const element = tab as HTMLElement;
            element.classList.toggle('is-active', element.dataset.view === currentViewMode);
        });
        rawTabsContainer.querySelectorAll('.stx-re-tab').forEach((tab: Element): void => {
            const element = tab as HTMLElement;
            element.classList.toggle('is-active', element.dataset.table === currentRawTable);
        });
    }

    /**
     * 功能：激活指定聊天项。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    function activateChatItem(chatKey: string): void {
        const normalizedChatKey = String(chatKey ?? '').trim();
        const activeCanonicalKey = normalizedChatKey ? resolveChatItemCanonicalKey(normalizedChatKey) : '';
        chatListContainer.querySelectorAll('.stx-re-chat-item').forEach((item: Element): void => {
            const element = item as HTMLElement;
            const itemChatKey = String(element.dataset.chatKey ?? '').trim();
            const itemCanonicalKey = String(element.dataset.chatCanonicalKey ?? '').trim();
            const isActive = !normalizedChatKey
                ? itemChatKey === ''
                : itemChatKey === normalizedChatKey
                    || (activeCanonicalKey && itemCanonicalKey === activeCanonicalKey);
            element.classList.toggle('is-active', isActive);
        });
    }

    /**
     * 功能：移除当前打开的右键菜单。
     * @returns 无返回值
     */
    function removeContextMenus(): void {
        document.querySelectorAll('.stx-re-ctx-menu').forEach((menu: Element): void => menu.remove());
        document.querySelectorAll('.is-context-target').forEach((target: Element): void => {
            (target as HTMLElement).classList.remove('is-context-target');
        });
    }

    /**
     * 功能：加载聊天列表并附带 MemoryOS 摘要。
     * @returns 无返回值
     */
    async function loadChatKeys(): Promise<void> {
        try {
            const [metaKeys, eventKeys] = await Promise.all([
                db.meta.toCollection().primaryKeys(),
                db.events.orderBy('chatKey').uniqueKeys(),
            ]);
            const allKeys = Array.from(
                new Set(
                    [...metaKeys, ...eventKeys]
                        .map((item: unknown): string => String(item ?? '').trim())
                        .filter(Boolean),
                ),
            ) as string[];

            const items = await Promise.all(allKeys.map(async (chatKey: string): Promise<ChatItemMeta> => {
                const signal = await readPluginSignal(chatKey, MEMORY_OS_PLUGIN_ID);
                return buildChatItemMeta(chatKey, signal);
            }));
            const activeCanonicalKey = resolveChatItemCanonicalKey(currentChatKey);
            const dedupedItems = Array.from(items.reduce((map: Map<string, ChatItemMeta>, item: ChatItemMeta) => {
                const dedupeKey = item.canonicalKey || item.chatKey;
                const existing = map.get(dedupeKey);
                if (!existing) {
                    map.set(dedupeKey, item);
                    return map;
                }

                const existingIsActive = Boolean(activeCanonicalKey) && existing.canonicalKey === activeCanonicalKey;
                const nextIsActive = Boolean(activeCanonicalKey) && item.canonicalKey === activeCanonicalKey;
                if (nextIsActive && !existingIsActive) {
                    map.set(dedupeKey, item);
                    return map;
                }

                const nextCreatedAt = Number(item.createdAt ?? 0);
                const existingCreatedAt = Number(existing.createdAt ?? 0);
                if (nextCreatedAt > existingCreatedAt || (!existing.signal && item.signal)) {
                    map.set(dedupeKey, item);
                }
                return map;
            }, new Map<string, ChatItemMeta>()).values());

            const allItemHtml = `
                <div class="stx-re-chat-item${currentChatKey ? '' : ' is-active'}" data-chat-key="">
                    <div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-globe"></i></div>
                    <div class="stx-re-chat-info">
                        <div class="stx-re-chat-name">全局记录</div>
                        <div class="stx-re-chat-sys">Database Root</div>
                        <div class="stx-re-chat-sys">仅原始库表可查看</div>
                    </div>
                </div>
            `;

            const listHtml = dedupedItems
                .sort((left: ChatItemMeta, right: ChatItemMeta): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
                .map((item: ChatItemMeta): string => `
                    <div class="stx-re-chat-item${item.chatKey === currentChatKey || (activeCanonicalKey && item.canonicalKey === activeCanonicalKey) ? ' is-active' : ''}" data-chat-key="${escapeHtml(item.chatKey)}" data-chat-canonical-key="${escapeHtml(item.canonicalKey)}" title="${escapeHtml(item.systemName)}">
                        ${item.avatarHtml}
                        <div class="stx-re-chat-info">
                            <div class="stx-re-chat-name">${escapeHtml(item.displayName)}</div>
                            <div class="stx-re-chat-sys">${escapeHtml(item.systemName)}</div>
                            <div class="stx-re-chat-sys">${escapeHtml(buildChatSummaryLabel(item.signal))}</div>
                        </div>
                        ${item.createdAt ? `<div class="stx-re-chat-time">${escapeHtml(formatTimeLabel(item.createdAt))}</div>` : ''}
                    </div>
                `)
                .join('');

            chatListContainer.innerHTML = `${allItemHtml}${listHtml}`;
            activateChatItem(currentChatKey);
        } catch (error) {
            logger.error('加载聊天列表失败', error);
            chatListContainer.innerHTML = '<div class="stx-re-empty is-error">聊天列表加载失败</div>';
        }
    }

    /**
     * 功能：读取当前原始库表记录。
     * @param tableName 表名
     * @returns 记录数组
     */
    async function getRawRecords(tableName: RawTableName): Promise<RawRecord[]> {
        const queryTable = (db as unknown as Record<RawTableName, any>)[tableName];
        const baseQuery = currentChatKey ? queryTable.where('chatKey').equals(currentChatKey) : queryTable.toCollection();
        const needReverse = tableName === 'events' || tableName === 'audit';
        const directionalQuery = needReverse ? baseQuery.reverse() : baseQuery;
        const limitedQuery = (tableName === 'events' || tableName === 'audit')
            ? directionalQuery.limit(tableName === 'events' ? 1000 : 500)
            : directionalQuery;
        return limitedQuery.toArray() as Promise<RawRecord[]>;
    }

    /**
     * 功能：刷新原始库表批量选择状态。
     * @returns 无返回值
     */
    function updateRawSelectionState(): void {
        const rowCheckboxes = contentArea.querySelectorAll('.stx-re-select-row:not(:disabled)') as NodeListOf<HTMLInputElement>;
        const checkedCount = Array.from(rowCheckboxes).filter((checkbox: HTMLInputElement): boolean => checkbox.checked).length;
        const masterCheckbox = contentArea.querySelector('.stx-re-select-all') as HTMLInputElement | null;
        if (masterCheckbox) {
            masterCheckbox.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
        }
        btnBatchDelete.classList.toggle('is-hidden', checkedCount === 0);
        if (checkedCount > 0) {
            btnBatchDelete.textContent = `批量删除选中 (${checkedCount})`;
        }
    }

    /**
     * 功能：保存原始库表中的挂起修改。
     * @returns 无返回值
     */
    async function saveRawChanges(): Promise<void> {
        try {
            const deleteEntries = Array.from(pendingChanges.deletes);
            const updateEntries = Array.from(pendingChanges.updates.values());

            await db.transaction('rw', [db.events, db.facts, db.summaries, db.world_state, db.audit], async (): Promise<void> => {
                for (const pendingKey of deleteEntries) {
                    const parsedKey = parsePendingKey(pendingKey);
                    if (!parsedKey.tableName || !parsedKey.id) {
                        continue;
                    }
                    await (db as unknown as Record<RawTableName, any>)[parsedKey.tableName].delete(parsedKey.id);
                }

                for (const updateInfo of updateEntries) {
                    const table = (db as unknown as Record<RawTableName, any>)[updateInfo.tableName];
                    const item = await table.get(updateInfo.id);
                    if (!item) {
                        continue;
                    }
                    const payloadField = getRawPayloadFieldName(updateInfo.tableName);
                    const nextRecord = {
                        ...item,
                        [payloadField]: updateInfo.payload,
                    } as RawRecord;
                    if (updateInfo.tableName === 'facts' || updateInfo.tableName === 'world_state') {
                        nextRecord.updatedAt = Date.now();
                    }
                    await table.put(nextRecord);
                }
            });

            if (currentChatKey) {
                const auditManager = new AuditManager(currentChatKey);
                if (deleteEntries.length > 0) {
                    await auditManager.log({
                        action: 'manual.delete',
                        actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                        before: { keys: deleteEntries },
                        after: {},
                    });
                }
                if (updateEntries.length > 0) {
                    await auditManager.log({
                        action: 'manual.edit',
                        actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                        before: {},
                        after: {
                            updates: updateEntries.map((item: PendingRawUpdate): Record<string, string> => ({
                                id: item.id,
                                tableName: item.tableName,
                            })),
                        },
                    });
                }
                await syncChatSignal(currentChatKey);
                await loadChatKeys();
            }

            pendingChanges.deletes.clear();
            pendingChanges.updates.clear();
            updateFooterState();
            toast.success('原始库表修改已保存');
            await renderActiveView();
        } catch (error) {
            logger.error('保存原始库表修改失败', error);
            toast.error(`保存失败: ${String(error)}`);
        }
    }

    /**
     * 功能：渲染原始库表视图。
     * @param tableName 表名
     * @returns 无返回值
     */
    async function renderRawTable(tableName: RawTableName): Promise<void> {
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载数据...</div>';

        try {
            const data = await getRawRecords(tableName);
            if (data.length === 0) {
                contentArea.innerHTML = '<div class="stx-re-empty">暂无数据记录。</div>';
                updateRawSelectionState();
                return;
            }
            const displayData = tableName === 'events' ? dedupeDisplayEvents(data) : [...data];
            if (displayData.length === 0) {
                contentArea.innerHTML = '<div class="stx-re-empty">暂无数据记录。</div>';
                updateRawSelectionState();
                return;
            }

            const defaultSortCol = tableName === 'events' || tableName === 'audit'
                ? 'ts'
                : tableName === 'world_state'
                    ? 'updatedAt'
                    : tableName === 'summaries'
                        ? 'level'
                        : 'factKey';
            const sortCol = currentSort.col || defaultSortCol;
            displayData.sort((left: RawRecord, right: RawRecord): number => {
                const leftValue = left[sortCol];
                const rightValue = right[sortCol];
                if (leftValue === rightValue) {
                    return 0;
                }
                if (leftValue == null) {
                    return 1;
                }
                if (rightValue == null) {
                    return -1;
                }
                const normalizedLeftValue = typeof leftValue === 'number' ? leftValue : String(leftValue);
                const normalizedRightValue = typeof rightValue === 'number' ? rightValue : String(rightValue);
                if (normalizedLeftValue < normalizedRightValue) {
                    return currentSort.asc ? -1 : 1;
                }
                if (normalizedLeftValue > normalizedRightValue) {
                    return currentSort.asc ? 1 : -1;
                }
                return 0;
            });
            const headerCell = (label: string, column: string): string => {
                const isActive = sortCol === column;
                const icon = isActive
                    ? (currentSort.asc ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>')
                    : '<i class="fa-solid fa-sort"></i>';
                return `<th class="stx-re-th-sortable ${isActive ? 'active' : ''}" data-col="${column}">${label} ${icon}</th>`;
            };

            let theadHtml = '';
            let rowsHtml = '';

            displayData.forEach((record: RawRecord): void => {
                const recordId = getRawRecordId(tableName, record);
                const pendingKey = makePendingKey(tableName, recordId);
                const isPendingDelete = pendingChanges.deletes.has(pendingKey);
                const pendingUpdate = pendingChanges.updates.get(pendingKey);
                const rowClass = isPendingDelete
                    ? 'stx-re-row pending-delete'
                    : pendingUpdate
                        ? 'stx-re-row pending-update'
                        : 'stx-re-row';
                const checkboxDisabled = isPendingDelete ? 'disabled' : '';
                const payloadField = getRawPayloadFieldName(tableName);
                const payloadValue = pendingUpdate?.payload ?? record[payloadField];

                if (tableName === 'events') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('事件概览', 'type')}${headerCell('发生时间', 'ts')}${headerCell('内容', 'payload')}<th>操作</th></tr>`;
                    }
                    const payloadRecord = payloadValue as Record<string, unknown> | null;
                    const senderName = String(payloadRecord?.name ?? '未知').trim() || '未知';
                    const isUser = Boolean(payloadRecord?.isUser) || payloadRecord?.name === 'You' || payloadRecord?.name === 'User';
                    const isSystem = payloadRecord?.role === 'system' || payloadRecord?.name === 'System' || payloadRecord?.name === '系统';
                    const senderType = isSystem ? '系统' : isUser || record.type === 'chat.message.sent' ? '用户' : 'AI';
                    const eventTypeLabel = formatEventTypeLabel(String(record.type ?? ''));
                    const eventSummary = joinReadableMeta([
                        `来源：${normalizeSenderLabel(senderType)}`,
                        senderName && senderName !== normalizeSenderLabel(senderType) ? senderName : '',
                    ]);
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(eventTypeLabel, eventSummary, '事件编号', recordId)}</td>
                            <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'facts') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('记忆主题', 'factKey')}${headerCell('关联对象', 'entity')}${headerCell('主题位置', 'path')}${headerCell('内容', 'value')}<th>操作</th></tr>`;
                    }
                    const entity = record.entity as Record<string, unknown> | undefined;
                    const pathValue = String(record.path ?? '').trim();
                    const entityLabel = formatEntityDisplayLabel(entity);
                    const rawEntityLabel = formatEntityRawHint(entity);
                    const pathLabel = pathValue ? formatHumanReadableTopic(pathValue, '未填写路径') : '未填写路径';
                    const pathSummary = pathValue ? '这条记录会归入当前主题下' : '这条记录还没有填写路径';
                    const factTitle = buildFactHeadline(record);
                    const factSubtitle = joinReadableMeta([entityLabel, buildFactSummaryLabel(record)]);
                    const entitySummary = entity ? '这条记录已经绑定到具体对象' : '这条记录还没有绑定对象';
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(factTitle, factSubtitle, '内部键', recordId, isFactStructurallyIncomplete(record) ? '结构待整理' : '')}</td>
                            <td>${renderRecordSummaryMarkup(entityLabel, entitySummary, '原始引用', rawEntityLabel === '未填写实体引用' ? '' : rawEntityLabel)}</td>
                            <td>${renderRecordSummaryMarkup(pathLabel, pathSummary, '原始路径', pathValue)}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'summaries') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('层级 / 标题', 'level')}${headerCell('关键词', 'keywords')}${headerCell('摘要内容', 'content')}<th>操作</th></tr>`;
                    }
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td><div class="stx-re-event-type">${escapeHtml(String(record.level ?? ''))}</div><div>${escapeHtml(String(record.title ?? ''))}</div></td>
                            <td>${escapeHtml(((record.keywords as string[]) ?? []).join(', '))}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="string">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'world_state') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('状态主题', 'path')}${headerCell('当前状态', 'value')}${headerCell('最近更新时间', 'updatedAt')}<th>操作</th></tr>`;
                    }
                    const worldPath = String(record.path ?? '').trim();
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(buildWorldStateHeadline(worldPath), worldPath ? `归类到：${formatHumanReadableTopic(worldPath, '未填写路径')}` : '这条世界状态还没有填写路径', '状态编号', recordId)}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td>${escapeHtml(formatTimeLabel(record.updatedAt))}</td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('变更动作', 'action')}${headerCell('执行来源', 'actor')}${headerCell('变更内容', 'after')}${headerCell('发生时间', 'ts')}<th>操作</th></tr>`;
                    }
                    const actor = record.actor as Record<string, unknown> | undefined;
                    const actorPluginId = String(actor?.pluginId ?? 'system').trim() || 'system';
                    const actorMode = String(actor?.mode ?? '').trim();
                    const actorTitle = actorPluginId === 'system' ? '系统维护' : actorPluginId === MEMORY_OS_PLUGIN_ID ? 'MemoryOS' : actorPluginId;
                    const actorSubtitle = joinReadableMeta([
                        actorMode ? `方式：${formatOperationModeLabel(actorMode)}` : '',
                        actorPluginId === 'system' ? '来源：系统内核' : '',
                    ]);
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(formatAuditActionLabel(String(record.action ?? '')), String(record.reason ?? '记录发生了结构变更').trim() || '记录发生了结构变更', '审计编号', recordId)}</td>
                            <td>${renderRecordSummaryMarkup(actorTitle, actorSubtitle || '未记录额外来源信息', '内部来源', actorPluginId)}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                }
            });

            const tableEl = document.createElement('table');
            tableEl.className = 'stx-re-table';
            tableEl.innerHTML = `<thead>${theadHtml}</thead><tbody>${rowsHtml}</tbody>`;
            contentArea.innerHTML = '';
            contentArea.appendChild(tableEl);

            tableEl.querySelectorAll('.stx-re-th-sortable').forEach((header: Element): void => {
                header.addEventListener('click', (): void => {
                    const column = String((header as HTMLElement).dataset.col ?? '');
                    if (!column) {
                        return;
                    }
                    if (currentSort.col === column) {
                        currentSort.asc = !currentSort.asc;
                    } else {
                        currentSort.col = column;
                        currentSort.asc = false;
                    }
                    void renderRawTable(tableName);
                });
            });

            const masterCheckbox = tableEl.querySelector('.stx-re-select-all') as HTMLInputElement | null;
            masterCheckbox?.addEventListener('change', (): void => {
                tableEl.querySelectorAll('.stx-re-select-row:not(:disabled)').forEach((checkbox: Element): void => {
                    (checkbox as HTMLInputElement).checked = Boolean(masterCheckbox.checked);
                });
                updateRawSelectionState();
            });

            tableEl.querySelectorAll('.stx-re-select-row').forEach((checkbox: Element): void => {
                checkbox.addEventListener('change', (): void => updateRawSelectionState());
            });

            tableEl.querySelectorAll('.stx-re-btn.delete').forEach((button: Element): void => {
                button.addEventListener('click', (): void => {
                    const id = String((button as HTMLElement).dataset.id ?? '');
                    if (!id) {
                        return;
                    }
                    pendingChanges.deletes.add(makePendingKey(tableName, id));
                    pendingChanges.updates.delete(makePendingKey(tableName, id));
                    updateFooterState();
                    void renderRawTable(tableName);
                });
            });

            tableEl.querySelectorAll('.stx-re-btn.edit').forEach((button: Element): void => {
                button.addEventListener('click', (): void => {
                    const buttonElement = button as HTMLButtonElement;
                    const id = String(buttonElement.dataset.id ?? '');
                    if (!id) {
                        return;
                    }
                    const editableDiv = buttonElement.closest('tr')?.querySelector('.editable') as HTMLElement | null;
                    if (!editableDiv) {
                        return;
                    }

                    if (editableDiv.classList.contains('is-editing')) {
                        const nextValue = readRawEditedValue(editableDiv, editableDiv.getAttribute('data-type'));
                        pendingChanges.updates.set(makePendingKey(tableName, id), { id, tableName, payload: nextValue });
                        editableDiv.classList.remove('is-editing');
                        editableDiv.innerHTML = renderRawValueHtml(nextValue, false);
                        buttonElement.textContent = '编辑';
                        buttonElement.classList.remove('is-editing');
                        updateFooterState();
                        return;
                    }

                    const record = data.find((item: RawRecord): boolean => getRawRecordId(tableName, item) === id);
                    const currentValue = pendingChanges.updates.get(makePendingKey(tableName, id))?.payload ?? record?.[getRawPayloadFieldName(tableName)];
                    editableDiv.classList.add('is-editing');
                    editableDiv.innerHTML = renderRawValueHtml(currentValue, true);
                    buttonElement.textContent = '保存';
                    buttonElement.classList.add('is-editing');
                });
            });

            tableEl.querySelectorAll('.editable').forEach((cell: Element): void => {
                cell.addEventListener('dblclick', (): void => {
                    const editButton = cell.closest('tr')?.querySelector('.stx-re-btn.edit') as HTMLButtonElement | null;
                    if (editButton && !(cell as HTMLElement).classList.contains('is-editing')) {
                        editButton.click();
                    }
                });
            });

            updateRawSelectionState();
        } catch (error) {
            logger.error('渲染原始库表失败', error);
            contentArea.innerHTML = `<div class="stx-re-empty is-error">加载失败: ${escapeHtml(String(error))}</div>`;
        }
    }

    /**
     * 功能：把逻辑表值转换为单元格文本。
     * @param value 原始值
     * @returns 展示文本
     */
    function renderLogicCellText(value: unknown): string {
        const text = stringifyDisplayValue(value);
        return text || '—';
    }

    /**
     * 功能：开始编辑逻辑表单元格。
     * @param cell 单元格元素
     * @returns 无返回值
     */
    function startLogicCellEditing(cell: HTMLElement): void {
        if (cell.dataset.readonly === 'true' || cell.dataset.editing === 'true') {
            return;
        }
        cell.dataset.editing = 'true';
        cell.contentEditable = 'true';
        cell.classList.add('is-editing');
        cell.focus();
    }

    /**
     * 功能：结束逻辑表单元格编辑并立即保存。
     * @param cell 单元格元素
     * @returns 无返回值
     */
    async function finishLogicCellEditing(cell: HTMLElement): Promise<void> {
        if (cell.dataset.editing !== 'true') {
            return;
        }
        cell.dataset.editing = 'false';
        cell.contentEditable = 'false';
        cell.classList.remove('is-editing');

        const memory = await ensureRecordMemory();
        const tableKey = String(cell.dataset.tableKey ?? '').trim();
        const rowId = String(cell.dataset.rowId ?? '').trim();
        const fieldKey = String(cell.dataset.fieldKey ?? '').trim();
        if (!memory || !tableKey || !rowId || !fieldKey) {
            return;
        }

        try {
            await memory.rows.updateCell(tableKey, rowId, fieldKey, parseLooseValue(cell.textContent ?? ''));
            cell.classList.add('is-saved');
            setTimeout((): void => cell.classList.remove('is-saved'), 800);
            await loadChatKeys();
            await renderLogicView();
        } catch (error) {
            cell.classList.add('is-error');
            toast.error(`保存单元格失败: ${String(error)}`);
            await renderLogicView();
        }
    }

    /**
     * 功能：渲染逻辑表视图。
     * @returns 无返回值
     */
    async function renderLogicView(): Promise<void> {
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载逻辑表...</div>';
        if (!currentChatKey) {
            contentArea.innerHTML = '<div class="stx-re-empty">逻辑表视图需要先选择一个具体聊天。</div>';
            return;
        }

        const memory = await ensureRecordMemory();
        if (!memory) {
            contentArea.innerHTML = '<div class="stx-re-empty">无法为当前聊天建立 MemorySDK。</div>';
            return;
        }

        const [template, binding, tables] = await Promise.all([
            memory.template.getEffective(),
            memory.template.getBinding(),
            memory.template.listTables(),
        ]);
        if (!template || tables.length === 0) {
            contentArea.innerHTML = '<div class="stx-re-empty">当前聊天还没有可展示的逻辑表。</div>';
            return;
        }

        if (!currentLogicTableKey || !tables.some((table: TemplateTableDef): boolean => table.key === currentLogicTableKey)) {
            currentLogicTableKey = tables[0].key;
        }

        const selectedTable = tables.find((table: TemplateTableDef): boolean => table.key === currentLogicTableKey) || tables[0];
        const rows = await memory.rows.listTableRows(selectedTable.key, { includeTombstones: true, limit: 500 });
        const visibleRowIds = new Set<string>(rows.map((row: LogicTableRow): string => row.rowId));
        Array.from(selectedLogicRowIds).forEach((rowId: string): void => {
            if (!visibleRowIds.has(rowId)) {
                selectedLogicRowIds.delete(rowId);
            }
        });

        const tableOptionsHtml = tables.map((table: TemplateTableDef): string => {
            return `<option value="${escapeHtml(table.key)}" ${table.key === selectedTable.key ? 'selected' : ''}>${escapeHtml(table.label)}${table.source === 'derived' ? '（派生）' : ''}</option>`;
        }).join('');
        const createFieldsHtml = selectedTable.fields
            .filter((field): boolean => !field.isPrimaryKey)
            .map((field): string => `<label style="display:flex; flex-direction:column; gap:4px; min-width:180px;"><span>${escapeHtml(field.label)}</span><input class="text_pole" data-create-field="${escapeHtml(field.key)}" placeholder="可输入文本或 JSON"></label>`)
            .join('');
        const headerHtml = selectedTable.fields.map((field): string => `<th>${escapeHtml(field.label)}</th>`).join('');
        const rowsHtml = rows.length === 0
            ? `<tr><td colspan="${selectedTable.fields.length + 2}"><div class="stx-re-empty">当前表暂无行数据。你可以先新建一行。</div></td></tr>`
            : rows.map((row: LogicTableRow): string => {
                const statusParts: string[] = [];
                if (row.tombstoned) {
                    statusParts.push('已软删除');
                }
                if (row.redirectedTo) {
                    statusParts.push(`重定向到 ${row.redirectedTo}`);
                }
                if (row.aliases.length > 0) {
                    statusParts.push(`别名 ${row.aliases.join(', ')}`);
                }
                const cellsHtml = selectedTable.fields.map((field): string => {
                    const cellValue = row.values[field.key] ?? (field.isPrimaryKey ? row.rowId : '');
                    return `<td><div class="stx-re-value stx-re-logic-cell ${field.isPrimaryKey ? 'is-readonly' : ''}" data-table-key="${escapeHtml(selectedTable.key)}" data-row-id="${escapeHtml(row.rowId)}" data-field-key="${escapeHtml(field.key)}" data-readonly="${field.isPrimaryKey ? 'true' : 'false'}" title="${escapeHtml(stringifyDisplayValue(cellValue))}">${escapeHtml(renderLogicCellText(cellValue))}</div></td>`;
                }).join('');
                return `<tr class="${row.tombstoned ? 'stx-re-row pending-delete' : 'stx-re-row'}"><td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-logic-row-check" data-row-id="${escapeHtml(row.rowId)}" ${selectedLogicRowIds.has(row.rowId) ? 'checked' : ''}></td><td><div class="stx-re-event-type">${escapeHtml(row.rowId)}</div><div class="stx-re-json compact">${escapeHtml(statusParts.join(' · ') || `更新于 ${formatTimeLabel(row.updatedAt)}`)}</div></td>${cellsHtml}</tr>`;
            }).join('');

        contentArea.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
                    <div class="stx-re-json">当前聊天：${escapeHtml(currentChatKey)}</div>
                    <div class="stx-re-json">模板：${escapeHtml(template.name)} (${escapeHtml(template.templateId)})</div>
                    <div class="stx-re-json">表来源：${selectedTable.source === 'derived' ? '旧模板派生' : '持久化模板'}</div>
                    <div class="stx-re-json">绑定状态：${binding?.isLocked ? '已锁定' : '自动同步'}</div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    <select class="text_pole" data-logic-table-select>${tableOptionsHtml}</select>
                    <button class="stx-re-btn" data-logic-refresh>刷新</button>
                    <button class="stx-re-btn" data-logic-create-toggle>${logicCreateExpanded ? '取消新建' : '新建行'}</button>
                    <button class="stx-re-btn" data-logic-merge>合并选中</button>
                    <button class="stx-re-btn danger" data-logic-delete>删除选中</button>
                    <button class="stx-re-btn" data-logic-restore>恢复选中</button>
                </div>
                ${logicCreateExpanded ? `<div style="display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--SmartThemeBorderColor); border-radius:10px;"><div class="stx-re-accent-text">新建 ${escapeHtml(selectedTable.label)} 行</div><label style="display:flex; flex-direction:column; gap:4px; min-width:220px;"><span>${escapeHtml(selectedTable.primaryKeyField)}（主键）</span><input class="text_pole" data-create-row-id placeholder="请输入新的行 ID"></label><div style="display:flex; flex-wrap:wrap; gap:10px;">${createFieldsHtml || '<span class="stx-re-json">当前表暂无额外字段，可先创建空行后再编辑。</span>'}</div><div style="display:flex; gap:8px;"><button class="stx-re-btn save" data-logic-create-submit>立即创建</button><button class="stx-re-btn" data-logic-create-cancel>取消</button></div></div>` : ''}
                <table class="stx-re-table"><thead><tr><th style="width:30px; text-align:center;"><input type="checkbox" class="stx-re-checkbox" data-logic-check-all></th><th>行 ID / 状态</th>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
            </div>
        `;

        const tableSelect = contentArea.querySelector('[data-logic-table-select]') as HTMLSelectElement | null;
        tableSelect?.addEventListener('change', (): void => {
            currentLogicTableKey = tableSelect.value;
            selectedLogicRowIds.clear();
            logicCreateExpanded = false;
            void renderLogicView();
        });

        contentArea.querySelector('[data-logic-refresh]')?.addEventListener('click', (): void => {
            void loadChatKeys().then((): Promise<void> => renderLogicView());
        });

        contentArea.querySelector('[data-logic-create-toggle]')?.addEventListener('click', (): void => {
            logicCreateExpanded = !logicCreateExpanded;
            void renderLogicView();
        });

        contentArea.querySelector('[data-logic-create-cancel]')?.addEventListener('click', (): void => {
            logicCreateExpanded = false;
            void renderLogicView();
        });

        contentArea.querySelector('[data-logic-create-submit]')?.addEventListener('click', (): void => {
            const rowIdInput = contentArea.querySelector('[data-create-row-id]') as HTMLInputElement | null;
            const rowId = String(rowIdInput?.value ?? '').trim();
            if (!rowId) {
                alert('请先填写行 ID。');
                return;
            }
            const seed: Record<string, unknown> = { [selectedTable.primaryKeyField]: rowId };
            contentArea.querySelectorAll('[data-create-field]').forEach((input: Element): void => {
                const element = input as HTMLInputElement;
                const fieldKey = String(element.dataset.createField ?? '').trim();
                const rawValue = String(element.value ?? '').trim();
                if (!fieldKey || !rawValue) {
                    return;
                }
                seed[fieldKey] = parseLooseValue(rawValue);
            });
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.rows.create(selectedTable.key, rowId, seed);
                logicCreateExpanded = false;
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已创建 ${selectedTable.key}/${rowId}`);
            }).catch((error: unknown): void => {
                toast.error(`创建行失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-delete]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length === 0) {
                alert('请先选择要删除的行。');
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                for (const rowId of rowIds) {
                    await memoryInstance.rows.delete(selectedTable.key, rowId);
                }
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已删除 ${rowIds.length} 行`);
            }).catch((error: unknown): void => {
                toast.error(`删除失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-restore]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length === 0) {
                alert('请先选择要恢复的行。');
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                for (const rowId of rowIds) {
                    await memoryInstance.rows.restore(selectedTable.key, rowId);
                }
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已恢复 ${rowIds.length} 行`);
            }).catch((error: unknown): void => {
                toast.error(`恢复失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-merge]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length !== 2) {
                alert('合并前请恰好选中 2 行。');
                return;
            }
            const targetRowId = prompt(`请输入保留的行 ID：\n${rowIds.join('\n')}`, rowIds[0] || '');
            if (!targetRowId) {
                return;
            }
            const normalizedTargetRowId = targetRowId.trim();
            if (!rowIds.includes(normalizedTargetRowId)) {
                alert('保留行 ID 必须来自当前选中的两行。');
                return;
            }
            const sourceRowId = rowIds.find((rowId: string): boolean => rowId !== normalizedTargetRowId);
            if (!sourceRowId) {
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                const result = await memoryInstance.rows.merge(selectedTable.key, sourceRowId, normalizedTargetRowId);
                if (!result.success) {
                    throw new Error(result.error || '合并失败');
                }
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已合并 ${sourceRowId} -> ${normalizedTargetRowId}`);
            }).catch((error: unknown): void => {
                toast.error(`合并失败: ${String(error)}`);
            });
        });

        const checkAll = contentArea.querySelector('[data-logic-check-all]') as HTMLInputElement | null;
        checkAll?.addEventListener('change', (): void => {
            const rowChecks = contentArea.querySelectorAll('.stx-re-logic-row-check') as NodeListOf<HTMLInputElement>;
            rowChecks.forEach((checkbox: HTMLInputElement): void => {
                checkbox.checked = Boolean(checkAll.checked);
                const rowId = String(checkbox.dataset.rowId ?? '');
                if (!rowId) {
                    return;
                }
                if (checkbox.checked) {
                    selectedLogicRowIds.add(rowId);
                } else {
                    selectedLogicRowIds.delete(rowId);
                }
            });
        });

        contentArea.querySelectorAll('.stx-re-logic-row-check').forEach((checkbox: Element): void => {
            checkbox.addEventListener('change', (): void => {
                const element = checkbox as HTMLInputElement;
                const rowId = String(element.dataset.rowId ?? '');
                if (!rowId) {
                    return;
                }
                if (element.checked) {
                    selectedLogicRowIds.add(rowId);
                } else {
                    selectedLogicRowIds.delete(rowId);
                }
            });
        });

        contentArea.querySelectorAll('.stx-re-logic-cell').forEach((cell: Element): void => {
            const element = cell as HTMLElement;
            if (element.dataset.readonly === 'true') {
                return;
            }
            element.addEventListener('dblclick', (): void => startLogicCellEditing(element));
            element.addEventListener('keydown', (event: Event): void => {
                const keyboardEvent = event as KeyboardEvent;
                if (keyboardEvent.key === 'Enter') {
                    keyboardEvent.preventDefault();
                    void finishLogicCellEditing(element);
                } else if (keyboardEvent.key === 'Escape') {
                    keyboardEvent.preventDefault();
                    void renderLogicView();
                }
            });
            element.addEventListener('blur', (): void => {
                void finishLogicCellEditing(element);
            });
        });
    }

    /**
     * 功能：根据当前视图重新渲染主区域。
     * @returns 无返回值
     */
    async function renderActiveView(): Promise<void> {
        updateChromeState();
        if (currentViewMode === 'raw') {
            await renderRawTable(currentRawTable);
            return;
        }
        await renderLogicView();
    }

    /**
     * 功能：切换聊天并刷新当前视图。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    async function switchChat(chatKey: string): Promise<void> {
        currentChatKey = chatKey;
        currentLogicTableKey = '';
        logicCreateExpanded = false;
        selectedLogicRowIds.clear();
        activateChatItem(chatKey);
        if (currentViewMode === 'logic') {
            await ensureRecordMemory();
        } else if (recordMemoryChatKey && recordMemoryChatKey !== chatKey) {
            await disposeRecordMemory();
        }
        await renderActiveView();
    }

    /**
     * 功能：关闭记录编辑器。
     * @returns 无返回值
     */
    async function close(): Promise<void> {
        if (currentViewMode === 'raw' && !btnSave.disabled) {
            const shouldClose = confirm('当前仍有未保存的原始库表修改，关闭后将丢失。确定继续吗？');
            if (!shouldClose) {
                return;
            }
        }
        overlay.style.opacity = '0';
        await disposeRecordMemory();
        setTimeout((): void => {
            overlay.remove();
            document.removeEventListener('keydown', onEsc);
        }, 200);
    }

    /**
     * 功能：处理 Esc 关闭快捷键。
     * @param event 键盘事件
     * @returns 无返回值
     */
    function onEsc(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            void close();
        }
    }

    btnClearDb.addEventListener('click', (): void => {
        const confirmed = confirm('警告：此操作将清空所有 MemoryOS 数据，且不可恢复。确定继续吗？');
        if (!confirmed) {
            return;
        }
        void clearAllMemoryData().then(async (): Promise<void> => {
            pendingChanges.deletes.clear();
            pendingChanges.updates.clear();
            currentChatKey = '';
            selectedLogicRowIds.clear();
            await disposeRecordMemory();
            await loadChatKeys();
            updateFooterState();
            toast.success('数据库已清空');
            await renderActiveView();
        }).catch((error: unknown): void => {
            logger.error('清空数据库失败', error);
            toast.error(`清空失败: ${String(error)}`);
        });
    });

    btnSave.addEventListener('click', (): void => {
        void saveRawChanges();
    });

    btnBatchDelete.addEventListener('click', (): void => {
        const checkboxes = contentArea.querySelectorAll('.stx-re-select-row:checked') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach((checkbox: HTMLInputElement): void => {
            const id = String(checkbox.dataset.id ?? '');
            if (!id) {
                return;
            }
            pendingChanges.deletes.add(makePendingKey(currentRawTable, id));
            pendingChanges.updates.delete(makePendingKey(currentRawTable, id));
        });
        updateFooterState();
        void renderRawTable(currentRawTable);
    });

    closeBtn?.addEventListener('click', (event: Event): void => {
        event.stopPropagation();
        void close();
    });

    panel.addEventListener('click', (event: Event): void => event.stopPropagation());
    overlay.addEventListener('click', (event: Event): void => {
        if (event.target === overlay) {
            event.stopPropagation();
            void close();
        }
    });
    document.addEventListener('keydown', onEsc);

    viewTabsContainer.addEventListener('click', (event: Event): void => {
        const target = (event.target as HTMLElement).closest('.stx-re-tab') as HTMLElement | null;
        const nextView = target?.dataset.view as ViewMode | undefined;
        if (!nextView || nextView === currentViewMode) {
            return;
        }
        currentViewMode = nextView;
        selectedLogicRowIds.clear();
        logicCreateExpanded = false;
        void renderActiveView();
    });

    rawTabsContainer.addEventListener('click', (event: Event): void => {
        const target = (event.target as HTMLElement).closest('.stx-re-tab') as HTMLElement | null;
        const nextTable = target?.dataset.table as RawTableName | undefined;
        if (!nextTable || nextTable === currentRawTable) {
            return;
        }
        currentRawTable = nextTable;
        currentSort = { col: '', asc: false };
        btnBatchDelete.classList.add('is-hidden');
        void renderActiveView();
    });

    chatListContainer.addEventListener('click', (event: Event): void => {
        const item = (event.target as HTMLElement).closest('.stx-re-chat-item') as HTMLElement | null;
        if (!item) {
            return;
        }
        void switchChat(String(item.dataset.chatKey ?? ''));
    });

    chatListContainer.addEventListener('contextmenu', (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        const item = (event.target as HTMLElement).closest('.stx-re-chat-item') as HTMLElement | null;
        if (!item) {
            return;
        }
        const chatKey = String(item.dataset.chatKey ?? '');
        if (!chatKey) {
            return;
        }
        mouseEvent.preventDefault();
        removeContextMenus();
        item.classList.add('is-context-target');

        const menu = document.createElement('div');
        menu.className = 'stx-re-ctx-menu';
        menu.style.left = `${mouseEvent.clientX}px`;
        menu.style.top = `${mouseEvent.clientY}px`;
        menu.innerHTML = `<div class="stx-re-ctx-menu-item"><i class="fa-solid fa-trash-can"></i> 删除该会话全部记忆</div>`;
        menu.addEventListener('click', (): void => {
            menu.remove();
            item.classList.remove('is-context-target');
            const confirmed = confirm('此操作会清空该聊天下的事件、事实、摘要、模板和状态，且不可恢复。确定继续吗？');
            if (!confirmed) {
                return;
            }
            void clearMemoryChatData(chatKey).then(async (): Promise<void> => {
                if (currentChatKey === chatKey) {
                    currentChatKey = '';
                    currentLogicTableKey = '';
                    selectedLogicRowIds.clear();
                    await disposeRecordMemory();
                }
                await loadChatKeys();
                updateFooterState();
                toast.success('已清空该会话的 MemoryOS 数据');
                await renderActiveView();
            }).catch((error: unknown): void => {
                logger.error('清空会话记忆失败', error);
                toast.error(`清空失败: ${String(error)}`);
            });
        });
        document.body.appendChild(menu);

        const dismiss = (dismissEvent: Event): void => {
            if (!menu.contains(dismissEvent.target as Node)) {
                menu.remove();
                item.classList.remove('is-context-target');
                document.removeEventListener('pointerdown', dismiss, { capture: true });
                document.removeEventListener('contextmenu', dismiss, { capture: true });
            }
        };
        setTimeout((): void => {
            document.addEventListener('pointerdown', dismiss, { capture: true });
            document.addEventListener('contextmenu', dismiss, { capture: true });
        }, 0);
    });

    await loadChatKeys();
    updateFooterState();
    updateChromeState();
    await renderActiveView();
}
