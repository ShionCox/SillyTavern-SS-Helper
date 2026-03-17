import type { DBEvent, DBFact, DBSummary, DBWorldState } from '../db/db';
import type {
    CanonSnapshot,
    CharacterSnapshot,
    ChatLifecycleState,
    ChatProfile,
    EditorExperienceSnapshot,
    ChatSemanticSeed,
    EditorHealthSnapshot,
    GroupMemoryState,
    LatestRecallExplanation,
    MemoryCandidateBufferSnapshot,
    MemoryLifecycleState,
    MemoryMigrationStatus,
    MemoryTuningProfile,
    LogicalChatView,
    LorebookGateDecision,
    MaintenanceInsight,
    MemoryQualityScorecard,
    MemorySDK,
    InjectionSectionName,
    PostGenerationGateDecision,
    PreGenerationGateDecision,
    RecallExplanationBucket,
    RecallLogEntry,
    RetentionPolicy,
    RelationshipState,
    SimpleMemoryPersona,
    SnapshotValue,
    SpeakerMemoryLane,
} from '../../../SDK/stx';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';

type ExperienceTone = 'accent' | 'soft' | 'warning' | 'success';
type CharacterRoleMark = 'primary' | 'secondary' | 'pending';

interface ExperienceListItem {
    title: string;
    detail: string;
    meta: string;
    tone?: ExperienceTone;
    iconClassName?: string;
    sourcePayload?: string;
    detailHtml?: string;
    actionsHtml?: string;
}

interface ExperienceListMarkupOptions {
    listClassName?: string;
    entryClassName?: string;
    compactSourceButton?: boolean;
}

interface ExperienceBadge {
    label: string;
    value: string;
    tone?: ExperienceTone;
}

type ExperienceSnapshot = EditorExperienceSnapshot;

/**
 * 功能：读取当前激活的 MemorySDK。
 * 参数：无。
 * 返回：
 *   MemorySDK | null：当前聊天绑定的记忆 SDK；未就绪时返回 null。
 */
function getActiveMemorySdk(): MemorySDK | null {
    return ((window as unknown as { STX?: { memory?: MemorySDK | null } }).STX?.memory ?? null) as MemorySDK | null;
}

/**
 * 功能：转义 HTML，避免把动态文本直接插入页面。
 * 参数：
 *   input：原始文本。
 * 返回：
 *   string：转义后的安全文本。
 */
function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：将任意值归一化为单行文本。
 * 参数：
 *   value：待处理的值。
 *   fallback：兜底文本。
 * 返回：
 *   string：清理后的文本。
 */
function normalizeText(value: unknown, fallback: string = '暂无'): string {
    const text: string = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || fallback;
}

const CHARACTER_ROLE_LABELS: Record<CharacterRoleMark, string> = {
    primary: '主角色',
    secondary: '次角色',
    pending: '待确认',
};

const CHARACTER_ROLE_STORAGE_PREFIX = 'stx-memoryos-character-role:';

function getCharacterRoleStorageKey(chatKey: string): string {
    return `${CHARACTER_ROLE_STORAGE_PREFIX}${String(chatKey ?? '').trim()}`;
}

function readCharacterRoleMarks(chatKey: string): Record<string, CharacterRoleMark> {
    if (typeof window === 'undefined' || !window.localStorage || !chatKey) {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(getCharacterRoleStorageKey(chatKey));
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as Record<string, CharacterRoleMark>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function deriveDefaultCharacterRole(item: CharacterSnapshot, index: number): CharacterRoleMark {
    if (index === 0) {
        return 'primary';
    }
    if (item.lastActiveAt) {
        return 'secondary';
    }
    return 'pending';
}

function resolveCharacterRoleMark(chatKey: string, item: CharacterSnapshot, index: number): CharacterRoleMark {
    const marks = readCharacterRoleMarks(chatKey);
    const stored = marks[String(item.actorKey ?? '').trim()];
    return stored || deriveDefaultCharacterRole(item, index);
}

const EXPERIENCE_KEY_LABELS: Record<string, string> = {
    semantic: '语义',
    style: '风格',
    identity: '身份',
    profile: '档案',
    mode: '模式',
    cues: '提示线索',
    presetstyle: '预设风格',
    displayname: '显示名称',
    aliases: '别名',
    catchphrases: '口头禅',
    demand: '要求',
    trait: '特征',
    event: '事件',
    relationship: '关系',
    goal: '目标',
    summary: '摘要',
    value: '内容',
    status: '状态',
    emotion: '情绪',
    scene: '场景',
    preference: '偏好',
    persona: '人物设定',
    notes: '备注',
    tags: '标签',
    keywords: '关键词',
    text: '文本',
    content: '内容',
    message: '消息',
    reason: '原因',
    outcome: '结果',
    result: '结果',
    source: '来源',
    speaker: '说话方',
    role: '角色',
    name: '名称',
    scope: '范围',
    pluginid: '插件',
    messageid: '消息ID',
    chat: '聊天',
    sent: '发送',
    received: '接收',
    system: '系统',
    updated: '更新',
    template: '模板',
    changed: '变更',
    rendered: '已渲染',
    build: '构建',
    vector: '向量',
    embed: '写入',
    search: '检索',
    rerank: '重排',
    extract: '抽取',
    summarize: '摘要',
    memory: '记忆',
    world: '世界',
    round: '回合',
    combat: '战斗',
    end: '结束',
};

const EXPERIENCE_FACT_TYPE_LABELS: Record<string, string> = {
    'semantic.style': '风格设定',
    'semantic.identity': '身份设定',
    'semantic.profile': '人物档案',
    'semantic.preference': '偏好设定',
    'character_demand': '角色要求',
    'character_trait': '角色特征',
    'character_profile': '角色档案',
    'character_identity': '角色身份',
    'event': '事件记录',
    'relationship': '关系线索',
};

const EXPERIENCE_EVENT_TYPE_LABELS: Record<string, string> = {
    'chat.message.sent': '用户发言',
    'chat.message.received': '角色回复',
    'chat.message.system': '系统消息',
    'chat.message.updated': '消息更新',
    user_message_rendered: '用户发言',
    'memory.extract': '记忆抽取',
    'memory.summarize': '摘要生成',
    'memory.vector.embed': '向量写入',
    'memory.search.rerank': '检索重排',
    'memory.template.changed': '记忆模板变更',
    'world.template.build': '世界模板构建',
    'world.template.changed': '世界模板变更',
    'world_state.update': '世界状态更新',
    'combat.end': '战斗结束',
    'combat.round.end': '战斗回合结束',
};

/**
 * 功能：把键名或类型片段翻成更适合展示的中文。
 * @param value 原始片段。
 * @returns 中文标签。
 */
function formatExperienceKeyLabel(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '未命名';
    }
    const lookupKey = normalized.toLowerCase();
    if (EXPERIENCE_KEY_LABELS[lookupKey]) {
        return EXPERIENCE_KEY_LABELS[lookupKey];
    }
    return normalized;
}

/**
 * 功能：把类型或路径翻译成自然中文标题。
 * @param value 原始值。
 * @returns 中文标题。
 */
function formatExperienceTopicLabel(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '未命名';
    }
    const lookupKey = normalized.toLowerCase();
    if (EXPERIENCE_FACT_TYPE_LABELS[lookupKey]) {
        return EXPERIENCE_FACT_TYPE_LABELS[lookupKey];
    }
    const parts = normalized.split(/[._/:-]+/).filter(Boolean);
    const translated = parts.map((part: string): string => formatExperienceKeyLabel(part));
    return translated.join(' / ');
}

/**
 * 功能：将事实路径压缩成适合展示的中文短标签。
 * @param path 原始路径。
 * @returns 中文路径标签。
 */
function formatExperiencePathLabel(path: string): string {
    const normalized = String(path ?? '').trim();
    if (!normalized) {
        return '';
    }
    const parts = normalized.split(/[./]+/).filter(Boolean);
    if (parts.length === 0) {
        return '';
    }
    const tail = parts.slice(-2).map((part: string): string => formatExperienceKeyLabel(part));
    return tail.join(' / ');
}

/**
 * 功能：把任意值概括为更适合体验卡阅读的中文短句。
 * @param value 原始值。
 * @returns 中文摘要。
 */
function summarizeExperienceValue(value: unknown): string {
    if (typeof value === 'string') {
        return truncateText(value, 100) || '无详细内容';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return normalizeText(value, '无详细内容');
    }
    if (Array.isArray(value)) {
        return truncateText(
            value
                .map((item: unknown): string => normalizeText(item, ''))
                .filter(Boolean)
                .join('、'),
            100,
        ) || '无详细内容';
    }
    if (value && typeof value === 'object') {
        const entries: Array<[string, unknown]> = Object.entries(value as Record<string, unknown>).slice(0, 4);
        return truncateText(
            entries
                .map(([key, item]: [string, unknown]): string => `${formatExperienceKeyLabel(key)}：${normalizeText(item, '')}`)
                .join('；'),
            120,
        ) || '无详细内容';
    }
    return normalizeText(value, '无详细内容');
}

/**
 * 功能：限制文本长度，避免卡片内容过长。
 * 参数：
 *   value：原始文本。
 *   maxLength：最大长度。
 * 返回：
 *   string：截断后的文本。
 */
