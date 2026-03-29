import type { RetrievalFacet, RetrievalContextRoute } from './types';

/**
 * 功能：实体信号 → facet 权重映射配置。
 */
const ENTITY_BOOST_RULES: Array<{
    anchorField: 'actorKeys' | 'locationKeys' | 'relationKeys' | 'worldKeys';
    boosts: Array<{ facet: RetrievalFacet; weight: number }>;
    label: string;
}> = [
    {
        anchorField: 'actorKeys',
        boosts: [
            { facet: 'relationship', weight: 0.25 },
            { facet: 'event', weight: 0.1 },
        ],
        label: '角色锚点',
    },
    {
        anchorField: 'locationKeys',
        boosts: [
            { facet: 'scene', weight: 0.3 },
            { facet: 'event', weight: 0.1 },
        ],
        label: '地点锚点',
    },
    {
        anchorField: 'relationKeys',
        boosts: [
            { facet: 'relationship', weight: 0.35 },
        ],
        label: '关系锚点',
    },
    {
        anchorField: 'worldKeys',
        boosts: [
            { facet: 'world', weight: 0.3 },
        ],
        label: '世界锚点',
    },
];

/**
 * 功能：实体文本模式 → facet 权重映射配置。
 */
const ENTITY_PATTERN_RULES: Array<{
    pattern: RegExp;
    boosts: Array<{ facet: RetrievalFacet; weight: number }>;
    label: string;
}> = [
    {
        pattern: /教派|教团|组织|势力|商会|学院|公会|骑士团|军团|教会|宗门|帮派|派系/u,
        boosts: [{ facet: 'organization_politics', weight: 0.35 }],
        label: '组织/势力/教派',
    },
    {
        pattern: /城市|城邦|王都|首都|港口|边境城/u,
        boosts: [
            { facet: 'organization_politics', weight: 0.2 },
            { facet: 'scene', weight: 0.15 },
        ],
        label: '城市级别实体',
    },
    {
        pattern: /国家|王国|帝国|联邦|政权|教权国|共和国/u,
        boosts: [
            { facet: 'organization_politics', weight: 0.25 },
            { facet: 'world', weight: 0.15 },
        ],
        label: '国家级别实体',
    },
];

/**
 * 功能：根据实体锚点命中增加 facet 分数。
 * 从 context-router 提取的独立模块，便于扩展新实体类型的权重规则。
 * @param entityAnchors 实体锚点。
 * @param scores facet 分数映射。
 * @param reasons 诊断原因列表。
 */
export function applyEntityBoostSignals(
    entityAnchors: RetrievalContextRoute['entityAnchors'],
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    for (const rule of ENTITY_BOOST_RULES) {
        const anchors = entityAnchors[rule.anchorField];
        if (!Array.isArray(anchors) || anchors.length <= 0) continue;
        for (const boost of rule.boosts) {
            scores.set(boost.facet, (scores.get(boost.facet) ?? 0) + boost.weight);
        }
        reasons.push({
            source: 'entity',
            detail: `${rule.label}命中：${anchors.join('、')}。`,
            weight: rule.boosts[0].weight,
        });
    }
}

/**
 * 功能：通过实体文本模式增加 facet 分数。
 * 集中管理组织/城市/国家等实体模式的权重增强。
 * @param query 查询文本。
 * @param scores facet 分数映射。
 * @param reasons 诊断原因列表。
 */
export function applyEntityPatternBoosts(
    query: string,
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    for (const rule of ENTITY_PATTERN_RULES) {
        if (!rule.pattern.test(query)) continue;
        for (const boost of rule.boosts) {
            scores.set(boost.facet, (scores.get(boost.facet) ?? 0) + boost.weight);
        }
        reasons.push({
            source: 'pattern',
            detail: `句式涉及${rule.label}，已提高相关情境权重。`,
            weight: rule.boosts[0].weight,
        });
    }
}
