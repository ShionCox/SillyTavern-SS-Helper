import type { CanonSnapshot, CharacterSnapshot, ChatLifecycleState, EditorExperienceSnapshot, EditorHealthSnapshot, LatestRecallExplanation, EffectiveSummarySettings, MemoryMutationPlanSnapshot, MemorySDK, MemoryProcessingDecision, LongSummaryCooldownState, RecallExplanationBucket, SnapshotValue, SummaryLongTrigger, SummaryRecordFocus, SummarySettingsSource } from '../../../SDK/stx';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import { buildRecallUiSummary, formatRecallUiReasonCode } from './recallUiSummary';

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

function formatSummarySourceLabel(source: SummarySettingsSource | null | undefined): string {
        if (source === 'chat_override') {
                return '当前聊天覆盖';
        }
        if (source === 'global_setting') {
                return '全局默认';
        }
        if (source === 'scenario_preset') {
                return '场景预设';
        }
        if (source === 'memory_mode_preset') {
                return '记忆模式预设';
        }
        return '系统默认';
}

/**
 * 功能：格式化记忆强度标签。
 * 参数：
 *   profile：当前聊天画像。
 * 返回：
 *   string：强度标签。
 */
/**
 * 功能：构建包含角色边界与向量索引状态的注入总览卡片。
 * @param snapshot 体验快照。
 * @returns HTML 字符串。
 */