function truncateText(value: unknown, maxLength: number): string {
    const text: string = normalizeText(value, '');
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * 功能：格式化时间戳为用户可读时间。
 * 参数：
 *   ts：毫秒级时间戳。
 * 返回：
 *   string：格式化后的时间文本。
 */
function formatTimestamp(ts: number): string {
        if (!Number.isFinite(ts) || ts <= 0) {
                return '未记录';
        }
        try {
                return new Date(ts).toLocaleString('zh-CN', { hour12: false });
        } catch {
                return '未记录';
        }
}

/**
 * 功能：格式化相对时间。
 * 参数：
 *   ts：毫秒级时间戳。
 * 返回：
 *   string：相对当前时间的简短描述。
 */
function formatRelativeTime(ts: number): string {
        if (!Number.isFinite(ts) || ts <= 0) {
                return '未记录';
        }
        const deltaMs = Date.now() - ts;
        if (deltaMs < 0) {
                return '刚刚';
        }
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (deltaMs < minute) {
                return '刚刚';
        }
        if (deltaMs < hour) {
                return `${Math.max(1, Math.floor(deltaMs / minute))} 分钟前`;
        }
        if (deltaMs < day) {
                return `${Math.max(1, Math.floor(deltaMs / hour))} 小时前`;
        }
        if (deltaMs < 7 * day) {
                return `${Math.max(1, Math.floor(deltaMs / day))} 天前`;
        }
        return formatTimestamp(ts);
}

/**
 * 功能：把 0-1 分数格式化为百分比。
 * 参数：
 *   value：分值。
 * 返回：
 *   string：百分比字符串。
 */
function formatScorePercent(value: number): string {
        if (!Number.isFinite(value)) {
                return '--';
        }
        return `${Math.round(Number(value) * 100)}%`;
}

/**
 * 功能：格式化迁移阶段标签。
 * 参数：
 *   status：迁移状态。
 * 返回：
 *   string：阶段文本。
 */
function formatMigrationStage(status: MemoryMigrationStatus | null): string {
        if (!status) {
                return '未记录';
        }
        if (status.stage === 'db_preferred') {
                return '结构化主读';
        }
        if (status.stage === 'dual_write') {
                return '双写过渡';
        }
        return '兼容旧状态';
}

/**
 * 功能：格式化调参摘要。
 * @param tuning 调参画像。
 * @returns string：摘要文本。
 */
function formatTuningSummary(tuning: MemoryTuningProfile): string {
        return [
                `阈值 ${tuning.candidateAcceptThresholdBias >= 0 ? '+' : ''}${tuning.candidateAcceptThresholdBias.toFixed(2)}`,
                `关系 ${tuning.recallRelationshipBias.toFixed(2)}`,
                `情绪 ${tuning.recallEmotionBias.toFixed(2)}`,
                `保护 ${tuning.distortionProtectionBias.toFixed(2)}`,
        ].join(' / ');
}

/**
 * 功能：构建新的角色概览说明。
 * @param snapshot 体验快照。
 * @returns string：HTML 片段。
 */
function buildRoleOverviewMarkupNext(snapshot: ExperienceSnapshot): string {
        const primaryLane: SpeakerMemoryLane | null = pickPrimaryLane(snapshot.groupMemory);
        const roleName: string = normalizeText(
                primaryLane?.displayName
                || snapshot.semanticSeed?.identitySeed?.displayName
                || snapshot.semanticSeed?.characterAnchors?.[0]?.label
                || '当前角色',
                '当前角色',
        );
        const anchors: string[] = Array.isArray(snapshot.semanticSeed?.identitySeed?.identity)
                ? snapshot.semanticSeed.identitySeed.identity.slice(0, 3).map((item: string): string => normalizeText(item, '')).filter(Boolean)
                : [];
        const topInsight: MaintenanceInsight | null = pickTopInsight(snapshot.maintenanceInsights);
        return `
            <div class="stx-ui-summary-callout">
                <div class="stx-ui-summary-callout-head">
                    <div>
                        <div class="stx-ui-summary-eyebrow">角色记忆概览</div>
                        <div class="stx-ui-summary-title">${escapeHtml(roleName)}</div>
                    </div>
                    <div class="stx-ui-summary-meta">${escapeHtml(formatLifecycleStage(snapshot.lifecycle))}</div>
                </div>
                <div class="stx-ui-summary-copy">
                    ${escapeHtml([
                            `${formatChatType(snapshot.profile)} / ${formatSummaryStrategy(snapshot.profile)}`,
                            snapshot.profile.vectorStrategy.enabled ? '当前会主动回想更早内容' : '当前偏轻量注入',
                            `迁移阶段：${formatMigrationStage(snapshot.migrationStatus)}`,
                            anchors.length > 0 ? `角色锚点：${anchors.join(' / ')}` : '角色锚点仍在形成',
                    ].join(' / '))}
                </div>
                <div class="stx-ui-summary-foot">
                    ${escapeHtml(topInsight
                            ? `当前提醒：${topInsight.shortLabel} / ${topInsight.detail}`
                            : `记忆质量 ${snapshot.quality.totalScore} 分 / 检索精度 ${formatScorePercent(snapshot.quality.dimensions.retrievalPrecision)} / ${formatTuningSummary(snapshot.tuningProfile)}`)}
                </div>
            </div>
        `;
}

/**
 * 功能：构建新的关系概览说明。
 * @param snapshot 体验快照。
 * @returns string：HTML 片段。
 */
function buildRelationOverviewMarkupNext(snapshot: ExperienceSnapshot): string {
        const primaryLane: SpeakerMemoryLane | null = pickPrimaryLane(snapshot.groupMemory);
        const sharedScene = snapshot.groupMemory?.sharedScene;
        const sceneText: string = normalizeText(sharedScene?.currentScene, '');
        const conflictText: string = normalizeText(sharedScene?.currentConflict, '');
        const relationText: string = normalizeText(primaryLane?.relationshipDelta, '');
        const topRelationship: RelationshipState | null = snapshot.relationshipState[0] ?? null;
        const participantCount: number = Number(sharedScene?.participantActorKeys?.length ?? 0);
        return `
            <div class="stx-ui-summary-callout">
                <div class="stx-ui-summary-callout-head">
                    <div>
                        <div class="stx-ui-summary-eyebrow">关系与场景</div>
                        <div class="stx-ui-summary-title">${escapeHtml(relationText || conflictText || topRelationship?.summary || '当前关系整体平稳')}</div>
                    </div>
                    <div class="stx-ui-summary-meta">${escapeHtml(participantCount > 0 ? `${participantCount} 个活跃对象` : formatChatType(snapshot.profile))}</div>
                </div>
                <div class="stx-ui-summary-copy">
                    ${escapeHtml([
                            sceneText ? `当前场景：${sceneText}` : '当前场景仍在形成',
                            conflictText ? `当前冲突：${conflictText}` : '暂时没有显著冲突',
                            topRelationship ? `最高关系：${normalizeText(topRelationship.targetKey, topRelationship.relationshipKey)}` : '暂时没有稳定关系对象',
                    ].join(' / '))}
                </div>
                <div class="stx-ui-summary-foot">
                    ${escapeHtml(topRelationship
                            ? `信任 ${Math.round(topRelationship.trust * 100)}% / 好感 ${Math.round(topRelationship.affection * 100)}% / 未解冲突 ${Math.round(topRelationship.unresolvedConflict * 100)}%`
                            : (primaryLane?.lastEmotion ? `最近情绪：${primaryLane.lastEmotion}` : '最近情绪波动较弱'))}
                </div>
            </div>
        `;
}

/**
 * 功能：构建新的注入概览说明。
 * @param snapshot 体验快照。
 * @returns string：HTML 片段。
 */
function buildInjectionOverviewMarkupNext(snapshot: ExperienceSnapshot): string {
        if (!snapshot.preDecision) {
                return `
                    <div class="stx-ui-summary-callout is-empty-state">
                        <div class="stx-ui-summary-title">还没有最近一次注入决策</div>
                        <div class="stx-ui-summary-copy">等下一次生成发生后，这里会显示本轮用了哪些记忆、为什么命中、当前迁移状态与调参偏置。</div>
                    </div>
                `;
        }
        return `
            <div class="stx-ui-summary-callout">
                <div class="stx-ui-summary-callout-head">
                    <div>
                        <div class="stx-ui-summary-eyebrow">本轮注入解释</div>
                        <div class="stx-ui-summary-title">${escapeHtml(snapshot.preDecision.shouldInject ? '已生成注入上下文' : '本轮跳过注入')}</div>
                    </div>
                    <div class="stx-ui-summary-meta">${escapeHtml(formatRelativeTime(snapshot.preDecision.generatedAt))}</div>
                </div>
                <div class="stx-ui-summary-copy">
                    ${escapeHtml([
                            `意图：${formatInjectionIntentLabel(snapshot.preDecision.intent)}`,
                            `锚点：${formatAnchorModeLabel(snapshot.preDecision.anchorMode)}`,
                            `渲染：${formatRenderStyleLabel(snapshot.preDecision.renderStyle)}`,
                            `世界书：${formatLorebookModeLabel(snapshot.preDecision.lorebookMode)}`,
                    ].join(' / '))}
                </div>
                <div class="stx-ui-summary-foot">
                    ${escapeHtml(`原因：${formatInjectionReasonSummary(snapshot.preDecision.reasonCodes)}`)}
                </div>
            </div>
        `;
}

/**
 * 功能：格式化记忆强度标签。
 * 参数：
 *   profile：当前聊天画像。
 * 返回：
 *   string：强度标签。
 */
function formatMemoryStrength(profile: ChatProfile): string {
    if (profile.memoryStrength === 'high') {
        return '强';
    }
    if (profile.memoryStrength === 'low') {
        return '弱';
    }
    return '中';
}

/**
 * 功能：格式化聊天类型标签。
 * 参数：
 *   profile：当前聊天画像。
 * 返回：
 *   string：聊天类型标签。
 */
function formatChatType(profile: ChatProfile): string {
    if (profile.chatType === 'group') {
        return '群聊';
    }
    if (profile.chatType === 'worldbook') {
        return '设定问答';
    }
    if (profile.chatType === 'tool') {
        return '工具会话';
    }
    return '单人聊天';
}

/**
 * 功能：格式化摘要策略标签。
 * 参数：
 *   profile：当前聊天画像。
 * 返回：
 *   string：摘要策略文本。
 */
function formatSummaryStrategy(profile: ChatProfile): string {
    if (profile.summaryStrategy === 'timeline') {
        return '时间线';
    }
    if (profile.summaryStrategy === 'short') {
        return '短摘要';
    }
    return '分层摘要';
}

/**
 * 功能：格式化生命周期阶段标签。
 * 参数：
 *   lifecycle：生命周期状态。
 * 返回：
 *   string：阶段文本。
 */
function formatLifecycleStage(lifecycle: ChatLifecycleState): string {
    if (lifecycle.stage === 'long_running') {
        return '长聊运行中';
    }
    if (lifecycle.stage === 'stable') {
        return '稳定期';
    }
    if (lifecycle.stage === 'archived') {
        return '已归档';
    }
    if (lifecycle.stage === 'deleted') {
        return '已删除';
    }
    if (lifecycle.stage === 'active') {
        return '活跃期';
    }
    return '新会话';
}

const LIFECYCLE_REASON_LABELS: Record<string, string> = {
    stage_long_running: '聊天已进入长聊阶段',
    stage_stable: '聊天结构整体稳定',
    stage_active: '近期互动较活跃',
    stage_archived: '当前聊天已归档',
    stage_deleted: '当前聊天已删除',
    stage_new: '当前仍属新会话',
    summary_recent: '最近刚生成过摘要',
    summary_stale: '摘要已有一段时间未刷新',
    facts_dense: '当前记忆事实较集中',
    facts_sparse: '当前记忆事实偏少',
    turns_low: '有效轮次较少',
    turns_medium: '互动轮次正在增长',
    turns_high: '互动轮次已经很多',
};

const MUTATION_KIND_LABELS: Record<string, string> = {
    message_added: '新增了一条消息',
    message_removed: '有消息被删除',
    message_updated: '有消息内容被修改',
    message_edited: '有消息内容被修改',
    message_deleted: '有消息被删除',
    message_swiped: '候选回复发生切换',
    message_replaced: '有消息被替换',
    summary_rebuilt: '摘要被重新整理',
    branch_switched: '聊天分支发生切换',
    chat_branched: '聊天分支发生切换',
    history_trimmed: '历史记录被压缩或裁剪',
    lifecycle_changed: '聊天阶段发生变化',
};

/**
 * 功能：把生命周期原因码列表翻译为中文说明。
 * @param reasons 原始原因码列表。
 * @returns 中文说明文本。
 */
function formatLifecycleReasonSummary(reasons: string[]): string {
    const items = Array.isArray(reasons) ? reasons : [];
    const translated: string[] = [];

    for (const reason of items) {
        const normalized = String(reason ?? '').trim();
        if (!normalized) {
            continue;
        }
        if (LIFECYCLE_REASON_LABELS[normalized]) {
            translated.push(LIFECYCLE_REASON_LABELS[normalized]);
            continue;
        }

        const turnsMatch = normalized.match(/^turns_(\d+)$/i);
        if (turnsMatch) {
            translated.push(`当前已累计 ${turnsMatch[1]} 轮互动`);
            continue;
        }

        const summariesMatch = normalized.match(/^summaries_(\d+)$/i);
        if (summariesMatch) {
            translated.push(`当前已沉淀 ${summariesMatch[1]} 条摘要`);
            continue;
        }

        const factsMatch = normalized.match(/^facts_(\d+)$/i);
        if (factsMatch) {
            translated.push(`当前保留 ${factsMatch[1]} 条事实记忆`);
            continue;
        }

        translated.push(normalized.replace(/^stage_/, '阶段：').replace(/_/g, ' '));
    }

    return translated.length > 0 ? translated.join(' · ') : '当前没有额外阶段说明';
}

/**
 * 功能：把最近变动类型翻译成中文说明。
 * @param mutationKinds 原始变动类型。
 * @returns 中文说明文本。
 */
function formatMutationKindSummary(mutationKinds: string[]): string {
    const items = Array.isArray(mutationKinds) ? mutationKinds : [];
    const translated = items
        .map((item: string): string => {
            const normalized = String(item ?? '').trim();
            if (!normalized) {
                return '';
            }
            return MUTATION_KIND_LABELS[normalized] || normalized.replace(/_/g, ' ');
        })
        .filter(Boolean);
    return translated.length > 0 ? translated.join(' · ') : '最近没有检测到明显的结构变化。';
}

const INJECTION_REASON_LABELS: Record<string, string> = {
    setting_only_mode: '当前只在设定问答场景下注入记忆',
    pre_gate_skip: '这一轮不适合注入额外记忆',
    lorebook_block: '世界书策略阻止了注入',
    chat_archived: '当前聊天已归档，暂停注入',
    setting_query: '检测到用户正在询问设定',
    story_progress: '当前对话更偏向推进剧情',
    tool_query: '当前请求更像工具问答',
    worldbook_profile: '当前聊天使用世界书导向配置',
    entry_matched: '命中了相关世界书条目',
    entry_not_matched: '没有命中相关世界书条目',
    no_active_lorebook: '当前没有启用世界书',
    world_conflict_detected: '检测到世界设定存在冲突风险',
    summary_only_mode: '本轮只保留摘要类注入',
    lorebook_blocked: '世界书拦截了这次注入',
    identity_memory: '更偏向角色身份类记忆',
    semantic_memory: '更偏向稳定语义记忆',
    episodic_memory: '更偏向情节经历记忆',
    working_memory: '更偏向近期上下文记忆',
    relation_signal: '关系线索与当前对话相关',
    emotion_signal: '情绪线索与当前对话相关',
    privacy_penalty: '因敏感度限制而降低优先级',
    below_threshold: '综合分数未达到采用阈值',
    keyword_hit: '与当前关键词高度相关',
    relation_match: '与当前关系线索匹配',
    emotion_match: '与当前情绪线索匹配',
    topic_continuity: '与当前话题保持连续',
    conflict_penalty: '因冲突惩罚被压低优先级',
    small_talk_noise: '当前内容更像闲聊噪声',
    skip_long_term_extract: '本轮不建议沉淀为长期记忆',
    tool_result: '当前内容属于工具结果',
    facts_only_focus: '本轮更适合保留事实信息',
    setting_confirmed: '本轮主要在确认设定',
    world_state_update: '适合更新世界状态',
    world_state_blocked: '暂不适合更新世界状态',
    relationship_shift: '检测到关系变化',
    relation_tracking: '需要继续跟踪关系线索',
    mutation_repair_required: '聊天结构变化较大，需要修复型处理',
};

function formatInjectionIntentLabel(value: string): string {
    if (value === 'setting_qa') {
        return '设定问答';
    }
    if (value === 'story_continue') {
        return '剧情续写';
    }
    if (value === 'roleplay') {
        return '角色扮演';
    }
    if (value === 'tool_qa') {
        return '工具问答';
    }
    return '自动判断';
}

function formatInjectionSectionLabel(value: string): string {
    if (value === 'WORLD_STATE') {
        return '世界状态';
    }
    if (value === 'FACTS') {
        return '事实';
    }
    if (value === 'EVENTS') {
        return '事件';
    }
    if (value === 'SUMMARY') {
        return '摘要';
    }
    if (value === 'CHARACTER_FACTS') {
        return '角色事实';
    }
    if (value === 'RELATIONSHIPS') {
        return '关系';
    }
    if (value === 'LAST_SCENE') {
        return '最近场景';
    }
    if (value === 'SHORT_SUMMARY') {
        return '短摘要';
    }
    if (value === 'PREVIEW') {
        return '预览';
    }
    return value || '未命名区段';
}

function formatAnchorModeLabel(value: string): string {
    const dict: Record<string, string> = {
        top: '插在最前面',
        before_start: '放在开头之前',
        custom_anchor: '插到自定义锚点',
        after_first_system: '放在第一条系统提示后',
        after_last_system: '放在最后一条系统提示后',
        after_persona: '放在人设后面',
        after_author_note: '放在作者注释后',
        after_lorebook: '放在世界书后',
        setting_query_only: '仅设定问答时插入',
    };
    return dict[String(value ?? '').trim()] || '按默认位置插入';
}

function formatRenderStyleLabel(value: string): string {
    const dict: Record<string, string> = {
        xml: '结构化片段',
        markdown: 'Markdown 列表',
        comment: '注释说明',
        compact_kv: '紧凑键值',
        minimal_bullets: '精简条目',
    };
    return dict[String(value ?? '').trim()] || '默认样式';
}

function formatLorebookModeLabel(value: string): string {
    const dict: Record<string, string> = {
        force_inject: '强制带入世界书',
        soft_inject: '按相关性柔性带入',
        summary_only: '只保留摘要提示',
        block: '本轮不带入世界书',
    };
    return dict[String(value ?? '').trim()] || '自动判断';
}

function formatInjectionReasonCode(code: string): string {
    const raw = String(code ?? '').trim();
    if (!raw) {
        return '';
    }
    const normalized = raw.toLowerCase();
    if (INJECTION_REASON_LABELS[normalized]) {
        return INJECTION_REASON_LABELS[normalized];
    }

    const intentMatch = normalized.match(/^intent:(.+)$/i);
    if (intentMatch) {
        return `本轮意图偏向${formatInjectionIntentLabel(intentMatch[1])}`;
    }

    const lorebookMatch = normalized.match(/^lorebook:(.+)$/i);
    if (lorebookMatch) {
        return `世界书：${formatInjectionReasonCode(lorebookMatch[1])}`;
    }

    const lifecycleMatch = normalized.match(/^lifecycle_(.+)$/i);
    if (lifecycleMatch) {
        return `当前聊天处于${formatLifecycleStage({ stage: lifecycleMatch[1] as ChatLifecycleState['stage'] } as ChatLifecycleState)}`;
    }

    if (normalized.startsWith('mutation_repair:')) {
        return '聊天结构变化较大，触发了修复型处理';
    }

    return raw.replace(/_/g, ' ');
}

function formatInjectionReasonSummary(reasonCodes: string[], limit: number = 4): string {
    const items = (Array.isArray(reasonCodes) ? reasonCodes : [])
        .map((code: string): string => formatInjectionReasonCode(code))
        .filter(Boolean)
        .slice(0, limit);
    return items.length > 0 ? items.join(' · ') : '当前没有额外原因标签';
}

/**
 * 功能：从维护提示中挑选最高优先级项。
 * 参数：
 *   insights：维护提示列表。
 * 返回：
 *   MaintenanceInsight | null：最高优先级提示。
 */
function pickTopInsight(insights: MaintenanceInsight[]): MaintenanceInsight | null {
    const severityWeight: Record<string, number> = {
        critical: 3,
        warning: 2,
        info: 1,
    };
    const nextInsights: MaintenanceInsight[] = Array.isArray(insights) ? [...insights] : [];
    nextInsights.sort((left: MaintenanceInsight, right: MaintenanceInsight): number => {
        const severityDelta: number = (severityWeight[right.severity] ?? 0) - (severityWeight[left.severity] ?? 0);
        if (severityDelta !== 0) {
            return severityDelta;
        }
        return Number(right.generatedAt ?? 0) - Number(left.generatedAt ?? 0);
    });
    return nextInsights[0] ?? null;
}

/**
 * 功能：挑选最应展示的角色记忆分支。
 * 参数：
 *   groupMemory：群聊记忆状态。
 * 返回：
 *   SpeakerMemoryLane | null：优先显示的角色分支。
 */
function pickPrimaryLane(groupMemory: GroupMemoryState | null): SpeakerMemoryLane | null {
    const lanes: SpeakerMemoryLane[] = Array.isArray(groupMemory?.lanes) ? [...groupMemory.lanes] : [];
    if (lanes.length === 0) {
        return null;
    }
    const salienceMap: Map<string, number> = new Map(
        (Array.isArray(groupMemory?.actorSalience) ? groupMemory.actorSalience : []).map((item) => [item.actorKey, Number(item.score ?? 0)]),
    );
    lanes.sort((left: SpeakerMemoryLane, right: SpeakerMemoryLane): number => {
        const salienceDelta: number = Number(salienceMap.get(right.actorKey) ?? 0) - Number(salienceMap.get(left.actorKey) ?? 0);
        if (salienceDelta !== 0) {
            return salienceDelta;
        }
        return Number(right.lastActiveAt ?? 0) - Number(left.lastActiveAt ?? 0);
    });
    return lanes[0] ?? null;
}

/**
 * 功能：判断事实是否更接近关系类信息。
 * 参数：
 *   fact：事实记录。
 * 返回：
 *   boolean：是否属于关系线索。
 */
function isRelationshipFact(fact: DBFact): boolean {
    const typeText: string = String(fact.type ?? '').toLowerCase();
    const pathText: string = String(fact.path ?? '').toLowerCase();
    return /relation|relationship|bond|trust|affection|conflict|关系|好感|信任|矛盾/.test(`${typeText} ${pathText}`);
}

/**
 * 功能：判断事实是否更接近稳定记忆。
 * 参数：
 *   fact：事实记录。
 * 返回：
 *   boolean：是否适合作为长期记忆展示。
 */
function isLongTermFact(fact: DBFact): boolean {
    const typeText: string = String(fact.type ?? '').toLowerCase();
    const pathText: string = String(fact.path ?? '').toLowerCase();
    return typeText.startsWith('semantic.')
        || /profile|identity|style|preference|setting|world/.test(`${typeText} ${pathText}`);
}

/**
 * 功能：从事实值中提取简短可读文本。
 * 参数：
 *   value：事实值。
 * 返回：
 *   string：摘要文本。
 */
function summarizeValue(value: unknown): string {
    return summarizeExperienceValue(value);
}

interface FactCardField {
        label: string;
        value: string;
        multiline?: boolean;
}

/**
 * 功能：把事实值整理成更适合卡片阅读的字段列表。
 * 参数：
 *   value：事实原始值。
 * 返回：
 *   FactCardField[]：可读字段列表。
 */
function buildFactCardFields(value: unknown): FactCardField[] {
        if (typeof value === 'string') {
                const text = normalizeText(value, '无详细内容');
                return text ? [{ label: '内容', value: text, multiline: text.length > 42 }] : [];
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
                return [{ label: '内容', value: normalizeText(value, '无详细内容') }];
        }
        if (Array.isArray(value)) {
                const items = value
                        .map((item: unknown): string => normalizeText(item, ''))
                        .filter(Boolean)
                        .slice(0, 8);
                return items.length > 0
                        ? [{ label: '内容', value: items.join('\n'), multiline: true }]
                        : [];
        }
        if (value && typeof value === 'object') {
                return Object.entries(value as Record<string, unknown>)
                        .slice(0, 8)
                        .map(([key, item]: [string, unknown]): FactCardField | null => {
                                if (Array.isArray(item)) {
                                        const lines = item
                                                .map((entry: unknown): string => normalizeText(entry, ''))
                                                .filter(Boolean)
                                                .slice(0, 8);
                                        if (lines.length === 0) {
                                                return null;
                                        }
                                        return {
                                                label: formatExperienceKeyLabel(key),
                                                value: lines.join('\n'),
                                                multiline: true,
                                        };
                                }
                                const text = normalizeText(item, '');
                                if (!text) {
                                        return null;
                                }
                                return {
                                        label: formatExperienceKeyLabel(key),
                                        value: text,
                                        multiline: text.length > 42,
                                };
                        })
                        .filter((field: FactCardField | null): field is FactCardField => Boolean(field));
        }
        return [];
}

/**
 * 功能：把长期事实渲染为更易读的卡片布局。
 * 参数：
 *   facts：长期事实列表。
 * 返回：
 *   string：HTML 字符串。
 */
function buildPrimaryFactsMarkup(facts: DBFact[]): string {
        if (!Array.isArray(facts) || facts.length === 0) {
                return '<div class="stx-ui-empty-hint">当前还没有稳定的长期记忆。</div>';
        }
        return `
            <div class="stx-ui-fact-card-list">
                ${facts.map((fact: DBFact): string => {
                        const pathLabel = formatExperiencePathLabel(String(fact.path ?? ''));
                        const entityLabel = normalizeText(fact.entity?.id, '');
                        const fields = buildFactCardFields(fact.value);
                        const fallbackDetail = summarizeValue(fact.value);
                        return `
                            <article class="stx-ui-fact-card${isRelationshipFact(fact) ? ' is-accent' : ''}">
                                <div class="stx-ui-fact-card-head">
                                    <div class="stx-ui-fact-card-title-wrap">
                                        <strong class="stx-ui-fact-card-title">${escapeHtml(formatExperienceTopicLabel(String(fact.type ?? '')))}</strong>
                                        <div class="stx-ui-fact-card-meta">
                                            <span class="stx-ui-fact-chip">${escapeHtml(formatRelativeTime(Number(fact.updatedAt ?? 0)))}</span>
                                            ${entityLabel ? `<span class="stx-ui-fact-chip is-soft">${escapeHtml(entityLabel)}</span>` : ''}
                                            ${pathLabel ? `<span class="stx-ui-fact-chip is-soft">${escapeHtml(pathLabel)}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="stx-ui-fact-card-body">
                                    ${fields.length > 0 ? fields.map((field: FactCardField): string => `
                                        <div class="stx-ui-fact-field${field.multiline ? ' is-multiline' : ''}">
                                            <div class="stx-ui-fact-field-label">${escapeHtml(field.label)}</div>
                                            <div class="stx-ui-fact-field-value">${escapeHtml(field.value)}</div>
                                        </div>
                                    `).join('') : `
                                        <div class="stx-ui-fact-field is-multiline">
                                            <div class="stx-ui-fact-field-label">内容</div>
                                            <div class="stx-ui-fact-field-value">${escapeHtml(fallbackDetail)}</div>
                                        </div>
                                    `}
                                </div>
                            </article>
                        `;
                }).join('')}
            </div>
        `;
}

/**
 * 功能：把事实记录格式化为展示项。
 * 参数：
 *   fact：事实记录。
 * 返回：
 *   ExperienceListItem：展示项。
 */
function formatFactItem(fact: DBFact): ExperienceListItem {
    const entityText: string = fact.entity?.id ? ` · ${fact.entity.id}` : '';
    const pathLabel: string = formatExperiencePathLabel(String(fact.path ?? ''));
    const pathText: string = pathLabel ? ` · ${pathLabel}` : '';
    return {
        title: formatExperienceTopicLabel(String(fact.type ?? '')),
        detail: summarizeValue(fact.value),
        meta: `${formatRelativeTime(Number(fact.updatedAt ?? 0))}${entityText}${pathText}`,
        tone: isRelationshipFact(fact) ? 'accent' : 'soft',
    };
}

/**
 * 功能：从事件载荷中提取简短摘要。
 * 参数：
 *   event：事件记录。
 * 返回：
 *   string：事件摘要文本。
 */
function summarizeEvent(event: DBEvent): string {
    const payload: Record<string, unknown> = event.payload && typeof event.payload === 'object'
        ? event.payload as Record<string, unknown>
        : {};
    const preferred: unknown[] = [
        payload.text,
        payload.content,
        payload.message,
        payload.summary,
        payload.reason,
        payload.outcome,
        payload.result,
    ];
    for (const candidate of preferred) {
        const text: string = truncateText(summarizeExperienceValue(candidate), 100);
        if (text) {
            return text;
        }
    }
    if (event.payload != null) {
        return truncateText(summarizeExperienceValue(event.payload), 100);
    }
    return '无附加内容';
}

/**
 * 功能：把事件里的发送方名字规范成中文展示。
 * @param value 原始发送方名字。
 * @returns 中文发送方名。
 */
function formatEventSpeakerLabel(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '';
    }
    const lookup = normalized.toLowerCase();
    if (lookup === 'you' || lookup === 'user') {
        return '用户';
    }
    if (lookup === 'system') {
        return '系统';
    }
    return normalized;
}

/**
 * 功能：把事件记录格式化为展示项。
 * 参数：
 *   event：事件记录。
 * 返回：
 *   ExperienceListItem：展示项。
 */
function formatEventItem(event: DBEvent): ExperienceListItem {
    const payload: Record<string, unknown> = event.payload && typeof event.payload === 'object'
        ? event.payload as Record<string, unknown>
        : {};
    const speaker = formatEventSpeakerLabel(payload.name ?? payload.role ?? payload.source);
    const eventScope = formatExperiencePathLabel(String((event.refs as Record<string, unknown> | undefined)?.scope ?? ''));
    const metaParts = [
        formatRelativeTime(Number(event.ts ?? 0)),
        speaker,
        eventScope,
    ].filter(Boolean);
    return {
        title: EXPERIENCE_EVENT_TYPE_LABELS[String(event.type ?? '').trim()] || formatExperienceTopicLabel(String(event.type ?? '')),
        detail: summarizeEvent(event),
        meta: `${metaParts.join(' · ')} · ${formatTimestamp(Number(event.ts ?? 0))}`,
    };
}

/**
 * 功能：把摘要记录格式化为展示项。
 * 参数：
 *   summary：摘要记录。
 * 返回：
 *   ExperienceListItem：展示项。
 */
function formatSummaryItem(summary: DBSummary): ExperienceListItem {
    return {
        title: normalizeText(summary.title, `${formatExperienceKeyLabel(String(summary.level ?? ''))}摘要`),
        detail: truncateText(summary.content, 120) || '暂无摘要内容',
        meta: `${formatRelativeTime(Number(summary.createdAt ?? 0))} · ${formatExperienceKeyLabel(String(summary.level ?? ''))}`,
        tone: summary.level === 'scene' ? 'accent' : 'soft',
    };
}

/**
 * 功能：把状态记录格式化为展示项。
 * 参数：
 *   state：世界状态记录。
 * 返回：
 *   ExperienceListItem：展示项。
 */
function formatStateItem(state: DBWorldState): ExperienceListItem {
    const shortPath: string = formatExperiencePathLabel(String(state.path ?? '')) || state.path;
    return {
        title: shortPath || '世界状态',
        detail: summarizeValue(state.value),
        meta: formatRelativeTime(Number(state.updatedAt ?? 0)),
        tone: state.path.startsWith('/semantic/world') ? 'accent' : 'soft',
    };
}

/**
 * 功能：构建人物记忆画像标签。
 * 参数：
 *   snapshot：体验快照。
 * 返回：
 *   ExperienceBadge[]：画像标签数组。
 */
function buildPersonaBadges(snapshot: ExperienceSnapshot): ExperienceBadge[] {
    if (snapshot.simplePersona) {
        const labelMap: Record<SimpleMemoryPersona['memoryStrength'], string> = {
            weak: '弱',
            balanced: '中',
            strong: '强',
        };
        const levelMap: Record<'low' | 'medium' | 'high', string> = {
            low: '低',
            medium: '中',
            high: '高',
        };
        const forgettingMap: Record<SimpleMemoryPersona['forgettingRate'], string> = {
            slow: '慢',
            medium: '中',
            fast: '快',
        };
        return [
            { label: '当前记性', value: labelMap[snapshot.simplePersona.memoryStrength], tone: 'accent' },
            { label: '情绪记忆', value: levelMap[snapshot.simplePersona.emotionalMemory], tone: snapshot.simplePersona.emotionalMemory === 'high' ? 'warning' : 'soft' },
            { label: '关系敏感', value: levelMap[snapshot.simplePersona.relationshipFocus], tone: snapshot.simplePersona.relationshipFocus === 'high' ? 'accent' : 'soft' },
            { label: '遗忘速度', value: forgettingMap[snapshot.simplePersona.forgettingRate], tone: snapshot.simplePersona.forgettingRate === 'fast' ? 'warning' : 'success' },
            { label: '误记倾向', value: levelMap[snapshot.simplePersona.distortionRisk], tone: snapshot.simplePersona.distortionRisk === 'high' ? 'warning' : 'success' },
        ];
    }
    const relationFactCount: number = snapshot.facts.filter(isRelationshipFact).length;
    const primaryLane: SpeakerMemoryLane | null = pickPrimaryLane(snapshot.groupMemory);
    const emotionLabel: string = primaryLane?.lastEmotion
        ? '高'
        : snapshot.profile.stylePreference === 'story' || snapshot.profile.chatType === 'group'
            ? '中'
            : '低';
    const relationLabel: string = primaryLane?.relationshipDelta || relationFactCount >= 3
        ? '高'
        : snapshot.profile.extractStrategy === 'facts_only'
            ? '低'
            : '中';
    const misrememberLabel: string = snapshot.quality.level === 'poor' || snapshot.quality.level === 'critical'
        ? '高'
        : snapshot.quality.level === 'watch'
            ? '中'
            : '低';
    return [
        { label: '当前记性', value: formatMemoryStrength(snapshot.profile), tone: 'accent' },
        { label: '情绪记忆', value: emotionLabel, tone: emotionLabel === '高' ? 'warning' : 'soft' },
        { label: '关系敏感', value: relationLabel, tone: relationLabel === '高' ? 'accent' : 'soft' },
        { label: '误记倾向', value: misrememberLabel, tone: misrememberLabel === '高' ? 'warning' : 'success' },
    ];
}

/**
 * 功能：构建角色主面板顶部说明。
 * 参数：
 *   snapshot：体验快照。
 * 返回：
 *   string：HTML 片段。
 */
function buildRoleOverviewMarkup(snapshot: ExperienceSnapshot): string {
    const primaryLane: SpeakerMemoryLane | null = pickPrimaryLane(snapshot.groupMemory);
    const roleName: string = normalizeText(
        primaryLane?.displayName
        || snapshot.semanticSeed?.identitySeed?.displayName
        || snapshot.semanticSeed?.characterAnchors?.[0]?.label
        || '当前角色',
        '当前角色',
    );
    const anchors: string[] = Array.isArray(snapshot.semanticSeed?.identitySeed?.identity)
        ? snapshot.semanticSeed!.identitySeed.identity.slice(0, 3).map((item: string): string => normalizeText(item, '')).filter(Boolean)
        : [];
    const topInsight: MaintenanceInsight | null = pickTopInsight(snapshot.maintenanceInsights);
    return `
      <div class="stx-ui-summary-callout">
        <div class="stx-ui-summary-callout-head">
          <div>
            <div class="stx-ui-summary-eyebrow">角色记忆概览</div>
            <div class="stx-ui-summary-title">${escapeHtml(roleName)}</div>
          </div>
          <div class="stx-ui-summary-meta">${escapeHtml(formatLifecycleStage(snapshot.lifecycle))}</div>
        </div>
        <div class="stx-ui-summary-copy">
          ${escapeHtml([
              `${formatChatType(snapshot.profile)} · ${formatSummaryStrategy(snapshot.profile)}`,
              snapshot.profile.vectorStrategy.enabled ? '会主动回想更早内容' : '当前偏轻量注入',
              anchors.length > 0 ? `角色锚点：${anchors.join(' / ')}` : '角色锚点还在形成',
          ].join(' · '))}
        </div>
        <div class="stx-ui-summary-foot">
          ${escapeHtml(topInsight
              ? `当前提醒：${topInsight.shortLabel} · ${topInsight.detail}`
              : `记忆质量 ${snapshot.quality.totalScore} 分 · 检索精度 ${formatScorePercent(snapshot.quality.dimensions.retrievalPrecision)}`)}
        </div>
      </div>
    `;
}

/**
 * 功能：构建关系与状态概览。
 * 参数：
 *   snapshot：体验快照。
 * 返回：
 *   string：HTML 片段。
 */
function buildRelationOverviewMarkup(snapshot: ExperienceSnapshot): string {
    const primaryLane: SpeakerMemoryLane | null = pickPrimaryLane(snapshot.groupMemory);
    const sharedScene = snapshot.groupMemory?.sharedScene;
    const sceneText: string = normalizeText(sharedScene?.currentScene, '');
    const conflictText: string = normalizeText(sharedScene?.currentConflict, '');
    const relationText: string = normalizeText(primaryLane?.relationshipDelta, '');
    const participantCount: number = Number(sharedScene?.participantActorKeys?.length ?? 0);
    return `
      <div class="stx-ui-summary-callout">
        <div class="stx-ui-summary-callout-head">
          <div>
            <div class="stx-ui-summary-eyebrow">关系与场景</div>
            <div class="stx-ui-summary-title">${escapeHtml(relationText || conflictText || '当前关系整体平稳')}</div>
          </div>
          <div class="stx-ui-summary-meta">${escapeHtml(participantCount > 0 ? `${participantCount} 个活跃角色` : formatChatType(snapshot.profile))}</div>
        </div>
        <div class="stx-ui-summary-copy">
          ${escapeHtml([
              sceneText ? `当前场景：${sceneText}` : '当前场景仍在形成',
              conflictText ? `当前冲突：${conflictText}` : '暂无明显冲突',
              primaryLane?.recentGoal ? `角色近期目标：${primaryLane.recentGoal}` : '暂无明显短期目标',
          ].join(' · '))}
        </div>
        <div class="stx-ui-summary-foot">
          ${escapeHtml(primaryLane?.lastEmotion ? `最近情绪：${primaryLane.lastEmotion}` : '最近情绪波动较弱')}
        </div>
      </div>
    `;
}

/**
 * 功能：构建注入概览说明。
 * 参数：
 *   snapshot：体验快照。
 * 返回：
 *   string：HTML 片段。
 */
function buildInjectionOverviewMarkup(snapshot: ExperienceSnapshot): string {
    if (!snapshot.preDecision) {
        return `
          <div class="stx-ui-summary-callout is-empty-state">
            <div class="stx-ui-summary-title">还没有最近一次注入决策</div>
            <div class="stx-ui-summary-copy">等下一次生成发生后，这里会展示“本轮用了哪些记忆、按什么方式插入”的解释。</div>
          </div>
        `;
    }
    return `
      <div class="stx-ui-summary-callout">
        <div class="stx-ui-summary-callout-head">
          <div>
            <div class="stx-ui-summary-eyebrow">本轮注入解释</div>
            <div class="stx-ui-summary-title">${escapeHtml(snapshot.preDecision.shouldInject ? '已生成注入上下文' : '本轮跳过注入')}</div>
          </div>
          <div class="stx-ui-summary-meta">${escapeHtml(formatRelativeTime(snapshot.preDecision.generatedAt))}</div>
        </div>
        <div class="stx-ui-summary-copy">
          ${escapeHtml([
                            `意图：${formatInjectionIntentLabel(snapshot.preDecision.intent)}`,
                            `锚点：${formatAnchorModeLabel(snapshot.preDecision.anchorMode)}`,
                            `渲染：${formatRenderStyleLabel(snapshot.preDecision.renderStyle)}`,
                            `世界书策略：${formatLorebookModeLabel(snapshot.preDecision.lorebookMode)}`,
          ].join(' · '))}
        </div>
        <div class="stx-ui-summary-foot">
                    ${escapeHtml(`原因：${formatInjectionReasonSummary(snapshot.preDecision.reasonCodes)}`)}
        </div>
      </div>
    `;
}

/**
 * 功能：构建展示标签 HTML。
 * 参数：
 *   badges：标签数组。
 * 返回：
 *   string：HTML 字符串。
 */
function buildBadgesMarkup(badges: ExperienceBadge[]): string {
    if (!Array.isArray(badges) || badges.length === 0) {
        return '<div class="stx-ui-empty-hint">暂无画像标签</div>';
    }
    return `
      <div class="stx-ui-badge-grid">
        ${badges.map((badge: ExperienceBadge): string => `
          <div class="stx-ui-badge-card${badge.tone ? ` is-${badge.tone}` : ''}">
            <span class="stx-ui-badge-label">${escapeHtml(badge.label)}</span>
            <strong class="stx-ui-badge-value">${escapeHtml(badge.value)}</strong>
          </div>
        `).join('')}
      </div>
    `;
}

/**
 * 功能：构建列表卡片内容 HTML。
 * 参数：
 *   items：列表项。
 *   emptyText：空状态说明。
 * 返回：
 *   string：HTML 字符串。
 */
function buildListMarkup(items: ExperienceListItem[], emptyText: string, options: ExperienceListMarkupOptions = {}): string {
    if (!Array.isArray(items) || items.length === 0) {
        return `<div class="stx-ui-empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return `
            <div class="stx-ui-memory-list${options.listClassName ? ` ${escapeHtml(options.listClassName)}` : ''}">
        ${items.map((item: ExperienceListItem): string => `
                        <article class="stx-ui-memory-entry${item.tone ? ` is-${item.tone}` : ''}${options.entryClassName ? ` ${escapeHtml(options.entryClassName)}` : ''}">
            <div class="stx-ui-memory-entry-head">
                            <strong>${item.iconClassName ? `<i class="${escapeHtml(item.iconClassName)} stx-ui-memory-entry-icon" aria-hidden="true"></i>` : ''}<span>${escapeHtml(item.title)}</span></strong>
                            <span>${escapeHtml(item.meta)}</span>
            </div>
                        <div class="stx-ui-memory-entry-body">${item.detailHtml ?? escapeHtml(item.detail)}</div>
                        ${((item.sourcePayload ? buildSourceDetailButton(item.sourcePayload, options.compactSourceButton === true) : '') + (item.actionsHtml ?? ''))
                            ? `<div class="stx-ui-actions">${item.sourcePayload ? buildSourceDetailButton(item.sourcePayload, options.compactSourceButton === true) : ''}${item.actionsHtml ?? ''}</div>`
                                : ''}
          </article>
        `).join('')}
      </div>
    `;
}

/**
 * 功能：构建注入区段标签。
 * 参数：
 *   preDecision：最近一次生成前决策。
 * 返回：
 *   string：HTML 字符串。
 */
function buildInjectionSectionMarkup(preDecision: PreGenerationGateDecision | null): string {
    if (!preDecision || preDecision.sectionsUsed.length === 0) {
        return '<div class="stx-ui-empty-hint">这次没有记录到区段预算。</div>';
    }
    return `
      <div class="stx-ui-pill-wrap">
        ${preDecision.sectionsUsed.map((section: InjectionSectionName): string => {
            const budget: number | undefined = preDecision.budgets?.[section];
                        const budgetLabel: string = Number.isFinite(Number(budget)) ? `约 ${budget} 词元` : '自动';
                        return `<span class="stx-ui-pill"><strong>${escapeHtml(formatInjectionSectionLabel(section))}</strong><em>${escapeHtml(budgetLabel)}</em></span>`;
        }).join('')}
      </div>
    `;
}

/**
 * 功能：构建“为什么注入”说明列表。
 * 参数：
 *   snapshot：体验快照。
 * 返回：
 *   ExperienceListItem[]：说明列表。
 */
/**
 * 功能：格式化注入语气标签。
 * @param tone 注入语气。
 * @returns 中文标签。
 */
function formatInjectedToneLabel(tone: RecallExplanationBucket['items'][number]['tone']): string {
    if (tone === 'stable_fact') {
        return '稳定事实';
    }
    if (tone === 'clear_recall') {
        return '清晰回忆';
    }
    if (tone === 'blurred_recall') {
        return '模糊回忆';
    }
    if (tone === 'possible_misremember') {
        return '可能误记';
    }
    return '未标注语气';
}

/**
 * 功能：格式化生命周期阶段标签。
 * @param stage 生命周期阶段。
 * @returns 中文标签。
 */
function formatDecayStageLabel(stage: RecallExplanationBucket['items'][number]['stage']): string {
    if (stage === 'clear') {
        return '清晰';
    }
    if (stage === 'blur') {
        return '模糊';
    }
    if (stage === 'distorted') {
        return '扭曲';
    }
    return '未标注阶段';
}

/**
 * 功能：格式化记忆层级标签。
 * @param layer 记忆层级。
 * @returns 中文标签。
 */
function formatMemoryLayerLabel(layer: RecallExplanationBucket['items'][number]['layer']): string {
    if (layer === 'core_identity') {
        return '核心身份';
    }
    if (layer === 'semantic') {
        return '语义层';
    }
    if (layer === 'episodic') {
        return '情节层';
    }
    if (layer === 'working') {
        return '工作层';
    }
    return '未定层级';
}

/**
 * 功能：把解释条目转换为体验列表项。
 * @param bucketKey 当前分组键。
 * @param item 解释条目。
 * @returns 体验列表项。
 */
function buildExplanationListItem(
    bucketKey: RecallExplanationBucket['bucketKey'],
    item: RecallExplanationBucket['items'][number],
): ExperienceListItem {
    const metaParts: string[] = [];
    if (Number.isFinite(Number(item.score))) {
        metaParts.push(`${Math.round(Number(item.score) * 100)} 分`);
    }
    if (item.section) {
        metaParts.push(formatInjectionSectionLabel(String(item.section)));
    }
    if (item.layer) {
        metaParts.push(formatMemoryLayerLabel(item.layer));
    }
    if (item.tone) {
        metaParts.push(formatInjectedToneLabel(item.tone));
    }
    if (item.stage) {
        metaParts.push(formatDecayStageLabel(item.stage));
    }
    return {
        title: normalizeText(item.title, '未命名条目'),
        detail: item.reasonCodes.length > 0
            ? item.reasonCodes.map((code: string): string => formatInjectionReasonCode(code)).filter(Boolean).join(' / ')
            : bucketKey === 'rejected_candidates'
                ? '这条候选没有通过当前编码评分。'
                : bucketKey === 'conflict_suppressed'
                    ? '这条记忆因为冲突惩罚被压制。'
                    : '这条记忆进入了本轮注入结果。',
        meta: metaParts.join(' · ') || '暂无补充信息',
        tone: bucketKey === 'selected' ? 'accent' : bucketKey === 'conflict_suppressed' ? 'warning' : 'soft',
    };
}

/**
 * 功能：构建单个解释分组的 HTML。
 * @param bucket 解释分组。
 * @returns HTML 字符串。
 */
function buildInjectionReasonBucketMarkup(bucket: RecallExplanationBucket): string {
    return `
      <section class="stx-ui-explanation-group">
        <div class="stx-ui-explanation-group-head">
          <strong>${escapeHtml(bucket.label)}</strong>
          <span>${escapeHtml(String(bucket.items.length))} 条</span>
        </div>
        ${buildListMarkup(bucket.items.map((item) => buildExplanationListItem(bucket.bucketKey, item)), bucket.emptyText)}
      </section>
    `;
}

/**
 * 功能：构建最近一轮注入解释区域。
 * @param explanation 最近一轮解释快照。
 * @returns HTML 字符串。
 */
function buildInjectionReasonMarkup(explanation: LatestRecallExplanation | null): string {
    if (!explanation) {
        return `
          <div class="stx-ui-explanation-groups">
            <section class="stx-ui-explanation-group">
              <div class="stx-ui-explanation-group-head">
                <strong>命中的记忆</strong>
                <span>0 条</span>
              </div>
              <div class="stx-ui-empty-hint">最近一轮还没有解释快照。</div>
            </section>
            <section class="stx-ui-explanation-group">
              <div class="stx-ui-explanation-group-head">
                <strong>被冲突压制</strong>
                <span>0 条</span>
              </div>
              <div class="stx-ui-empty-hint">最近一轮还没有解释快照。</div>
            </section>
            <section class="stx-ui-explanation-group">
              <div class="stx-ui-explanation-group-head">
                <strong>编码拦下</strong>
                <span>0 条</span>
              </div>
              <div class="stx-ui-empty-hint">最近一轮还没有解释快照。</div>
            </section>
          </div>
        `;
    }
    return `
      <div class="stx-ui-explanation-groups">
        ${buildInjectionReasonBucketMarkup(explanation.selected)}
        ${buildInjectionReasonBucketMarkup(explanation.conflictSuppressed)}
        ${buildInjectionReasonBucketMarkup(explanation.rejectedCandidates)}
      </div>
    `;
}

/**
 * 功能：构建生成后动作摘要。
 * 参数：
 *   postDecision：最近一次生成后决策。
 * 返回：
 *   ExperienceListItem[]：动作摘要列表。
 */
function buildPostDecisionItems(postDecision: PostGenerationGateDecision | null): ExperienceListItem[] {
    if (!postDecision) {
        return [];
    }
    return [
        {
            title: '长期写入',
            detail: postDecision.shouldPersistLongTerm ? '本轮内容允许沉淀为更长期的记忆。' : '本轮内容更偏向短期处理。',
            meta: postDecision.shouldPersistLongTerm ? '已开启' : '未开启',
            tone: postDecision.shouldPersistLongTerm ? 'accent' : 'soft',
        },
        {
            title: '事实抽取',
            detail: postDecision.shouldExtractFacts ? '系统会继续提取稳定事实。' : '当前不会继续抽取稳定事实。',
            meta: postDecision.shouldExtractRelations ? '含关系抽取' : '无关系抽取',
            tone: postDecision.shouldExtractFacts ? 'success' : 'soft',
        },
        {
            title: '世界状态',
            detail: postDecision.shouldUpdateWorldState ? '本轮允许改写世界状态缓存。' : '本轮不更新世界状态。',
            meta: postDecision.shouldExtractWorldState ? '允许抽取世界状态' : '不抽取世界状态',
            tone: postDecision.shouldUpdateWorldState ? 'accent' : 'soft',
        },
        {
            title: '摘要重建',
            detail: postDecision.rebuildSummary ? '系统建议重建摘要，说明近期聊天结构变化较大。' : '当前不需要重建摘要。',
            meta: postDecision.shortTermOnly ? '偏短期' : '可长期沉淀',
            tone: postDecision.rebuildSummary ? 'warning' : 'soft',
        },
    ];
}

/**
 * 功能：构建迁移状态摘要列表。
 * @param snapshot 体验快照。
 * @returns 迁移状态列表。
 */
function buildMigrationStatusItems(snapshot: ExperienceSnapshot): ExperienceListItem[] {
    return [
        {
            title: '当前迁移阶段',
            detail: formatMigrationStage(snapshot.migrationStatus),
            meta: `Schema v${snapshot.migrationStatus.schemaVersion}`,
            tone: snapshot.migrationStatus.stage === 'db_preferred' ? 'success' : snapshot.migrationStatus.stage === 'dual_write' ? 'accent' : 'soft',
        },
        {
            title: '生命周期回填',
            detail: snapshot.migrationStatus.lifecycleBackfilled ? '已完成生命周期回填。' : '还没有完成生命周期回填。',
            meta: snapshot.migrationStatus.lifecycleBackfilled ? '已完成' : '待处理',
            tone: snapshot.migrationStatus.lifecycleBackfilled ? 'success' : 'warning',
        },
        {
            title: '镜像准备情况',
            detail: [
                `候选 ${snapshot.migrationStatus.candidateMirrorReady ? '已就绪' : '未就绪'}`,
                `召回 ${snapshot.migrationStatus.recallMirrorReady ? '已就绪' : '未就绪'}`,
                `关系 ${snapshot.migrationStatus.relationshipMirrorReady ? '已就绪' : '未就绪'}`,
            ].join(' / '),
            meta: snapshot.migrationStatus.pendingBackfillReasons.length > 0
                ? `待回填：${snapshot.migrationStatus.pendingBackfillReasons.join(' / ')}`
                : '当前没有待回填项',
            tone: snapshot.migrationStatus.pendingBackfillReasons.length > 0 ? 'warning' : 'success',
        },
        {
            title: '最近回填时间',
            detail: snapshot.migrationStatus.lastBackfillAt > 0
                ? formatTimestamp(snapshot.migrationStatus.lastBackfillAt)
                : '还没有执行过迁移回填。',
            meta: snapshot.migrationStatus.lastBackfillAt > 0
                ? formatRelativeTime(snapshot.migrationStatus.lastBackfillAt)
                : '尚未执行',
            tone: 'soft',
        },
        {
            title: '自动回填维护',
            detail: snapshot.migrationStatus.autoBackfillEnabled
                ? `已开启，单批 ${snapshot.migrationStatus.autoBackfillBatchSize} 条`
                : '当前已关闭自动回填维护。',
            meta: snapshot.migrationStatus.lastAutoBackfillAt > 0
                ? `最近一次：${formatRelativeTime(snapshot.migrationStatus.lastAutoBackfillAt)} / ${snapshot.migrationStatus.lastAutoBackfillReason || '自动维护'}`
                : '还没有执行过自动回填。',
            tone: snapshot.migrationStatus.autoBackfillEnabled ? 'accent' : 'soft',
        },
        {
            title: '最近一批处理量',
            detail: [
                `事实 ${snapshot.migrationStatus.lastBatchStats.lifecycleFacts}`,
                `摘要 ${snapshot.migrationStatus.lastBatchStats.lifecycleSummaries}`,
                `候选 ${snapshot.migrationStatus.lastBatchStats.candidateRows}`,
                `召回 ${snapshot.migrationStatus.lastBatchStats.recallRows}`,
                `关系 ${snapshot.migrationStatus.lastBatchStats.relationshipRows}`,
            ].join(' / '),
            meta: snapshot.migrationStatus.lastBatchStats.updatedAt > 0
                ? formatRelativeTime(snapshot.migrationStatus.lastBatchStats.updatedAt)
                : '还没有批次统计',
            tone: 'soft',
        },
    ];
}

/**
 * 功能：把调参值写回到输入框。
 * @param id 输入框 ID。
 * @param value 待写入的数值。
 * @returns 无返回值。
 */
function setNumberInputValue(id: string, value: number): void {
    const element: HTMLInputElement | null = document.getElementById(id) as HTMLInputElement | null;
    if (!element) {
        return;
    }
    element.value = String(value);
}

/**
 * 功能：渲染记忆调参面板。
 * @param ids 设置面板 ID 集。
 * @param snapshot 体验快照。
 * @returns 无返回值。
 */
function renderTuningPanel(ids: MemoryOSSettingsIds, snapshot: EditorExperienceSnapshot): void {
    setContainerHtml(
        ids.tuningMigrationStatusId,
        buildListMarkup(buildMigrationStatusItems(snapshot), '当前还没有迁移状态。'),
    );
    setNumberInputValue(ids.tuningCandidateAcceptThresholdBiasId, snapshot.tuningProfile.candidateAcceptThresholdBias);
    setNumberInputValue(ids.tuningRecallRelationshipBiasId, snapshot.tuningProfile.recallRelationshipBias);
    setNumberInputValue(ids.tuningRecallEmotionBiasId, snapshot.tuningProfile.recallEmotionBias);
    setNumberInputValue(ids.tuningRecallRecencyBiasId, snapshot.tuningProfile.recallRecencyBias);
    setNumberInputValue(ids.tuningRecallContinuityBiasId, snapshot.tuningProfile.recallContinuityBias);
    setNumberInputValue(ids.tuningDistortionProtectionBiasId, snapshot.tuningProfile.distortionProtectionBias);
    setNumberInputValue(ids.tuningCandidateRetentionLimitId, snapshot.tuningProfile.candidateRetentionLimit);
    setNumberInputValue(ids.tuningRecallRetentionLimitId, snapshot.tuningProfile.recallRetentionLimit);
}

/**
 * 功能：写入容器 HTML。
 * 参数：
 *   id：容器 ID。
 *   html：HTML 字符串。
 * 返回：
 *   void：无返回值。
 */
function setContainerHtml(id: string, html: string): void {
    const element: HTMLElement | null = document.getElementById(id);
    if (!element) {
        return;
    }
    element.innerHTML = html;
}

function hasStableSnapshotValue(value: SnapshotValue | null | undefined): boolean {
    const normalized = normalizeText(value?.value, '');
    return Boolean(normalized) && normalized !== '尚未稳定抽取';
}

function getStableSnapshotValues(values: SnapshotValue[]): SnapshotValue[] {
    return Array.isArray(values)
        ? values.filter((item: SnapshotValue): boolean => hasStableSnapshotValue(item))
        : [];
}

function summarizeSnapshotValues(values: SnapshotValue[], limit: number = 3): string {
    const stableValues = getStableSnapshotValues(values).slice(0, limit).map((item: SnapshotValue): string => item.value);
    return stableValues.length > 0 ? stableValues.join(' / ') : '尚未稳定抽取';
}

function formatSourceKindLabel(kind: SnapshotValue['sourceKinds'][number]): string {
    if (kind === 'fact') return '事实记录';
    if (kind === 'world_state') return '世界状态';
    if (kind === 'semantic_seed') return '初始设定';
    if (kind === 'group_memory') return '群聊记忆';
    if (kind === 'summary') return '摘要';
    if (kind === 'manual') return '手动整理';
    return '系统推导';
}

function formatSnapshotMeta(value: SnapshotValue | null | undefined): string {
    if (!value) {
        return '来源待补充';
    }
    const sourceText = Array.isArray(value.sourceKinds) && value.sourceKinds.length > 0
        ? value.sourceKinds.map((item: SnapshotValue['sourceKinds'][number]): string => formatSourceKindLabel(item)).join(' + ')
        : '系统推导';
    const timeText = Number(value.updatedAt ?? 0) > 0 ? formatRelativeTime(Number(value.updatedAt)) : '时间待补充';
    return `来自 ${sourceText} · 更新于 ${timeText}`;
}

function buildSummaryInfoLine(iconClassName: string, label: string, value: string): string {
    return `
      <div class="stx-ui-summary-line">
        <i class="${escapeHtml(iconClassName)} stx-ui-summary-line-icon" aria-hidden="true"></i>
        <span class="stx-ui-summary-line-label">${escapeHtml(label)}</span>
        <span class="stx-ui-summary-line-value">${escapeHtml(value)}</span>
      </div>
    `;
}

function buildSummaryInfoTile(iconClassName: string, label: string, value: string): string {
        return `
            <div class="stx-ui-summary-tile">
                <div class="stx-ui-summary-tile-head">
                    <i class="${escapeHtml(iconClassName)} stx-ui-summary-tile-icon" aria-hidden="true"></i>
                    <span class="stx-ui-summary-tile-label">${escapeHtml(label)}</span>
                </div>
                <div class="stx-ui-summary-tile-value">${escapeHtml(value)}</div>
            </div>
        `;
}

function buildSourceDetailButton(sourcePayload: string, compact: boolean = false): string {
    if (!sourcePayload) {
        return '';
    }
    if (compact) {
        return `<button type="button" class="stx-ui-btn secondary stx-ui-icon-action" data-stx-source-details="${escapeHtml(sourcePayload)}" aria-label="查看来源详情" data-tip="查看来源"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>`;
    }
    return `<button type="button" class="stx-ui-btn secondary" data-stx-source-details="${escapeHtml(sourcePayload)}">来源</button>`;
}

function buildSnapshotSourcePayload(value: SnapshotValue | null | undefined): string {
    if (!value) {
        return '';
    }
    const payload = {
        value: value.value,
        confidence: value.confidence,
        updatedAt: Number(value.updatedAt ?? 0) || null,
        sourceKinds: Array.isArray(value.sourceKinds) ? value.sourceKinds : [],
        sourceRefs: Array.isArray(value.sourceRefs) ? value.sourceRefs : [],
    };
    try {
        return encodeURIComponent(JSON.stringify(payload));
    } catch {
        return '';
    }
}

function collectSnapshotSourceCount(values: Array<SnapshotValue | null | undefined>): number {
    const refs = new Set<string>();
    let fallbackCount = 0;
    values.forEach((value: SnapshotValue | null | undefined): void => {
        if (!value) {
            return;
        }
        if (Array.isArray(value.sourceRefs) && value.sourceRefs.length > 0) {
            value.sourceRefs.forEach((ref): void => {
                refs.add([
                    String(ref.kind ?? ''),
                    String(ref.recordId ?? ''),
                    String(ref.path ?? ''),
                    String(ref.ts ?? ''),
                    String(ref.note ?? ''),
                ].join('|'));
            });
            return;
        }
        fallbackCount += Math.max(1, Array.isArray(value.sourceKinds) ? value.sourceKinds.length : 0);
    });
    return refs.size > 0 ? refs.size : fallbackCount;
}

function collectSnapshotConfidence(values: Array<SnapshotValue | null | undefined>): number {
    const scores = values
        .filter((value: SnapshotValue | null | undefined): value is SnapshotValue => Boolean(value) && Number.isFinite(value!.confidence))
        .map((value: SnapshotValue): number => Number(value.confidence));
    if (scores.length === 0) {
        return 0;
    }
    return Math.round((scores.reduce((total: number, score: number): number => total + score, 0) / scores.length) * 100);
}

function buildEditorActionButton(action: string, label: string, tone: 'primary' | 'secondary' = 'secondary'): string {
    return `<button type="button" class="stx-ui-btn${tone === 'secondary' ? ' secondary' : ''}" data-stx-editor-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function buildCharacterRoleButtons(chatKey: string, actorKey: string, currentRole: CharacterRoleMark): string {
    return (['primary', 'secondary', 'pending'] as CharacterRoleMark[]).map((role: CharacterRoleMark): string => {
        const tone = currentRole === role ? 'primary' : 'secondary';
        return `<button type="button" class="stx-ui-btn${tone === 'secondary' ? ' secondary' : ''}" data-stx-character-role="${role}" data-stx-chat-key="${escapeHtml(chatKey)}" data-stx-actor-key="${escapeHtml(actorKey)}" aria-pressed="${currentRole === role ? 'true' : 'false'}">${escapeHtml(CHARACTER_ROLE_LABELS[role])}</button>`;
    }).join('');
}

