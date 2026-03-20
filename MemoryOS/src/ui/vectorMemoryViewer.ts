import type { MemorySDKImpl } from '../sdk/memory-sdk';
import { Toast } from '../../../SDK/toast';
import { parseAnyTavernChatRefEvent } from '../../../SDK/tavern';
import { escapeHtml, formatTimeLabel, normalizeLookup } from './editorShared';
import type {
    MemoryCardSummary,
    MemoryRecallPreviewHit,
    MemoryRecallPreviewResult,
    MemoryCardViewerSnapshot,
} from '../../../SDK/stx';

type VectorMemorySortMode = 'recent_hit' | 'recent_index' | 'recent_created' | 'content_length' | 'usage';
type VectorMemoryTimeFilter = '__all__' | 'indexed_7d' | 'indexed_30d' | 'hit_7d' | 'hit_30d';

interface VectorMemoryViewerState {
    snapshot: MemoryCardViewerSnapshot | null;
    testResult: MemoryRecallPreviewResult | null;
    selectedCardId: string | null;
    activeActorKey: string | null;
    keyword: string;
    sourceKind: 'all' | 'fact' | 'summary' | 'unknown';
    statusKind: 'all' | 'normal' | 'recent_hit' | 'long_unused' | 'source_missing' | 'archived_residual' | 'needs_rebuild';
    actorKey: '__all__' | '__current__' | string;
    sortMode: VectorMemorySortMode;
    timeFilter: VectorMemoryTimeFilter;
    quickRecentHit: boolean;
    quickLongUnused: boolean;
    quickAbnormal: boolean;
    quickCurrentActor: boolean;
    testQuery: string;
    isLoading: boolean;
    isRunningTest: boolean;
}

interface VectorMemoryActorOption {
    key: string;
    label: string;
}

export interface VectorMemoryViewerDerivedItem {
    item: MemoryCardSummary;
    testHit: MemoryRecallPreviewHit | null;
}

export interface VectorMemoryViewerSourceJumpTarget {
    tableName: 'facts' | 'summaries' | 'events';
    recordId?: string;
    messageId?: string;
}

export interface VectorMemoryViewerControllerOptions {
    container: HTMLElement;
    getMemory: () => Promise<MemorySDKImpl>;
    onJumpToRaw: (target: VectorMemoryViewerSourceJumpTarget) => Promise<void> | void;
}

const STYLE_ID = 'stx-vector-memory-viewer-style';
const toast = new Toast('MemoryOS');

/**
 * 功能：确保向量记忆查看器样式只注入一次。
 * @returns 无返回值。
 */
