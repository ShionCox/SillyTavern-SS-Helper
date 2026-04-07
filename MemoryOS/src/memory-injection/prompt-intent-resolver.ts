/**
 * 功能：Prompt 注入意图类型。
 */
export type PromptIntent =
    | 'setting_qa'
    | 'character_reasoning'
    | 'relationship_update'
    | 'scene_progression'
    | 'organization_politics'
    | 'location_navigation';

/**
 * 功能：意图解析输入。
 */
export interface IntentResolverInput {
    /** 最新用户查询。 */
    userQuery: string;
    /** 路由 facet 分数。 */
    facetScores?: Map<string, number>;
    /** 命中的意图提示（来自 keyword matcher）。 */
    intentHints?: string[];
    /** 命中的实体类型列表。 */
    matchedEntityTypes?: string[];
}

/**
 * 功能：意图解析结果。
 */
export interface IntentResolverResult {
    intent: PromptIntent;
    confidence: number;
    reasons: string[];
}

/**
 * 功能：意图模式规则。
 */
interface IntentPatternRule {
    intent: PromptIntent;
    patterns: RegExp[];
    facetKeys: string[];
    entityTypes: string[];
    hintKeywords: string[];
    baseWeight: number;
}

const INTENT_RULES: IntentPatternRule[] = [
    {
        intent: 'organization_politics',
        patterns: [
            /教派|教团|组织|势力|商会|学院|公会|骑士团|军团|教会|宗门|派系/u,
            /权力|政治|阵营|联盟|对立|暗中/u,
        ],
        facetKeys: ['organization_politics'],
        entityTypes: ['organization', 'city', 'nation'],
        hintKeywords: ['organization', 'politics', 'faction'],
        baseWeight: 0.3,
    },
    {
        intent: 'character_reasoning',
        patterns: [
            /你(觉得|认为|怎么看|为什么)/u,
            /我(觉得|认为|感觉|好像)/u,
            /角色|性格|人格|态度|想法/u,
        ],
        facetKeys: ['interpretation'],
        entityTypes: [],
        hintKeywords: ['character', 'reasoning', 'personality'],
        baseWeight: 0.25,
    },
    {
        intent: 'relationship_update',
        patterns: [
            /关系|你我|之间|对.*(感情|看法|态度)|你.*(喜欢|讨厌|信任|怀疑)/u,
        ],
        facetKeys: ['relationship'],
        entityTypes: [],
        hintKeywords: ['relationship', 'bond', 'trust'],
        baseWeight: 0.3,
    },
    {
        intent: 'scene_progression',
        patterns: [
            /接下来|然后|走|去|前往|出发|离开|到达/u,
            /这(里|个地方|座城)|来到|走进/u,
        ],
        facetKeys: ['scene', 'event'],
        entityTypes: ['location', 'scene_shared_state'],
        hintKeywords: ['scene', 'location', 'travel'],
        baseWeight: 0.2,
    },
    {
        intent: 'location_navigation',
        patterns: [
            /哪里|在哪|怎么去|位于|地图|路线/u,
            /城门|黑市|广场|教堂|酒馆|宿舍|集市/u,
        ],
        facetKeys: ['scene'],
        entityTypes: ['location', 'city'],
        hintKeywords: ['location', 'navigation', 'direction'],
        baseWeight: 0.2,
    },
    {
        intent: 'setting_qa',
        patterns: [
            /为什么|规则|法则|禁令|设定|世界观|历史/u,
        ],
        facetKeys: ['world'],
        entityTypes: ['world_core_setting', 'world_hard_rule'],
        hintKeywords: ['setting', 'world', 'lore', 'rule'],
        baseWeight: 0.2,
    },
];

/**
 * 功能：根据用户查询、facet 路由和实体命中联合判定注入意图。
 * @param input 意图解析输入。
 * @returns 意图解析结果。
 */
export function resolvePromptIntent(input: IntentResolverInput): IntentResolverResult {
    const query = String(input.userQuery ?? '').trim();
    const facetScores = input.facetScores ?? new Map<string, number>();
    const intentHints = input.intentHints ?? [];
    const matchedEntityTypes = input.matchedEntityTypes ?? [];

    let bestIntent: PromptIntent = 'setting_qa';
    let bestScore = 0;
    let bestReasons: string[] = [];

    for (const rule of INTENT_RULES) {
        let score = 0;
        const reasons: string[] = [];

        for (const pattern of rule.patterns) {
            if (pattern.test(query)) {
                score += rule.baseWeight;
                reasons.push(`文本模式命中：${pattern.source.slice(0, 30)}`);
                break;
            }
        }

        for (const facetKey of rule.facetKeys) {
            const facetScore = facetScores.get(facetKey) ?? 0;
            if (facetScore > 0.15) {
                score += facetScore * 0.4;
                reasons.push(`facet ${facetKey} 权重 ${facetScore.toFixed(2)}`);
            }
        }

        for (const entityType of rule.entityTypes) {
            if (matchedEntityTypes.includes(entityType)) {
                score += 0.15;
                reasons.push(`命中实体类型 ${entityType}`);
            }
        }

        for (const hint of rule.hintKeywords) {
            if (intentHints.includes(hint)) {
                score += 0.1;
                reasons.push(`意图提示命中 ${hint}`);
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestIntent = rule.intent;
            bestReasons = reasons;
        }
    }

    return {
        intent: bestIntent,
        confidence: Math.min(1, bestScore),
        reasons: bestReasons,
    };
}