function formatSuggestedActionLabel(action: string): string {
    switch (action) {
        case 'rebuild_chat_view':
            return '重建聊天结构视图';
        case 'refresh_seed':
            return '刷新初始设定';
        case 'normalize_rows':
            return '检查结构化行';
        case 'review_candidates':
            return '查看候选来源';
        default:
            return normalizeText(action, '人工检查');
    }
}

function buildSuggestedActionButtons(actions: string[]): string {
    const uniqueActions = Array.from(new Set(actions.filter(Boolean)));
    return uniqueActions.map((action: string): string => {
        if (action === 'rebuild_chat_view') {
            return buildEditorActionButton('rebuild-chat-view', formatSuggestedActionLabel(action));
        }
        if (action === 'refresh_seed') {
            return buildEditorActionButton('refresh-seed', formatSuggestedActionLabel(action));
        }
        if (action === 'normalize_rows') {
            return buildEditorActionButton('view-hidden-rows', '打开记录编辑器');
        }
        if (action === 'review_candidates') {
            return buildEditorActionButton('view-candidate-sources', formatSuggestedActionLabel(action));
        }
        return '';
    }).join('');
}

function buildCharacterSourcePayload(item: CharacterSnapshot): string {
    return buildSnapshotSourcePayload(item.identities[0] || item.currentLocation || item.aliases[0] || item.relationshipAnchors[0]);
}