function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.stx-vmv{display:flex;flex-direction:column;gap:16px;color:var(--SmartThemeBodyColor,#f5f5f5);font-family:"Noto Sans SC",var(--mainFontFamily,sans-serif)}
.stx-vmv-hero,.stx-vmv-layout{display:grid;gap:14px}
.stx-vmv-hero{grid-template-columns:minmax(0,1.3fr) minmax(320px,.9fr)}
.stx-vmv-layout{grid-template-columns:minmax(240px,.75fr) minmax(0,1.12fr) minmax(320px,.95fr);min-height:620px}
.stx-vmv-card,.stx-vmv-panel,.stx-vmv-hero-card{border:1px solid color-mix(in srgb,var(--SmartThemeBorderColor,rgba(255,255,255,.16)) 92%,transparent);background:radial-gradient(circle at top right,color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 18%,transparent) 0%,transparent 42%),color-mix(in srgb,var(--SmartThemeBlurTintColor,#161616) 88%,transparent);border-radius:18px;box-shadow:0 18px 46px rgba(0,0,0,.22)}
.stx-vmv-hero-card,.stx-vmv-panel,.stx-vmv-card{padding:16px}
.stx-vmv-kicker,.stx-vmv-chip,.stx-vmv-pill,.stx-vmv-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-size:12px}
.stx-vmv-kicker{padding:6px 10px;background:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 14%,transparent);color:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 78%,white 22%);letter-spacing:.08em;text-transform:uppercase}
.stx-vmv-title{margin-bottom:14px;margin-top:14px;font-size:clamp(28px,4vw,42px);font-weight:900;letter-spacing:-.04em;line-height:1.04}
.stx-vmv-subtitle,.stx-vmv-toolbar-meta,.stx-vmv-inline-note{font-size:12px;line-height:1.75;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 74%,transparent)}
.stx-vmv-chip,.stx-vmv-badge{padding:6px 10px;background:color-mix(in srgb,var(--SmartThemeBorderColor,rgba(255,255,255,.16)) 26%,transparent)}
.stx-vmv-pill{padding:5px 9px;font-weight:700;background:rgba(255,255,255,.06)}
.stx-vmv-pill.tone-success{background:rgba(22,163,74,.14);color:#78e08f}
.stx-vmv-pill.tone-warning{background:rgba(245,158,11,.14);color:#fbbf24}
.stx-vmv-pill.tone-danger{background:rgba(248,113,113,.16);color:#fca5a5}
.stx-vmv-pill.tone-muted{background:rgba(148,163,184,.14);color:#cbd5f5}
.stx-vmv-chip-row,.stx-vmv-actions,.stx-vmv-badge-row,.stx-vmv-toolbar-row,.stx-vmv-quick-grid,.stx-vmv-stat-grid,.stx-vmv-test-rank{display:flex;flex-wrap:wrap;gap:8px}
.stx-vmv-toolbar-row{align-items:center;justify-content:space-between}
.stx-vmv-section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.stx-vmv-section-title strong,.stx-vmv-toolbar-row h3,.stx-vmv-detail-head h3,.stx-vmv-detail-card h4{margin:0;font-weight:800}
.stx-vmv-section-title strong,.stx-vmv-detail-card h4{font-size:15px}
.stx-vmv-toolbar-row h3,.stx-vmv-detail-head h3{font-size:18px}
.stx-vmv-filter-field{display:flex;flex-direction:column;gap:7px}
.stx-vmv-filter-field label,.stx-vmv-block-title{font-size:12px;font-weight:700;letter-spacing:.04em;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 76%,transparent)}
.stx-vmv-test-card textarea,.stx-vmv-filter-field input,.stx-vmv-filter-field select{width:100%;border-radius:14px;border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#121212) 94%,transparent);color:var(--SmartThemeBodyColor,#f5f5f5);padding:12px 14px;font-size:13px;outline:none}
.stx-vmv-test-card textarea{min-height:92px;resize:vertical;line-height:1.6}
.stx-vmv-list-stack,.stx-vmv-detail-stack{display:flex;flex-direction:column;gap:12px}
.stx-vmv-list-scroller,.stx-vmv-detail-scroller{min-height:0;overflow:auto;padding-right:4px}
.stx-vmv-card{display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:border-color .18s ease,transform .18s ease}
.stx-vmv-card:hover,.stx-vmv-quick-btn:hover,.stx-vmv-icon-btn:hover{border-color:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 72%,white 28%)}
.stx-vmv-card.is-selected{border-color:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 80%,white 20%);box-shadow:0 0 0 1px color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 36%,transparent),0 22px 48px rgba(0,0,0,.24)}
.stx-vmv-card-topline,.stx-vmv-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.stx-vmv-card-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;line-height:1.65}
.stx-vmv-card-meta{display:flex;flex-direction:column;gap:4px;font-size:12px;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 74%,transparent)}
.stx-vmv-content-box{white-space:pre-wrap;line-height:1.7;font-size:13px;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#0f0f0f) 96%,transparent);border:1px solid color-mix(in srgb,var(--SmartThemeBorderColor,rgba(255,255,255,.16)) 76%,transparent)}
.stx-vmv-stat-grid,.stx-vmv-test-rank{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.stx-vmv-test-rank{grid-template-columns:repeat(3,minmax(0,1fr))}
.stx-vmv-stat{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--SmartThemeBorderColor,rgba(255,255,255,.16)) 22%,transparent);display:flex;flex-direction:column;gap:5px}
.stx-vmv-stat label{font-size:11px;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 70%,transparent)}
.stx-vmv-kv-list{display:grid;grid-template-columns:minmax(88px,108px) minmax(0,1fr);gap:8px 10px;align-items:start;font-size:12px}
.stx-vmv-kv-list dt{color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 68%,transparent)}
.stx-vmv-kv-list dd{margin:0;line-height:1.65}
.stx-vmv-empty,.stx-vmv-details{border-radius:16px;border:1px dashed var(--SmartThemeBorderColor,rgba(255,255,255,.16));background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#121212) 88%,transparent)}
.stx-vmv-empty{padding:20px 16px;font-size:13px;line-height:1.8;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f5f5f5) 74%,transparent)}
.stx-vmv-reasons{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:1.65}
.stx-vmv-details summary{cursor:pointer;list-style:none;padding:12px 14px;font-size:13px;font-weight:700}
.stx-vmv-details summary::-webkit-details-marker{display:none}
.stx-vmv-details-body{padding:0 14px 14px;display:flex;flex-direction:column;gap:12px}
.stx-vmv-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.stx-vmv-quick-btn,.stx-vmv-icon-btn{border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16));background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#121212) 92%,transparent);color:var(--SmartThemeBodyColor,#f5f5f5);border-radius:12px;padding:10px 12px;font-size:12px;cursor:pointer}
.stx-vmv-quick-btn.is-active{background:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 18%,transparent);color:color-mix(in srgb,var(--SmartThemeQuoteColor,#ef7d2d) 84%,white 16%)}
@media (max-width:1080px){.stx-vmv-hero,.stx-vmv-layout{grid-template-columns:1fr}}
@media (max-width:720px){.stx-vmv-quick-grid,.stx-vmv-stat-grid,.stx-vmv-test-rank{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
}

/**
 * 功能：格式化相对时间。
 * @param value 时间戳。
 * @returns 相对时间文本。
 */
function formatRelativeTime(value: number | null | undefined): string {
    const ts = Number(value ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) {
        return '暂无';
    }
    const diff = Date.now() - ts;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分钟前`;
    if (diff < day) return `${Math.max(1, Math.round(diff / hour))} 小时前`;
    return `${Math.max(1, Math.round(diff / day))} 天前`;
}

/**
 * 功能：压缩过长文本，避免界面被内部键值撑开。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 压缩后的展示文本。
 */
function compactDisplayText(value: string, maxLength: number): string {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue || normalizedValue.length <= maxLength) {
        return normalizedValue;
    }
    const safeMaxLength = Math.max(12, Math.floor(maxLength));
    const headLength = Math.max(5, Math.floor((safeMaxLength - 3) / 2));
    const tailLength = Math.max(4, safeMaxLength - headLength - 3);
    return `${normalizedValue.slice(0, headLength)}...${normalizedValue.slice(-tailLength)}`;
}

/**
 * 功能：去掉聊天 ID 末尾的自动时间戳后缀。
 * @param chatId 原始聊天 ID。
 * @returns 去掉噪音后的聊天 ID。
 */
function stripGeneratedChatSuffix(chatId: string): string {
    return String(chatId ?? '')
        .trim()
        .replace(/(?:\s*[_-]+\s*)?\d{4}-\d{2}-\d{2}@\d{2}h\d{2}m\d{2}s\d{1,3}ms$/i, '')
        .replace(/[_\s-]+$/g, '')
        .trim();
}

/**
 * 功能：把聊天 ID 中的时间戳转成更短的展示时间。
 * @param chatId 原始聊天 ID。
 * @returns 适合界面展示的时间标签。
 */
function extractChatSessionStamp(chatId: string): string {
    const match = String(chatId ?? '').trim().match(/(\d{4})-(\d{2})-(\d{2})@(\d{2})h(\d{2})m/i);
    if (!match) {
        return '';
    }
    const [, year, month, day, hour, minute] = match;
    const currentYear = String(new Date().getFullYear());
    return year === currentYear
        ? `${month}-${day} ${hour}:${minute}`
        : `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 功能：根据 Tavern 作用域键推断更易读的会话主体名称。
 * @param scopeType 作用域类型。
 * @param scopeId 作用域 ID。
 * @returns 适合展示的主体名称。
 */
function resolveTavernScopeLabel(scopeType: string, scopeId: string): string {
    const normalizedScopeId = String(scopeId ?? '').trim();
    if (!normalizedScopeId || normalizedScopeId === 'unknown_scope') {
        return '';
    }
    const context = (window as any).SillyTavern?.getContext?.() || {};
    const groups = Array.isArray(context.groups) ? context.groups : [];
    const characters = Array.isArray(context.characters) ? context.characters : [];

    if (scopeType === 'group') {
        const matchedGroup = groups.find((item: Record<string, unknown>): boolean => {
            return normalizeLookup(item.id) === normalizeLookup(normalizedScopeId)
                || normalizeLookup(item.name) === normalizeLookup(normalizedScopeId)
                || normalizeLookup(item.avatar) === normalizeLookup(normalizedScopeId);
        });
        const groupName = String(matchedGroup?.name ?? '').trim();
        return groupName ? `[群组] ${groupName}` : `[群组] ${normalizedScopeId}`;
    }

    const matchedCharacter = characters.find((item: Record<string, unknown>): boolean => {
        return normalizeLookup(item.avatar) === normalizeLookup(normalizedScopeId)
            || normalizeLookup(item.name) === normalizeLookup(normalizedScopeId);
    });
    return String(matchedCharacter?.name ?? '').trim() || normalizedScopeId;
}

/**
 * 功能：把内部 chatKey 格式化为更短、更适合界面展示的会话名称。
 * @param chatKey 原始聊天键。
 * @returns 展示用会话名称。
 */
function formatViewerChatLabel(chatKey: string | null | undefined): string {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return '全局记录';
    }

    const parsedRef = parseAnyTavernChatRefEvent(normalizedChatKey);
    const scopeLabel = resolveTavernScopeLabel(parsedRef.scopeType, parsedRef.scopeId);
    const sessionStamp = extractChatSessionStamp(parsedRef.chatId);
    const compactChatId = stripGeneratedChatSuffix(parsedRef.chatId);

    if (scopeLabel && sessionStamp) {
        return `${scopeLabel} · ${sessionStamp}`;
    }
    if (scopeLabel) {
        return scopeLabel;
    }
    if (compactChatId && compactChatId !== 'fallback_chat') {
        return compactDisplayText(compactChatId, 32);
    }
    return compactDisplayText(normalizedChatKey, 32) || '全局记录';
}

/**
 * 功能：把来源范围转换为中文。
 * @param scope 来源范围。
 * @returns 中文标签。
 */
function formatScopeLabel(scope: string | null | undefined): string {
    const normalized = normalizeLookup(scope);
    if (normalized === 'self') return '当前角色';
    if (normalized === 'target') return '目标角色';
    if (normalized === 'group') return '群组共享';
    if (normalized === 'world') return '世界共享';
    if (normalized === 'system') return '系统整理';
    return normalized || '未标记';
}

/**
 * 功能：把来源类型转换为中文。
 * @param kind 来源类型。
 * @returns 中文标签。
 */
/**
 * 功能：把记忆卡层级转成可读中文。
 * @param lane 记忆卡层级。
 * @returns 中文标签。
 */
function formatMemoryLaneLabel(lane: string | null | undefined): string {
    const normalized = normalizeLookup(lane);
    if (normalized === 'identity') return '身份';
    if (normalized === 'style') return '风格';
    if (normalized === 'relationship') return '关系';
    if (normalized === 'rule') return '规则';
    if (normalized === 'event') return '事件';
    if (normalized === 'state') return '状态';
    return normalized || '其他';
}

function formatSourceKindLabel(kind: MemoryCardSummary['sourceRecordKind']): string {
    if (kind === 'fact') return '事实';
    if (kind === 'summary') return '摘要';
    if (kind === 'semantic_seed') return '语义种子';
    return '未知来源';
}

/**
 * 功能：把记忆类型转换为中文。
 * @param value 记忆类型。
 * @returns 中文标签。
 */
function formatMemoryTypeLabel(value: string | null | undefined): string {
    const normalized = normalizeLookup(value);
    if (normalized === 'identity') return '身份';
    if (normalized === 'event') return '事件';
    if (normalized === 'relationship') return '关系';
    if (normalized === 'world') return '世界';
    if (normalized === 'status') return '状态';
    return normalized || '其他';
}

/**
 * 功能：把记忆细分类转换为中文。
 * @param value 记忆细分类。
 * @returns 中文标签。
 */
function formatMemorySubtypeLabel(value: string | null | undefined): string {
    const normalized = normalizeLookup(value);
    const map: Record<string, string> = {
        trait: '特征',
        preference: '偏好',
        bond: '关系纽带',
        emotion_imprint: '情绪印记',
        goal: '目标',
        promise: '承诺',
        secret: '秘密',
        rumor: '传闻',
        major_plot_event: '重大事件',
        minor_event: '小事件',
        conversation_event: '对话事件',
        temporary_status: '临时状态',
        global_rule: '全局规则',
        city_rule: '城市规则',
        location_fact: '地点事实',
        world_history: '世界历史',
    };
    return map[normalized] ?? (normalized || '其他');
}

/**
 * 功能：格式化匹配强度。
 * @param value 分数。
 * @returns 展示文本。
 */
function formatScore(value: number | null | undefined): string {
    const score = Number(value ?? NaN);
    return Number.isFinite(score) ? score.toFixed(3) : '暂无';
}

/**
 * 功能：判断当前记忆是否属于异常项。
 * @param item 向量记忆。
 * @returns 是否异常。
 */
function isAbnormalItem(item: MemoryCardSummary): boolean {
    return item.sourceMissing
        || item.needsRebuild
        || item.isArchived
        || item.statusKind === 'long_unused'
        || item.duplicateCount > 1
        || item.contentLength < 8;
}

/**
 * 功能：判断当前记忆是否与某个角色相关。
 * @param item 向量记忆。
 * @param actorKey 角色键。
 * @returns 是否相关。
 */
function matchesActor(item: MemoryCardSummary, actorKey: string | null | undefined): boolean {
    const normalizedActorKey = normalizeLookup(actorKey);
    if (!normalizedActorKey) {
        return false;
    }
    return normalizeLookup(item.ownerActorKey) === normalizedActorKey
        || item.participantActorKeys.some((value: string): boolean => normalizeLookup(value) === normalizedActorKey);
}

/**
 * 功能：构建角色筛选选项。
 * @param snapshot 查看器快照。
 * @returns 角色筛选选项。
 */
function buildActorOptions(snapshot: MemoryCardViewerSnapshot | null): VectorMemoryActorOption[] {
    if (!snapshot) {
        return [];
    }
    const map = new Map<string, string>();
    snapshot.items.forEach((item: MemoryCardSummary): void => {
        const ownerKey = String(item.ownerActorKey ?? '').trim();
        if (ownerKey) {
            map.set(ownerKey, String(item.ownerActorLabel ?? '').trim() || ownerKey);
        }
        item.participantActorKeys.forEach((participantKey: string, index: number): void => {
            const normalizedKey = String(participantKey ?? '').trim();
            if (normalizedKey) {
                map.set(normalizedKey, String(item.participantActorLabels[index] ?? '').trim() || normalizedKey);
            }
        });
    });
    return Array.from(map.entries())
        .sort((left, right): number => left[1].localeCompare(right[1], 'zh-CN'))
        .map(([key, label]) => ({ key, label }));
}

/**
 * 功能：构建检索测试命中索引。
 * @param result 检索测试结果。
 * @returns 命中映射。
 */
function buildSearchHitMap(result: MemoryRecallPreviewResult | null): Map<string, MemoryRecallPreviewHit> {
    const map = new Map<string, MemoryRecallPreviewHit>();
    (result?.hits ?? []).forEach((hit: MemoryRecallPreviewHit): void => {
        const cardId = String(hit.cardId ?? hit.chunkId ?? '').trim();
        if (cardId) {
            map.set(cardId, hit);
        }
    });
    return map;
}

/**
 * 功能：按当前筛选条件整理查看器列表。
 * @param snapshot 查看器快照。
 * @param state 当前界面状态。
 * @returns 可展示的列表项。
 */
export function deriveVectorMemoryViewerItems(
    snapshot: MemoryCardViewerSnapshot | null,
    state: Pick<VectorMemoryViewerState, 'keyword' | 'sourceKind' | 'statusKind' | 'actorKey' | 'sortMode' | 'timeFilter' | 'quickRecentHit' | 'quickLongUnused' | 'quickAbnormal' | 'quickCurrentActor' | 'activeActorKey' | 'testResult'>,
): VectorMemoryViewerDerivedItem[] {
    if (!snapshot) {
        return [];
    }
    const now = Date.now();
    const searchHitMap = buildSearchHitMap(state.testResult ?? null);
    const itemMap = new Map<string, MemoryCardSummary>();
    const cardHitMap = new Map<string, MemoryRecallPreviewHit>();
    snapshot.items.forEach((item: MemoryCardSummary): void => {
        itemMap.set(item.cardId, item);
        const cardIds = Array.isArray(item.cardIds) && item.cardIds.length > 0 ? item.cardIds : [item.cardId];
        cardIds.forEach((cardId: string): void => {
            itemMap.set(cardId, item);
        });
        const matchedHits = cardIds
            .map((cardId: string): MemoryRecallPreviewHit | null => searchHitMap.get(cardId) ?? null)
            .filter((hit: MemoryRecallPreviewHit | null): hit is MemoryRecallPreviewHit => hit != null)
            .sort((left: MemoryRecallPreviewHit, right: MemoryRecallPreviewHit): number => Number(right.vectorScore ?? 0) - Number(left.vectorScore ?? 0));
        if (matchedHits.length > 0) {
            cardHitMap.set(item.cardId, matchedHits[0]);
        }
    });
    const orderedItems = state.testResult
        ? state.testResult.hits
            .map((hit: MemoryRecallPreviewHit): MemoryCardSummary | null => itemMap.get(String(hit.cardId ?? hit.chunkId ?? '').trim()) ?? null)
            .filter((item: MemoryCardSummary | null): item is MemoryCardSummary => item != null)
        : [...snapshot.items];
    const filtered = orderedItems.filter((item: MemoryCardSummary): boolean => {
        const keyword = normalizeLookup(state.keyword);
        if (keyword) {
            const haystack = [
                item.content,
                item.sourceLabel,
                item.sourceDetail,
                item.ownerActorLabel,
                item.ownerActorKey,
                item.participantActorLabels.join(' '),
                item.participantActorKeys.join(' '),
                item.statusLabel,
            ].map((value: unknown): string => normalizeLookup(value)).join(' ');
            if (!haystack.includes(keyword)) {
                return false;
            }
        }
        if (state.sourceKind !== 'all' && item.sourceRecordKind !== state.sourceKind) return false;
        if (state.statusKind !== 'all' && item.statusKind !== state.statusKind) return false;
        if (state.actorKey === '__current__' && !matchesActor(item, state.activeActorKey)) return false;
        if (state.actorKey !== '__all__' && state.actorKey !== '__current__' && !matchesActor(item, state.actorKey)) return false;
        if (state.timeFilter === 'indexed_7d' && now - Number(item.createdAt ?? 0) > 7 * 24 * 60 * 60 * 1000) return false;
        if (state.timeFilter === 'indexed_30d' && now - Number(item.createdAt ?? 0) > 30 * 24 * 60 * 60 * 1000) return false;
        if (state.timeFilter === 'hit_7d' && (!(item.usage.lastHitAt) || now - Number(item.usage.lastHitAt) > 7 * 24 * 60 * 60 * 1000)) return false;
        if (state.timeFilter === 'hit_30d' && (!(item.usage.lastHitAt) || now - Number(item.usage.lastHitAt) > 30 * 24 * 60 * 60 * 1000)) return false;
        if (state.quickRecentHit && item.statusKind !== 'recent_hit') return false;
        if (state.quickLongUnused && item.statusKind !== 'long_unused') return false;
        if (state.quickAbnormal && !isAbnormalItem(item)) return false;
        if (state.quickCurrentActor && !matchesActor(item, state.activeActorKey)) return false;
        return true;
    });
    if (!state.testResult) {
        filtered.sort((left: MemoryCardSummary, right: MemoryCardSummary): number => {
            if (state.sortMode === 'recent_hit') {
                return Number(right.usage.lastHitAt ?? 0) - Number(left.usage.lastHitAt ?? 0)
                    || Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
            }
            if (state.sortMode === 'content_length') {
                return Number(right.contentLength ?? 0) - Number(left.contentLength ?? 0)
                    || Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
            }
            if (state.sortMode === 'usage') {
                return Number(right.usage.totalHits ?? 0) - Number(left.usage.totalHits ?? 0)
                    || Number(right.usage.selectedHits ?? 0) - Number(left.usage.selectedHits ?? 0)
                    || Number(right.usage.lastHitAt ?? 0) - Number(left.usage.lastHitAt ?? 0);
            }
            return Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
        });
    }
    return filtered.map((item: MemoryCardSummary): VectorMemoryViewerDerivedItem => ({
        item,
        testHit: cardHitMap.get(item.cardId) ?? null,
    }));
}

/**
 * 功能：复制文本到剪贴板。
 * @param text 目标文本。
 * @returns 是否复制成功。
 */
async function copyText(text: string): Promise<boolean> {
    const normalized = String(text ?? '');
    if (!normalized) {
        return false;
    }
    try {
        await navigator.clipboard.writeText(normalized);
        return true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = normalized;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
    }
}

/**
 * 功能：构建状态标签类名。
 * @param item 向量记忆。
 * @returns 状态类名。
 */
function buildStatusToneClass(item: MemoryCardSummary): string {
    if (item.statusTone === 'success') return 'tone-success';
    if (item.statusTone === 'danger') return 'tone-danger';
    if (item.statusTone === 'muted') return 'tone-muted';
    return 'tone-warning';
}

/**
 * 功能：将任意值渲染为安全文本。
 * @param value 原始值。
 * @returns 安全文本。
 */
function renderValue(value: unknown): string {
    const normalized = String(value ?? '').trim();
    return escapeHtml(normalized || '暂无');
}

/**
 * 功能：选择当前详情项。
 * @param items 当前列表项。
 * @param selectedCardId 已选记忆卡编号。
 * @returns 选中的列表项。
 */
function pickSelectedItem(items: VectorMemoryViewerDerivedItem[], selectedCardId: string | null): VectorMemoryViewerDerivedItem | null {
    if (items.length <= 0) {
        return null;
    }
    const normalizedSelected = normalizeLookup(selectedCardId);
    return items.find((entry: VectorMemoryViewerDerivedItem): boolean => {
        return normalizeLookup(entry.item.cardId) === normalizedSelected
            || (Array.isArray(entry.item.cardIds) && entry.item.cardIds.some((cardId: string): boolean => normalizeLookup(cardId) === normalizedSelected));
    }) ?? items[0] ?? null;
}

/**
 * 功能：控制向量记忆查看器的渲染与交互。
 */
export class VectorMemoryViewerController {
    private container: HTMLElement;
    private getMemory: () => Promise<MemorySDKImpl>;
    private onJumpToRaw: (target: VectorMemoryViewerSourceJumpTarget) => Promise<void> | void;
    private state: VectorMemoryViewerState;
    private bound = false;

    constructor(options: VectorMemoryViewerControllerOptions) {
        ensureStyles();
        this.container = options.container;
        this.getMemory = options.getMemory;
        this.onJumpToRaw = options.onJumpToRaw;
        this.state = {
            snapshot: null,
            testResult: null,
            selectedCardId: null,
            activeActorKey: null,
            keyword: '',
            sourceKind: 'all',
            statusKind: 'all',
            actorKey: '__all__',
            sortMode: 'recent_hit',
            timeFilter: '__all__',
            quickRecentHit: false,
            quickLongUnused: false,
            quickAbnormal: false,
            quickCurrentActor: false,
            testQuery: '',
            isLoading: false,
            isRunningTest: false,
        };
        this.bindEvents();
    }

    /**
     * 功能：重置查看器状态。
     * @returns 无返回值。
     */
    public reset(): void {
        this.state = {
            snapshot: null,
            testResult: null,
            selectedCardId: null,
            activeActorKey: null,
            keyword: '',
            sourceKind: 'all',
            statusKind: 'all',
            actorKey: '__all__',
            sortMode: 'recent_hit',
            timeFilter: '__all__',
            quickRecentHit: false,
            quickLongUnused: false,
            quickAbnormal: false,
            quickCurrentActor: false,
            testQuery: '',
            isLoading: false,
            isRunningTest: false,
        };
        this.paint();
    }

    /**
     * 功能：聚焦指定向量片段。
     * @param cardId 记忆卡编号。
     * @returns 无返回值。
     */
    public focusCard(cardId: string | null): void {
        this.state.selectedCardId = String(cardId ?? '').trim() || null;
        this.paint();
    }

    /**
     * 功能：重新读取数据并渲染查看器。
     * @returns 无返回值。
     */
    public async render(): Promise<void> {
        this.state.isLoading = true;
        this.paint();
        try {
            await this.reloadData();
        } finally {
            this.state.isLoading = false;
            this.paint();
        }
    }

    /**
     * 功能：绑定容器事件委托。
     * @returns 无返回值。
     */
    private bindEvents(): void {
        if (this.bound) {
            return;
        }
        this.bound = true;
        this.container.addEventListener('click', (event: Event): void => {
            void this.handleClick(event);
        });
        this.container.addEventListener('input', (event: Event): void => {
            this.handleInput(event);
        });
        this.container.addEventListener('change', (event: Event): void => {
            this.handleChange(event);
        });
        this.container.addEventListener('submit', (event: Event): void => {
            event.preventDefault();
            void this.runSearchTest();
        });
    }

    /**
     * 功能：重新加载快照和角色上下文。
     * @returns 无返回值。
     */
    private async reloadData(): Promise<void> {
        const memory = await this.getMemory();
        const queryToRerun = String(this.state.testResult?.query ?? this.state.testQuery ?? '').trim();
        const [snapshot, activeActorKey] = await Promise.all([
            memory.editor.getMemoryCardSnapshot(),
            memory.chatState.getActiveActorKey(),
        ]);
        this.state.snapshot = snapshot;
        this.state.activeActorKey = String(activeActorKey ?? '').trim() || null;
        this.state.testResult = queryToRerun ? await memory.editor.runMemoryRecallPreview(queryToRerun) : null;
        if (queryToRerun) {
            this.state.testQuery = queryToRerun;
        }
        this.state.selectedCardId = pickSelectedItem(
            deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
            this.state.selectedCardId,
        )?.item.cardId ?? null;
    }

    /**
     * 功能：处理输入框变更。
     * @param event 输入事件。
     * @returns 无返回值。
     */
    private handleInput(event: Event): void {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
        if (!target) {
            return;
        }
        const field = String(target.dataset.field ?? '').trim();
        if (field === 'keyword') {
            this.state.keyword = target.value;
            this.state.selectedCardId = pickSelectedItem(
                deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
                this.state.selectedCardId,
            )?.item.cardId ?? null;
            this.paint();
        }
        if (field === 'testQuery') {
            this.state.testQuery = target.value;
        }
    }

    /**
     * 功能：处理筛选项切换。
     * @param event 变更事件。
     * @returns 无返回值。
     */
    private handleChange(event: Event): void {
        const target = event.target as HTMLSelectElement | null;
        if (!target) {
            return;
        }
        const field = String(target.dataset.field ?? '').trim();
        if (field === 'sourceKind') this.state.sourceKind = target.value as VectorMemoryViewerState['sourceKind'];
        if (field === 'statusKind') this.state.statusKind = target.value as VectorMemoryViewerState['statusKind'];
        if (field === 'actorKey') this.state.actorKey = target.value as VectorMemoryViewerState['actorKey'];
        if (field === 'sortMode') this.state.sortMode = target.value as VectorMemorySortMode;
        if (field === 'timeFilter') this.state.timeFilter = target.value as VectorMemoryTimeFilter;
        this.state.selectedCardId = pickSelectedItem(
            deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
            this.state.selectedCardId,
        )?.item.cardId ?? null;
        this.paint();
    }

    /**
     * 功能：处理按钮和卡片点击。
     * @param event 点击事件。
     * @returns 无返回值。
     */
    private async handleClick(event: Event): Promise<void> {
        const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
        if (!target) {
            return;
        }
        const action = String(target.dataset.action ?? '').trim();
        const cardId = String(target.dataset.cardId ?? '').trim() || null;
        if (action === 'select-item' && cardId) {
            this.state.selectedCardId = cardId;
            this.paint();
            return;
        }
        if (action === 'toggle-quick') {
            const key = String(target.dataset.key ?? '').trim();
            if (key === 'recent') this.state.quickRecentHit = !this.state.quickRecentHit;
            if (key === 'unused') this.state.quickLongUnused = !this.state.quickLongUnused;
            if (key === 'abnormal') this.state.quickAbnormal = !this.state.quickAbnormal;
            if (key === 'current') this.state.quickCurrentActor = !this.state.quickCurrentActor;
            this.state.selectedCardId = pickSelectedItem(
                deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
                this.state.selectedCardId,
            )?.item.cardId ?? null;
            this.paint();
            return;
        }
        if (action === 'clear-test') {
            this.state.testQuery = '';
            this.state.testResult = null;
            this.state.selectedCardId = pickSelectedItem(
                deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
                this.state.selectedCardId,
            )?.item.cardId ?? null;
            this.paint();
            return;
        }
        if (action === 'run-test') {
            await this.runSearchTest();
            return;
        }
        if (action === 'batch-rebuild') {
            await this.rebuildCurrentItems();
            return;
        }
        if (action === 'batch-ignore') {
            await this.archiveCurrentItems();
            return;
        }
        if (action === 'batch-export') {
            this.exportCurrentItems();
            return;
        }
        const selected = pickSelectedItem(
            deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
            this.state.selectedCardId,
        );
        const item = selected?.item ?? null;
        if (!item || !cardId || item.cardId !== cardId) {
            return;
        }
        if (action === 'jump-source') {
            await this.jumpToSource(item);
            return;
        }
        if (action === 'jump-anchor') {
            await this.jumpToAnchor(item);
            return;
        }
        if (action === 'copy-content') {
            const copied = await copyText(item.memoryText || item.content);
            if (copied) {
                toast.success('已复制记忆内容');
            } else {
                toast.error('复制失败');
            }
            return;
        }
        if (action === 'rebuild-item') {
            await this.rebuildSelectedItem(item);
            return;
        }
        if (action === 'delete-item') {
            await this.deleteSelectedItem(item);
            return;
        }
        if (action === 'toggle-archive') {
            await this.toggleArchive(item);
        }
    }

    /**
     * 功能：执行检索测试。
     * @returns 无返回值。
     */
    private async runSearchTest(): Promise<void> {
        const query = String(this.state.testQuery ?? '').trim();
        if (!query) {
            toast.info('先输入一句测试内容再检索。');
            return;
        }
        const memory = await this.getMemory();
        this.state.isRunningTest = true;
        this.paint();
        try {
            this.state.testResult = await memory.editor.runMemoryRecallPreview(query);
            this.state.selectedCardId = pickSelectedItem(
                deriveVectorMemoryViewerItems(this.state.snapshot, this.state),
                this.state.selectedCardId,
            )?.item.cardId ?? null;
            toast.success(`召回预演完成，命中 ${this.state.testResult.hitCount} 张。`);
        } catch (error) {
            toast.error(`召回预演失败：${String(error)}`);
        } finally {
            this.state.isRunningTest = false;
            this.paint();
        }
    }

    /**
     * 功能：跳转到来源记录。
     * @param item 当前向量记忆。
     * @returns 无返回值。
     */
    private async jumpToSource(item: MemoryCardSummary): Promise<void> {
        if (item.sourceRecordKind === 'semantic_seed') {
            toast.info('语义种子卡没有单条原始记录，请使用“刷新语义种子”来同步。');
            return;
        }
        if (item.sourceRecordKind === 'fact' && item.sourceRecordKey) {
            await this.onJumpToRaw({ tableName: 'facts', recordId: item.sourceRecordKey });
            return;
        }
        if (item.sourceRecordKind === 'summary' && item.sourceRecordKey) {
            await this.onJumpToRaw({ tableName: 'summaries', recordId: item.sourceRecordKey });
            return;
        }
        toast.info('当前这张记忆卡没有可跳转的来源记录。');
    }

    /**
     * 功能：跳转到消息锚点。
     * @param item 当前向量记忆。
     * @returns 无返回值。
     */
    private async jumpToAnchor(item: MemoryCardSummary): Promise<void> {
        if (!item.anchorMessageId) {
            toast.info('当前这张记忆卡没有可用的消息锚点。');
            return;
        }
        await this.onJumpToRaw({ tableName: 'events', messageId: item.anchorMessageId });
    }

    /**
     * 功能：重新建立单条向量记忆。
     * @param item 当前向量记忆。
     * @returns 无返回值。
     */
    private async rebuildSelectedItem(item: MemoryCardSummary): Promise<void> {
        if (item.sourceRecordKind === 'semantic_seed') {
            toast.info('语义种子卡请通过“刷新语义种子”或“严格重建记忆卡”重建。');
            return;
        }
        if (!item.sourceRecordKey || (item.sourceRecordKind !== 'fact' && item.sourceRecordKind !== 'summary')) {
            toast.info('当前这张记忆卡缺少严格来源，无法直接重建。');
            return;
        }
        const memory = await this.getMemory();
        try {
            const cardIds = await memory.chatState.rebuildMemoryCardsFromSource(item.sourceRecordKey, item.sourceRecordKind);
            await this.render();
            this.state.selectedCardId = cardIds[0] || item.cardId;
            this.paint();
            toast.success(cardIds.length > 0 ? `已重新建立 ${cardIds.length} 张记忆卡` : '来源记录存在，但没有生成新的记忆卡');
        } catch (error) {
            toast.error(`重新建立失败：${String(error)}`);
        }
    }

    /**
     * 功能：删除当前选中的向量片段。
     * @param item 当前向量记忆。
     * @returns 无返回值。
     */
    private async deleteSelectedItem(item: MemoryCardSummary): Promise<void> {
        if (!confirm('确定删除这张记忆卡吗？这只会删除当前记忆卡，不会删除来源记录。')) {
            return;
        }
        const memory = await this.getMemory();
        try {
            const cardIds = item.cardIds.length > 0 ? item.cardIds : [item.cardId];
            let removedCount = 0;
            for (const cardId of cardIds) {
                const removed = await memory.chatState.deleteMemoryCard(cardId);
                if (removed) {
                    removedCount += 1;
                }
            }
            if (removedCount <= 0) {
                toast.info('这张记忆卡已经不存在了。');
                return;
            }
            this.state.selectedCardId = null;
            await this.render();
            toast.success('已删除当前记忆卡');
        } catch (error) {
            toast.error(`删除失败：${String(error)}`);
        }
    }

    /**
     * 功能：切换当前向量片段的忽略状态。
     * @param item 当前向量记忆。
     * @returns 无返回值。
     */
    private async toggleArchive(item: MemoryCardSummary): Promise<void> {
        const memory = await this.getMemory();
        try {
            const cardIds = item.cardIds.length > 0 ? item.cardIds : [item.cardId];
            for (const cardId of cardIds) {
                await memory.chatState.setMemoryCardArchived(cardId, !item.isArchived);
            }
            await this.render();
            this.state.selectedCardId = item.cardId;
            this.paint();
            toast.success(item.isArchived ? '已取消忽略这张记忆卡' : '已标记忽略这张记忆卡');
        } catch (error) {
            toast.error(`更新忽略状态失败：${String(error)}`);
        }
    }

    /**
     * 功能：批量重建当前筛选结果中的来源记录。
     * @returns 无返回值。
     */
    private async rebuildCurrentItems(): Promise<void> {
        const currentItems = deriveVectorMemoryViewerItems(this.state.snapshot, this.state)
            .map((entry: VectorMemoryViewerDerivedItem): MemoryCardSummary => entry.item)
            .filter((item: MemoryCardSummary): boolean => Boolean(item.sourceRecordKey && (item.sourceRecordKind === 'fact' || item.sourceRecordKind === 'summary')));
        const uniqueRecords = Array.from(new Map(currentItems.map((item: MemoryCardSummary): [string, MemoryCardSummary] => [`${item.sourceRecordKind}:${item.sourceRecordKey}`, item])).values());
        if (uniqueRecords.length <= 0) {
            toast.info('当前筛选结果里没有可重建的来源记录。');
            return;
        }
        const confirmed = confirm(`确定批量重建当前筛选结果中的 ${uniqueRecords.length} 条来源记录吗？`);
        if (!confirmed) {
            return;
        }
        const memory = await this.getMemory();
        let rebuiltChunkCount = 0;
        for (const item of uniqueRecords) {
            const cardIds = await memory.chatState.rebuildMemoryCardsFromSource(item.sourceRecordKey!, item.sourceRecordKind as 'fact' | 'summary');
            rebuiltChunkCount += cardIds.length;
        }
        await this.render();
        toast.success(`已批量重建 ${uniqueRecords.length} 条来源记录，写回 ${rebuiltChunkCount} 张记忆卡。`);
    }

    /**
     * 功能：批量忽略当前筛选结果中的向量记忆。
     * @returns 无返回值。
     */
    private async archiveCurrentItems(): Promise<void> {
        const currentItems = deriveVectorMemoryViewerItems(this.state.snapshot, this.state)
            .map((entry: VectorMemoryViewerDerivedItem): MemoryCardSummary => entry.item)
            .filter((item: MemoryCardSummary): boolean => !item.isArchived);
        if (currentItems.length <= 0) {
            toast.info('当前筛选结果里没有需要忽略的记忆卡。');
            return;
        }
        const confirmed = confirm(`确定标记忽略当前筛选结果中的 ${currentItems.length} 张记忆卡吗？`);
        if (!confirmed) {
            return;
        }
        const memory = await this.getMemory();
        for (const item of currentItems) {
            const cardIds = item.cardIds.length > 0 ? item.cardIds : [item.cardId];
            for (const cardId of cardIds) {
                await memory.chatState.setMemoryCardArchived(cardId, true);
            }
        }
        await this.render();
        toast.success(`已标记忽略 ${currentItems.length} 张记忆卡。`);
    }

    /**
     * 功能：导出当前筛选结果为 JSON 文件。
     * @returns 无返回值。
     */
    private exportCurrentItems(): void {
        const currentItems = deriveVectorMemoryViewerItems(this.state.snapshot, this.state).map((entry: VectorMemoryViewerDerivedItem): MemoryCardSummary => entry.item);
        if (currentItems.length <= 0) {
            toast.info('当前筛选结果为空，没有可导出的内容。');
            return;
        }
        const payload = {
            chatKey: this.state.snapshot?.chatKey ?? '',
            exportedAt: Date.now(),
            count: currentItems.length,
            items: currentItems,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `memoryos-memory-card-view-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success(`已导出 ${currentItems.length} 张记忆卡。`);
    }

    /**
     * 功能：根据当前状态重绘查看器。
     * @returns 无返回值。
     */
    private paint(): void {
        const snapshot = this.state.snapshot;
        const actorOptions = buildActorOptions(snapshot);
        const items = deriveVectorMemoryViewerItems(snapshot, this.state);
        const compactChatLabel = formatViewerChatLabel(snapshot?.chatKey);
        const rawChatKey = String(snapshot?.chatKey ?? '').trim();
        const chatKeyTitleAttr = rawChatKey && rawChatKey !== compactChatLabel
            ? ` title="${escapeHtml(rawChatKey)}"`
            : '';
        const selected = pickSelectedItem(items, this.state.selectedCardId);
        if (selected && selected.item.cardId !== this.state.selectedCardId) {
            this.state.selectedCardId = selected.item.cardId;
        }
        const selectedItem = selected?.item ?? null;
        const selectedHit = selected?.testHit ?? null;
        const testMode = Boolean(this.state.testResult);
        const actorOptionHtml = actorOptions
            .map((option: VectorMemoryActorOption): string => `<option value="${escapeHtml(option.key)}"${this.state.actorKey === option.key ? ' selected' : ''}>${escapeHtml(option.label)}</option>`)
            .join('');
        const listHtml = items.length > 0
            ? items.map((entry: VectorMemoryViewerDerivedItem): string => this.renderListCard(entry)).join('')
            : `<div class="stx-vmv-empty">${escapeHtml(testMode ? '当前测试语句没有命中可展示的记忆卡，建议换个说法再试一次。' : '当前筛选条件下没有记忆卡。')}</div>`;
        this.container.innerHTML = `
            <div class="stx-vmv">
                <section class="stx-vmv-hero">
                    <article class="stx-vmv-hero-card">
                        <div class="stx-vmv-kicker"><i class="fa-solid fa-note-sticky"></i><span>记忆卡检索台</span></div>
                        <div class="stx-vmv-title">记忆卡与命中依据</div>
                        <div class="stx-vmv-subtitle">当前会话 <strong${chatKeyTitleAttr}>${escapeHtml(compactChatLabel)}</strong> 共有 <strong>${snapshot?.totalCount ?? 0}</strong> 张记忆卡。默认只展示记忆内容、来源证据、最近使用和当前状态，需要深查时再展开详细信息。</div>
                        <div class="stx-vmv-chip-row" style="margin-top:14px;">
                            <span class="stx-vmv-chip"><strong>${snapshot?.totalCount ?? 0}</strong> 全部记忆</span>
                            <span class="stx-vmv-chip"><strong>${items.length}</strong> 当前结果</span>
                            <span class="stx-vmv-chip"><strong>${snapshot?.recentHitCount ?? 0}</strong> 最近命中</span>
                            <span class="stx-vmv-chip"><strong>${snapshot?.needsRebuildCount ?? 0}</strong> 建议重建</span>
                            <span class="stx-vmv-chip"><strong>${snapshot?.sourceMissingCount ?? 0}</strong> 来源丢失</span>
                            <span class="stx-vmv-chip"><strong>${snapshot?.archivedCount ?? 0}</strong> 已归档</span>
                        </div>
                    </article>
                    <form class="stx-vmv-hero-card stx-vmv-test-card">
                        <div class="stx-vmv-section-title">
                            <div>
                                <strong>召回预演</strong>
                                <div class="stx-vmv-inline-note">输入一句话，直接预演这次召回会命中哪些记忆卡。</div>
                            </div>
                            <span class="stx-vmv-chip">${this.state.isRunningTest ? '正在预演…' : testMode ? '预演结果模式' : '普通浏览模式'}</span>
                        </div>
                        <textarea data-field="testQuery" placeholder="例如：她最在意的承诺是什么？">${escapeHtml(this.state.testQuery)}</textarea>
                        <div class="stx-vmv-actions">
                            <button class="stx-re-btn save" type="submit" data-action="run-test">${this.state.isRunningTest ? '正在预演…' : '召回预演'}</button>
                            <button class="stx-re-btn" type="button" data-action="clear-test"${testMode ? '' : ' disabled'}>退出预演结果</button>
                        </div>
                        <div class="stx-vmv-inline-note">${escapeHtml(testMode ? `本次命中 ${this.state.testResult?.hitCount ?? 0} 张，最终进入上下文 ${this.state.testResult?.selectedCount ?? 0} 张${this.state.testResult?.rerankApplied ? '，已执行二次整理。' : '。'}` : '这里会显示匹配顺序、二次整理前后位置，以及最终是否进入上下文。')}</div>
                    </form>
                </section>
                <section class="stx-vmv-layout">
                    <aside class="stx-vmv-panel">
                        <div class="stx-vmv-section-title"><div><strong>筛选区</strong><div class="stx-vmv-inline-note">先缩小范围，再进入排查。</div></div></div>
                        <div class="stx-vmv-filter-field"><label>关键词搜索</label><input data-field="keyword" type="search" placeholder="搜索记忆内容、来源证据或角色名" value="${escapeHtml(this.state.keyword)}" /></div>
                        <div class="stx-vmv-filter-field"><label>来源类型</label><select data-field="sourceKind"><option value="all"${this.state.sourceKind === 'all' ? ' selected' : ''}>全部来源</option><option value="fact"${this.state.sourceKind === 'fact' ? ' selected' : ''}>事实</option><option value="summary"${this.state.sourceKind === 'summary' ? ' selected' : ''}>摘要</option><option value="unknown"${this.state.sourceKind === 'unknown' ? ' selected' : ''}>未知来源</option></select></div>
                        <div class="stx-vmv-filter-field"><label>当前状态</label><select data-field="statusKind"><option value="all"${this.state.statusKind === 'all' ? ' selected' : ''}>全部状态</option><option value="normal"${this.state.statusKind === 'normal' ? ' selected' : ''}>正常使用</option><option value="recent_hit"${this.state.statusKind === 'recent_hit' ? ' selected' : ''}>最近命中</option><option value="long_unused"${this.state.statusKind === 'long_unused' ? ' selected' : ''}>长期未用</option><option value="source_missing"${this.state.statusKind === 'source_missing' ? ' selected' : ''}>来源丢失</option><option value="archived_residual"${this.state.statusKind === 'archived_residual' ? ' selected' : ''}>已归档残留</option><option value="needs_rebuild"${this.state.statusKind === 'needs_rebuild' ? ' selected' : ''}>建议重建</option></select></div>
                        <div class="stx-vmv-filter-field"><label>角色范围</label><select data-field="actorKey"><option value="__all__"${this.state.actorKey === '__all__' ? ' selected' : ''}>全部角色</option><option value="__current__"${this.state.actorKey === '__current__' ? ' selected' : ''}>当前主角色</option>${actorOptionHtml}</select></div>
                        <div class="stx-vmv-filter-field"><label>时间窗口</label><select data-field="timeFilter"><option value="__all__"${this.state.timeFilter === '__all__' ? ' selected' : ''}>全部时间</option><option value="indexed_7d"${this.state.timeFilter === 'indexed_7d' ? ' selected' : ''}>最近 7 天索引</option><option value="indexed_30d"${this.state.timeFilter === 'indexed_30d' ? ' selected' : ''}>最近 30 天索引</option><option value="hit_7d"${this.state.timeFilter === 'hit_7d' ? ' selected' : ''}>最近 7 天命中</option><option value="hit_30d"${this.state.timeFilter === 'hit_30d' ? ' selected' : ''}>最近 30 天命中</option></select></div>
                        <div class="stx-vmv-filter-field"><label>排序方式</label><select data-field="sortMode"${testMode ? ' disabled' : ''}><option value="recent_hit"${this.state.sortMode === 'recent_hit' ? ' selected' : ''}>按最近命中</option><option value="recent_index"${this.state.sortMode === 'recent_index' ? ' selected' : ''}>按最近索引</option><option value="recent_created"${this.state.sortMode === 'recent_created' ? ' selected' : ''}>按最近创建</option><option value="content_length"${this.state.sortMode === 'content_length' ? ' selected' : ''}>按内容长度</option><option value="usage"${this.state.sortMode === 'usage' ? ' selected' : ''}>按使用频率</option></select></div>
                        <div><div class="stx-vmv-block-title">快捷入口</div><div class="stx-vmv-quick-grid" style="margin-top:10px;"><button class="stx-vmv-quick-btn ${this.state.quickRecentHit ? 'is-active' : ''}" type="button" data-action="toggle-quick" data-key="recent">只看最近命中</button><button class="stx-vmv-quick-btn ${this.state.quickLongUnused ? 'is-active' : ''}" type="button" data-action="toggle-quick" data-key="unused">只看长期未用</button><button class="stx-vmv-quick-btn ${this.state.quickAbnormal ? 'is-active' : ''}" type="button" data-action="toggle-quick" data-key="abnormal">只看异常项</button><button class="stx-vmv-quick-btn ${this.state.quickCurrentActor ? 'is-active' : ''}" type="button" data-action="toggle-quick" data-key="current">只看当前角色相关</button></div></div>
                        <div>
                        <div class="stx-vmv-block-title">批量处理</div>
                            <div class="stx-vmv-actions" style="margin-top:10px;">
                                <button class="stx-re-btn save" type="button" data-action="batch-rebuild">批量重新建立</button>
                                <button class="stx-re-btn" type="button" data-action="batch-ignore">批量标记忽略</button>
                                <button class="stx-re-btn" type="button" data-action="batch-export">导出当前结果</button>
                            </div>
                            <div class="stx-vmv-inline-note">先用左侧筛选缩小范围，再对当前结果执行批量维护。</div>
                        </div>
                        <div class="stx-vmv-empty">${escapeHtml(this.state.activeActorKey ? `当前主角色：${this.state.activeActorKey}` : '当前聊天暂未标记主角色，角色相关筛选仍可按来源角色使用。')}</div>
                    </aside>
                    <section class="stx-vmv-panel">
                        <div class="stx-vmv-toolbar-row"><div><h3>${escapeHtml(testMode ? '预演结果列表' : '记忆卡列表')}</h3><div class="stx-vmv-toolbar-meta">${escapeHtml(testMode ? '当前按照预演中的命中顺序展示。' : '默认展示记忆内容、来源证据、最近使用和当前状态。')}</div></div><div class="stx-vmv-chip-row"><span class="stx-vmv-chip"${chatKeyTitleAttr}>${escapeHtml(compactChatLabel)}</span><span class="stx-vmv-chip">${items.length} 张卡片</span></div></div>
                        <div class="stx-vmv-list-scroller"><div class="stx-vmv-list-stack">${this.state.isLoading && !snapshot ? '<div class="stx-vmv-empty">正在读取记忆卡...</div>' : listHtml}</div></div>
                    </section>
                    <aside class="stx-vmv-panel"><div class="stx-vmv-detail-scroller">${selectedItem ? this.renderDetail(selectedItem, selectedHit) : '<div class="stx-vmv-empty">左侧选一张记忆卡后，这里会显示完整正文、来源证据、最近使用情况、状态判断和详细信息。</div>'}</div></aside>
                </section>
            </div>
        `;
    }

    /**
     * 功能：渲染单条列表卡片。
     * @param entry 列表项。
     * @returns 卡片 HTML。
     */
    private renderListCard(entry: VectorMemoryViewerDerivedItem): string {
        const item = entry.item;
        const hit = entry.testHit;
        const timeLabel = item.usage.lastHitAt ? `最近命中 ${formatRelativeTime(item.usage.lastHitAt)}` : `索引于 ${formatRelativeTime(item.createdAt)}`;
        const topBadges = [
            `<span class="stx-vmv-pill">${escapeHtml(formatSourceKindLabel(item.sourceRecordKind))}</span>`,
            `<span class="stx-vmv-pill ${buildStatusToneClass(item)}">${escapeHtml(item.statusLabel)}</span>`,
            hit
                ? `<span class="stx-vmv-pill ${hit.enteredContext ? 'tone-success' : hit.matchedInRecall ? 'tone-warning' : 'tone-muted'}">${escapeHtml(hit.enteredContext ? '进入上下文' : hit.matchedInRecall ? '命中未入选' : '测试命中')}</span>`
                : (item.statusKind === 'recent_hit'
                    ? '<span class="stx-vmv-pill tone-success">最近命中</span>'
                    : item.statusKind === 'long_unused'
                        ? '<span class="stx-vmv-pill tone-warning">长期未用</span>'
                        : ''),
        ].filter(Boolean).join('');
        const bottomBadges = [
            `<span class="stx-vmv-badge">卡片层级 路 ${escapeHtml(formatMemoryLaneLabel(item.lane))}</span>`,
            `<span class="stx-vmv-badge">来源范围 · ${escapeHtml(formatScopeLabel(item.sourceScope))}</span>`,
            `<span class="stx-vmv-badge">记忆类型 · ${escapeHtml(formatMemoryTypeLabel(item.memoryType))}</span>`,
            `<span class="stx-vmv-badge">生命周期 路 ${escapeHtml(item.ttl)}</span>`,
            item.memorySubtype ? `<span class="stx-vmv-badge">${escapeHtml(formatMemorySubtypeLabel(item.memorySubtype))}</span>` : '',
            item.isArchived ? '<span class="stx-vmv-badge">已归档</span>' : '',
            item.needsRebuild ? '<span class="stx-vmv-badge">建议重建</span>' : '',
        ].filter(Boolean).join('');
        const extraMeta = hit
            ? `测试顺位：原始 ${hit.initialRank ?? '-'} · 整理后 ${hit.rerankedRank ?? '-'} · 最终 ${hit.finalRank ?? '-'}`
            : `累计命中 ${item.usage.totalHits} 次`;
        return `
            <article class="stx-vmv-card ${item.cardId === this.state.selectedCardId ? 'is-selected' : ''}" data-action="select-item" data-card-id="${escapeHtml(item.cardId)}">
                <div class="stx-vmv-card-topline">
                    <div class="stx-vmv-chip-row">${topBadges}</div>
                    <button class="stx-vmv-icon-btn" type="button" data-action="select-item" data-card-id="${escapeHtml(item.cardId)}">查看详情</button>
                </div>
                <div class="stx-vmv-card-preview">${escapeHtml(item.preview)}</div>
                <div class="stx-vmv-card-meta">
                    <div><strong>${escapeHtml(item.title)}</strong></div>
                    <div>${escapeHtml(item.subject)} · ${escapeHtml(timeLabel)}</div>
                    <div>${escapeHtml(extraMeta)}</div>
                </div>
                <div class="stx-vmv-badge-row">${bottomBadges}</div>
            </article>
        `;
    }

    /**
     * 功能：渲染右侧详情区。
     * @param item 当前选中的向量记忆。
     * @param hit 当前测试命中。
     * @returns 详情 HTML。
     */
    private renderDetail(item: MemoryCardSummary, hit: MemoryRecallPreviewHit | null): string {
        const reasonList = item.statusReasons.length > 0
            ? `<ul class="stx-vmv-reasons">${item.statusReasons.map((reason: string): string => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
            : '<div class="stx-vmv-inline-note">当前这张记忆卡没有额外异常提示。</div>';
        const participantText = item.participantActorLabels.length > 0 ? item.participantActorLabels.join('、') : '暂无';
        const testCard = hit ? `
            <article class="stx-vmv-card">
                <h4>本次预演</h4>
                <div class="stx-vmv-test-rank">
                    <div class="stx-vmv-stat"><label>原始顺位</label><strong>${renderValue(hit.initialRank ?? '-')}</strong></div>
                    <div class="stx-vmv-stat"><label>二次整理后</label><strong>${renderValue(hit.rerankedRank ?? '-')}</strong></div>
                    <div class="stx-vmv-stat"><label>最终顺位</label><strong>${renderValue(hit.finalRank ?? '-')}</strong></div>
                </div>
                <div class="stx-vmv-stat-grid">
                    <div class="stx-vmv-stat"><label>匹配强度</label><strong>${escapeHtml(formatScore(hit.vectorScore))}</strong></div>
                    <div class="stx-vmv-stat"><label>是否进入上下文</label><strong>${escapeHtml(hit.enteredContext ? '是' : '否')}</strong></div>
                </div>
                <div class="stx-vmv-inline-note">${escapeHtml(hit.reasonCodes.length > 0 ? `召回理由：${hit.reasonCodes.join(' / ')}` : '当前测试没有额外召回理由说明。')}</div>
            </article>
        ` : '';
        return `
            <div class="stx-vmv-detail-stack">
                <div class="stx-vmv-detail-head">
                    <div>
                        <h3>${escapeHtml(item.title)}</h3>
                        <div class="stx-vmv-inline-note">当前状态：${escapeHtml(item.statusLabel)} · 最近索引 ${escapeHtml(formatTimeLabel(item.createdAt))}</div>
                    </div>
                    <span class="stx-vmv-pill ${buildStatusToneClass(item)}">${escapeHtml(item.statusLabel)}</span>
                </div>
                <div class="stx-vmv-actions">
                    <button class="stx-re-btn" type="button" data-action="jump-source" data-card-id="${escapeHtml(item.cardId)}">查看来源</button>
                    <button class="stx-re-btn save" type="button" data-action="rebuild-item" data-card-id="${escapeHtml(item.cardId)}">重新建立</button>
                    <button class="stx-re-btn" type="button" data-action="copy-content" data-card-id="${escapeHtml(item.cardId)}">复制内容</button>
                    <button class="stx-re-btn" type="button" data-action="jump-anchor" data-card-id="${escapeHtml(item.cardId)}"${item.anchorMessageId ? '' : ' disabled'}>跳到消息锚点</button>
                </div>
                <article class="stx-vmv-card">
                    <h4>记忆正文</h4>
                    <div class="stx-vmv-content-box">${escapeHtml(item.memoryText || item.content)}</div>
                    <div class="stx-vmv-chip-row">
                        <span class="stx-vmv-chip"><strong>${item.contentLength}</strong> 字符</span>
                        <span class="stx-vmv-chip"><strong>${item.embeddingDimensions ?? 0}</strong> 嵌入长度</span>
                        <span class="stx-vmv-chip">${escapeHtml(item.embeddingModel || '未记录建模方式')}</span>
                    </div>
                </article>
                <article class="stx-vmv-card">
                    <h4>来源证据</h4>
                    <dl class="stx-vmv-kv-list">
                        <dt>来源类型</dt><dd>${escapeHtml(formatSourceKindLabel(item.sourceRecordKind))}</dd>
                        <dt>来源记录</dt><dd>${escapeHtml(item.title)}</dd>
                        <dt>来源角色</dt><dd>${escapeHtml(item.subject)}</dd>
                        <dt>参与角色</dt><dd>${escapeHtml(participantText)}</dd>
                        <dt>来源范围</dt><dd>${escapeHtml(formatScopeLabel(item.sourceScope))}</dd>
                        <dt>原始锚点</dt><dd>${escapeHtml(item.anchorMessageId || (item.sourceMessageIds.length > 0 ? `关联消息 ${item.sourceMessageIds.length} 条` : '暂无'))}</dd>
                        <dt>来源说明</dt><dd>${escapeHtml(item.sourceDetail)}</dd>
                        <dt>卡片编号</dt><dd>${escapeHtml(item.cardId)}</dd>
                        <dt>关联记忆卡</dt><dd>${escapeHtml(String(item.cardIds.length))}</dd>
                    </dl>
                </article>
                <article class="stx-vmv-card">
                    <h4>使用情况</h4>
                    <div class="stx-vmv-stat-grid">
                        <div class="stx-vmv-stat"><label>最近一次命中</label><strong>${escapeHtml(formatTimeLabel(item.usage.lastHitAt))}</strong></div>
                        <div class="stx-vmv-stat"><label>最近进入上下文</label><strong>${escapeHtml(formatTimeLabel(item.usage.lastSelectedAt))}</strong></div>
                        <div class="stx-vmv-stat"><label>最近一次匹配问题</label><strong>${escapeHtml(item.usage.lastQuery || '暂无')}</strong></div>
                        <div class="stx-vmv-stat"><label>最近匹配强度</label><strong>${escapeHtml(formatScore(item.usage.lastScore))}</strong></div>
                        <div class="stx-vmv-stat"><label>最近 7 天命中</label><strong>${item.usage.hitsIn7d}</strong></div>
                        <div class="stx-vmv-stat"><label>最近 30 天命中</label><strong>${item.usage.hitsIn30d}</strong></div>
                    </div>
                    <div class="stx-vmv-inline-note">累计命中 ${item.usage.totalHits} 次，其中进入最终上下文 ${item.usage.selectedHits} 次。</div>
                </article>
                ${testCard}
                <article class="stx-vmv-card">
                    <h4>状态判断</h4>
                    <div class="stx-vmv-chip-row">
                        <span class="stx-vmv-pill ${buildStatusToneClass(item)}">${escapeHtml(item.statusLabel)}</span>
                        ${item.sourceMissing ? '<span class="stx-vmv-pill tone-danger">来源丢失</span>' : ''}
                        ${item.needsRebuild ? '<span class="stx-vmv-pill tone-warning">建议重建</span>' : ''}
                        ${item.isArchived ? '<span class="stx-vmv-pill tone-muted">已归档</span>' : ''}
                    </div>
                    ${reasonList}
                </article>
                <details class="stx-vmv-details">
                    <summary>打开详细信息</summary>
                    <div class="stx-vmv-details-body">
                        <dl class="stx-vmv-kv-list">
                            <dt>内部编号</dt><dd>${escapeHtml(item.cardId)}</dd>
                            <dt>来源键</dt><dd>${escapeHtml(item.sourceRecordKey || '暂无')}</dd>
                            <dt>记录类型</dt><dd>${escapeHtml(formatSourceKindLabel(item.sourceRecordKind))}</dd>
                            <dt>角色键</dt><dd>${escapeHtml(item.ownerActorKey || '暂无')}</dd>
                            <dt>范围标识</dt><dd>${escapeHtml(item.sourceScope || '暂无')}</dd>
                            <dt>内容哈希</dt><dd>${escapeHtml(item.contentHash)}</dd>
                            <dt>视图标识</dt><dd>${escapeHtml(item.sourceViewHash || '暂无')}</dd>
                            <dt>快照标识</dt><dd>${escapeHtml(item.sourceSnapshotHash || '暂无')}</dd>
                            <dt>修复代次</dt><dd>${escapeHtml(item.sourceRepairGeneration == null ? '暂无' : String(item.sourceRepairGeneration))}</dd>
                            <dt>触发来源</dt><dd>${escapeHtml(item.sourceTraceKind || '暂无')}</dd>
                            <dt>建立原因</dt><dd>${escapeHtml(item.sourceReason || '暂无')}</dd>
                            <dt>记忆类型</dt><dd>${escapeHtml(formatMemoryTypeLabel(item.memoryType))}</dd>
                            <dt>记忆细分类</dt><dd>${escapeHtml(formatMemorySubtypeLabel(item.memorySubtype))}</dd>
                        </dl>
                        <details class="stx-vmv-details">
                            <summary>更多操作</summary>
                            <div class="stx-vmv-details-body">
                                <div class="stx-vmv-actions">
                                    <button class="stx-re-btn" type="button" data-action="toggle-archive" data-card-id="${escapeHtml(item.cardId)}">${escapeHtml(item.isArchived ? '取消忽略' : '标记忽略')}</button>
                                    <button class="stx-re-btn danger" type="button" data-action="delete-item" data-card-id="${escapeHtml(item.cardId)}">删除记忆</button>
                                </div>
                                <div class="stx-vmv-inline-note">危险操作只会影响当前这张记忆卡，不会直接删除来源记录。</div>
                            </div>
                        </details>
                    </div>
                </details>
            </div>
        `;
    }
}