function buildRecallInjectionOverviewMarkup(snapshot: ExperienceSnapshot): string {
        const recallSummary = buildRecallUiSummary(snapshot);
        const latestExplanation = snapshot.latestRecallExplanation;
        const generatedAt = Number(latestExplanation?.generatedAt ?? snapshot.preDecision?.generatedAt ?? 0);
        const subtitleText = snapshot.preDecision
                ? [
                        `意图：${formatInjectionIntentLabel(snapshot.preDecision.intent)}`,
                        `布局：${snapshot.preDecision.layoutMode}`,
                        `插入角色：${snapshot.preDecision.insertionRole}`,
                        `插入位置：${snapshot.preDecision.insertionPosition}`,
                        `世界书：${formatLorebookModeLabel(snapshot.preDecision.lorebookMode)}`,
                ].join(' / ')
                : '最近还没有新的注入决策，这里仍会持续显示角色边界与严格向量回源状态。';
        const secondaryActorsText = recallSummary.secondaryActorLabels.length > 0
                ? recallSummary.secondaryActorLabels.join(' / ')
                : '当前以共享池为主';
        const vectorDetailText = `${recallSummary.vectorIndexLabel} / ${recallSummary.vectorRebuiltLabel}`;
        const resultText = latestExplanation
                ? `${latestExplanation.selected.items.length} 条命中 / ${latestExplanation.rejectedCandidates.items.length} 条回退`
                : '暂无注入解释快照';
        const reasonText = recallSummary.reasonLabels.length > 0
                ? recallSummary.reasonLabels.join(' / ')
                : formatInjectionReasonSummary(snapshot.preDecision?.reasonCodes ?? []);
        return buildSummaryCalloutMarkup({
                eyebrow: '本轮注入视角',
                title: snapshot.preDecision?.shouldInject ? '已生成注入上下文' : '本轮跳过注入',
                copy: subtitleText,
                copyHtml: `
                    <div class="stx-ui-summary-caption">${escapeHtml(subtitleText)}</div>
                    <div class="stx-ui-summary-tile-grid">
                        ${[
                                buildSummaryInfoTile('fa-solid fa-eye', '视角模式', recallSummary.viewpointModeLabel),
                                buildSummaryInfoTile('fa-solid fa-user-check', '主视角角色', recallSummary.primaryActorLabel),
                                buildSummaryInfoTile('fa-solid fa-users-viewfinder', '次角色', secondaryActorsText),
                                buildSummaryInfoTile('fa-solid fa-layer-group', '共享 / 角色池', `${recallSummary.globalPoolSelectedCount} / ${recallSummary.actorPoolSelectedCount}`),
                                buildSummaryInfoTile('fa-solid fa-shield', '边界压制', `${recallSummary.blockedCount} 条`),
                                buildSummaryInfoTile('fa-solid fa-link', '严格回源', recallSummary.vectorIndexLabel),
                                buildSummaryInfoTile('fa-solid fa-diagram-project', 'Memory Context', (snapshot.preDecision?.blocksUsed ?? []).map((block) => `${block.kind}${block.actorKey ? `(${block.actorKey})` : ''}`).join(' / ') || '无分层块'),
                        ].join('')}
                    </div>
                `,
                foot: reasonText,
                footHtml: [
                        buildSummaryInfoLine('fa-solid fa-crosshairs', '主视角来源', recallSummary.focusSourceLabel),
                        buildSummaryInfoLine('fa-solid fa-circle-nodes', '热度角色', recallSummary.salienceLabels.length > 0 ? recallSummary.salienceLabels.join(' / ') : '当前没有明显的热度角色'),
                        buildSummaryInfoLine('fa-solid fa-filter-circle-xmark', '角色边界', recallSummary.foreignPrivateSuppressedCount > 0 ? `${recallSummary.foreignPrivateSuppressedCount} 条私人记忆被压制` : '当前没有因角色边界被压制的条目'),
                        buildSummaryInfoLine('fa-solid fa-brain', '遗忘阻断', recallSummary.forgottenBlockedCount > 0 ? `${recallSummary.forgottenBlockedCount} 条因遗忘而不可见` : '当前没有因遗忘而阻断的条目'),
                        buildSummaryInfoLine('fa-solid fa-database', '向量索引', vectorDetailText),
                        buildSummaryInfoLine('fa-solid fa-list-check', '本轮结果', resultText),
                ].join(''),
                meta: generatedAt > 0 ? formatRelativeTime(generatedAt) : '暂无记录',
                empty: !snapshot.preDecision && !latestExplanation,
                iconClassName: 'fa-solid fa-brain',
        });
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

function formatLayoutModeLabel(value: string): string {
    const dict: Record<string, string> = {
        layered_memory_context: '固定三层记忆布局',
    };
    return dict[String(value ?? '').trim().toLowerCase()] || '固定分层布局';
}

function formatInsertionRoleLabel(value: string): string {
    const dict: Record<string, string> = {
        user: 'user 消息',
    };
    return dict[String(value ?? '').trim().toLowerCase()] || '固定角色';
}

function formatInsertionPositionLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'before_last_user') {
        return '最后一条真实用户消息之前';
    }
    return '固定位置';
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
    const recallReasonLabel = formatRecallUiReasonCode(raw);
    if (recallReasonLabel && recallReasonLabel !== raw) {
        return recallReasonLabel;
    }
    const normalized = raw.toLowerCase();
    const viewpointLabelMap: Record<string, string> = {
        viewpoint_shared: '褰撳墠瑙嗚鍙鐨勫叡浜蹇?',
        viewpoint_owned_by_actor: '灞炰簬褰撳墠瑙掕壊鐨勭鏈夎蹇?',
        viewpoint_retained_for_actor: '宸茶涓烘湰瑙掕壊鐣欏瓨鐨勮蹇?',
        viewpoint_foreign_private_suppressed: '灞炰簬鍏朵粬瑙掕壊鐨勭鏈夎蹇嗭紝宸查伒鐓ц鑹茶竟鐣屽帇鍒?',
        foreign_private_memory_suppressed: '鍥犺鑹茶竟鐣岃鍒欐湭杩涘叆鏈疆娉ㄥ叆',
        blocked_foreign_private: '灞炰簬鍏朵粬瑙掕壊鐨勭鏈夎蹇嗚鍙洖瑙勫垯鎷︽埅',
        blocked_actor_forgotten: '褰撳墠瑙掕壊宸茬粡蹇樿杩欐潯璁板繂',
    };
    const viewpointKey = normalized.replace(/:/g, '_');
    if (viewpointLabelMap[viewpointKey]) {
        return viewpointLabelMap[viewpointKey];
    }
    if (INJECTION_REASON_LABELS[normalized]) {
        return INJECTION_REASON_LABELS[normalized];
    }

    if (normalized.startsWith('layout:')) {
        return `布局：${formatLayoutModeLabel(normalized.slice('layout:'.length))}`;
    }
    if (normalized.startsWith('insertion_role:')) {
        return `插入角色：${formatInsertionRoleLabel(normalized.slice('insertion_role:'.length))}`;
    }
    if (normalized.startsWith('insertion_position:')) {
        return `插入位置：${formatInsertionPositionLabel(normalized.slice('insertion_position:'.length))}`;
    }
    if (normalized.startsWith('block:')) {
        return `分层块：${normalized.slice('block:'.length)}`;
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
                                <strong>未入选候选</strong>
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
 * 功能：构建处理等级决策摘要。
 * 参数：
 *   processingDecision：最近一次处理等级决策。
 * 返回：
 *   ExperienceListItem[]：摘要列表。
 */
function buildProcessingDecisionItems(processingDecision: MemoryProcessingDecision | null): ExperienceListItem[] {
    if (!processingDecision) {
        return [{
            title: '处理等级决策',
            detail: '最近还没有处理等级决策记录。',
            meta: '等待下一次抽取触发',
            tone: 'soft',
            iconClassName: 'fa-solid fa-shuffle',
        }];
    }
    const precompressed = processingDecision.precompressedStats;
    const compressionMeta = precompressed
        ? `${precompressed.originalLength} → ${precompressed.compressedLength} 字`
        : '暂无预压缩数据';
    const compressionDetail = precompressed
        ? `去重 ${precompressed.removedDuplicateCount} · 合并 ${precompressed.mergedRunCount} · 截断 ${precompressed.truncatedToolOutputCount}`
        : '本轮没有可展示的预压缩统计。';
    return [
        {
            title: '处理等级决策',
            detail: `等级 ${processingDecision.level} · 摘要 ${processingDecision.summaryTier} · 抽取 ${processingDecision.extractScope}`,
            meta: processingDecision.cooldownBlocked ? '长总结冷却命中' : '本轮正常执行',
            tone: processingDecision.level === 'heavy' ? 'warning' : (processingDecision.level === 'none' ? 'soft' : 'accent'),
            iconClassName: 'fa-solid fa-shuffle',
        },
        {
            title: '长总结触发',
            detail: processingDecision.heavyTriggerKind
                ? `重处理来源：${processingDecision.heavyTriggerKind}`
                : '本轮没有进入重处理候选。',
            meta: processingDecision.reasonCodes.slice(0, 3).join(' / ') || '暂无原因码',
            tone: processingDecision.level === 'heavy' ? 'warning' : 'soft',
            iconClassName: 'fa-solid fa-pen-to-square',
        },
        {
            title: '预压缩结果',
            detail: compressionDetail,
            meta: compressionMeta,
            tone: precompressed && precompressed.compressedLength < precompressed.originalLength ? 'accent' : 'soft',
            iconClassName: 'fa-solid fa-compress',
        },
    ];
}

/**
 * 功能：构建长总结冷却摘要。
 * 参数：
 *   cooldown：最近一次长总结冷却状态。
 * 返回：
 *   ExperienceListItem[]：摘要列表。
 */
function buildLongSummaryCooldownItems(cooldown: LongSummaryCooldownState | null): ExperienceListItem[] {
    if (!cooldown) {
        return [];
    }
    const hasSummary = Number(cooldown.lastLongSummaryAt ?? 0) > 0;
    const hasHeavy = Number(cooldown.lastHeavyProcessAt ?? 0) > 0;
    return [{
        title: '长总结冷却',
        detail: hasSummary
            ? `最近长总结：${formatRelativeTime(Number(cooldown.lastLongSummaryAt ?? 0))}`
            : '最近还没有长总结记录。',
        meta: [
            cooldown.lastLongSummaryWindowHash ? `窗口 ${cooldown.lastLongSummaryWindowHash.slice(0, 8)}` : '无窗口哈希',
            cooldown.lastLongSummaryReason ? `原因 ${cooldown.lastLongSummaryReason}` : '无原因码',
            hasHeavy ? `重处理 ${formatRelativeTime(Number(cooldown.lastHeavyProcessAt ?? 0))}` : '暂无重处理',
        ].join(' · '),
        tone: hasSummary ? 'warning' : 'soft',
        iconClassName: 'fa-solid fa-hourglass-half',
    }];
}

/**
 * 功能：把最近一次 mutation planner 快照格式化成便于界面展示的动作统计。
 * @param snapshot 最近一次 mutation planner 快照。
 * @returns 用于界面展示的动作统计文案。
 */
function formatMutationPlanActionCounts(snapshot: MemoryMutationPlanSnapshot | null): string {
    if (!snapshot) {
        return '最近还没有 mutation planner 记录。';
    }
    const parts = [
        ['ADD', snapshot.actionCounts.ADD],
        ['MERGE', snapshot.actionCounts.MERGE],
        ['UPDATE', snapshot.actionCounts.UPDATE],
        ['INVALIDATE', snapshot.actionCounts.INVALIDATE],
        ['DELETE', snapshot.actionCounts.DELETE],
        ['NOOP', snapshot.actionCounts.NOOP],
    ].filter((entry): boolean => Number(entry[1] ?? 0) > 0)
        .map((entry): string => `${entry[0]} ${entry[1]}`);
    return parts.length > 0 ? parts.join(' / ') : '最近一轮没有产生有效动作。';
}

/**
 * 功能：构建 mutation planner 的体验面板条目。
 * @param snapshot 最近一次 mutation planner 快照。
 * @returns 可直接渲染到体验面板的列表条目。
 */
function buildMutationPlanItems(snapshot: MemoryMutationPlanSnapshot | null): ExperienceListItem[] {
    if (!snapshot) {
        return [{
            title: '长期记忆 CRUD',
            detail: '最近还没有 mutation planner 记录。',
            meta: '等待新的提议进入长期记忆 CRUD 主链',
            tone: 'soft',
            iconClassName: 'fa-solid fa-shuffle',
        }];
    }
    const sourceLabel = normalizeText(snapshot.consumerPluginId || snapshot.source, 'unknown_plugin');
    const preview = snapshot.items
        .slice(0, 3)
        .map((item): string => `${item.action} ${item.title}`)
        .join(' / ');
    return [{
        title: '长期记忆 CRUD',
        detail: formatMutationPlanActionCounts(snapshot),
        meta: `执行 ${snapshot.appliedItems} / ${snapshot.totalItems} · ${sourceLabel} · ${snapshot.generatedAt > 0 ? formatRelativeTime(snapshot.generatedAt) : '刚刚'}`,
        tone: snapshot.appliedItems > 0 ? 'accent' : 'soft',
        iconClassName: 'fa-solid fa-shuffle',
        detailHtml: preview
            ? `<div class="stx-ui-body-text">${escapeHtml(preview)}</div>`
            : undefined,
    }];
}

/**
 * 功能：构建 mutation history 的体验面板条目。
 * @param history 最近执行的长期记忆变更历史。
 * @returns 可直接渲染到体验面板的列表条目。
 */
function buildMutationHistoryItems(history: EditorExperienceSnapshot['mutationHistory']): ExperienceListItem[] {
    if (!Array.isArray(history) || history.length === 0) {
        return [{
            title: '最近变更',
            detail: '最近还没有变更历史记录。',
            meta: '等待新的长期记忆变更写入 history',
            tone: 'soft',
            iconClassName: 'fa-solid fa-clock-rotate-left',
        }];
    }
    const latest = history[0];
    const preview = history
        .slice(0, 3)
        .map((item): string => `${item.action} ${item.targetKind} ${item.title}`)
        .join(' / ');
    return [{
        title: '最近变更',
        detail: `${history.length} 条已执行变更`,
        meta: `${normalizeText(latest.consumerPluginId || latest.source, 'unknown_plugin')} · ${latest.ts > 0 ? formatRelativeTime(latest.ts) : '刚刚'}`,
        tone: history.length > 0 ? 'accent' : 'soft',
        iconClassName: 'fa-solid fa-clock-rotate-left',
        detailHtml: preview
            ? `<div class="stx-ui-body-text">${escapeHtml(preview)}</div>`
            : undefined,
    }];
}

/**
 * 功能：构建主链 trace 的体验面板条目。
 * @param traceSnapshot 最近一次主链 trace 快照。
 * @returns 可直接渲染到体验面板的列表条目。
 */
function buildMainlineTraceItems(traceSnapshot: EditorExperienceSnapshot['mainlineTraceSnapshot']): ExperienceListItem[] {
    const normalized = traceSnapshot ?? null;
    const recentTraces = Array.isArray(normalized?.recentTraces) ? normalized!.recentTraces : [];
    const lastSuccess = normalized?.lastSuccessTrace
        ?? normalized?.lastPromptInjectionTrace
        ?? normalized?.lastRecallTrace
        ?? normalized?.lastTrustedWriteTrace
        ?? normalized?.lastAppendTrace
        ?? normalized?.lastIngestTrace
        ?? null;
    if (recentTraces.length === 0 && !lastSuccess) {
        return [{
            title: '主链追踪',
            detail: '最近还没有可见的主链 trace。',
            meta: '等待 ingest / trusted write / recall / prompt 注入完成后展示',
            tone: 'soft',
            iconClassName: 'fa-solid fa-route',
        }];
    }

    const preview = recentTraces
        .slice(-3)
        .map((item): string => `${item.ok ? '成功' : '失败'} · ${item.label} · ${formatRelativeTime(item.ts)}`)
        .join(' / ');

    return [{
        title: '主链追踪',
        detail: lastSuccess
            ? `最近成功：${lastSuccess.label} · ${formatRelativeTime(lastSuccess.ts)}`
            : `${recentTraces.length} 条 trace 已记录`,
        meta: normalized?.lastUpdatedAt ? `最近更新 ${formatRelativeTime(normalized.lastUpdatedAt)}` : '尚未生成追踪快照',
        tone: lastSuccess ? 'accent' : 'soft',
        iconClassName: 'fa-solid fa-route',
        detailHtml: preview
            ? `<div class="stx-ui-body-text">${escapeHtml(preview)}</div>`
            : undefined,
    }];
}

/**
 * 功能：把总结设置快照压缩成一组只读概览条目。
 * @param snapshot 体验快照。
 * @returns 可直接渲染到体验面板的条目列表。
 */
function buildSummarySettingsItems(snapshot: EditorExperienceSnapshot): ExperienceListItem[] {
    const effective: EffectiveSummarySettings | null = snapshot.effectiveSummarySettings ?? null;
    const sourceLabel = snapshot.summarySettingsSource
        ? formatSummarySourceLabel(snapshot.summarySettingsSource as SummarySettingsSource)
        : '系统默认';
    const override = snapshot.summarySettingsOverride ?? null;
    if (!effective) {
        return [{
            title: '总结设置',
            detail: '当前还没有总结设置快照。',
            meta: sourceLabel,
            tone: 'soft',
            iconClassName: 'fa-solid fa-list-check',
        }];
    }
    const focusText = Array.isArray(effective.contentPreference.recordFocus) && effective.contentPreference.recordFocus.length > 0
        ? effective.contentPreference.recordFocus.map((item: SummaryRecordFocus): string => ({
            facts: '事实',
            relationship: '关系',
            world: '世界',
            plot: '剧情',
            emotion: '情绪',
            tool_result: '工具结果',
        }[item] ?? item)).join(' / ')
        : '事实 / 关系 / 世界 / 剧情';
    const triggerText = Array.isArray(effective.summaryBehavior.longSummaryTrigger) && effective.summaryBehavior.longSummaryTrigger.length > 0
        ? effective.summaryBehavior.longSummaryTrigger.map((item: SummaryLongTrigger): string => ({
            scene_end: '场景结束',
            combat_end: '战斗结束',
            plot_advance: '剧情推进',
            relationship_shift: '关系变化',
            world_change: '世界变化',
            structure_repair: '结构修复',
            archive_finalize: '归档整理',
        }[item] ?? item)).join(' / ')
        : '阶段结束';
    const workModeText = '记忆模式 ' + (effective.workMode.memoryMode === 'streamlined' ? '精简' : effective.workMode.memoryMode === 'deep' ? '深度' : '平衡') + ' · 使用场景 ' + ({
        auto: '自动',
        companion_chat: '陪伴闲聊',
        long_rp: '长剧情角色扮演',
        worldbook_qa: '世界设定问答',
        group_trpg: '群聊 / 跑团',
        tool_qa: '工具 / 代码协作',
        custom: '自定义',
    }[effective.workMode.scenario] ?? '自动') + ' · 资源优先级 ' + (effective.workMode.resourcePriority === 'quality' ? '质量优先' : effective.workMode.resourcePriority === 'saving' ? '节省优先' : '平衡');
    const behaviorText = '时机 ' + (effective.summaryBehavior.summaryTiming === 'key_only' ? '关键节点' : effective.summaryBehavior.summaryTiming === 'frequent' ? '更频繁' : '阶段结束') + ' · 长度 ' + (effective.summaryBehavior.summaryLength === 'short' ? '短' : effective.summaryBehavior.summaryLength === 'detailed' ? '详细' : effective.summaryBehavior.summaryLength === 'ultra' ? '超长' : '标准') + ' · 冷却 ' + (effective.summaryBehavior.longSummaryCooldown === 'short' ? '短' : effective.summaryBehavior.longSummaryCooldown === 'long' ? '长' : '标准');
    const advancedText = '处理间隔 ' + (effective.advanced.processInterval === 'small' ? '小' : effective.advanced.processInterval === 'large' ? '大' : '中') + ' · 回看范围 ' + (effective.advanced.lookbackScope === 'small' ? '小' : effective.advanced.lookbackScope === 'large' ? '大' : '中');
    const overrideText = override && Object.keys(override).length > 0 ? '当前聊天存在差异覆盖' : '当前聊天与全局默认一致';
    return [
        {
            title: '总结设置来源',
            detail: sourceLabel,
            meta: '来源：' + sourceLabel,
            tone: 'accent',
            iconClassName: 'fa-solid fa-sitemap',
        },
        {
            title: '工作方式',
            detail: workModeText,
            meta: '当前生效：' + sourceLabel,
            tone: 'soft',
            iconClassName: 'fa-solid fa-sliders',
        },
        {
            title: '总结行为',
            detail: behaviorText,
            meta: '长总结触发：' + triggerText,
            tone: 'soft',
            iconClassName: 'fa-solid fa-pen-to-square',
        },
        {
            title: '记录重点',
            detail: focusText,
            meta: '低价值处理：' + (effective.contentPreference.lowValueHandling === 'keep_more' ? '保留更多' : effective.contentPreference.lowValueHandling === 'keep_some' ? '保留部分' : '忽略') + ' · 过滤强度：' + (effective.contentPreference.noiseFilter === 'high' ? '高过滤' : effective.contentPreference.noiseFilter === 'low' ? '低过滤' : '中过滤'),
            tone: 'soft',
            iconClassName: 'fa-solid fa-tags',
        },
        {
            title: '高级设置',
            detail: advancedText,
            meta: overrideText,
            tone: 'soft',
            iconClassName: 'fa-solid fa-wand-magic-sparkles',
        },
    ];
}

/**
 * 功能：把调参值写回到输入框。
 * @param id 输入框 ID。
 * @param value 待写入的数值。
 * @returns 无返回值。
 */function setNumberInputValue(id: string, value: number): void {
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
    setNumberInputValue(ids.tuningCandidateAcceptThresholdBiasId, snapshot.tuningProfile.candidateAcceptThresholdBias);
    setNumberInputValue(ids.tuningRecallRelationshipBiasId, snapshot.tuningProfile.recallRelationshipBias);
    setNumberInputValue(ids.tuningRecallEmotionBiasId, snapshot.tuningProfile.recallEmotionBias);
    setNumberInputValue(ids.tuningRecallRecencyBiasId, snapshot.tuningProfile.recallRecencyBias);
    setNumberInputValue(ids.tuningRecallContinuityBiasId, snapshot.tuningProfile.recallContinuityBias);
    setNumberInputValue(ids.tuningDistortionProtectionBiasId, snapshot.tuningProfile.distortionProtectionBias);
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
            return '检查结构化来源';
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
            return buildEditorActionButton('open-diagnostics', '查看系统诊断');
        }
        if (action === 'review_candidates') {
            return buildEditorActionButton('open-diagnostics', formatSuggestedActionLabel(action));
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
    return buildSummaryCalloutMarkup({
        eyebrow: '设定总览',
        title: worldTitle,
        copy: overviewText,
        copyHtml: summaryCopyHtml,
        meta: canon.health.maintenanceLabels[0] || '当前状态稳定',
        iconClassName: 'fa-solid fa-compass',
        className: 'is-overview-hero',
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
                buildEditorActionButton('open-record-editor', '打开记录编辑器'),
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
            meta: '展开后即可直接查看系统诊断与修复动作',
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
            actionsHtml: buildEditorActionButton('open-record-editor', '打开记录编辑器'),
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
            copy: '这里先解释当前稳定结构、隐藏行与候选层的状态；后续修复动作统一从系统诊断进入。',
            copyHtml: [
                buildSummaryInfoLine('fa-solid fa-brain', '事实行', `${canon.health.dataLayers.factsCount} 条已整理事实`),
                buildSummaryInfoLine('fa-solid fa-signature', '别名映射', `${canon.health.dataLayers.aliasCount} 条别名映射`),
                buildSummaryInfoLine('fa-solid fa-route', '重定向', `${canon.health.dataLayers.redirectCount} 条重定向`),
                buildSummaryInfoLine('fa-solid fa-box-archive', '隐藏墓碑', `${canon.health.dataLayers.tombstoneCount} 条隐藏墓碑`),
            ].join(''),
            footHtml: [
                buildSummaryInfoLine('fa-solid fa-pen-ruler', '维护入口', '候选修复、隐藏项整理与来源排查统一从系统诊断进入。'),
                buildSummaryInfoLine('fa-solid fa-magnifying-glass', '空表说明', '如果表里暂时为空，下面会继续解释数据可能停留在哪一层。'),
            ].join(''),
            meta: canon.health.maintenanceLabels[0] || '系统诊断已就绪',
            iconClassName: 'fa-solid fa-table-cells-large',
        }),
    );
    setContainerHtml(
        ids.relationLanesId,
        buildListMarkup([
            {
                title: '维护边界',
                detail: '抽取结果、摘要和状态提议现在都会先进入长期记忆 CRUD 主链，统一经过 mutation planner 决策后再执行。',
                meta: '统一通过结构层和变更规划执行',
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

function renderInjectionPanel(ids: MemoryOSSettingsIds, snapshot: EditorExperienceSnapshot): void {
    const canon: CanonSnapshot = snapshot.canon;
    const issues: ExperienceListItem[] = canon.health.issues.map((issue): ExperienceListItem => ({
        title: issue.label,
        detail: issue.detail,
        meta: issue.actionLabel || '建议人工检查',
        tone: issue.severity === 'critical' || issue.severity === 'warning' ? 'warning' : 'soft',
        iconClassName: issue.severity === 'critical' || issue.severity === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info',
    }));
    const warningCount: number = canon.health.issues.filter((issue) => issue.severity === 'warning').length;
    const criticalCount: number = canon.health.issues.filter((issue) => issue.severity === 'critical').length;
    const healthyCount: number = Math.max(0, 5 - Math.min(5, criticalCount + warningCount));
    const statusToneClassName: string = criticalCount > 0 ? 'is-danger' : warningCount > 0 ? 'is-warning' : 'is-healthy';
    const statusLabel: string = criticalCount > 0 ? '需要立即处理' : warningCount > 0 ? '建议尽快整理' : '运行稳定';
    const statusDescription: string = criticalCount > 0
        ? `检测到 ${criticalCount} 项高风险问题，建议优先执行修复动作。`
        : warningCount > 0
            ? `当前有 ${warningCount} 项预警，建议在下一轮整理中完成收敛。`
            : '当前没有明显结构风险，可以继续观察后续快照。';
    const statusMetricsHtml: string = [
        {
            label: '严重告警',
            value: `${criticalCount}`,
            toneClassName: criticalCount > 0 ? 'is-danger' : 'is-muted',
        },
        {
            label: '普通预警',
            value: `${warningCount}`,
            toneClassName: warningCount > 0 ? 'is-warning' : 'is-muted',
        },
        {
            label: '稳定层级',
            value: `${healthyCount}/5`,
            toneClassName: healthyCount >= 4 ? 'is-healthy' : 'is-muted',
        },
    ].map((item) => `
        <div class="stx-ui-diagnostics-metric ${item.toneClassName}">
            <span class="stx-ui-diagnostics-metric-label">${escapeHtml(item.label)}</span>
            <strong class="stx-ui-diagnostics-metric-value">${escapeHtml(item.value)}</strong>
        </div>
    `).join('');
    const overviewHtml: string = `
        <div class="stx-ui-diagnostics-stack">
            <div class="stx-ui-diagnostics-status ${statusToneClassName}">
                <div class="stx-ui-diagnostics-status-head">
                    <span class="stx-ui-diagnostics-status-label">系统信号</span>
                    <strong class="stx-ui-diagnostics-status-title">${escapeHtml(statusLabel)}</strong>
                </div>
                <p class="stx-ui-diagnostics-status-copy">${escapeHtml(statusDescription)}</p>
                <div class="stx-ui-diagnostics-metrics">${statusMetricsHtml}</div>
            </div>
            ${buildRecallInjectionOverviewMarkup(snapshot)}
            ${buildListMarkup([
                ...buildSummarySettingsItems(snapshot),
                ...buildMainlineTraceItems(snapshot.mainlineTraceSnapshot),
                ...buildProcessingDecisionItems(snapshot.processingDecision),
                ...buildLongSummaryCooldownItems(snapshot.longSummaryCooldown),
                ...buildMutationPlanItems(snapshot.lastMutationPlan),
                ...buildMutationHistoryItems(snapshot.mutationHistory),
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
            ], '当前还没有可展示的数据分层诊断。')}
        </div>
    `;
    const actionHtml: string = `
        <div class="stx-ui-diagnostics-actions-shell">
            <section class="stx-ui-diagnostics-terminal">
                <div class="stx-ui-diagnostics-terminal-head">
                    <span class="stx-ui-diagnostics-terminal-kicker">优先队列</span>
                    <strong>优先动作</strong>
                </div>
                <div class="stx-ui-actions stx-ui-diagnostics-actions-row">
                    <button data-stx-editor-action="rebuild-chat-view" type="button" class="stx-ui-btn secondary">重建结构视图</button>
                    <button data-stx-editor-action="refresh-canon" type="button" class="stx-ui-btn secondary">刷新总览快照</button>
                </div>
            </section>
            <section class="stx-ui-diagnostics-terminal">
                <div class="stx-ui-diagnostics-terminal-head">
                    <span class="stx-ui-diagnostics-terminal-kicker">源数据刷新</span>
                    <strong>同步源数据</strong>
                </div>
                <div class="stx-ui-actions stx-ui-diagnostics-actions-row">
                    <button data-stx-editor-action="refresh-seed" type="button" class="stx-ui-btn secondary">刷新初始设定</button>
                    <button data-stx-editor-action="view-hidden-rows" type="button" class="stx-ui-btn secondary">查看已隐藏行</button>
                </div>
            </section>
            <section class="stx-ui-diagnostics-terminal">
                <div class="stx-ui-diagnostics-terminal-head">
                    <span class="stx-ui-diagnostics-terminal-kicker">深入排查</span>
                    <strong>深入排查</strong>
                </div>
                <div class="stx-ui-actions stx-ui-diagnostics-actions-row">
                    <button data-stx-editor-action="open-diagnostics" type="button" class="stx-ui-btn secondary">打开系统诊断</button>
                </div>
                <div class="stx-ui-diagnostics-terminal-copy">结构修复、候选处理和隐藏项整理统一收敛到系统诊断；这里保留刷新与跳转入口，避免设置页和编辑器出现双轨漂移。</div>
            </section>
        </div>
    `;
    const issueBoardHtml: string = `
        <div class="stx-ui-diagnostics-stack">
            <div class="stx-ui-diagnostics-issue-board">
                <div class="stx-ui-diagnostics-issue-summary">
                    <span class="stx-ui-diagnostics-issue-summary-label">风险聚焦</span>
                    <strong class="stx-ui-diagnostics-issue-summary-value">${escapeHtml(`${canon.health.issues.length} 项诊断结果`)}</strong>
                </div>
                <div class="stx-ui-diagnostics-issue-tags">
                    <span class="stx-ui-diagnostics-issue-tag is-danger">严重 ${escapeHtml(String(criticalCount))}</span>
                    <span class="stx-ui-diagnostics-issue-tag is-warning">预警 ${escapeHtml(String(warningCount))}</span>
                    <span class="stx-ui-diagnostics-issue-tag is-muted">维护标签 ${escapeHtml(String(canon.health.maintenanceLabels.length))}</span>
                </div>
            </div>
            ${buildListMarkup(issues, '当前没有问题列表。')}
        </div>
    `;
    setContainerHtml(
        ids.injectionOverviewId,
        overviewHtml,
    );
    setContainerHtml(ids.injectionSectionsId, issueBoardHtml);
    setContainerHtml(
        ids.injectionPostId,
        actionHtml,
    );
    setContainerHtml(
        ids.injectionReasonId,
        buildInjectionReasonMarkup(snapshot.latestRecallExplanation),
    );
}

function renderEmptyState(ids: MemoryOSSettingsIds): void {
    const emptyMarkup: string = buildSummaryCalloutMarkup({
        eyebrow: '系统诊断',
        title: '当前还没有绑定聊天',
        copy: '切换到一个可记录的聊天后，这里会显示设定总览、角色与地点以及系统诊断信息。',
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
}

function renderLoadErrorState(ids: MemoryOSSettingsIds, message: string): void {
    const errorMarkup: string = buildSummaryCalloutMarkup({
        eyebrow: '系统诊断',
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
    setContainerHtml(ids.relationLanesId, '<div class="stx-ui-empty-hint">系统诊断页暂时不可用。</div>');
    setContainerHtml(ids.relationStateId, '<div class="stx-ui-empty-hint">系统诊断页暂时不可用。</div>');
    setContainerHtml(ids.injectionOverviewId, errorMarkup);
    setContainerHtml(ids.injectionSectionsId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
    setContainerHtml(ids.injectionReasonId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
    setContainerHtml(ids.injectionPostId, '<div class="stx-ui-empty-hint">诊断页暂时不可用。</div>');
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
        renderInjectionPanel(ids, experienceSnapshot);
        renderTuningPanel(ids, experienceSnapshot);
    } catch (error) {
        const message: string = normalizeText(error instanceof Error ? error.message : error, '未知错误');
        renderLoadErrorState(ids, message);
    }
}
