/**
 * 功能：渲染世界状态叙事行。
 * @param input 渲染输入。
 * @returns 叙事文本。
 */
export function renderWorldStateNarrative(input: {
    text: string;
    injectionStyle?: string;
    entryType?: string;
    detailPayload?: Record<string, unknown>;
}): string {
    const text = String(input.text ?? '').trim();
    if (!text) {
        return '';
    }
    const normalizedStyle = String(input.injectionStyle ?? '').trim().toLowerCase();
    const extensionText = buildExtensionFieldText(input.entryType, input.detailPayload, normalizedStyle);
    if (normalizedStyle === 'ancient_traditional') {
        return extensionText
            ? `依当前纲常所见，${text}；礼序补注：${extensionText}`
            : `依当前纲常所见，${text}`;
    }
    if (normalizedStyle === 'fantasy_magic') {
        return extensionText
            ? `在既定法则下，${text}；额外法则：${extensionText}`
            : `在既定法则下，${text}`;
    }
    if (normalizedStyle === 'supernatural_hidden') {
        const layeredText = buildHiddenLayerNarrative(text, input.detailPayload);
        return extensionText
            ? `${layeredText}；隐层注记：${extensionText}`
            : layeredText;
    }
    return extensionText ? `${text}；补充：${extensionText}` : text;
}

/**
 * 功能：构建潜藏超自然的双层叙事。
 * @param text 基础文本。
 * @param detailPayload 结构化载荷。
 * @returns 双层叙事文本。
 */
function buildHiddenLayerNarrative(text: string, detailPayload?: Record<string, unknown>): string {
    const fields = toRecord(detailPayload?.fields);
    const publicCover = pickFirstText(fields.publicCover, fields.coverStory);
    const hiddenPurpose = pickFirstText(fields.hiddenPurpose, fields.trueMechanism, fields.realThreat);
    if (publicCover && hiddenPurpose) {
        return `表层说法：${publicCover}；隐层真实：${hiddenPurpose}；当前记录：${text}`;
    }
    if (publicCover) {
        return `表层秩序：${publicCover}；当前记录：${text}`;
    }
    if (hiddenPurpose) {
        return `外界未见的真实机制是${hiddenPurpose}；当前记录：${text}`;
    }
    return `表层一切仍显得正常，但异常已在暗处运转：${text}`;
}

/**
 * 功能：根据画像偏好抽取结构化扩展字段。
 * @param entryType 条目类型。
 * @param detailPayload 结构化载荷。
 * @param injectionStyle 注入风格。
 * @returns 扩展字段叙事。
 */
function buildExtensionFieldText(
    entryType?: string,
    detailPayload?: Record<string, unknown>,
    injectionStyle?: string,
): string {
    const normalizedType = String(entryType ?? '').trim().toLowerCase();
    const fields = toRecord(detailPayload?.fields);
    const profileFields = resolveProfileExtensionFields(injectionStyle, normalizedType);
    const rows = profileFields
        .map((field): string => {
            const value = normalizeFieldValue(fields[field.key]);
            if (!value) {
                return '';
            }
            return `${field.label}${value}`;
        })
        .filter(Boolean);
    return rows.join('，');
}

/**
 * 功能：解析不同画像下的扩展字段定义。
 * @param injectionStyle 注入风格。
 * @param entryType 条目类型。
 * @returns 字段列表。
 */
function resolveProfileExtensionFields(
    injectionStyle?: string,
    entryType?: string,
): Array<{ key: string; label: string }> {
    const normalizedStyle = String(injectionStyle ?? '').trim().toLowerCase();
    const normalizedType = String(entryType ?? '').trim().toLowerCase();
    const mapping: Record<string, Record<string, Array<{ key: string; label: string }>>> = {
        urban_modern: {
            location: [
                { key: 'district', label: '片区=' },
                { key: 'businessType', label: '业态=' },
                { key: 'publicAccess', label: '公共开放度=' },
            ],
            organization: [
                { key: 'industry', label: '行业=' },
                { key: 'legalStatus', label: '合法身份=' },
            ],
        },
        ancient_traditional: {
            location: [
                { key: 'region', label: '辖域=' },
                { key: 'sectControl', label: '掌控者=' },
                { key: 'forbiddenZone', label: '禁忌=' },
            ],
            organization: [
                { key: 'lineage', label: '门第=' },
                { key: 'sects', label: '宗门=' },
                { key: 'allegiance', label: '效忠=' },
            ],
        },
        fantasy_magic: {
            event: [
                { key: 'magicCost', label: '代价=' },
                { key: 'artifactImpact', label: '圣物影响=' },
                { key: 'prophecyTag', label: '预言=' },
            ],
            location: [
                { key: 'manaDensity', label: '魔力密度=' },
                { key: 'factionControl', label: '阵营控制=' },
                { key: 'dangerRank', label: '危险等级=' },
            ],
        },
        supernatural_hidden: {
            organization: [
                { key: 'publicCover', label: '公开壳层=' },
                { key: 'hiddenPurpose', label: '隐藏目的=' },
            ],
            event: [
                { key: 'coverStory', label: '掩饰说法=' },
                { key: 'publicExposureRisk', label: '暴露风险=' },
            ],
        },
    };
    return mapping[normalizedStyle]?.[normalizedType] ?? [];
}

/**
 * 功能：格式化结构化字段值。
 * @param value 原始值。
 * @returns 文本值。
 */
function normalizeFieldValue(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean).join(' / ');
    }
    return String(value ?? '').trim();
}

/**
 * 功能：读取首个非空文本。
 * @param values 文本列表。
 * @returns 首个有效文本。
 */
function pickFirstText(...values: unknown[]): string {
    for (const value of values) {
        const text = String(value ?? '').trim();
        if (text) {
            return text;
        }
    }
    return '';
}

/**
 * 功能：安全转为对象。
 * @param value 原始值。
 * @returns 对象记录。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