function buildSummaryCalloutMarkup(options: {
    eyebrow: string;
    title: string;
    copy: string;
    foot?: string;
    meta?: string;
    empty?: boolean;
    iconClassName?: string;
    copyHtml?: string;
    footHtml?: string;
        className?: string;
}): string {
    return `
            <div class="stx-ui-summary-callout${options.empty ? ' is-empty-state' : ''}${options.className ? ` ${escapeHtml(options.className)}` : ''}">
        <div class="stx-ui-summary-callout-head">
          <div>
            <div class="stx-ui-summary-eyebrow">${escapeHtml(options.eyebrow)}</div>
                        <div class="stx-ui-summary-title-wrap">
                            ${options.iconClassName ? `<i class="${escapeHtml(options.iconClassName)} stx-ui-summary-title-icon" aria-hidden="true"></i>` : ''}
                            <div class="stx-ui-summary-title">${escapeHtml(options.title)}</div>
                        </div>
          </div>
          ${options.meta ? `<div class="stx-ui-summary-meta">${escapeHtml(options.meta)}</div>` : ''}
        </div>
        <div class="stx-ui-summary-copy${options.copyHtml ? ' is-rich' : ''}">${options.copyHtml ?? escapeHtml(options.copy)}</div>
        ${(options.foot || options.footHtml) ? `<div class="stx-ui-summary-foot${options.footHtml ? ' is-rich' : ''}">${options.footHtml ?? escapeHtml(options.foot ?? '')}</div>` : ''}
      </div>
    `;
}

