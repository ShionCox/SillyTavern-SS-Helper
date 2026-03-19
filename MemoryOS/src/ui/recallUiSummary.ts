import type {
    EditorExperienceSnapshot,
    LatestRecallExplanation,
    LogicalMessageNode,
} from '../../../SDK/stx';

interface RecallActorCandidate {
    actorKey: string;
    labels: string[];
}

type ExplanationItem = LatestRecallExplanation['selected']['items'][number];

export interface RecallUiSuppressedItem {
    title: string;
    reasonLabels: string[];
    score: number;
}

export interface RecallUiSummary {
    viewpointModeLabel: string;
    focusSourceLabel: string;
    primaryActorKey: string | null;
    primaryActorLabel: string;
    secondaryActorLabels: string[];
    salienceLabels: string[];
    selectedCount: number;
    rejectedCount: number;
    globalPoolSelectedCount: number;
    actorPoolSelectedCount: number;
    blockedCount: number;
    foreignPrivateSuppressedCount: number;
    forgottenBlockedCount: number;
    vectorIndexLabel: string;
    vectorRebuiltLabel: string;
    reasonLabels: string[];
}

const RECALL_UI_REASON_LABELS: Record<string, string> = {
    'focus:explicit_active_actor': '主视角来自手动指定的角色',
    'focus:current_speaker': '主视角来自最近说话人',
    'focus:salience_top1': '主视角来自角色显著度 Top1',
    'focus:no_primary_actor': '未锁定主视角，已回退到共享视角',
    'focus:secondary_actor': '已为次角色保留辅助预算',
    'focus:director_view': '当前使用导演全局视角',
    'focus:shared': '当前命中共享池',
    'focus:primary_actor': '当前命中主角色池',
    'viewpoint:shared': '当前视角可见的共享记忆',
    'viewpoint:owned_by_actor': '属于当前角色的私人记忆',
    'viewpoint:retained_for_actor': '该记忆仍被当前角色保留',
    'viewpoint:foreign_private_suppressed': '其他角色的私人记忆已按角色边界压制',
    'pool:global': '进入共享池',
    'pool:actor': '进入角色池',
    'visibility:self_owner': '归属于当前角色本人',
    'visibility:actor_retained': '当前角色仍保留这条记忆',
    'blocked:foreign_private': '其他角色的私人记忆不可见',
    'blocked:actor_forgotten': '当前角色已经遗忘这条记忆',
    foreign_private_memory_suppressed: '因角色边界规则未进入本轮注入',
    vector_hit: '命中了向量检索',
    vector_search: '来自向量搜索',
    vector_reranked: '经过向量重排',
    vector_source_metadata: '向量命中已按源记录 metadata 直连回源',
    vector_source_weak: '向量命中来自弱来源块，仅作共享参考',
    relationship_projection: '关系记忆已按当前视角做投影',
    relationship_lane_focus: '关系候选已按角色焦点重新加权',
    relationship_shared_group: '共享关系变化进入共享池',
    relationship_primary_focus: '关系候选进入主角色池',
    relationship_secondary_focus: '关系候选进入次角色池',
    relationship_foreign_private: '其他角色的私人关系不会直接暴露',
    relationship_uncertain_tone: '关系记忆强度偏低，已改为不确定语气',
};

/**
 * 功能：把任意值规整成单行文本。
 * @param value 待处理的值。
 * @returns 规整后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：把角色键规整成便于比较的形式。
 * @param actorKey 原始角色键。
 * @returns 归一化后的角色键。
 */
function normalizeActorKey(actorKey: string | null | undefined): string {
    return normalizeText(actorKey ?? '').toLowerCase();
}

/**
 * 功能：对字符串数组去重并移除空项。
 * @param values 原始字符串列表。
 * @returns 去重后的字符串列表。
 */
function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = normalizeText(value);
        if (!text) {
            continue;
        }
        const normalized = text.toLowerCase();
        if (seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(text);
    }
    return result;
}

/**
 * 功能：收集当前快照里可识别的角色及其展示标签。
 * @param snapshot 编辑器体验快照。
 * @returns 角色候选列表。
 */
