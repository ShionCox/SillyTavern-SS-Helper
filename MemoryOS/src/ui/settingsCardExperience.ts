import { db, type DBEvent, type DBFact, type DBSummary, type DBWorldState } from '../db/db';
import type {
    ChatLifecycleState,
    ChatProfile,
    ChatSemanticSeed,
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
    SpeakerMemoryLane,
} from '../../../SDK/stx';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';

type ExperienceTone = 'accent' | 'soft' | 'warning' | 'success';

interface ExperienceListItem {
    title: string;
    detail: string;
    meta: string;
    tone?: ExperienceTone;
}

interface ExperienceBadge {
    label: string;
    value: string;
    tone?: ExperienceTone;
}

interface ExperienceSnapshot {
    chatKey: string;
    profile: ChatProfile;
    quality: MemoryQualityScorecard;
    lifecycle: ChatLifecycleState;
    retention: RetentionPolicy;
    semanticSeed: ChatSemanticSeed | null;
    simplePersona: SimpleMemoryPersona | null;
    groupMemory: GroupMemoryState | null;
    relationshipState: RelationshipState[];
    logicalView: LogicalChatView | null;
    lorebookDecision: LorebookGateDecision | null;
    preDecision: PreGenerationGateDecision | null;
    postDecision: PostGenerationGateDecision | null;
    lifecycleSummary: MemoryLifecycleState[];
    candidateSnapshot: MemoryCandidateBufferSnapshot;
    recallLog: RecallLogEntry[];
    latestRecallExplanation: LatestRecallExplanation | null;
    migrationStatus: MemoryMigrationStatus;
    tuningProfile: MemoryTuningProfile;
    maintenanceInsights: MaintenanceInsight[];
    facts: DBFact[];
    summaries: DBSummary[];
    events: DBEvent[];
    states: DBWorldState[];
}

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
        return '暂无时间';
    }
    return new Date(ts).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * 功能：将时间戳转换为相对时间。
 * 参数：
 *   ts：毫秒级时间戳。
 * 返回：
 *   string：相对时间描述。
 */
function formatRelativeTime(ts: number): string {
    if (!Number.isFinite(ts) || ts <= 0) {
        return '尚未发生';
    }
    const diffMs: number = Date.now() - ts;
    const diffMinutes: number = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) {
        return '刚刚';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`;
    }
    const diffHours: number = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} 小时前`;
    }
    const diffDays: number = Math.floor(diffHours / 24);
    if (diffDays < 7) {
        return `${diffDays} 天前`;
    }
    return formatTimestamp(ts);
}

/**
 * 功能：把 0-1 范围分数映射为百分比。
 * 参数：
 *   value：原始分数。
 * 返回：
 *   string：百分比文本。
 */
function formatScorePercent(value: number): string {
    const safeValue: number = Number.isFinite(value) ? value : 0;
    const percent: number = Math.max(0, Math.min(100, Math.round(safeValue * 100)));
    return `${percent}%`;
}

/**
 * 功能：格式化迁移阶段标签。
 * @param status 迁移状态。
 * @returns string：阶段说明。
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
              `意图：${snapshot.preDecision.intent}`,
              `锚点：${snapshot.preDecision.anchorMode}`,
              `迁移：${formatMigrationStage(snapshot.migrationStatus)}`,
              `调参：${formatTuningSummary(snapshot.tuningProfile)}`,
          ].join(' / '))}
        </div>
        <div class="stx-ui-summary-foot">
          ${escapeHtml(snapshot.preDecision.reasonCodes.length > 0
              ? `原因：${snapshot.preDecision.reasonCodes.slice(0, 4).join(' / ')}`
              : '当前没有额外原因标签')}
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
    if (typeof value === 'string') {
        return truncateText(value, 100) || '无详细内容';
    }
    if (Array.isArray(value)) {
        return truncateText(value.map((item: unknown): string => normalizeText(item, '')).filter(Boolean).join('、'), 100) || '无详细内容';
    }
    if (value && typeof value === 'object') {
        const entries: Array<[string, unknown]> = Object.entries(value as Record<string, unknown>).slice(0, 4);
        return truncateText(entries.map(([key, item]: [string, unknown]): string => `${key}: ${normalizeText(item, '')}`).join('；'), 120) || '无详细内容';
    }
    return normalizeText(value, '无详细内容');
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
    const pathText: string = fact.path ? ` · ${fact.path}` : '';
    return {
        title: normalizeText(fact.type, '未命名事实'),
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
        const text: string = truncateText(candidate, 100);
        if (text) {
            return text;
        }
    }
    if (event.payload != null) {
        return truncateText(JSON.stringify(event.payload), 100);
    }
    return '无附加内容';
}

/**
 * 功能：把事件记录格式化为展示项。
 * 参数：
 *   event：事件记录。
 * 返回：
 *   ExperienceListItem：展示项。
 */