function buildOverviewMarkup(canon: CanonSnapshot): string {
    const worldTitle = normalizeText(canon.world.templateId, '未绑定世界模板');
    const currentLocation = hasStableSnapshotValue(canon.world.currentLocation) ? canon.world.currentLocation!.value : '尚未稳定抽取';
    const overviewText = canon.world.overview?.value || '设定总览仍在整理中，当前会先展示地点、规则和成员信息。';
    const summaryCopyHtml = `
      <div class="stx-ui-summary-caption">${escapeHtml(overviewText)}</div>
      <div class="stx-ui-summary-tile-grid">
        ${[
            buildSummaryInfoTile('fa-solid fa-location-crosshairs', '主要地点', currentLocation),
            buildSummaryInfoTile('fa-solid fa-scale-balanced', '规则重点', summarizeSnapshotValues(canon.world.rules, 2)),
            buildSummaryInfoTile('fa-solid fa-shield-halved', '硬约束', summarizeSnapshotValues(canon.world.hardConstraints, 2)),
            buildSummaryInfoTile('fa-solid fa-book-open-reader', '初始化设定书', summarizeSnapshotValues(canon.world.activeLorebooks, 2)),
            buildSummaryInfoTile('fa-solid fa-people-group', '群组成员', summarizeSnapshotValues(canon.world.groupMembers, 3)),
            buildSummaryInfoTile('fa-solid fa-clock-rotate-left', '最近刷新', formatRelativeTime(canon.generatedAt)),
        ].join('')}
      </div>
    `;
    const detailItems: ExperienceListItem[] = [
        {
            title: '当前地点',
            detail: currentLocation,
            meta: formatSnapshotMeta(canon.world.currentLocation),
            tone: 'accent',
            iconClassName: 'fa-solid fa-location-dot',
            sourcePayload: buildSnapshotSourcePayload(canon.world.currentLocation),
        },
        {
            title: '世界规则',
            detail: summarizeSnapshotValues(canon.world.rules, 3),
            meta: formatSnapshotMeta(getStableSnapshotValues(canon.world.rules)[0]),
            tone: 'soft',
            iconClassName: 'fa-solid fa-scale-balanced',
            sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.world.rules)[0]),
        },
        {
            title: '硬约束',
            detail: summarizeSnapshotValues(canon.world.hardConstraints, 3),
            meta: formatSnapshotMeta(getStableSnapshotValues(canon.world.hardConstraints)[0]),
            tone: getStableSnapshotValues(canon.world.hardConstraints).length > 0 ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-shield-halved',
            sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.world.hardConstraints)[0]),
        },
        {
            title: '初始化设定书',
            detail: summarizeSnapshotValues(canon.world.activeLorebooks, 3),
            meta: `${formatSnapshotMeta(getStableSnapshotValues(canon.world.activeLorebooks)[0])} · ${getStableSnapshotValues(canon.world.activeLorebooks).length} 个来源`,
            tone: 'soft',
            iconClassName: 'fa-solid fa-book-open',
            sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.world.activeLorebooks)[0]),
        },
        {
            title: '群组成员',
            detail: summarizeSnapshotValues(canon.world.groupMembers, 4),
            meta: `${formatSnapshotMeta(getStableSnapshotValues(canon.world.groupMembers)[0])} · ${getStableSnapshotValues(canon.world.groupMembers).length} 个成员`,
            tone: 'soft',
            iconClassName: 'fa-solid fa-users',
            sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.world.groupMembers)[0]),
        },
    ];
    return buildSummaryCalloutMarkup({
        eyebrow: '设定总览',
        title: worldTitle,
        copy: overviewText,
        copyHtml: summaryCopyHtml,
        meta: canon.health.maintenanceLabels[0] || '当前状态稳定',
        iconClassName: 'fa-solid fa-compass',
        className: 'is-overview-hero',
    }) + buildListMarkup(detailItems, '当前还没有稳定的世界概览条目。', {
        listClassName: 'is-overview-grid',
        entryClassName: 'is-overview-tile',
        compactSourceButton: true,
    });
}