function buildRecallActorCandidates(snapshot: EditorExperienceSnapshot): RecallActorCandidate[] {
    const candidates = new Map<string, RecallActorCandidate>();

    const upsertCandidate = (actorKey: string, labels: string[]): void => {
        const normalizedActorKey = normalizeActorKey(actorKey);
        if (!normalizedActorKey) {
            return;
        }
        const current = candidates.get(normalizedActorKey) ?? { actorKey: normalizeText(actorKey), labels: [] };
        current.labels = uniqueStrings([...current.labels, ...labels, current.actorKey]);
        candidates.set(normalizedActorKey, current);
    };

    snapshot.canon.characters.forEach((character): void => {
        upsertCandidate(String(character.actorKey ?? ''), [String(character.displayName ?? '')]);
    });

    (snapshot.groupMemory?.lanes ?? []).forEach((lane): void => {
        upsertCandidate(String(lane.actorKey ?? ''), [String(lane.displayName ?? ''), String(lane.actorKey ?? '')]);
    });

    const seedActorKey = String(snapshot.semanticSeed?.identitySeed?.roleKey ?? '').trim();
    if (seedActorKey) {
        upsertCandidate(seedActorKey, [
            String(snapshot.semanticSeed?.identitySeed?.displayName ?? ''),
            seedActorKey,
        ]);
    }

    const activeActorKey = String(snapshot.activeActorKey ?? '').trim();
    if (activeActorKey) {
        upsertCandidate(activeActorKey, [activeActorKey]);
    }

    return Array.from(candidates.values());
}

/**
 * 功能：根据角色键解析更适合展示的角色名称。
 * @param actorKey 角色键。
 * @param candidates 角色候选列表。
 * @returns 角色展示名称。
 */
function resolveActorLabel(actorKey: string | null | undefined, candidates: RecallActorCandidate[]): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    if (!normalizedActorKey) {
        return '未锁定主视角';
    }
    const matched = candidates.find((candidate: RecallActorCandidate): boolean => normalizeActorKey(candidate.actorKey) === normalizedActorKey);
    if (!matched) {
        return normalizeText(actorKey ?? '') || '未锁定主视角';
    }
    const preferred = matched.labels.find((label: string): boolean => normalizeActorKey(label) !== normalizedActorKey);
    return preferred || matched.actorKey;
}

/**
 * 功能：从最近可见消息中尝试提取说话人标签。
 * @param text 消息文本。
 * @returns 提取到的说话人标签。
 */
function extractVisibleSpeakerLabel(text: string): string {
    const match = normalizeText(text).match(/^([A-Za-z0-9_\u4e00-\u9fa5]{1,24})[:：]/);
    return normalizeText(match?.[1] ?? '');
}

/**
 * 功能：把说话人标签映射回已知角色键。
 * @param label 说话人标签。
 * @param candidates 角色候选列表。
 * @returns 命中的角色键；找不到时返回 null。
 */
function matchSpeakerToActorKey(label: string, candidates: RecallActorCandidate[]): string | null {
    const normalizedLabel = normalizeActorKey(label);
    if (!normalizedLabel) {
        return null;
    }
    for (const candidate of candidates) {
        if (normalizeActorKey(candidate.actorKey) === normalizedLabel) {
            return candidate.actorKey;
        }
        if (candidate.labels.some((item: string): boolean => normalizeActorKey(item) === normalizedLabel)) {
            return candidate.actorKey;
        }
    }
    return null;
}

/**
 * 功能：判断原因码列表中是否包含指定原因码。
 * @param reasonCodes 原因码列表。
 * @param target 目标原因码。
 * @returns 是否命中。
 */
function hasReasonCode(reasonCodes: string[], target: string): boolean {
    const normalizedTarget = normalizeText(target).toLowerCase();
    return reasonCodes.some((code: string): boolean => normalizeText(code).toLowerCase() === normalizedTarget);
}

/**
 * 功能：收集解释快照中的全部原因码并去重。
 * @param explanation 最近一轮注入解释。
 * @returns 去重后的原因码列表。
 */
function collectExplanationReasonCodes(explanation: LatestRecallExplanation | null): string[] {
    if (!explanation) {
        return [];
    }
    const rawCodes: string[] = [
        ...(Array.isArray(explanation.reasonCodes) ? explanation.reasonCodes : []),
        ...explanation.selected.items.flatMap((item: ExplanationItem): string[] => item.reasonCodes ?? []),
        ...explanation.conflictSuppressed.items.flatMap((item: ExplanationItem): string[] => item.reasonCodes ?? []),
        ...explanation.rejectedCandidates.items.flatMap((item: ExplanationItem): string[] => item.reasonCodes ?? []),
    ];
    return uniqueStrings(rawCodes);
}