function formatEventItem(event: DBEvent): ExperienceListItem {
    return {
        title: normalizeText(event.type, '未命名事件'),
        detail: summarizeEvent(event),
        meta: `${formatRelativeTime(Number(event.ts ?? 0))} · ${formatTimestamp(Number(event.ts ?? 0))}`,
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
        title: normalizeText(summary.title, `${summary.level} 摘要`),
        detail: truncateText(summary.content, 120) || '暂无摘要内容',
        meta: `${formatRelativeTime(Number(summary.createdAt ?? 0))} · ${summary.level}`,
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
    const shortPath: string = state.path.split('/').filter(Boolean).slice(-2).join(' / ') || state.path;
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
              `意图：${snapshot.preDecision.intent}`,
              `锚点：${snapshot.preDecision.anchorMode}`,
              `渲染：${snapshot.preDecision.renderStyle}`,
              `世界书策略：${snapshot.preDecision.lorebookMode}`,
          ].join(' · '))}
        </div>
        <div class="stx-ui-summary-foot">
          ${escapeHtml(snapshot.preDecision.reasonCodes.length > 0
              ? `原因：${snapshot.preDecision.reasonCodes.slice(0, 4).join(' / ')}`
              : '当前没有额外原因标签')}
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
function buildListMarkup(items: ExperienceListItem[], emptyText: string): string {
    if (!Array.isArray(items) || items.length === 0) {
        return `<div class="stx-ui-empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return `
      <div class="stx-ui-memory-list">
        ${items.map((item: ExperienceListItem): string => `
          <article class="stx-ui-memory-entry${item.tone ? ` is-${item.tone}` : ''}">
            <div class="stx-ui-memory-entry-head">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.meta)}</span>
            </div>
            <div class="stx-ui-memory-entry-body">${escapeHtml(item.detail)}</div>
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
            const budgetLabel: string = Number.isFinite(Number(budget)) ? `${budget}t` : '自动';
            return `<span class="stx-ui-pill"><strong>${escapeHtml(section)}</strong><em>${escapeHtml(budgetLabel)}</em></span>`;
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
        metaParts.push(String(item.section));
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
            ? item.reasonCodes.join(' / ')
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
function renderTuningPanel(ids: MemoryOSSettingsIds, snapshot: ExperienceSnapshot): void {
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
 * 功能：查询最近的事实记录。
 * 参数：
 *   chatKey：聊天键。
 *   limit：最大条数。
 * 返回：
 *   Promise<DBFact[]>：事实列表。
 */
async function queryFacts(chatKey: string, limit: number): Promise<DBFact[]> {
    return db.facts
        .where('[chatKey+updatedAt]')
        .between([chatKey, 0], [chatKey, Number.MAX_SAFE_INTEGER])
        .reverse()
        .limit(limit)
        .toArray();
}

/**
 * 功能：查询最近的摘要记录。
 * 参数：
 *   chatKey：聊天键。
 *   limit：最大条数。
 * 返回：
 *   Promise<DBSummary[]>：摘要列表。
 */
async function querySummaries(chatKey: string, limit: number): Promise<DBSummary[]> {
    return db.summaries
        .where('[chatKey+level+createdAt]')
        .between([chatKey, '', 0], [chatKey, '\uffff', Number.MAX_SAFE_INTEGER])
        .reverse()
        .limit(limit)
        .toArray();
}

/**
 * 功能：查询最近的事件记录。
 * 参数：
 *   chatKey：聊天键。
 *   limit：最大条数。
 * 返回：
 *   Promise<DBEvent[]>：事件列表。
 */
async function queryEvents(chatKey: string, limit: number): Promise<DBEvent[]> {
    return db.events
        .where('[chatKey+ts]')
        .between([chatKey, 0], [chatKey, Number.MAX_SAFE_INTEGER])
        .reverse()
        .limit(limit)
        .toArray();
}

/**
 * 功能：查询当前聊天的世界状态记录。
 * 参数：
 *   chatKey：聊天键。
 *   limit：最大条数。
 * 返回：
 *   Promise<DBWorldState[]>：状态记录列表。
 */
async function queryStates(chatKey: string, limit: number): Promise<DBWorldState[]> {
    const records: DBWorldState[] = await db.world_state
        .where('[chatKey+path]')
        .between([chatKey, ''], [chatKey, '\uffff'])
        .toArray();
    return records
        .sort((left: DBWorldState, right: DBWorldState): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
        .slice(0, limit);
}

/**
 * 功能：加载设置页体验面板所需的完整快照。
 * 参数：
 *   memory：当前聊天的 MemorySDK。
 * 返回：
 *   Promise<ExperienceSnapshot>：体验快照。
 */
async function loadExperienceSnapshot(memory: MemorySDK): Promise<ExperienceSnapshot> {
    const chatKey: string = memory.getChatKey();
    const [
        profile,
        quality,
        lifecycle,
        retention,
        semanticSeed,
        simplePersona,
        groupMemory,
        relationshipState,
        logicalView,
        lorebookDecision,
        preDecision,
        postDecision,
        lifecycleSummary,
        candidateSnapshot,
        recallLog,
        latestRecallExplanation,
        migrationStatus,
        tuningProfile,
        maintenanceInsights,
        facts,
        summaries,
        events,
        states,
    ] = await Promise.all([
        memory.chatState.getChatProfile(),
        memory.chatState.getMemoryQuality(),
        memory.chatState.getLifecycleState(),
        memory.chatState.getRetentionPolicy(),
        memory.chatState.getSemanticSeed(),
        memory.chatState.getSimpleMemoryPersona(),
        memory.chatState.getGroupMemory(),
        memory.chatState.getRelationshipState(),
        memory.chatState.getLogicalChatView(),
        memory.chatState.getLorebookDecision(),
        memory.chatState.getLastPreGenerationDecision(),
        memory.chatState.getLastPostGenerationDecision(),
        memory.chatState.getMemoryLifecycleSummary(),
        memory.chatState.getCandidateBufferSnapshot(),
        memory.chatState.getRecallLog(),
        memory.chatState.getLatestRecallExplanation(),
        memory.chatState.getMemoryMigrationStatus(),
        memory.chatState.getMemoryTuningProfile(),
        memory.chatState.getMaintenanceInsights(),
        queryFacts(chatKey, 36),
        querySummaries(chatKey, 18),
        queryEvents(chatKey, 18),
        queryStates(chatKey, 18),
    ]);
    return {
        chatKey,
        profile,
        quality,
        lifecycle,
        retention,
        semanticSeed,
        simplePersona,
        groupMemory,
        relationshipState,
        logicalView,
        lorebookDecision,
        preDecision,
        postDecision,
        lifecycleSummary,
        candidateSnapshot,
        recallLog,
        latestRecallExplanation,
        migrationStatus,
        tuningProfile,
        maintenanceInsights,
        facts,
        summaries,
        events,
        states,
    };
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

/**
 * 功能：渲染角色记忆面板。
 * 参数：
 *   ids：设置面板 ID 集。
 *   snapshot：体验快照。
 * 返回：
 *   void：无返回值。
 */
function renderRolePanel(ids: MemoryOSSettingsIds, snapshot: ExperienceSnapshot): void {
    const longTermFacts: DBFact[] = snapshot.facts.filter(isLongTermFact).slice(0, 5);
    const recentFacts: DBFact[] = snapshot.facts.filter((fact: DBFact): boolean => !isLongTermFact(fact)).slice(0, 5);
    const blurCandidates: ExperienceListItem[] = [
        ...snapshot.lifecycleSummary
            .filter((item: MemoryLifecycleState): boolean => item.stage === 'blur' || item.stage === 'distorted')
            .slice(0, 3)
            .map((item: MemoryLifecycleState): ExperienceListItem => ({
                title: item.recordKey,
                detail: item.stage === 'distorted'
                    ? '这条记忆已经接近“可能误记”区间，后续注入会更谨慎。'
                    : '这条记忆正在从清晰回忆走向模糊回忆。',
                meta: `强度 ${Math.round(item.strength * 100)}% · 复述 ${item.rehearsalCount} 次`,
                tone: item.stage === 'distorted' ? 'warning' : 'soft',
            })),
        ...snapshot.maintenanceInsights.slice(0, 2).map((insight: MaintenanceInsight): ExperienceListItem => ({
            title: insight.shortLabel,
            detail: insight.detail,
            meta: insight.actionLabel,
            tone: insight.severity === 'critical' || insight.severity === 'warning' ? 'warning' : 'soft',
        })),
        ...snapshot.summaries.slice(-2).map((summary: DBSummary): ExperienceListItem => ({
            title: normalizeText(summary.title, '旧摘要'),
            detail: '如果长期不再提起，这类摘要会先被压缩或归档，属于当前版本里的“遗忘趋势”入口。',
            meta: `${formatRelativeTime(summary.createdAt)} · 保留上限 ${snapshot.retention.keepSummaryCount}`,
            tone: 'soft',
        })),
    ].slice(0, 4);
    setContainerHtml(ids.roleOverviewMetaId, buildRoleOverviewMarkupNext(snapshot));
    setContainerHtml(ids.rolePersonaBadgesId, buildBadgesMarkup(buildPersonaBadges(snapshot)));
    setContainerHtml(ids.rolePrimaryFactsId, buildListMarkup(longTermFacts.map(formatFactItem), '当前还没有稳定的长期记忆。'));
    setContainerHtml(ids.roleRecentMemoryId, buildListMarkup(recentFacts.map(formatFactItem), '最近还没有新的事实沉淀。'));
    setContainerHtml(ids.roleBlurMemoryId, buildListMarkup(blurCandidates, '当前没有明显的遗忘或压缩提醒。'));
}

/**
 * 功能：渲染近期事件面板。
 * 参数：
 *   ids：设置面板 ID 集。
 *   snapshot：体验快照。
 * 返回：
 *   void：无返回值。
 */
function renderRecentPanel(ids: MemoryOSSettingsIds, snapshot: ExperienceSnapshot): void {
    const lifecycleItems: ExperienceListItem[] = [
        {
            title: '聊天阶段',
            detail: formatLifecycleStage(snapshot.lifecycle),
            meta: snapshot.lifecycle.stageReasonCodes.join(' / ') || '无阶段原因',
            tone: 'accent',
        },
        {
            title: '最近变动',
            detail: snapshot.logicalView?.mutationKinds?.length
                ? snapshot.logicalView.mutationKinds.join(' / ')
                : '最近没有检测到明显的消息结构变化。',
            meta: snapshot.logicalView ? formatRelativeTime(snapshot.logicalView.rebuiltAt) : '尚未构建逻辑视图',
        },
        {
            title: '记忆质量',
            detail: `${snapshot.quality.totalScore} 分 · 命中率 ${formatScorePercent(snapshot.quality.dimensions.retrievalPrecision)}`,
            meta: `抽取接受 ${formatScorePercent(snapshot.quality.dimensions.extractAcceptance)} · 摘要新鲜度 ${formatScorePercent(snapshot.quality.dimensions.summaryFreshness)}`,
            tone: snapshot.quality.level === 'watch' || snapshot.quality.level === 'poor' || snapshot.quality.level === 'critical'
                ? 'warning'
                : 'success',
        },
    ];
    setContainerHtml(ids.recentEventsId, buildListMarkup(snapshot.events.map(formatEventItem).slice(0, 8), '最近还没有新的事件入库。'));
    setContainerHtml(ids.recentSummariesId, buildListMarkup(snapshot.summaries.map(formatSummaryItem).slice(0, 6), '最近还没有新的摘要。'));
    setContainerHtml(ids.recentLifecycleId, buildListMarkup(lifecycleItems, '暂无生命周期信息。'));
}

/**
 * 功能：渲染关系与状态面板。
 * 参数：
 *   ids：设置面板 ID 集。
 *   snapshot：体验快照。
 * 返回：
 *   void：无返回值。
 */
function renderRelationPanel(ids: MemoryOSSettingsIds, snapshot: ExperienceSnapshot): void {
    const laneItems: ExperienceListItem[] = (Array.isArray(snapshot.groupMemory?.lanes) ? snapshot.groupMemory!.lanes : [])
        .slice(0, 6)
        .map((lane: SpeakerMemoryLane): ExperienceListItem => ({
            title: normalizeText(lane.displayName, lane.actorKey),
            detail: [
                lane.relationshipDelta ? `关系：${lane.relationshipDelta}` : '',
                lane.recentGoal ? `目标：${lane.recentGoal}` : '',
                lane.lastEmotion ? `情绪：${lane.lastEmotion}` : '',
            ].filter(Boolean).join(' · ') || '当前还没有形成足够的关系线索。',
            meta: `${formatRelativeTime(Number(lane.lastActiveAt ?? 0))} · 最近消息 ${Number(lane.recentMessageIds?.length ?? 0)} 条`,
            tone: lane.relationshipDelta ? 'accent' : 'soft',
        }));
    const relationshipItems: ExperienceListItem[] = snapshot.relationshipState
        .slice(0, 6)
        .map((item: RelationshipState): ExperienceListItem => ({
            title: item.scope === 'group_pair'
                ? normalizeText((Array.isArray(item.participantKeys) ? item.participantKeys.join(' / ') : ''), item.relationshipKey)
                : normalizeText(item.targetKey, item.relationshipKey),
            detail: item.summary || '关系仍在形成。',
            meta: [
                item.scope === 'group_pair' ? '群聊对象对' : '主角色关系',
                `信任 ${Math.round(item.trust * 100)}%`,
                `好感 ${Math.round(item.affection * 100)}%`,
                item.unresolvedConflict > 0 ? `冲突 ${Math.round(item.unresolvedConflict * 100)}%` : '',
            ].filter(Boolean).join(' · '),
            tone: item.unresolvedConflict >= 0.35 ? 'warning' : item.affection >= 0.35 || item.trust >= 0.35 ? 'accent' : 'soft',
        }));
    const relationFacts: ExperienceListItem[] = snapshot.facts
        .filter(isRelationshipFact)
        .slice(0, 6)
        .map(formatFactItem);
    const stateItems: ExperienceListItem[] = snapshot.states
        .filter((state: DBWorldState): boolean => state.path.startsWith('/semantic/world') || state.path.startsWith('/scene') || state.path.startsWith('/semantic/meta'))
        .slice(0, 6)
        .map(formatStateItem);
    setContainerHtml(ids.relationOverviewId, buildRelationOverviewMarkupNext(snapshot));
    setContainerHtml(ids.relationLanesId, buildListMarkup(relationshipItems.length > 0 ? relationshipItems : laneItems.length > 0 ? laneItems : relationFacts, '当前还没有形成明显的关系或群聊分支。'));
    setContainerHtml(ids.relationStateId, buildListMarkup(stateItems, '当前还没有可展示的场景与世界状态。'));
}

/**
 * 功能：渲染本轮注入面板。
 * 参数：
 *   ids：设置面板 ID 集。
 *   snapshot：体验快照。
 * 返回：
 *   void：无返回值。
 */
function renderInjectionPanel(ids: MemoryOSSettingsIds, snapshot: ExperienceSnapshot): void {
    setContainerHtml(ids.injectionOverviewId, buildInjectionOverviewMarkupNext(snapshot));
    setContainerHtml(ids.injectionSectionsId, buildInjectionSectionMarkup(snapshot.preDecision));
    setContainerHtml(ids.injectionReasonId, buildInjectionReasonMarkup(snapshot.latestRecallExplanation));
    setContainerHtml(ids.injectionPostId, buildListMarkup(buildPostDecisionItems(snapshot.postDecision), '最近还没有生成后的写回判定。'));
}

/**
 * 功能：渲染未绑定聊天时的空状态。
 * 参数：
 *   ids：设置面板 ID 集。
 * 返回：
 *   void：无返回值。
 */
function renderEmptyState(ids: MemoryOSSettingsIds): void {
    const emptyMarkup: string = `
      <div class="stx-ui-summary-callout is-empty-state">
        <div class="stx-ui-summary-title">当前还没有绑定聊天</div>
        <div class="stx-ui-summary-copy">切换到一个可记录的聊天后，这里会显示角色记忆、近期事件、关系状态和本轮注入解释。</div>
      </div>
    `;
    setContainerHtml(ids.roleOverviewMetaId, emptyMarkup);
    setContainerHtml(ids.rolePersonaBadgesId, '<div class="stx-ui-empty-hint">等待聊天绑定后生成画像标签。</div>');
    setContainerHtml(ids.rolePrimaryFactsId, '<div class="stx-ui-empty-hint">暂无长期记忆。</div>');
    setContainerHtml(ids.roleRecentMemoryId, '<div class="stx-ui-empty-hint">暂无近期记忆。</div>');
    setContainerHtml(ids.roleBlurMemoryId, '<div class="stx-ui-empty-hint">暂无遗忘趋势。</div>');
    setContainerHtml(ids.recentEventsId, '<div class="stx-ui-empty-hint">暂无近期事件。</div>');
    setContainerHtml(ids.recentSummariesId, '<div class="stx-ui-empty-hint">暂无摘要。</div>');
    setContainerHtml(ids.recentLifecycleId, '<div class="stx-ui-empty-hint">暂无生命周期状态。</div>');
    setContainerHtml(ids.relationOverviewId, emptyMarkup);
    setContainerHtml(ids.relationLanesId, '<div class="stx-ui-empty-hint">暂无关系状态。</div>');
    setContainerHtml(ids.relationStateId, '<div class="stx-ui-empty-hint">暂无世界状态。</div>');
    setContainerHtml(ids.injectionOverviewId, emptyMarkup);
    setContainerHtml(ids.injectionSectionsId, '<div class="stx-ui-empty-hint">暂无注入区段。</div>');
    setContainerHtml(ids.injectionReasonId, '<div class="stx-ui-empty-hint">暂无注入说明。</div>');
    setContainerHtml(ids.injectionPostId, '<div class="stx-ui-empty-hint">暂无生成后判定。</div>');
    setContainerHtml(ids.tuningMigrationStatusId, '<div class="stx-ui-empty-hint">绑定聊天后这里会显示迁移状态。</div>');
}

/**
 * 功能：渲染加载失败时的错误状态。
 * 参数：
 *   ids：设置面板 ID 集。
 *   message：错误消息。
 * 返回：
 *   void：无返回值。
 */
function renderLoadErrorState(ids: MemoryOSSettingsIds, message: string): void {
    const errorMarkup: string = `
      <div class="stx-ui-summary-callout is-empty-state">
        <div class="stx-ui-summary-title">体验面板加载失败</div>
        <div class="stx-ui-summary-copy">${escapeHtml(message)}</div>
      </div>
    `;
    setContainerHtml(ids.roleOverviewMetaId, errorMarkup);
    setContainerHtml(ids.rolePersonaBadgesId, '<div class="stx-ui-empty-hint">角色画像暂时不可用。</div>');
    setContainerHtml(ids.rolePrimaryFactsId, '<div class="stx-ui-empty-hint">长期记忆暂时无法读取。</div>');
    setContainerHtml(ids.roleRecentMemoryId, '<div class="stx-ui-empty-hint">近期记忆暂时无法读取。</div>');
    setContainerHtml(ids.roleBlurMemoryId, '<div class="stx-ui-empty-hint">遗忘趋势暂时无法读取。</div>');
    setContainerHtml(ids.recentEventsId, '<div class="stx-ui-empty-hint">近期事件暂时无法读取。</div>');
    setContainerHtml(ids.recentSummariesId, '<div class="stx-ui-empty-hint">摘要暂时无法读取。</div>');
    setContainerHtml(ids.recentLifecycleId, '<div class="stx-ui-empty-hint">生命周期暂时无法读取。</div>');
    setContainerHtml(ids.relationOverviewId, errorMarkup);
    setContainerHtml(ids.relationLanesId, '<div class="stx-ui-empty-hint">关系状态暂时无法读取。</div>');
    setContainerHtml(ids.relationStateId, '<div class="stx-ui-empty-hint">世界状态暂时无法读取。</div>');
    setContainerHtml(ids.injectionOverviewId, errorMarkup);
    setContainerHtml(ids.injectionSectionsId, '<div class="stx-ui-empty-hint">注入区段暂时无法读取。</div>');
    setContainerHtml(ids.injectionReasonId, '<div class="stx-ui-empty-hint">注入说明暂时无法读取。</div>');
    setContainerHtml(ids.injectionPostId, '<div class="stx-ui-empty-hint">生成后判定暂时无法读取。</div>');
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
        const snapshot: ExperienceSnapshot = await loadExperienceSnapshot(memory);
        renderRolePanel(ids, snapshot);
        renderRecentPanel(ids, snapshot);
        renderRelationPanel(ids, snapshot);
        renderInjectionPanel(ids, snapshot);
        renderTuningPanel(ids, snapshot);
    } catch (error) {
        const message: string = normalizeText(error instanceof Error ? error.message : error, '未知错误');
        renderLoadErrorState(ids, message);
    }
}