function buildCharacterOverviewItems(canon: CanonSnapshot): ExperienceListItem[] {
    return canon.characters.slice(0, 8).map((item: CharacterSnapshot, index: number): ExperienceListItem => {
        const roleMark = resolveCharacterRoleMark(canon.chatKey, item, index);
        const sourceCount = collectSnapshotSourceCount([...item.identities, ...item.aliases, ...item.relationshipAnchors, item.currentLocation]);
        const confidence = collectSnapshotConfidence([...item.identities, ...item.aliases, ...item.relationshipAnchors, item.currentLocation]);
        const detailHtml = `
            <div>${escapeHtml([
                summarizeSnapshotValues(item.identities, 2),
                                item.relationshipAnchors.length > 0 ? `当前关系：${summarizeSnapshotValues(item.relationshipAnchors, 1)}` : '',
                                item.currentLocation?.value ? `所在地点：${item.currentLocation.value}` : '',
            ].filter(Boolean).join(' / ') || '当前还没有稳定角色摘要。')}</div>
            <details style="margin-top: 8px;">
                            <summary style="cursor: pointer;">展开更多角色信息</summary>
              <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                <div>常用称呼：${escapeHtml(summarizeSnapshotValues(item.aliases, 3))}</div>
                                <div>身份说明：${escapeHtml(summarizeSnapshotValues(item.identities, 3))}</div>
                                <div>关系线索：${escapeHtml(summarizeSnapshotValues(item.relationshipAnchors, 2))}</div>
                                <div>当前地点：${escapeHtml(item.currentLocation?.value || '尚未稳定抽取')}</div>
                <div>最近出现场景：${escapeHtml(canon.scene.currentScene?.value || '尚未稳定抽取')}</div>
                                <div>可信度：${confidence}% · 来源 ${sourceCount} 条</div>
              </div>
            </details>
        `;
        return {
            title: item.displayName,
            detail: '',
            detailHtml,
            meta: [
                CHARACTER_ROLE_LABELS[roleMark],
                item.lastActiveAt ? formatRelativeTime(item.lastActiveAt) : '最近未活跃',
                sourceCount > 0 ? `来源 ${sourceCount} 条` : '来源待补充',
            ].join(' · '),
            tone: roleMark === 'primary' ? 'accent' : (roleMark === 'secondary' ? 'soft' : 'warning'),
            iconClassName: roleMark === 'primary' ? 'fa-solid fa-crown' : roleMark === 'secondary' ? 'fa-solid fa-user' : 'fa-solid fa-circle-question',
            sourcePayload: buildCharacterSourcePayload(item),
            actionsHtml: [
                buildEditorActionButton('view-hidden-rows', '打开记录编辑器'),
                buildCharacterRoleButtons(canon.chatKey, item.actorKey, roleMark),
            ].join(''),
        };
    });
}