/**
 * 功能：推断当前这一轮 recall 的主视角角色及其来源。
 * @param snapshot 编辑器体验快照。
 * @param candidates 角色候选列表。
 * @returns 主视角角色键与来源原因码。
 */
function inferPrimaryActor(snapshot: EditorExperienceSnapshot, candidates: RecallActorCandidate[]): { actorKey: string | null; reasonCode: string } {
    const explicitActorKey = normalizeText(snapshot.activeActorKey ?? '');
    if (explicitActorKey) {
        return { actorKey: explicitActorKey, reasonCode: 'focus:explicit_active_actor' };
    }

    const recentMessages: LogicalMessageNode[] = Array.isArray(snapshot.logicalView?.visibleMessages)
        ? [...snapshot.logicalView.visibleMessages].slice(-12).reverse()
        : [];
    for (const message of recentMessages) {
        const speakerLabel = extractVisibleSpeakerLabel(String(message.text ?? ''));
        const matchedActorKey = matchSpeakerToActorKey(speakerLabel, candidates);
        if (matchedActorKey) {
            return { actorKey: matchedActorKey, reasonCode: 'focus:current_speaker' };
        }
    }

    const topSalience = (snapshot.groupMemory?.actorSalience ?? [])
        .slice()
        .sort((left, right): number => Number(right.score ?? 0) - Number(left.score ?? 0))
        .map((item): string => normalizeText(item.actorKey))
        .find((actorKey: string): boolean => Boolean(actorKey));
    if (topSalience) {
        return { actorKey: topSalience, reasonCode: 'focus:salience_top1' };
    }

    return { actorKey: null, reasonCode: 'focus:no_primary_actor' };
}

/**
 * 功能：解析当前轮次的次角色列表。
 * @param snapshot 编辑器体验快照。
 * @param primaryActorKey 主视角角色键。
 * @returns 次角色键列表。
 */
function buildSecondaryActorKeys(snapshot: EditorExperienceSnapshot, primaryActorKey: string | null): string[] {
    const normalizedPrimaryKey = normalizeActorKey(primaryActorKey);
    return uniqueStrings(
        (snapshot.groupMemory?.actorSalience ?? [])
            .slice()
            .sort((left, right): number => Number(right.score ?? 0) - Number(left.score ?? 0))
            .map((item): string => normalizeText(item.actorKey))
            .filter((actorKey: string): boolean => Boolean(actorKey) && normalizeActorKey(actorKey) !== normalizedPrimaryKey),
    ).slice(0, 2);
}

/**
 * 功能：统计某组解释条目中命中特定原因码的数量。
 * @param items 解释条目列表。
 * @param targetCodes 目标原因码列表。
 * @returns 命中数量。
 */
function countItemsByReason(items: ExplanationItem[], targetCodes: string[]): number {
    return items.filter((item: ExplanationItem): boolean => targetCodes.some((code: string): boolean => hasReasonCode(item.reasonCodes ?? [], code))).length;
}

/**
 * 功能：把向量索引版本翻译成便于界面展示的中文状态。
 * @param version 原始版本值。
 * @returns 向量索引状态说明。
 */
function formatVectorIndexVersionLabel(version: string | null | undefined): string {
    const normalized = normalizeText(version ?? '');
    if (!normalized) {
        return '旧版索引 / 未标记';
    }
    if (normalized === 'source_metadata_v2') {
        return 'Metadata 直连回源';
    }
    return normalized;
}

/**
 * 功能：把时间戳翻译成相对时间说明。
 * @param ts 毫秒级时间戳。
 * @returns 相对时间说明。
 */
function formatRelativeTimeLabel(ts: number | null | undefined): string {
    if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) {
        return '尚未重建';
    }
    const deltaMs = Date.now() - Number(ts);
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
    return `${Math.max(1, Math.floor(deltaMs / day))} 天前`;
}

/**
 * 功能：把 recall 相关原因码翻译为中文说明。
 * @param code 原始原因码。
 * @returns 中文说明；如果没有命中则返回原始原因码。
 */
export function formatRecallUiReasonCode(code: string): string {
    const raw = normalizeText(code);
    if (!raw) {
        return '';
    }
    return RECALL_UI_REASON_LABELS[raw] || raw;
}

