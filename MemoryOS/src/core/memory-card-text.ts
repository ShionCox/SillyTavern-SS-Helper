import type { DBFact, DBSummary } from '../db/db';

const FACT_TYPE_LABEL_MAP: Record<string, string> = {
    'semantic.identity': '身份设定',
    'semantic.style': '风格设定',
    'semantic.relationship': '关系设定',
    'semantic.world_state': '世界状态',
    'world_state': '世界状态',
    'scene_state': '场景状态',
    'state': '状态',
    'event': '事件',
    'profile': '人物设定',
};

const FACT_FIELD_LABEL_MAP: Record<string, string> = {
    displayName: '名称',
    name: '姓名',
    alias: '别名',
    aliases: '别名',
    title: '称号',
    role: '身份',
    roleSummary: '角色概述',
    identity: '身份',
    summary: '概述',
    description: '描述',
    desc: '描述',
    content: '内容',
    traits: '特征',
    appearance: '外貌',
    personality: '性格',
    emotion: '情绪',
    emotionTag: '情绪',
    mood: '心情',
    preference: '偏好',
    preferences: '偏好',
    likes: '偏好',
    dislikes: '厌恶',
    goals: '目标',
    goal: '目标',
    promise: '承诺',
    secret: '秘密',
    secrets: '秘密',
    catchphrases: '口头禅',
    relationshipAnchors: '关系锚点',
    relationship: '关系',
    relationships: '关系',
    currentState: '当前状态',
    state: '状态',
    status: '状态',
    location: '地点',
    place: '地点',
    scene: '场景',
    setting: '设定',
    rule: '规则',
    rules: '规则',
    note: '备注',
    notes: '备注',
    tags: '标签',
    tag: '标签',
    age: '年龄',
    gender: '性别',
    occupation: '职业',
    affiliation: '阵营',
    group: '群组',
    faction: '势力',
    world: '世界观',
    history: '历史',
    behavior: '行为',
    habits: '习惯',
    ability: '能力',
    abilities: '能力',
};

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function containsCjk(value: string): boolean {
    return /[\u4e00-\u9fff]/.test(value);
}

function formatFactTypeLabel(type: unknown): string {
    const normalized = normalizeText(type);
    if (!normalized) {
        return '事实';
    }
    return FACT_TYPE_LABEL_MAP[normalized] ?? FACT_TYPE_LABEL_MAP[normalized.toLowerCase()] ?? (containsCjk(normalized) ? normalized : '事实');
}

function formatEntityLabel(entity: {
    kind?: string;
    id?: string;
} | undefined): string {
    if (!entity) {
        return '';
    }
    const kind = normalizeText(entity.kind);
    const id = normalizeText(entity.id);
    const parts: string[] = [];
    if (kind) {
        parts.push(containsCjk(kind) ? kind : (kind === 'character' ? '角色' : kind === 'group' ? '群组' : kind === 'world' ? '世界' : kind === 'location' ? '地点' : '对象'));
    }
    if (id) {
        parts.push(id);
    }
    return parts.join(' · ');
}

function formatReadablePath(path: unknown): string {
    const normalized = normalizeText(path);
    if (!normalized) {
        return '';
    }
    const chunks = normalized
        .split(/::|\/|\\|>/g)
        .map((item: string): string => item.trim())
        .filter(Boolean);
    if (chunks.length <= 0) {
        return containsCjk(normalized) ? normalized : '';
    }
    const candidate = chunks[chunks.length - 1];
    return containsCjk(candidate) ? candidate : '';
}

function formatFactFieldLabel(key: string): string {
    const normalized = normalizeText(key);
    if (!normalized) {
        return '内容';
    }
    if (FACT_FIELD_LABEL_MAP[normalized]) {
        return FACT_FIELD_LABEL_MAP[normalized];
    }
    if (containsCjk(normalized)) {
        return normalized;
    }
    return '内容';
}

function formatScalarValue(value: unknown): string {
    if (typeof value === 'string') {
        return normalizeText(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value == null) {
        return '';
    }
    return normalizeText(value);
}

function formatStructuredValue(value: unknown, depth: number = 0): string {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item: unknown): string => formatStructuredValue(item, depth + 1)).map((item: string): string => normalizeText(item)).filter(Boolean))).join('；');
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        const segments: string[] = [];
        for (const [key, nextValue] of entries) {
            const rendered = formatStructuredValue(nextValue, depth + 1);
            if (!rendered) {
                continue;
            }
            const label = formatFactFieldLabel(key);
            if (label === '内容' && depth > 0) {
                segments.push(rendered);
            } else {
                segments.push(`${label}：${rendered}`);
            }
        }
        return segments.join('；');
    }
    return formatScalarValue(value);
}

/**
 * 功能：把结构化事实整理成适合记忆索引的中文文本。
 * 参数：
 *   fact (DBFact)：结构化事实记录。
 * 返回：
 *   string：可直接用于向量化或展示的中文文本。
 */
export function formatFactMemoryText(fact: {
    type?: string;
    path?: string;
    value?: unknown;
    entity?: {
        kind?: string;
        id?: string;
    };
}): string {
    const lines: string[] = [];
    const typeLabel = formatFactTypeLabel(fact.type);
    const subject = formatReadablePath(fact.path) || formatEntityLabel(fact.entity);
    lines.push(subject ? `${typeLabel}：${subject}` : typeLabel);
    const pathLabel = formatReadablePath(fact.path);
    if (pathLabel && pathLabel !== subject) {
        lines.push(`来源：${pathLabel}`);
    }
    const entityLabel = formatEntityLabel(fact.entity);
    if (entityLabel && entityLabel !== subject) {
        lines.push(`关联对象：${entityLabel}`);
    }
    const valueText = formatStructuredValue(fact.value);
    if (valueText) {
        lines.push(`内容：${valueText}`);
    }
    return lines.filter(Boolean).join('\n');
}

/**
 * 功能：把摘要记录整理成适合记忆索引的中文文本。
 * 参数：
 *   summary (DBSummary)：摘要记录。
 * 返回：
 *   string：可直接用于向量化或展示的文本。
 */
export function formatSummaryMemoryText(summary: DBSummary): string {
    const title = normalizeText(summary.title);
    const content = normalizeText(summary.content);
    if (title && content) {
        return `${title}\n${content}`;
    }
    return title || content;
}