function buildSceneItems(canon: CanonSnapshot): ExperienceListItem[] {
    const items: ExperienceListItem[] = [];
    items.push({
        title: '当前场景',
        detail: canon.scene.currentScene?.value || '尚未稳定抽取',
        meta: formatSnapshotMeta(canon.scene.currentScene),
        tone: 'accent',
        iconClassName: 'fa-solid fa-map-location-dot',
        sourcePayload: buildSnapshotSourcePayload(canon.scene.currentScene),
        actionsHtml: buildEditorActionButton('refresh-canon', '刷新场景聚合'),
    });
    items.push({
        title: '当前冲突',
        detail: canon.scene.currentConflict?.value || '暂时没有明确冲突',
        meta: formatSnapshotMeta(canon.scene.currentConflict),
        tone: canon.scene.currentConflict?.value ? 'warning' : 'soft',
        iconClassName: 'fa-solid fa-bolt',
        sourcePayload: buildSnapshotSourcePayload(canon.scene.currentConflict),
    });
    items.push({
        title: '待处理事件',
        detail: summarizeSnapshotValues(canon.scene.pendingEvents, 3),
        meta: getStableSnapshotValues(canon.scene.pendingEvents).length > 0 ? `${getStableSnapshotValues(canon.scene.pendingEvents).length} 条候选` : '暂无待处理事件',
        tone: 'soft',
        iconClassName: 'fa-solid fa-list-check',
        sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.scene.pendingEvents)[0]),
    });
    items.push({
        title: '当前参与者',
        detail: summarizeSnapshotValues(canon.scene.participants, 4),
        meta: getStableSnapshotValues(canon.scene.participants).length > 0 ? `${getStableSnapshotValues(canon.scene.participants).length} 个参与者` : '暂无参与者',
        tone: 'soft',
        iconClassName: 'fa-solid fa-users',
        sourcePayload: buildSnapshotSourcePayload(getStableSnapshotValues(canon.scene.participants)[0]),
    });
    return items;
}

function buildChatContextItems(canon: CanonSnapshot): ExperienceListItem[] {
    return [
        {
            title: '当前有效消息',
            detail: `${canon.chat.visibleMessageCount} 条`,
            meta: canon.chat.activeMessageIds.length > 0 ? `当前追踪 ${canon.chat.activeMessageIds.length} 条活动消息` : '当前没有活动消息标记',
            tone: 'accent',
            iconClassName: 'fa-solid fa-comments',
        },
        {
            title: '最近编辑次数',
            detail: `${canon.chat.editedRevisionCount} 次`,
            meta: canon.chat.lastMutationAt ? `最近变动 ${formatRelativeTime(canon.chat.lastMutationAt)}` : '暂无变动时间',
            tone: canon.chat.editedRevisionCount > 0 ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-pen-to-square',
        },
        {
            title: '最近删除次数',
            detail: `${canon.chat.deletedTurnCount} 次`,
            meta: canon.chat.invalidatedMessageCount > 0 ? `失效消息 ${canon.chat.invalidatedMessageCount} 条` : '当前无失效消息',
            tone: canon.chat.deletedTurnCount > 0 ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-trash-can',
        },
        {
            title: '分支根数量',
            detail: `${canon.chat.branchRootCount} 个`,
            meta: canon.chat.mutationKinds.length > 0 ? formatMutationKindSummary(canon.chat.mutationKinds) : '最近没有明显结构变化',
            tone: canon.chat.branchRootCount > 0 ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-code-branch',
        },
        {
            title: '结构视图维护',
            detail: canon.chat.rebuildRecommended ? '建议立即重建聊天结构视图。' : '当前无需强制重建结构视图。',
            meta: canon.chat.rebuildRecommended ? '建议动作已就绪' : '当前结构稳定',
            tone: canon.chat.rebuildRecommended ? 'warning' : 'success',
            iconClassName: 'fa-solid fa-rotate',
            actionsHtml: buildEditorActionButton('rebuild-chat-view', '重建结构视图'),
        },
    ];
}

function buildHealthItems(health: EditorHealthSnapshot): ExperienceListItem[] {
    const suggestedActionButtons = buildSuggestedActionButtons(health.suggestedActions);
    const issueItems = health.issues.slice(0, 4).map((issue): ExperienceListItem => ({
        title: issue.label,
        detail: issue.detail,
        meta: issue.actionLabel || '建议查看诊断页',
        tone: issue.severity === 'critical' || issue.severity === 'warning' ? 'warning' : 'soft',
        iconClassName: issue.severity === 'critical' || issue.severity === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info',
    }));
    const headItems: ExperienceListItem[] = [
        {
            title: '孤儿事实',
            detail: `${Number(health.orphanFactsCount ?? 0)} 条`,
            meta: health.hasDraftRevision ? '当前存在结构草稿修订' : '当前没有结构草稿修订',
            tone: Number(health.orphanFactsCount ?? 0) > 0 ? 'warning' : 'success',
            iconClassName: 'fa-solid fa-link-slash',
        },
        {
            title: '一致性风险',
            detail: `${Math.round(Number(health.duplicateEntityRisk ?? 0) * 100)}%`,
            meta: health.maintenanceLabels.length > 0 ? health.maintenanceLabels.join(' / ') : '暂无额外风险标签',
            tone: Number(health.duplicateEntityRisk ?? 0) >= 0.25 ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-shield-exclamation',
        },
        {
            title: '建议动作',
            detail: health.suggestedActions.length > 0 ? health.suggestedActions.map(formatSuggestedActionLabel).join(' / ') : '当前无需额外修复动作',
            meta: '展开或点击按钮即可执行对应维护入口',
            tone: health.suggestedActions.length > 0 ? 'accent' : 'soft',
            iconClassName: 'fa-solid fa-screwdriver-wrench',
            actionsHtml: `${suggestedActionButtons}${buildEditorActionButton('open-diagnostics', '查看诊断')}`,
        },
    ];
    return headItems.concat(issueItems).slice(0, 6);
}

function deriveLocationType(name: string): string {
    if (/城|市|都|镇|村/.test(name)) return '城市';
    if (/学院|学校|大学|研究所/.test(name)) return '机构';
    if (/基地|要塞|据点|营地/.test(name)) return '据点';
    if (/区域|大陆|王国|帝国|联邦/.test(name)) return '区域';
    return '地点';
}

function buildLocationItems(canon: CanonSnapshot): ExperienceListItem[] {
    const stableLocations = getStableSnapshotValues(canon.world.locations);
    return stableLocations.slice(0, 8).map((item: SnapshotValue): ExperienceListItem => {
        const relatedCharacters = canon.characters
            .filter((character: CharacterSnapshot): boolean => normalizeText(character.currentLocation?.value, '') === item.value)
            .map((character: CharacterSnapshot): string => character.displayName)
            .slice(0, 3);
        const relatedEvents = getStableSnapshotValues(canon.scene.pendingEvents)
            .filter((eventItem: SnapshotValue): boolean => eventItem.value.includes(item.value))
            .map((eventItem: SnapshotValue): string => eventItem.value)
            .slice(0, 2);
        const sourceCount = collectSnapshotSourceCount([item]);
        return {
            title: item.value,
            detail: [
                `类型：${deriveLocationType(item.value)}`,
                `所属模板：${normalizeText(canon.world.templateId, '未绑定世界模板')}`,
                relatedCharacters.length > 0 ? `相关角色：${relatedCharacters.join(' / ')}` : '',
                relatedEvents.length > 0 ? `相关事件：${relatedEvents.join(' / ')}` : '',
            ].filter(Boolean).join(' / ') || '当前还没有更多稳定地点信息。',
            meta: [formatSnapshotMeta(item), `${relatedCharacters.length} 名相关角色`, `来源 ${sourceCount} 条`].join(' · '),
            tone: relatedCharacters.length > 0 ? 'accent' : 'soft',
            iconClassName: 'fa-solid fa-location-crosshairs',
            sourcePayload: buildSnapshotSourcePayload(item),
            actionsHtml: buildEditorActionButton('view-hidden-rows', '打开记录编辑器'),
        };
    });
}

function renderRolePanel(ids: MemoryOSSettingsIds, canon: CanonSnapshot): void {
    setContainerHtml(ids.roleOverviewMetaId, buildOverviewMarkup(canon));
    setContainerHtml(ids.rolePersonaBadgesId, buildListMarkup(buildCharacterOverviewItems(canon), '当前还没有稳定角色概览。'));
    setContainerHtml(ids.rolePrimaryFactsId, buildListMarkup(buildSceneItems(canon), '当前还没有稳定场景摘要。'));
    setContainerHtml(ids.roleRecentMemoryId, buildListMarkup(buildChatContextItems(canon), '当前还没有稳定聊天上下文。'));
    setContainerHtml(ids.roleBlurMemoryId, buildListMarkup(buildHealthItems(canon.health), '当前没有明显的健康风险。'));
}

function renderRecentPanel(ids: MemoryOSSettingsIds, canon: CanonSnapshot): void {
    setContainerHtml(
        ids.recentLifecycleId,
        buildSummaryCalloutMarkup({
            eyebrow: '角色与地点',
            title: `${canon.characters.length} 个角色 / ${getStableSnapshotValues(canon.world.locations).length} 个地点`,
            copy: '这页会把角色、地点和当前关系先整理成便于浏览的摘要。',
            copyHtml: [
                buildSummaryInfoLine('fa-solid fa-user-group', '角色数量', `${canon.characters.length} 个角色已进入总览`),
                buildSummaryInfoLine('fa-solid fa-location-crosshairs', '地点数量', `${getStableSnapshotValues(canon.world.locations).length} 个地点已被整理`),
                buildSummaryInfoLine('fa-solid fa-people-arrows', '当前关系', canon.characters.length > 0 ? '可从角色卡和地点卡快速查看彼此关系。' : '当前还没有足够角色信息。'),
            ].join(''),
            footHtml: [
                buildSummaryInfoLine('fa-solid fa-layer-group', '所属模板', normalizeText(canon.world.templateId, '未绑定世界模板')),
                buildSummaryInfoLine('fa-solid fa-clock-rotate-left', '最近刷新', formatRelativeTime(canon.generatedAt)),
            ].join(''),
            iconClassName: 'fa-solid fa-map',
        }),
    );
    setContainerHtml(ids.recentEventsId, buildListMarkup(buildCharacterOverviewItems(canon), '当前还没有可展示的角色卡。'));
    setContainerHtml(ids.recentSummariesId, buildListMarkup(buildLocationItems(canon), '当前还没有稳定地点，地点信息可能仍停留在初始设定或世界状态里。'));
}

