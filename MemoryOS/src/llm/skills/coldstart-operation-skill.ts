import type { MemoryPromptSkill } from './index';

export const COLDSTART_OPERATION_SKILL: MemoryPromptSkill = {
    skillId: 'memoryos.coldstart.operation',
    title: '冷启动操作说明',
    description: '用于角色卡与世界观冷启动提炼，要求总览、目录明细与世界规则严格分离。',
    instructions: [
        '你是一个角色卡与世界观整理助手。',
        '请根据输入的角色描述、开场白、作者注释、系统提示和世界观资料，提炼适合 MemoryOS 冷启动的角色总结与世界设定。',
        '只输出符合 schema 的 JSON，不输出解释、Markdown 或代码块。',
        '所有自然语言内容必须使用简体中文。',
        '内容要简洁、可复用、避免编造；如果资料里没有，就返回空字符串或空数组。',
        'worldSummary 只能写总览，不得把规则、制度、地点清单平铺进总览。',
        '世界设定必须优先写入 detail 数组，例如 nationDetails、regionDetails、cityDetails、locationDetails、ruleDetails。',
        '每个 detail 条目必须只表达一个可落库主题，不要把多条无关内容塞进同一个条目。',
        '地点类条目必须拆成 name 与 summary；name 只能是地点名，summary 才是描述。',
        '没有明确国家、区域、城市父级时必须留空，不得用地点名、描述句或制度句回填父级。',
        '如果只知道模糊归属，可以使用 rumor 或 inferred，并把归属写入对应父级字段。',
        '同一条规则只能进入一个最合适的 facet，不要同时出现在 rule、social、culture 等多个数组里。',
        '遇到不确定或信息不足的条目，宁可留空或标记为传闻，也不要编造明确结论。',
        'nations 只放明确国家、王朝、帝国、联邦、共和国等政体名，不要把制度句或描述句塞进去。',
        'regionDetails 只记录明确区域名，cityDetails 只记录明确城市或聚落名，locationDetails 只记录明确地点名。',
        '如果资料写成“御花园：供皇室休憩游玩之所”，那么 name 应为“御花园”，summary 应为“供皇室休憩游玩之所”。',
        '如果无法确认名字，就不要生成对应 detail 条目。',
        '不要返回 character_summary、world_summary、seed_key_entries 或其他替代键名。',
    ],
};

const COLDSTART_REQUIRED_KEYS_TEXT: string[] = [
    '严格使用以下 JSON 键名：roleSummary、worldSummary、identityFacts、worldRules、hardConstraints、nations、regions、cities、locations、organizations、entities、calendarSystems、currencySystems、socialSystems、culturalPractices、majorEvents、dangers、otherWorldDetails、tasks、relationshipFacts、catchphrases、relationshipAnchors、styleCues、nationDetails、regionDetails、cityDetails、locationDetails、organizationDetails、taskDetails、majorEventDetails、ruleDetails、constraintDetails、socialSystemDetails、culturalPracticeDetails、dangerDetails、entityDetails、otherWorldDetailDetails。',
    'roleSummary 和 worldSummary 是字符串。',
    'nationDetails、regionDetails、cityDetails、locationDetails 必须是对象数组，每个对象至少包含 name 和 summary。',
    'organizationDetails、taskDetails、majorEventDetails、ruleDetails、constraintDetails、socialSystemDetails、culturalPracticeDetails、dangerDetails、entityDetails、otherWorldDetailDetails 必须是对象数组。',
    '每个世界 detail 条目必须包含 title、summary、facet、knowledgeLevel、scopeType，其中 knowledgeLevel 只能是 confirmed、rumor、inferred。',
];

const COLDSTART_EXTRA_RULES_TEXT: string[] = [
    '新增硬性要求：必须输出 organizationDetails、taskDetails、majorEventDetails、ruleDetails、constraintDetails、socialSystemDetails、culturalPracticeDetails、dangerDetails、entityDetails、otherWorldDetailDetails。',
    '地点条目必须拆成地点名与描述，不得把整句描述塞进 name；没有明确父级时 nationName、regionName、cityName 留空，不得用地点名回填城市名。',
    'worldSummary 只能写总览，不得重复平铺规则条目；规则类内容应写入 detail 数组。',
    '如果资料里只有制度描述、社会结构描述或朝代特征，但没有明确国家名字，就不要把整句放进 nations，可改放 socialSystems 或 otherWorldDetails。',
    'regionDetails 只记录明确区域名；如果只有制度描述，不要放进 regionDetails。',
    'cityDetails 只记录明确城市或聚落名；locationDetails 只记录明确地点名，例如宫殿、花园、寝宫、房间、遗迹、学院。',
    '如果无法确认名字，就不要生成对应 detail 项，宁可留空。',
    'regions 只放大区、边境、行省、州郡、大陆分区。',
    'cities 只放城市、都城、主城、镇、村、聚落、港口城等聚居地。',
    'locations 只放神庙、遗迹、房间、据点、学院、基地、空间站、森林、峡谷等具体地点节点，不要放国家、区域、城市。',
    'organizations 只放组织、派系、公会、教团、军团、家族势力；entities 只放不属于前述分类、但可单独索引的对象或机构。',
    'worldRules 放普遍规则与运行机制；hardConstraints 放绝对禁忌和硬限制。',
    'calendarSystems 放历法、纪年、节气与月份体系；currencySystems 放货币、面额、税制、交易度量；socialSystems 放阶级、身份等级、社会制度；culturalPractices 放礼俗、传统、节庆、仪式习惯。',
    'majorEvents 放重大事件；dangers 放危险和威胁；tasks 放任务进展；relationshipFacts 与 relationshipAnchors 放稳定关系事实与检索锚点。',
    'otherWorldDetails 只放明确属于世界设定、但不适合放入上述任一分类的合法条目；不要把无法理解、残缺或噪音文本放进去。',
    '同一条内容只能进入一个最合适的字段。nation > region > city > location，系统类内容不要放入地点类字段。',
    '不要返回 character_summary、world_summary、seed_key_entries 或任何其他替代键名。',
];

/**
 * 功能：将冷启动技能渲染为系统提示文本。
 * @returns 冷启动技能文本。
 */
function renderColdstartSkillText(): string {
    const instructions: string[] = COLDSTART_OPERATION_SKILL.instructions
        .map((item: string, index: number): string => `${index + 1}. ${String(item ?? '').trim()}`)
        .filter((item: string): boolean => item.length > 0);
    return [
        `【技能】${COLDSTART_OPERATION_SKILL.title}`,
        `技能编号：${COLDSTART_OPERATION_SKILL.skillId}`,
        COLDSTART_OPERATION_SKILL.description,
        ...instructions,
    ]
        .filter((item: string): boolean => item.length > 0)
        .join('\n');
}

/**
 * 功能：构建冷启动任务专用的完整系统提示词。
 * @returns 完整冷启动系统提示词。
 */
export function buildColdstartOperationSystemPrompt(): string {
    return [
        renderColdstartSkillText(),
        ...COLDSTART_REQUIRED_KEYS_TEXT,
        ...COLDSTART_EXTRA_RULES_TEXT,
    ].join('\n');
}