/**
 * 功能：构建 UI 层需要的 recall 视角摘要。
 * @param snapshot 编辑器体验快照。
 * @returns 供界面直接消费的 recall 摘要。
 */
export function buildRecallUiSummary(snapshot: EditorExperienceSnapshot): RecallUiSummary {
    const candidates = buildRecallActorCandidates(snapshot);
    const explanation = snapshot.latestRecallExplanation;
    const primaryActor = inferPrimaryActor(snapshot, candidates);
    const secondaryActorKeys = buildSecondaryActorKeys(snapshot, primaryActor.actorKey);
    const secondaryActorLabels = secondaryActorKeys.map((actorKey: string): string => resolveActorLabel(actorKey, candidates));
    const salienceLabels = (snapshot.groupMemory?.actorSalience ?? [])
        .slice()
        .sort((left, right): number => Number(right.score ?? 0) - Number(left.score ?? 0))
        .slice(0, 3)
        .map((item): string => resolveActorLabel(String(item.actorKey ?? ''), candidates));
    const selectedItems = explanation?.selected.items ?? [];
    const rejectedItems = explanation?.rejectedCandidates.items ?? [];
    const explanationReasonCodes = collectExplanationReasonCodes(explanation);
    const foreignPrivateSuppressedCount = countItemsByReason(rejectedItems, ['foreign_private_memory_suppressed', 'viewpoint:foreign_private_suppressed']);
    const forgottenBlockedCount = countItemsByReason(rejectedItems, ['blocked:actor_forgotten']);
    const blockedCount = countItemsByReason(rejectedItems, ['foreign_private_memory_suppressed', 'viewpoint:foreign_private_suppressed', 'blocked:actor_forgotten']);
    const actorPoolSelectedCount = countItemsByReason(selectedItems, ['pool:actor']);
    const globalPoolSelectedCount = countItemsByReason(selectedItems, ['pool:global']);
    const isRoleplay = snapshot.preDecision?.intent === 'roleplay';
    const viewpointModeLabel = isRoleplay
        ? (primaryActor.actorKey ? '角色边界视角' : '导演全局视角（缺少主视角时回退）')
        : '导演全局视角';

    return {
        viewpointModeLabel,
        focusSourceLabel: formatRecallUiReasonCode(primaryActor.reasonCode),
        primaryActorKey: primaryActor.actorKey,
        primaryActorLabel: resolveActorLabel(primaryActor.actorKey, candidates),
        secondaryActorLabels,
        salienceLabels,
        selectedCount: selectedItems.length,
        rejectedCount: rejectedItems.length,
        globalPoolSelectedCount,
        actorPoolSelectedCount,
        blockedCount,
        foreignPrivateSuppressedCount,
        forgottenBlockedCount,
        vectorIndexLabel: formatVectorIndexVersionLabel(snapshot.vectorIndexVersion),
        vectorRebuiltLabel: formatRelativeTimeLabel(snapshot.vectorMetadataRebuiltAt),
        reasonLabels: explanationReasonCodes.map((code: string): string => formatRecallUiReasonCode(code)).filter((label: string): boolean => Boolean(label)).slice(0, 6),
    };
}

/**
 * 功能：提取最近一轮里因角色边界被压制的条目。
 * @param explanation 最近一轮注入解释。
 * @param limit 最多返回多少条。
 * @returns 被压制条目的标题与原因摘要。
 */
export function extractForeignPrivateSuppressedItems(explanation: LatestRecallExplanation | null, limit: number = 6): RecallUiSuppressedItem[] {
    if (!explanation) {
        return [];
    }
    return explanation.rejectedCandidates.items
        .filter((item: ExplanationItem): boolean => hasReasonCode(item.reasonCodes ?? [], 'foreign_private_memory_suppressed') || hasReasonCode(item.reasonCodes ?? [], 'viewpoint:foreign_private_suppressed'))
        .slice(0, Math.max(1, limit))
        .map((item: ExplanationItem): RecallUiSuppressedItem => ({
            title: normalizeText(item.title) || '未命名候选',
            reasonLabels: uniqueStrings((item.reasonCodes ?? []).map((code: string): string => formatRecallUiReasonCode(code))).slice(0, 3),
            score: Number(item.score ?? 0) || 0,
        }));
}