function renderRelationPanel(ids: MemoryOSSettingsIds, canon: CanonSnapshot): void {
    setContainerHtml(
        ids.relationOverviewId,
        buildSummaryCalloutMarkup({
            eyebrow: '关系与结构状态',
            title: normalizeText(canon.world.templateId, '未绑定世界模板'),
            copy: '这里先解释当前稳定结构、隐藏行与候选层的状态；需要逐行维护时请从记录编辑器进入。',
            copyHtml: [
                buildSummaryInfoLine('fa-solid fa-brain', '事实行', `${canon.health.dataLayers.factsCount} 条已整理事实`),
                buildSummaryInfoLine('fa-solid fa-signature', '别名映射', `${canon.health.dataLayers.aliasCount} 条别名映射`),
                buildSummaryInfoLine('fa-solid fa-route', '重定向', `${canon.health.dataLayers.redirectCount} 条重定向`),
                buildSummaryInfoLine('fa-solid fa-box-archive', '隐藏墓碑', `${canon.health.dataLayers.tombstoneCount} 条隐藏墓碑`),
            ].join(''),
            footHtml: [
                buildSummaryInfoLine('fa-solid fa-pen-ruler', '维护入口', '逐行编辑与来源排查请从记录编辑器进入。'),
                buildSummaryInfoLine('fa-solid fa-magnifying-glass', '空表说明', '如果表里暂时为空，下面会继续解释数据可能停留在哪一层。'),
            ].join(''),
            meta: canon.health.maintenanceLabels[0] || '维护页已就绪',
            iconClassName: 'fa-solid fa-table-cells-large',
        }),
    );
    setContainerHtml(
        ids.relationLanesId,
        buildListMarkup([
            {
                title: '维护边界',
                detail: '当前阶段继续复用现有逻辑行接口，只维护已经稳定落库的事实行，不会把系统推导结果自动写回事实层。',
                meta: '保持事实写入协议不变',
                tone: 'accent',
                iconClassName: 'fa-solid fa-ruler-combined',
            },
            {
                title: '空表解释',
                detail: '当前表暂时没有稳定结构化行时，数据也可能还停留在初始设定、世界状态、群聊记忆或已隐藏逻辑行里。',
                meta: '先解释，再维护',
                tone: 'soft',
                iconClassName: 'fa-solid fa-circle-info',
            },
        ], '当前没有额外的维护说明。'),
    );
    setContainerHtml(
        ids.relationStateId,
        buildListMarkup(canon.health.issues.slice(0, 4).map((issue) => ({
            title: issue.label,
            detail: issue.detail,
            meta: issue.actionLabel || '查看诊断页',
            tone: issue.severity === 'critical' || issue.severity === 'warning' ? 'warning' : 'soft',
            iconClassName: issue.severity === 'critical' || issue.severity === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info',
        })), '当前没有明显的逻辑表风险。'),
    );
}

function renderInjectionPanel(ids: MemoryOSSettingsIds, canon: CanonSnapshot): void {
    setContainerHtml(
        ids.injectionOverviewId,
        buildListMarkup([
            {
                title: '事实层',
                detail: `${canon.health.dataLayers.factsCount} 条`,
                meta: canon.health.dataLayers.activeTemplateId || '未绑定世界模板',
                tone: 'accent',
                iconClassName: 'fa-solid fa-brain',
            },
            {
                title: '世界状态层',
                detail: `${canon.health.dataLayers.worldStateCount} 条`,
                meta: canon.health.dataLayers.hasSemanticSeed ? '初始设定已存在' : '初始设定缺失',
                tone: canon.health.dataLayers.hasSemanticSeed ? 'soft' : 'warning',
                iconClassName: 'fa-solid fa-globe',
            },
            {
                title: '摘要与事件层',
                detail: `${canon.health.dataLayers.summaryCount} / ${canon.health.dataLayers.eventCount}`,
                meta: canon.health.dataLayers.hasLogicalChatView ? '聊天结构视图已存在' : '聊天结构视图缺失',
                tone: canon.health.dataLayers.hasLogicalChatView ? 'soft' : 'warning',
                iconClassName: 'fa-solid fa-layer-group',
            },
            {
                title: '群聊记忆层',
                detail: canon.health.dataLayers.hasGroupMemory ? '已存在' : '缺失',
                meta: canon.health.dataLayers.hasDraftRevision ? '当前存在结构草稿' : '当前没有结构草稿',
                tone: canon.health.dataLayers.hasDraftRevision ? 'warning' : 'soft',
                iconClassName: 'fa-solid fa-users-viewfinder',
            },
            {
                title: '别名与重定向层',
                detail: `${canon.health.dataLayers.aliasCount} / ${canon.health.dataLayers.redirectCount} / ${canon.health.dataLayers.tombstoneCount}`,
                meta: '结构维护层状态',
                tone: (canon.health.dataLayers.redirectCount + canon.health.dataLayers.tombstoneCount) > 0 ? 'warning' : 'soft',
                iconClassName: 'fa-solid fa-route',
            },
        ], '当前还没有可展示的数据分层诊断。'),
    );
    setContainerHtml(ids.injectionSectionsId, buildListMarkup(canon.health.issues.map((issue) => ({
        title: issue.label,
        detail: issue.detail,
        meta: issue.actionLabel || '建议人工检查',
        tone: issue.severity === 'critical' || issue.severity === 'warning' ? 'warning' : 'soft',
        iconClassName: issue.severity === 'critical' || issue.severity === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info',
    })), '当前没有问题列表。'));
    setContainerHtml(
        ids.injectionPostId,
        `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div class="stx-ui-actions">
                            <button data-stx-editor-action="rebuild-chat-view" type="button" class="stx-ui-btn secondary">重建结构视图</button>
                            <button data-stx-editor-action="refresh-seed" type="button" class="stx-ui-btn secondary">刷新初始设定</button>
                            <button data-stx-editor-action="refresh-canon" type="button" class="stx-ui-btn secondary">刷新总览快照</button>
                        </div>
                        <div class="stx-ui-actions">
                            <button data-stx-editor-action="repair-normalize-aliases" type="button" class="stx-ui-btn secondary">规范别名</button>
                            <button data-stx-editor-action="repair-compact-tombstones" type="button" class="stx-ui-btn secondary">整理隐藏墓碑</button>
                            <button data-stx-editor-action="repair-rebuild-candidates" type="button" class="stx-ui-btn secondary">重建候选</button>
                        </div>
                        <div class="stx-ui-actions">
                            <button data-stx-editor-action="view-candidate-sources" type="button" class="stx-ui-btn secondary">查看候选来源</button>
                            <button data-stx-editor-action="view-world-state-candidates" type="button" class="stx-ui-btn secondary">查看世界状态候选</button>
                            <button data-stx-editor-action="view-hidden-rows" type="button" class="stx-ui-btn secondary">查看已隐藏行</button>
                            <button data-stx-editor-action="view-hidden-rows" type="button" class="stx-ui-btn secondary">打开记录编辑器</button>
                        </div>
                        <div class="stx-ui-empty-hint">这些整理动作会优先作用于当前已选逻辑表；如果还没选表，系统会自动挑选最需要处理的一张。</div>
          </div>
        `,
    );
    setContainerHtml(
        ids.injectionReasonId,
        buildSummaryCalloutMarkup({
            eyebrow: '诊断说明',
            title: canon.health.maintenanceLabels[0] || '当前没有明显阻塞',
            copy: canon.health.issues[0]?.detail || '如果主页面看起来很空，优先检查初始设定、聊天结构视图和世界状态是否都齐全。',
            copyHtml: [
                buildSummaryInfoLine('fa-solid fa-heart-pulse', '当前判断', canon.health.issues[0]?.detail || '当前没有明显阻塞，整体状态较稳定。'),
                buildSummaryInfoLine('fa-solid fa-database', '数据检查', '优先确认初始设定、聊天结构视图和世界状态是否都已准备好。'),
            ].join(''),
            footHtml: [
                buildSummaryInfoLine('fa-solid fa-screwdriver-wrench', '建议动作', canon.health.suggestedActions.length > 0 ? canon.health.suggestedActions.map(formatSuggestedActionLabel).join(' / ') : '当前没有额外建议动作。'),
                buildSummaryInfoLine('fa-solid fa-clock-rotate-left', '生成时间', formatRelativeTime(canon.generatedAt)),
            ].join(''),
            meta: `生成于 ${formatRelativeTime(canon.generatedAt)}`,
            iconClassName: 'fa-solid fa-stethoscope',
        }),
    );
}

function renderEmptyState(ids: MemoryOSSettingsIds): void {
    const emptyMarkup: string = buildSummaryCalloutMarkup({
        eyebrow: '记录编辑器',
        title: '当前还没有绑定聊天',
        copy: '切换到一个可记录的聊天后，这里会显示设定总览、角色与地点、逻辑表维护和诊断信息。',
        empty: true,
    });
    setContainerHtml(ids.roleOverviewMetaId, emptyMarkup);
    setContainerHtml(ids.rolePersonaBadgesId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示角色概览。</div>');
    setContainerHtml(ids.rolePrimaryFactsId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示当前场景。</div>');
    setContainerHtml(ids.roleRecentMemoryId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示聊天上下文。</div>');
    setContainerHtml(ids.roleBlurMemoryId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示健康度和建议动作。</div>');
    setContainerHtml(ids.recentLifecycleId, emptyMarkup);
    setContainerHtml(ids.recentEventsId, '<div class="stx-ui-empty-hint">暂无角色卡。</div>');
    setContainerHtml(ids.recentSummariesId, '<div class="stx-ui-empty-hint">暂无地点卡。</div>');
    setContainerHtml(ids.relationOverviewId, emptyMarkup);
    setContainerHtml(ids.relationLanesId, '<div class="stx-ui-empty-hint">暂无逻辑表说明。</div>');
    setContainerHtml(ids.relationStateId, '<div class="stx-ui-empty-hint">暂无维护问题。</div>');
    setContainerHtml(ids.injectionOverviewId, emptyMarkup);
    setContainerHtml(ids.injectionSectionsId, '<div class="stx-ui-empty-hint">暂无问题列表。</div>');
    setContainerHtml(ids.injectionReasonId, '<div class="stx-ui-empty-hint">暂无诊断说明。</div>');
    setContainerHtml(ids.injectionPostId, '<div class="stx-ui-empty-hint">暂无修复动作。</div>');
    setContainerHtml(ids.tuningMigrationStatusId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示迁移状态。</div>');
}

function renderLoadErrorState(ids: MemoryOSSettingsIds, message: string): void {
    const errorMarkup: string = buildSummaryCalloutMarkup({
        eyebrow: '记录编辑器',
        title: 'Phase 1 面板加载失败',
        copy: message,
        empty: true,
    });
    setContainerHtml(ids.roleOverviewMetaId, errorMarkup);
    setContainerHtml(ids.rolePersonaBadgesId, '<div class="stx-ui-empty-hint">角色概览暂时不可用。</div>');
    setContainerHtml(ids.rolePrimaryFactsId, '<div class="stx-ui-empty-hint">场景卡暂时不可用。</div>');
    setContainerHtml(ids.roleRecentMemoryId, '<div class="stx-ui-empty-hint">聊天上下文卡暂时不可用。</div>');
    setContainerHtml(ids.roleBlurMemoryId, '<div class="stx-ui-empty-hint">健康度卡暂时不可用。</div>');
    setContainerHtml(ids.recentLifecycleId, errorMarkup);
    setContainerHtml(ids.recentEventsId, '<div class="stx-ui-empty-hint">角色与地点页暂时不可用。</div>');
    setContainerHtml(ids.recentSummariesId, '<div class="stx-ui-empty-hint">角色与地点页暂时不可用。</div>');
    setContainerHtml(ids.relationOverviewId, errorMarkup);
    setContainerHtml(ids.relationLanesId, '<div class="stx-ui-empty-hint">逻辑表维护页暂时不可用。</div>');
    setContainerHtml(ids.relationStateId, '<div class="stx-ui-empty-hint">逻辑表维护页暂时不可用。</div>');
    setContainerHtml(ids.injectionOverviewId, errorMarkup);
    setContainerHtml(ids.injectionSectionsId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
    setContainerHtml(ids.injectionReasonId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
    setContainerHtml(ids.injectionPostId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
    setContainerHtml(ids.tuningMigrationStatusId, '<div class="stx-ui-empty-hint">迁移状态暂时无法读取。</div>');
}

/**
 * 功能：刷新设置页中的体验面板。
 * 参数：
 *   ids：设置面板 ID 集。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function renderSettingsExperience(ids: MemoryOSSettingsIds): Promise<void> {
    const memory: MemorySDK | null = getActiveMemorySdk();
    if (!memory) {
        renderEmptyState(ids);
        return;
    }
    try {
        const experienceSnapshot: EditorExperienceSnapshot = await memory.editor.getExperienceSnapshot();
        const canonSnapshot: CanonSnapshot = experienceSnapshot.canon;
        renderRolePanel(ids, canonSnapshot);
        renderRecentPanel(ids, canonSnapshot);
        renderRelationPanel(ids, canonSnapshot);
        renderInjectionPanel(ids, canonSnapshot);
        renderTuningPanel(ids, experienceSnapshot);
    } catch (error) {
        const message: string = normalizeText(error instanceof Error ? error.message : error, '未知错误');
        renderLoadErrorState(ids, message);
    }
}
