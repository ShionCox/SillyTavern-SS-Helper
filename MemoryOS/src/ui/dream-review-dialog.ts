import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { renderDreamReviewExplainPanel } from './dream-review-explain-panel';
import {
    localizeDreamDisplayText,
    resolveDreamMaintenanceDisplay,
    resolveDreamMutationTypeLabel,
    resolveDreamProposalTypeLabel,
    resolveDreamReviewSourceLabel,
    resolveDreamReviewWaveLabel,
} from './workbenchLocale';
import type {
    DreamMaintenanceProposalRecord,
    DreamMutationProposal,
    DreamReviewDecision,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamSessionOutputRecord,
    DreamSessionRecallRecord,
} from '../services/dream-types';

const DREAM_REVIEW_DIALOG_ID = 'stx-memory-dream-review-dialog';
const DREAM_REVIEW_STYLE_ID = 'stx-memory-dream-review-style';

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function truncateText(value: string, maxLength: number = 24): string {
    const text = String(value ?? '').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * 创建带有 tooltip 的标签。用于 meta key 的截断显示。
 */
function createLabelWithTooltip(label: string, maxLength: number = 14): string {
    const truncated = truncateText(label, maxLength);
    return truncated === label
        ? truncated
        : `<span title="${escapeAttr(label)}" style="cursor:help;border-bottom:1px dotted var(--dr-muted);">${truncated}</span>`;
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): string => String(item ?? '').trim())
        .filter(Boolean);
}

function buildRecallTitleMap(recall: DreamSessionRecallRecord): Map<string, string> {
    const titleMap = new Map<string, string>();
    [recall.recentHits, recall.midHits, recall.deepHits, recall.fusedHits].forEach((hits) => {
        hits.forEach((hit) => {
            const entryId = String(hit.entryId ?? '').trim();
            const title = String(hit.title ?? '').trim();
            if (!entryId || !title) {
                return;
            }
            titleMap.set(entryId, title);
            titleMap.set(normalizeDreamDiagnosticEntryId(entryId), title);
        });
    });
    return titleMap;
}

function normalizeDreamDiagnosticEntryId(value: string): string {
    let normalized = String(value ?? '').trim();
    while (normalized.startsWith('entry:')) {
        normalized = normalized.slice('entry:'.length).trim();
    }
    return normalized;
}

function humanizeDreamDiagnosticKey(key: string, titleMap: Map<string, string>): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    if (normalized.startsWith('entry:')) {
        const entryId = normalizeDreamDiagnosticEntryId(normalized);
        return titleMap.get(entryId) || `记忆 ${truncateText(entryId, 18)}`;
    }
    if (normalized.startsWith('actor:')) {
        return `角色 ${normalized.slice('actor:'.length).replace(/_/g, ' ')}`;
    }
    if (normalized.startsWith('topic:')) {
        return `主题 ${normalized.slice('topic:'.length).replace(/_/g, ' ')}`;
    }
    if (normalized.startsWith('relation:')) {
        const tail = normalized.split(':').pop() || normalized;
        return `关系 ${truncateText(tail, 18)}`;
    }
    if (normalized.startsWith('state:')) {
        return `状态 ${normalized.slice('state:'.length).replace(/_/g, ' ')}`;
    }
    if (normalized.startsWith('summary:')) {
        return `总结 ${truncateText(normalized.slice('summary:'.length), 18)}`;
    }
    return truncateText(normalized, 24);
}

/**
 * 功能：根据条目标识读取梦境来源记忆标题。
 * @param entryId 条目标识。
 * @param titleMap 来源记忆标题映射。
 * @returns 条目标题，无法匹配时返回空字符串。
 */
function resolveDreamSourceEntryTitle(entryId: string, titleMap: Map<string, string>): string {
    const normalized = String(entryId ?? '').trim();
    if (!normalized) {
        return '';
    }
    return titleMap.get(normalized) || titleMap.get(normalizeDreamDiagnosticEntryId(normalized)) || '';
}

/**
 * 功能：渲染来源记忆标题，缺少标题时回退到短标识。
 * @param entryId 条目标识。
 * @param titleMap 来源记忆标题映射。
 * @returns 可读的来源记忆标签。
 */
function renderDreamSourceEntryLabel(entryId: string, titleMap: Map<string, string>): string {
    const normalized = String(entryId ?? '').trim();
    if (!normalized) {
        return '';
    }
    return resolveDreamSourceEntryTitle(normalized, titleMap) || `记忆 ${truncateText(normalizeDreamDiagnosticEntryId(normalized), 18)}`;
}

function renderDreamDiagnosticChips(items: string[], titleMap: Map<string, string>, emptyText = '无'): string {
    const normalized = items
        .map((item: string): string => humanizeDreamDiagnosticKey(item, titleMap))
        .filter(Boolean)
        .slice(0, 8);
    if (normalized.length <= 0) {
        return `<div class="stx-memory-dream-review__hint">${escapeHtml(emptyText)}</div>`;
    }
    return `
        <div class="stx-memory-dream-review__chip-row">
            ${normalized.map((item: string): string => `<span class="stx-memory-dream-review__badge" title="${escapeAttr(item)}">${escapeHtml(item)}</span>`).join('')}
        </div>
    `;
}

function resolveDreamMutationActionHint(mutation: DreamMutationProposal): string {
    if (mutation.mutationType === 'entry_create') {
        return '应用后会新增一条记忆，让这次梦境里的关键信息真正写进记忆库。';
    }
    if (mutation.mutationType === 'entry_patch') {
        return '应用后会补写或修正一条现有记忆，让它更完整、更贴近当前上下文。';
    }
    if (mutation.mutationType === 'relationship_patch') {
        return '应用后会调整一段关系记录，让人物之间的联系更清楚。';
    }
    return '应用后会按这条提案更新相关记忆内容。';
}

function renderDreamMutationSourceRefs(sourceEntryIds: string[], titleMap: Map<string, string>): string {
    const normalized = sourceEntryIds
        .map((entryId: string): string => String(entryId ?? '').trim())
        .filter(Boolean);
    if (normalized.length <= 0) {
        return '未标注';
    }
    return normalized
        .slice(0, 3)
        .map((entryId: string): string => renderDreamSourceEntryLabel(entryId, titleMap))
        .join('、');
}

function renderDreamMaintenanceSourceRefs(sourceEntryIds: string[], titleMap: Map<string, string>): string {
    const normalized = sourceEntryIds
        .map((entryId: string): string => String(entryId ?? '').trim())
        .filter(Boolean);
    if (normalized.length <= 0) {
        return '未标注';
    }
    return normalized
        .slice(0, 4)
        .map((entryId: string): string => renderDreamSourceEntryLabel(entryId, titleMap))
        .join('、');
}

function normalizeDreamReviewDisplayText(value: string): string {
    return String(value ?? '')
        .replace(/\s+/g, '')
        .replace(/[；;，,。、“”"'‘’：:\-—]/g, '')
        .trim();
}

function ensureDreamReviewStyle(): void {
    if (document.getElementById(DREAM_REVIEW_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = DREAM_REVIEW_STYLE_ID;
    style.textContent = `
        /* ========== Custom Scrollbars (scoped to dialog) ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-content {
            scrollbar-color: rgba(126, 87, 194, 0.4) rgba(0, 0, 0, 0.15);
            scrollbar-width: thin;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-content::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-content::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.15) !important;
            border-radius: 4px !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-content::-webkit-scrollbar-thumb {
            background: rgba(126, 87, 194, 0.4) !important;
            border-radius: 4px !important;
            border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-content::-webkit-scrollbar-thumb:hover {
            background: rgba(218, 186, 116, 0.6) !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel {
            scrollbar-color: rgba(126, 87, 194, 0.35) rgba(0, 0, 0, 0.1);
            scrollbar-width: thin;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel::-webkit-scrollbar {
            width: 7px !important;
            height: 7px !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1) !important;
            border-radius: 4px !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel::-webkit-scrollbar-thumb {
            background: rgba(126, 87, 194, 0.35) !important;
            border-radius: 4px !important;
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel::-webkit-scrollbar-thumb:hover {
            background: rgba(218, 186, 116, 0.55) !important;
        }

        /* ========== Dialog Surface Customization ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-shared-dialog-surface {
            background: rgba(10, 8, 14, 0.92) !important;
            backdrop-filter: blur(28px) saturate(130%) !important;
            -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
            box-shadow: 0 40px 100px rgba(0, 0, 0, 0.9), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
        }

        /* ========== Main Container ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review {
            --dr-bg: var(--ss-theme-panel-bg, #0f0a14);
            --dr-panel: color-mix(in srgb, var(--dr-bg) 80%, #1b1527 20%);
            --dr-panel-2: color-mix(in srgb, var(--dr-bg) 70%, #281d3d 30%);
            --dr-line: rgba(180, 160, 220, 0.12);
            --dr-line-strong: color-mix(in srgb, var(--dr-accent) 50%, transparent);
            --dr-text: #e8e4f2;
            --dr-muted: rgba(232, 228, 242, 0.6);
            --dr-accent: #daba74;
            --dr-accent-glow: rgba(218, 186, 116, 0.4);
            --dr-magic: #7e57c2;
            --dr-success: #4caf50;
            --dr-mutation-create: #43a047;
            --dr-mutation-patch: #1e88e5;
            --dr-mutation-relationship: #8e24aa;

            position: relative;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
            width: 100%;
            max-width: 100%;
            height: min(86vh, 1080px);
            overflow: hidden;
            color: var(--dr-text);
        }

        /* ========== Grid Systems ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid {
            display:grid;
            gap:12px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero {
            display:grid;
            grid-template-columns:minmax(0,1.32fr) minmax(0,.88fr);
            gap:12px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel {
            border:1px solid var(--dr-line);
            border-radius:16px;
            background:linear-gradient(160deg, color-mix(in srgb, var(--dr-panel) 85%, var(--dr-magic) 6%), color-mix(in srgb, var(--dr-bg) 95%, black 5%));
            box-shadow:inset 0 1px 1px rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.4);
            min-height:0;
            min-width:0;
        }
        
        /* ========== Hero Section ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card {
            padding:14px 16px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card--overview {
            background:linear-gradient(135deg, color-mix(in srgb, var(--dr-magic) 20%, transparent) 0%, color-mix(in srgb, var(--dr-panel) 85%, transparent) 50%, color-mix(in srgb, var(--dr-accent) 12%, transparent) 100%), var(--dr-bg);
            border:1px solid color-mix(in srgb, var(--dr-accent) 25%, var(--dr-line));
            box-shadow:inset 0 1px 2px rgba(255,255,255,0.1), 0 0 20px color-mix(in srgb, var(--dr-magic) 25%, transparent);
            position: relative;
            overflow: hidden;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card--overview::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, var(--dr-accent), transparent);
            opacity: 0.6;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-head {
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-title {
            font-size:16px;
            font-weight:700;
            letter-spacing:1px;
            margin:0;
            background: linear-gradient(90deg, #fff, var(--dr-accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 2px 10px var(--dr-accent-glow);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-subtitle {
            margin-top:6px;
            font-size:11px;
            color:var(--dr-muted);
            line-height:1.6;
            letter-spacing: 0.5px;
        }
        
        /* ========== Findings KPI ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card--findings {
            display:flex;
            flex-direction:column;
            gap:10px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__findings-kpis {
            display:grid;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi {
            border:1px solid color-mix(in srgb, var(--dr-line) 60%, transparent);
            border-radius:12px;
            padding:10px 12px;
            background:color-mix(in srgb, var(--dr-panel-2) 60%, transparent);
            box-shadow: inset 0 0 12px rgba(0,0,0,0.2);
            transition: border-color 0.3s, box-shadow 0.3s;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi:hover {
            border-color: color-mix(in srgb, var(--dr-accent) 40%, transparent);
            box-shadow: inset 0 0 15px var(--dr-accent-glow);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi-label {
            font-size:10px;
            color:var(--dr-muted);
            line-height:1.4;
            margin:0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi-value {
            margin:4px 0 0;
            font-size:18px;
            font-weight:700;
            color:var(--dr-text);
            text-shadow: 0 0 8px rgba(255,255,255,0.2);
        }
        
        /* ========== Summary Section ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary {
            grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);
            align-items:start;
            gap:10px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-copy,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-meta,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-list {
            display:flex;
            flex-direction:column;
            gap:8px;
            min-width:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-meta {
            max-height:220px;
            overflow:auto;
            padding-right:4px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-grid {
            display:grid;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:8px;
        }
        
        /* ========== Meta Rows ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-row {
            display:grid;
            grid-template-columns:80px minmax(0,1fr);
            gap:10px;
            align-items:start;
            border:1px solid var(--dr-line);
            border-radius:12px;
            padding:8px 10px;
            background:color-mix(in srgb, var(--dr-panel-2) 65%, transparent);
            min-width:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-key {
            font-size:10px;
            color:var(--dr-muted);
            line-height:1.4;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-value {
            font-size:11px;
            color:var(--dr-text);
            line-height:1.5;
            min-width:0;
            word-break:break-word;
            overflow-wrap:anywhere;
        }
        
        /* ========== Main Grid (Left/Right Panels) ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid {
            grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);
            min-height:0;
            flex:1;
            gap:12px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel {
            padding:12px;
            overflow:auto;
            scrollbar-width: thin;
        }
        
        /* ========== Source Group ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-group {
            border:1px solid var(--dr-line);
            border-radius:12px;
            background:color-mix(in srgb, var(--dr-panel-2) 50%, transparent);
            overflow:hidden;
            margin-bottom:10px;
            transition: background 0.3s;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary {
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            list-style:none;
            cursor:pointer;
            padding:10px 12px;
            font-size:11px;
            color:var(--dr-text);
            margin:0;
            background:color-mix(in srgb, var(--dr-panel) 80%, transparent);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary::-webkit-details-marker {
            display:none;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary::after {
            content:"展开";
            font-size:10px;
            color:var(--dr-muted);
            letter-spacing: 1px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-group[open] .stx-memory-dream-review__source-summary::after {
            content:"收起";
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary strong {
            font-size:11px;
            font-weight:700;
            color:var(--dr-text);
            letter-spacing: 0.5px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-count {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:24px;
            min-height:20px;
            padding:0 8px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--dr-accent) 30%, transparent);
            background:color-mix(in srgb, var(--dr-accent) 15%, transparent);
            font-size:9px;
            color:var(--dr-accent);
            font-weight:700;
            box-shadow: 0 0 8px var(--dr-accent-glow);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-body {
            display:flex;
            flex-direction:column;
            gap:8px;
            padding:0 10px 10px;
        }
        
        /* ========== Cards (Source, Metric, Mutation, Diag) ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-card,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__diag-card {
            border:1px solid var(--dr-line);
            border-radius:12px;
            padding:10px 12px;
            background:color-mix(in srgb, var(--dr-panel-2) 80%, transparent);
            min-width:0;
            position: relative;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation:hover,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transform: translateY(-1px);
        }
        
        /* ========== Mutation Type Styling ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_create"] {
            border-color:color-mix(in srgb, var(--dr-mutation-create) 35%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-create) 8%, transparent), color-mix(in srgb, var(--dr-panel-2) 90%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_patch"] {
            border-color:color-mix(in srgb, var(--dr-mutation-patch) 35%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-patch) 8%, transparent), color-mix(in srgb, var(--dr-panel-2) 90%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="relationship_patch"] {
            border-color:color-mix(in srgb, var(--dr-mutation-relationship) 35%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-relationship) 8%, transparent), color-mix(in srgb, var(--dr-panel-2) 90%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_create"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-create) 25%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-create) 50%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-create) 90%, white);
            font-weight:600;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_patch"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-patch) 25%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-patch) 50%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-patch) 90%, white);
            font-weight:600;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="relationship_patch"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-relationship) 25%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-relationship) 50%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-relationship) 90%, white);
            font-weight:600;
        }
        
        /* ========== Text Styles ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-label,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hint,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload {
            font-size:10px;
            line-height:1.5;
            color:var(--dr-muted);
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-value,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-title,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title {
            font-size:12px;
            font-weight:700;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-value,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hint,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-title,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title {
            min-width:0;
            white-space:pre-wrap;
            word-break:break-word;
            overflow-wrap:anywhere;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-value {
            margin-top:4px;
            color:var(--dr-text);
            font-family:"Fira Code", monospace;
            font-size:11px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-title {
            margin:0 0 4px;
            color:var(--dr-text);
            letter-spacing: 0.5px;
        }
        
        /* ========== Panel Title ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title {
            display:flex;
            align-items:center;
            gap:8px;
            margin:0 0 10px;
            color:var(--dr-text);
            text-transform:uppercase;
            letter-spacing:1px;
            font-size:11px;
            text-shadow: 0 0 8px rgba(255,255,255,0.2);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title::before {
            content:"";
            width:6px;
            height:6px;
            background:var(--dr-accent);
            box-shadow:0 0 10px var(--dr-accent-glow), 0 0 4px var(--dr-accent);
            transform: rotate(45deg);
            display: inline-block;
        }
        
        /* ========== Narrative ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__narrative {
            white-space:pre-wrap;
            line-height:1.7;
            font-size:11px;
            color:var(--dr-text);
            padding:10px 12px;
            border-radius:12px;
            border:1px solid color-mix(in srgb, var(--dr-magic) 30%, transparent);
            background:linear-gradient(135deg, color-mix(in srgb, var(--dr-bg) 90%, transparent), color-mix(in srgb, var(--dr-panel) 80%, transparent));
            margin:0 0 8px;
            box-shadow: inset 0 0 16px rgba(0,0,0,0.3);
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }
        
        /* ========== Lists & Sections ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__list,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__sources {
            display:flex;
            flex-direction:column;
            gap:8px;
            margin:0;
            min-width:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__section {
            display:flex;
            flex-direction:column;
            gap:8px;
            margin-bottom:10px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__section + .stx-memory-dream-review__section {
            margin-top:0;
            padding-top:10px;
            border-top:1px solid color-mix(in srgb, var(--dr-line) 80%, transparent);
        }
        
        /* ========== Mutation Selection ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation.is-selected {
            border-color:color-mix(in srgb, var(--dr-success) 60%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-success) 15%, transparent), color-mix(in srgb, var(--dr-panel) 90%, transparent));
            box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dr-success) 20%, transparent), 0 4px 15px rgba(0,0,0,0.4);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-body {
            display:flex;
            flex-direction:column;
            gap:6px;
            min-width:0;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-meta {
            display:flex;
            flex-wrap:wrap;
            gap:6px;
            margin:4px 0 0;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__secondary {
            font-size:10px;
            line-height:1.5;
            color:var(--dr-muted);
            min-width:0;
            word-break:break-word;
            overflow-wrap:anywhere;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__secondary--truncate,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-value--truncate {
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            word-break:normal;
            overflow-wrap:normal;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-grid {
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:8px;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field {
            border:1px solid color-mix(in srgb, var(--dr-line) 60%, transparent);
            border-radius:10px;
            padding:8px 10px;
            background:color-mix(in srgb, var(--dr-panel) 70%, transparent);
            min-width:0;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-label {
            font-size:10px;
            line-height:1.35;
            color:var(--dr-muted);
            margin-bottom:4px;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-value {
            font-size:11px;
            line-height:1.55;
            color:var(--dr-text);
            min-width:0;
            word-break:break-word;
            overflow-wrap:anywhere;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-value--title {
            font-weight:700;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__chip-row {
            display:flex;
            flex-wrap:wrap;
            gap:6px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__pill {
            display:inline-flex;
            align-items:center;
            min-height:22px;
            padding:0 8px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--dr-line) 80%, transparent);
            background:color-mix(in srgb, var(--dr-panel-2) 70%, transparent);
            color:var(--dr-muted);
            font-size:9px;
            line-height:1.3;
            white-space:nowrap;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-head {
            display:flex;
            gap:8px;
            align-items:flex-start;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-head input {
            margin-top:2px;
            flex-shrink:0;
            accent-color: var(--dr-success);
        }
        
        /* ========== Badges & Highlights ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badges,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlights {
            display:flex;
            flex-wrap:wrap;
            gap:6px;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badge,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlight {
            border-radius:999px;
            padding:3px 8px;
            background:color-mix(in srgb, var(--dr-panel-2) 80%, transparent);
            border:1px solid color-mix(in srgb, var(--dr-line) 80%, transparent);
            color:var(--dr-text);
            font-size:9px;
            line-height:1.4;
            white-space:nowrap;
            margin:0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlight {
            background:color-mix(in srgb, var(--dr-magic) 25%, transparent);
            border-color:color-mix(in srgb, var(--dr-magic) 40%, transparent);
            box-shadow: 0 0 8px color-mix(in srgb, var(--dr-magic) 20%, transparent);
        }
        
        /* ========== Toolbar ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar {
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:8px;
            flex-wrap:wrap;
            position:sticky;
            top:0;
            z-index:2;
            padding-bottom:10px;
            background:linear-gradient(180deg, var(--dr-bg) 40%, color-mix(in srgb, var(--dr-bg) 80%, transparent) 80%, rgba(0,0,0,0));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar > div:last-child {
            display:flex;
            gap:8px;
            flex-wrap:wrap;
        }
        
        /* ========== Actions & Buttons ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions {
            display:flex;
            justify-content:space-between;
            gap:8px;
            flex-wrap:wrap;
            padding:12px 0 0;
            margin-top:12px;
            border-top:1px solid color-mix(in srgb, var(--dr-line) 60%, transparent);
            background:linear-gradient(180deg, rgba(0,0,0,0), color-mix(in srgb, var(--dr-bg) 90%, transparent) 40%);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar button {
            border:1px solid color-mix(in srgb, var(--dr-line) 80%, transparent);
            border-radius:10px;
            padding:8px 14px;
            background:color-mix(in srgb, var(--dr-panel-2) 80%, transparent);
            color:inherit;
            font-size:11px;
            font-weight:600;
            cursor:pointer;
            transition:all .2s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            letter-spacing: 0.5px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button:hover,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar button:hover {
            background:color-mix(in srgb, var(--dr-panel-2) 100%, transparent);
            border-color:color-mix(in srgb, var(--dr-accent) 50%, transparent);
            transform:translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3), 0 0 10px var(--dr-accent-glow);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button[data-action="approve"] {
            background:color-mix(in srgb, var(--dr-success) 20%, transparent);
            border-color:color-mix(in srgb, var(--dr-success) 40%, transparent);
            text-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button[data-action="approve"]:hover {
            background:color-mix(in srgb, var(--dr-success) 30%, transparent);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3), 0 0 12px color-mix(in srgb, var(--dr-success) 40%, transparent);
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__maintenance-actions {
            display:flex;
            flex-wrap:wrap;
            gap:8px;
            margin-top:2px;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__maintenance-actions button {
            border:1px solid color-mix(in srgb, var(--dr-line) 80%, transparent);
            border-radius:10px;
            padding:6px 12px;
            background:color-mix(in srgb, var(--dr-panel-2) 80%, transparent);
            color:inherit;
            font-size:11px;
            font-weight:700;
            cursor:pointer;
            transition:all .2s ease;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__maintenance-actions button.is-active[data-dream-maintenance-choice="approve"] {
            border-color:color-mix(in srgb, var(--dr-success) 55%, transparent);
            background:color-mix(in srgb, var(--dr-success) 24%, transparent);
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__maintenance-actions button.is-active[data-dream-maintenance-choice="reject"] {
            border-color:color-mix(in srgb, #ef5350 55%, transparent);
            background:color-mix(in srgb, #ef5350 18%, transparent);
            color:#ffcdd2;
        }
        
        /* ========== Payload & JSON Syntax Highlighting ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload {
            margin:6px 0 0;
            padding:10px 12px;
            white-space:pre-wrap;
            word-break:break-word;
            overflow-wrap:anywhere;
            border-radius:10px;
            background:color-mix(in srgb, var(--dr-bg) 80%, transparent);
            border:1px dashed color-mix(in srgb, var(--dr-magic) 40%, transparent);
            font-size:10px;
            max-height:180px;
            overflow:auto;
            font-family:"Fira Code", monospace;
            color:color-mix(in srgb, var(--dr-text) 90%, transparent);
            box-shadow: inset 0 0 10px rgba(0,0,0,0.4);
        }
        
        /* JSON Syntax Highlighting (via CSS pseudo-elements and patterns) */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload {
            --json-key:#a5d6a7;
            --json-string:#90caf9;
            --json-number:#ffcc80;
            --json-boolean:#f48fb1;
            --json-null:#b3e5fc;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__explain {
            margin-top:8px;
            padding-top:8px;
            border-top:1px dashed color-mix(in srgb, var(--dr-magic) 30%, transparent);
        }
        
        /* ========== Responsive ========== */
        @media (max-width: 1080px) {
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero,
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid,
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary {
                grid-template-columns:minmax(0,1fr);
            }
        }
        @media (max-width: 760px) {
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__findings-kpis,
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-grid {
                grid-template-columns:minmax(0,1fr);
            }
            #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-row {
                grid-template-columns:minmax(0,1fr);
                gap:6px;
            }
        }
    `;
    document.head.appendChild(style);
}

function renderSourceCards(title: string, hits: DreamSessionRecallRecord['recentHits']): string {
    if (hits.length <= 0) {
        return `<div class="stx-memory-dream-review__source-card"><div class="stx-memory-dream-review__meta">${escapeHtml(resolveDreamReviewSourceLabel(title))} 暂无命中。</div></div>`;
    }
    return hits
        .map((hit) => {
            const entryIdDisplay = truncateText(hit.entryId, 36);
            return `
        <article class="stx-memory-dream-review__source-card">
            <div class="stx-memory-dream-review__mutation-title">${escapeHtml(hit.title || '未命名条目')}</div>
            <div class="stx-memory-dream-review__meta">分：${Number(hit.score ?? 0).toFixed(2)} / 来源：${escapeHtml(resolveDreamReviewSourceLabel(title))}</div>
            <div class="stx-memory-dream-review__hint">${escapeHtml(hit.summary || '无摘要')}</div>
            <div class="stx-memory-dream-review__secondary stx-memory-dream-review__secondary--truncate" title="${escapeAttr(hit.entryId)}">标识：${escapeHtml(entryIdDisplay)}</div>
            <div class="stx-memory-dream-review__badges">
                ${hit.tags
                    .slice(0, 6)
                    .map((tag: string): string => `<span class="stx-memory-dream-review__badge" title="${escapeAttr(tag)}">${escapeHtml(truncateText(tag, 12))}</span>`)
                    .join('')}
            </div>
        </article>
    `;
        })
        .join('');
}

function renderSourceGroup(title: string, hits: DreamSessionRecallRecord['recentHits'], open = false): string {
    return `
        <details class="stx-memory-dream-review__source-group" ${open ? 'open' : ''}>
            <summary class="stx-memory-dream-review__source-summary"><i class="fa-regular fa-folder-open" style="margin-right: -4px;"></i> 
                <strong>${escapeHtml(resolveDreamReviewSourceLabel(title))}</strong>
                <span class="stx-memory-dream-review__source-count">${String(hits.length)}</span>
            </summary>
            <div class="stx-memory-dream-review__source-body">
                ${renderSourceCards(title, hits)}
            </div>
        </details>
    `;
}

function renderDiagnosticsCard(
    diagnostics?: DreamSessionDiagnosticsRecord | null,
    graphSnapshot?: DreamSessionGraphSnapshotRecord | null,
    titleMap: Map<string, string> = new Map<string, string>(),
): string {
    if (!diagnostics) {
        return `<div class="stx-memory-dream-review__diag-card"><div class="stx-memory-dream-review__hint"><i class="fa-solid fa-ghost"></i> 当前会话未保存诊断信息。</div></div>`;
    }
    return `
        <div class="stx-memory-dream-review__diag-card" style="display:flex; flex-direction:column; gap:10px;">
            <div class="stx-memory-dream-review__mutation-title" style="margin:0;"><i class="fa-solid fa-microscope" style="color:var(--dr-magic);"></i> 融合诊断</div>
            
            <div class="stx-memory-dream-review__narrative" style="margin:0; padding:8px 10px; font-style:italic;">
                <i class="fa-solid fa-magnifying-glass" style="margin-right:4px; opacity:0.6;"></i> ${escapeHtml(diagnostics.waveOutputs[0]?.queryText ?? '自动漫游（无特定查询）')}
            </div>
            
            <div class="stx-memory-dream-review__findings-kpis" style="grid-template-columns: repeat(4, 1fr); gap:6px;">
                <div class="stx-memory-dream-review__kpi" style="padding:6px; text-align:center;">
                    <div class="stx-memory-dream-review__kpi-value" style="margin:0; font-size:15px; color:var(--dr-success);">${diagnostics.fusionResult.diagnostics.finalSelectedCount}</div>
                    <div class="stx-memory-dream-review__kpi-label" style="font-size:9px; margin-top:2px;">最终应用</div>
                </div>
                <div class="stx-memory-dream-review__kpi" style="padding:6px; text-align:center;">
                    <div class="stx-memory-dream-review__kpi-value" style="margin:0; font-size:15px; opacity:0.8;">${diagnostics.fusionResult.diagnostics.duplicateDropped}</div>
                    <div class="stx-memory-dream-review__kpi-label" style="font-size:9px; margin-top:2px;">冗余去重</div>
                </div>
                <div class="stx-memory-dream-review__kpi" style="padding:6px; text-align:center;">
                    <div class="stx-memory-dream-review__kpi-value" style="margin:0; font-size:15px; color:var(--dr-accent);">${diagnostics.fusionResult.diagnostics.boostedByNovelty}</div>
                    <div class="stx-memory-dream-review__kpi-label" style="font-size:9px; margin-top:2px;">新颖提升</div>
                </div>
                <div class="stx-memory-dream-review__kpi" style="padding:6px; text-align:center;">
                    <div class="stx-memory-dream-review__kpi-value" style="margin:0; font-size:15px; color:var(--dr-magic);">${diagnostics.fusionResult.diagnostics.boostedByActivation}</div>
                    <div class="stx-memory-dream-review__kpi-label" style="font-size:9px; margin-top:2px;">共现激活</div>
                </div>
            </div>
            
            ${diagnostics.fusionResult.bridgeNodeKeys.length > 0 ? `
            <div class="stx-memory-dream-review__field" style="background:transparent; border:none; padding:0 4px;">
                <div class="stx-memory-dream-review__field-label"><i class="fa-solid fa-bridge"></i> 关键桥接线索</div>
                ${renderDreamDiagnosticChips(diagnostics.fusionResult.bridgeNodeKeys, titleMap)}
            </div>` : ''}

            <details class="stx-memory-dream-review__source-group" style="margin:0; border-color:color-mix(in srgb, var(--dr-line) 40%, transparent);">
                <summary class="stx-memory-dream-review__source-summary" style="padding:8px 10px; background:transparent;">
                    <strong><i class="fa-solid fa-network-wired" style="margin-right:4px;"></i> 溯源脉络与会话快照</strong>
                </summary>
                <div class="stx-memory-dream-review__source-body" style="padding:0 10px 10px;">
                    <div class="stx-memory-dream-review__badges" style="margin-bottom:8px;">
                        <span class="stx-memory-dream-review__badge"><i class="fa-solid fa-circle-nodes"></i> 图节点: ${String(graphSnapshot?.activatedNodes.length ?? 0)}</span>
                        <span class="stx-memory-dream-review__badge"><i class="fa-solid fa-link"></i> 网路边: ${String(graphSnapshot?.activatedEdges.length ?? 0)}</span>
                    </div>
                    ${diagnostics.waveOutputs.map((wave) => `
                        <div class="stx-memory-dream-review__section" style="padding-top:8px; margin-bottom:4px; border-top:1px dashed color-mix(in srgb, var(--dr-line) 40%, transparent);">
                            <div class="stx-memory-dream-review__meta" style="color:var(--dr-accent);"><i class="fa-solid fa-wave-pulse"></i> ${escapeHtml(resolveDreamReviewWaveLabel(wave.waveType))} (候选 ${String(wave.diagnostics.candidateCount)})</div>
                            <div class="stx-memory-dream-review__chip-row" style="margin-top:6px;">
                                ${wave.seedEntryIds.length > 0 ? `<span class="stx-memory-dream-review__pill" style="border-color:color-mix(in srgb, var(--dr-magic) 50%, transparent); color:var(--dr-text);"><i class="fa-solid fa-seedling" style="margin-right:3px; color:var(--dr-magic);"></i>种子: ${String(wave.seedEntryIds.length)} 条</span>` : ''}
                                ${wave.activatedNodeKeys.length > 0 ? `<span class="stx-memory-dream-review__pill"><i class="fa-solid fa-bolt" style="margin-right:3px; color:var(--dr-accent);"></i>激活: ${String(wave.activatedNodeKeys.length)} 节点</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </details>
        </div>
    `;
}

function renderField(label: string, value: string, emphasize = false): string {
    return renderFieldWithOptions(label, value, { emphasize });
}

function renderFieldWithOptions(label: string, value: string, options?: { emphasize?: boolean; truncate?: boolean }): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    const emphasize = Boolean(options?.emphasize);
    const truncate = Boolean(options?.truncate);
    return `
        <div class="stx-memory-dream-review__field">
            <div class="stx-memory-dream-review__field-label">${escapeHtml(label)}</div>
            <div class="stx-memory-dream-review__field-value${emphasize ? ' stx-memory-dream-review__field-value--title' : ''}${truncate ? ' stx-memory-dream-review__field-value--truncate' : ''}"${truncate ? ` title="${escapeAttr(text)}"` : ''}>${escapeHtml(text)}</div>
        </div>
    `;
}

function renderFieldChips(label: string, values: string[]): string {
    const normalized = values.map((item: string): string => String(item ?? '').trim()).filter(Boolean);
    if (normalized.length <= 0) {
        return '';
    }
    return `
        <div class="stx-memory-dream-review__field">
            <div class="stx-memory-dream-review__field-label">${escapeHtml(label)}</div>
            <div class="stx-memory-dream-review__chip-row">
                ${normalized.map((item: string): string => `<span class="stx-memory-dream-review__badge" title="${escapeAttr(item)}">${escapeHtml(truncateText(item, 18))}</span>`).join('')}
            </div>
        </div>
    `;
}

/**
 * 功能：渲染变更提案的结构化内容预览。
 * @param mutation 变更提案。
 * @param titleMap 来源记忆标题映射。
 * @returns HTML 片段。
 */
function renderMutationPayloadVisual(mutation: DreamMutationProposal, titleMap: Map<string, string>): string {
    const payload = toRecord(mutation.payload);
    if (mutation.mutationType === 'relationship_patch') {
        return `
            <div class="stx-memory-dream-review__field-grid">
                ${renderField('关系标签', String(payload.relationTag ?? mutation.preview ?? '').trim(), true)}
                ${renderField('关系摘要', String(payload.summary ?? mutation.reason ?? '').trim())}
                ${renderFieldWithOptions('源角色', String(payload.sourceActorKey ?? '').trim(), { truncate: true })}
                ${renderFieldWithOptions('目标角色', String(payload.targetActorKey ?? '').trim(), { truncate: true })}
                ${renderField('状态', String(payload.state ?? '').trim())}
                ${renderFieldWithOptions('关系标识', String(payload.relationshipId ?? '').trim(), { truncate: true })}
                ${renderField('信任', String(payload.trust ?? '').trim())}
                ${renderField('好感', String(payload.affection ?? '').trim())}
                ${renderField('张力', String(payload.tension ?? '').trim())}
                ${renderFieldChips('参与者', toStringArray(payload.participants))}
            </div>
        `;
    }
    const detailPayload = toRecord(payload.detailPayload);
    const payloadEntryId = String(payload.entryId ?? '').trim();
    const payloadEntryTitle = resolveDreamSourceEntryTitle(payloadEntryId, titleMap);
    return `
        <div class="stx-memory-dream-review__field-grid">
            ${renderField('标题', String(payload.title ?? payload.candidateTitle ?? mutation.preview ?? '').trim(), true)}
            ${renderField('对应内容标题', payloadEntryTitle, true)}
            ${renderField('类型', String(payload.entryType ?? '').trim())}
            ${renderField('摘要', String(payload.summary ?? mutation.reason ?? '').trim())}
            ${renderField('详情', String(payload.detail ?? '').trim())}
            ${renderFieldWithOptions('比较键', String(payload.compareKey ?? '').trim(), { truncate: true })}
            ${renderFieldWithOptions('实体键', String(payload.entityKey ?? '').trim(), { truncate: true })}
            ${renderFieldWithOptions('条目标识', payloadEntryId, { truncate: true })}
            ${renderFieldChips('标签', toStringArray(payload.tags))}
            ${renderFieldChips('角色绑定', toStringArray(payload.actorBindings))}
            ${renderFieldChips('匹配键', toStringArray(payload.matchKeys))}
            ${renderFieldChips('详情字段', Object.keys(detailPayload))}
        </div>
    `;
}

/**
 * 功能：渲染带类型样式标记的变更提案卡片。
 * @param mutation 变更提案。
 * @param checked 当前是否选中。
 * @param titleMap 来源记忆标题映射。
 * @returns HTML 片段。
 */
function renderMutationCard(mutation: DreamMutationProposal, checked: boolean, titleMap: Map<string, string>): string {
    const payload = toRecord(mutation.payload);
    const title = mutation.mutationType === 'relationship_patch'
        ? String(payload.relationTag ?? mutation.preview ?? mutation.mutationType).trim()
        : String(payload.title ?? payload.candidateTitle ?? mutation.preview ?? mutation.mutationType).trim();
    return `
        <article class="stx-memory-dream-review__mutation${checked ? ' is-selected' : ''}" data-mutation-card="${escapeAttr(mutation.mutationId)}" data-mutation-type="${escapeAttr(mutation.mutationType)}">
            <div class="stx-memory-dream-review__mutation-head">
                <input type="checkbox" data-dream-mutation="${escapeAttr(mutation.mutationId)}" ${checked ? 'checked' : ''}>
                <div class="stx-memory-dream-review__mutation-body">
                    <div class="stx-memory-dream-review__mutation-title">${escapeHtml(localizeDreamDisplayText(title || mutation.preview || mutation.mutationType))}</div>
                    <div class="stx-memory-dream-review__secondary">${escapeHtml(localizeDreamDisplayText(mutation.preview || '无预览文案'))}</div>
                    <div class="stx-memory-dream-review__mutation-meta">
                        <span class="stx-memory-dream-review__pill">类型 ${escapeHtml(truncateText(resolveDreamMutationTypeLabel(mutation.mutationType), 8))}</span>
                        <span class="stx-memory-dream-review__pill">置 ${Number(mutation.confidence ?? 0).toFixed(2)}</span>
                        <span class="stx-memory-dream-review__pill">波段 ${escapeHtml(resolveDreamReviewWaveLabel(mutation.sourceWave))}</span>
                    </div>
                </div>
            </div>
            <div class="stx-memory-dream-review__list">
                <div class="stx-memory-dream-review__hint">${escapeHtml(localizeDreamDisplayText(mutation.reason || '无理由说明'))}</div>
                <div class="stx-memory-dream-review__meta">应用后：${escapeHtml(resolveDreamMutationActionHint(mutation))}</div>
                <div class="stx-memory-dream-review__meta">来源记忆：${escapeHtml(renderDreamMutationSourceRefs(mutation.sourceEntryIds, titleMap))}</div>
                ${renderMutationPayloadVisual(mutation, titleMap)}
                ${renderDreamReviewExplainPanel(mutation.explain)}
            </div>
        </article>
    `;
}

/**
 * 功能：渲染梦后维护提案卡片。
 * @param proposal 维护提案。
 * @param checked 当前是否选中。
 * @param titleMap 来源记忆标题映射。
 * @returns HTML 片段。
 */
function renderMaintenanceCard(
    proposal: DreamMaintenanceProposalRecord,
    checked: boolean,
    titleMap: Map<string, string>,
): string {
    const payload = toRecord(proposal.payload);
    const display = resolveDreamMaintenanceDisplay({
        proposalType: proposal.proposalType,
        preview: proposal.preview,
        reason: proposal.reason,
        payload,
        sourceEntryLabels: proposal.sourceEntryIds.map((entryId: string): string => renderDreamSourceEntryLabel(entryId, titleMap)),
        actorLabels: toStringArray(payload.participants),
    });
    const impactItemsText = (display.impactItems ?? []).join('、');
    const impactText = String(display.impactText ?? '').trim();
    const payloadEntryId = String(payload.entryId ?? payload.primaryEntryId ?? '').trim();
    const payloadEntryTitle = resolveDreamSourceEntryTitle(payloadEntryId, titleMap);
    const shouldShowImpactItems = Boolean(impactItemsText.trim());
    const shouldShowImpactText = Boolean(impactText)
        && normalizeDreamReviewDisplayText(impactText) !== normalizeDreamReviewDisplayText(impactItemsText)
        && normalizeDreamReviewDisplayText(impactText) !== normalizeDreamReviewDisplayText(String(display.summary ?? '').trim());
    return `
        <article class="stx-memory-dream-review__mutation${checked ? ' is-selected' : ''}" data-maintenance-card="${escapeAttr(proposal.proposalId)}" data-mutation-type="${escapeAttr(proposal.proposalType)}">
            <div class="stx-memory-dream-review__mutation-head">
                <input type="checkbox" data-dream-maintenance="${escapeAttr(proposal.proposalId)}" ${checked ? 'checked' : ''} hidden aria-hidden="true" tabindex="-1">
                <div class="stx-memory-dream-review__mutation-body">
                    <div class="stx-memory-dream-review__mutation-title">${escapeHtml(localizeDreamDisplayText(display.title || proposal.preview || proposal.proposalType))}</div>
                    <div class="stx-memory-dream-review__secondary">${escapeHtml(localizeDreamDisplayText(display.summary || proposal.reason || '无预览文案'))}</div>
                    <div class="stx-memory-dream-review__mutation-meta">
                        <span class="stx-memory-dream-review__pill">维护 ${escapeHtml(truncateText(resolveDreamProposalTypeLabel(proposal.proposalType), 8))}</span>
                        <span class="stx-memory-dream-review__pill">置 ${Number(proposal.confidence ?? 0).toFixed(2)}</span>
                        <span class="stx-memory-dream-review__pill">建 ${escapeHtml(new Date(proposal.createdAt).toLocaleString('zh-CN'))}</span>
                    </div>
                </div>
            </div>
            <div class="stx-memory-dream-review__list">
                <div class="stx-memory-dream-review__hint">${escapeHtml(localizeDreamDisplayText(proposal.reason || '无理由说明'))}</div>
                <div class="stx-memory-dream-review__meta">应用后：${escapeHtml(display.resultHint || '会按这条维护建议更新相关记忆内容。')}</div>
                <div class="stx-memory-dream-review__meta">来源记忆：${escapeHtml(renderDreamMaintenanceSourceRefs(proposal.sourceEntryIds, titleMap))}</div>
                <div class="stx-memory-dream-review__maintenance-actions">
                    <button type="button" data-dream-maintenance-choice="approve" data-proposal-id="${escapeAttr(proposal.proposalId)}">通过</button>
                    <button type="button" data-dream-maintenance-choice="reject" data-proposal-id="${escapeAttr(proposal.proposalId)}">拒绝</button>
                    <span class="stx-memory-dream-review__secondary">这里只是预选，点击底部“应用”后才会真正执行。</span>
                </div>
                ${shouldShowImpactItems ? `<div class="stx-memory-dream-review__meta">影响对象：${escapeHtml(impactItemsText)}</div>` : ''}
                ${shouldShowImpactText ? `<div class="stx-memory-dream-review__meta">补充说明：${escapeHtml(impactText)}</div>` : ''}
                <div class="stx-memory-dream-review__field-grid">
                    ${renderField('标题', display.title || proposal.preview || proposal.proposalType, true)}
                    ${renderField('对应内容标题', payloadEntryTitle, true)}
                    ${renderField('类型', resolveDreamProposalTypeLabel(proposal.proposalType))}
                    ${renderField('摘要', display.summary || proposal.reason || '')}
                    ${renderField('提案时间', new Date(proposal.createdAt).toLocaleString('zh-CN'))}
                    ${renderFieldWithOptions('条目标识', payloadEntryId, { truncate: true })}
                    ${renderFieldWithOptions('提案标识', proposal.proposalId, { truncate: true })}
                    ${renderFieldWithOptions('梦境标识', proposal.dreamId, { truncate: true })}
                </div>
            </div>
        </article>
    `;
}

function resolveTriggerReasonLabel(triggerReason: string): string {
    if (triggerReason === 'generation_ended') {
        return '生成结束';
    }
    if (triggerReason === 'idle') {
        return '空闲触发';
    }
    if (triggerReason === 'manual') {
        return '手动';
    }
    return triggerReason || '未知';
}

/**
 * 功能：打开 dream 审批弹窗。
 */
export async function openDreamReviewDialog(input: {
    meta: { dreamId: string; triggerReason: string; createdAt: number };
    recall: DreamSessionRecallRecord;
    output: DreamSessionOutputRecord;
    maintenanceProposals: DreamMaintenanceProposalRecord[];
    diagnostics?: DreamSessionDiagnosticsRecord | null;
    graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
}): Promise<DreamReviewDecision> {
    ensureDreamReviewStyle();
    return new Promise<DreamReviewDecision>((resolve): void => {
        let settled = false;
        const finish = (result: DreamReviewDecision): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };
        const defaultSelected = new Set(
            input.output.proposedMutations
                .filter((mutation: DreamMutationProposal): boolean => mutation.confidence >= 0.65)
                .map((mutation: DreamMutationProposal): string => mutation.mutationId),
        );
        const defaultSelectedMaintenance = new Set(
            input.maintenanceProposals
                .filter((proposal: DreamMaintenanceProposalRecord): boolean => proposal.status === 'pending' && proposal.confidence >= 0.68)
                .map((proposal: DreamMaintenanceProposalRecord): string => proposal.proposalId),
        );
        const recallTitleMap = buildRecallTitleMap(input.recall);
        const selectedCount = input.output.proposedMutations.filter((mutation: DreamMutationProposal): boolean => {
            return defaultSelected.has(mutation.mutationId);
        }).length;
        const selectedMaintenanceCount = input.maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
            return defaultSelectedMaintenance.has(proposal.proposalId);
        }).length;
        const narrativeOverview = truncateText(
            input.output.highlights.join('；') || input.output.narrative || '本轮未生成梦境概览。',
            140,
        );
        openSharedDialog({
            id: DREAM_REVIEW_DIALOG_ID,
            size: 'xl',
            chrome: { title: '梦境审批' },
            backdropBackground: [
                /* Realistic SVG Moon with extended glow (no clip) */
                `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 500'%3E%3Cdefs%3E%3Cfilter id='g' x='-100%25' y='-100%25' width='300%25' height='300%25'%3E%3CfeDropShadow dx='0' dy='0' stdDeviation='50' flood-color='%23e5d38a' flood-opacity='0.4'/%3E%3CfeDropShadow dx='0' dy='0' stdDeviation='100' flood-color='%237e57c2' flood-opacity='0.2'/%3E%3C/filter%3E%3ClinearGradient id='m' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='30%25' stop-color='%23fffbef'/%3E%3Cstop offset='100%25' stop-color='%23eac775'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg filter='url(%23g)' transform='translate(250,250) rotate(-35) translate(-100,-100)'%3E%3Cpath d='M100 0 A100 100 0 1 1 0 100 A85 85 0 0 0 100 0 Z' fill='url(%23m)' opacity='0.8'/%3E%3C/g%3E%3C/svg%3E") calc(100% - 20px) -20px / 400px 400px no-repeat`,
                /* Milky Way */
                'linear-gradient(55deg, transparent 35%, rgba(126, 87, 194, 0.06) 45%, rgba(218, 186, 116, 0.04) 50%, rgba(126, 87, 194, 0.03) 58%, transparent 65%)',
                /* Nebula / Glow Effects / Clouds */
                'radial-gradient(ellipse at 85% 15%, rgba(218, 186, 116, 0.1) 0%, transparent 45%)',
                'radial-gradient(ellipse at 20% 85%, rgba(126, 87, 194, 0.08) 0%, transparent 55%)',
                'radial-gradient(circle at 65% 75%, rgba(80, 150, 220, 0.06) 0%, transparent 35%)',
                'radial-gradient(circle at 10% 20%, rgba(200, 100, 150, 0.05) 0%, transparent 40%)',
                'radial-gradient(ellipse at 45% 45%, rgba(126, 87, 194, 0.04) 0%, transparent 40%)',
                /* Large Stars & Constellations */
                'radial-gradient(2.5px 2.5px at 15% 25%, rgba(255,255,255,0.4) 100%, transparent)',
                'radial-gradient(3.5px 3.5px at 32% 12%, rgba(218,186,116,0.3) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 45% 28%, rgba(255,255,255,0.3) 100%, transparent)',
                'radial-gradient(4px 4px at 62% 18%, rgba(126,87,194,0.3) 100%, transparent)',
                'radial-gradient(2.5px 2.5px at 82% 35%, rgba(255,255,255,0.4) 100%, transparent)',
                'radial-gradient(2.5px 2.5px at 10% 55%, rgba(255,255,255,0.3) 100%, transparent)',
                'radial-gradient(3.5px 3.5px at 28% 65%, rgba(218,186,116,0.35) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 52% 60%, rgba(255,255,255,0.25) 100%, transparent)',
                'radial-gradient(4px 4px at 75% 72%, rgba(126,87,194,0.25) 100%, transparent)',
                'radial-gradient(2.5px 2.5px at 88% 85%, rgba(255,255,255,0.3) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 40% 88%, rgba(255,255,255,0.25) 100%, transparent)',
                'radial-gradient(3px 3px at 60% 45%, rgba(218,186,116,0.25) 100%, transparent)',
                'radial-gradient(2px 2px at 92% 25%, rgba(255,255,255,0.3) 100%, transparent)',
                /* Deep Starfield base */
                'radial-gradient(1.5px 1.5px at 22% 38%, rgba(255,255,255,0.2) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 38% 82%, rgba(255,255,255,0.2) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 82% 58%, rgba(255,255,255,0.2) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 78% 15%, rgba(255,255,255,0.2) 100%, transparent)',
                'radial-gradient(1px 1px at 12% 85%, rgba(255,255,255,0.15) 100%, transparent)',
                'radial-gradient(1.5px 1.5px at 48% 50%, rgba(255,255,255,0.2) 100%, transparent)',
                /* Base Ambient Darkness */
                'linear-gradient(160deg, rgba(8, 6, 14, 0.65), rgba(2, 2, 4, 0.75))',
                'color-mix(in srgb, var(--ss-theme-backdrop, rgba(0, 0, 0, 0.8)) 60%, transparent)',
            ].join(', '),
            bodyHtml: `
                <div class="stx-memory-dream-review">
                    <div class="stx-memory-dream-review__hero">
                        <div class="stx-memory-dream-review__hero-card stx-memory-dream-review__hero-card--overview">
                            <div class="stx-memory-dream-review__hero-head">
                                <div>
                                    <div class="stx-memory-dream-review__hero-title"><i class="fa-solid fa-moon"></i> 梦境审批</div>
                                    <div class="stx-memory-dream-review__hero-subtitle">快速审查梦境叙事、来源记忆和提案价值。勾选想要应用的提案，然后提交。</div>
                                </div>
                                <div class="stx-memory-dream-review__badge">${escapeHtml(resolveTriggerReasonLabel(input.meta.triggerReason))}</div>
                            </div>
                            <div class="stx-memory-dream-review__summary" style="margin-top:8px;">
                                <div class="stx-memory-dream-review__overview-copy">
                                    <div class="stx-memory-dream-review__metric-grid">
                                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">融合召回</div><div class="stx-memory-dream-review__metric-value">${String(input.recall.fusedHits.length)}</div></div>
                                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">默选</div><div class="stx-memory-dream-review__metric-value">${String(selectedCount + selectedMaintenanceCount)}/${String(input.output.proposedMutations.length + input.maintenanceProposals.length)}</div></div>
                                    </div>
                                    <div class="stx-memory-dream-review__hint">${escapeHtml(narrativeOverview)}</div>
                                </div>
                                <div class="stx-memory-dream-review__overview-meta">
                                    <div class="stx-memory-dream-review__meta-list">
                                        <div class="stx-memory-dream-review__meta-row">
                                            <div class="stx-memory-dream-review__meta-key">${createLabelWithTooltip('梦境ID', 14)}</div>
                                            <div class="stx-memory-dream-review__meta-value" title="${escapeAttr(input.meta.dreamId)}">${escapeHtml(truncateText(input.meta.dreamId, 22))}</div>
                                        </div>
                                        <div class="stx-memory-dream-review__meta-row">
                                            <div class="stx-memory-dream-review__meta-key">${createLabelWithTooltip('创建时', 14)}</div>
                                            <div class="stx-memory-dream-review__meta-value">${escapeHtml(new Date(input.meta.createdAt).toLocaleString('zh-CN'))}</div>
                                        </div>
                                        <div class="stx-memory-dream-review__meta-row">
                                            <div class="stx-memory-dream-review__meta-key">${createLabelWithTooltip('提案数', 14)}</div>
                                            <div class="stx-memory-dream-review__meta-value">写回 ${String(input.output.proposedMutations.length)} 条 / 维护 ${String(input.maintenanceProposals.length)} 条</div>
                                        </div>
                                        <div class="stx-memory-dream-review__meta-row">
                                            <div class="stx-memory-dream-review__meta-key">${createLabelWithTooltip('触发源', 14)}</div>
                                            <div class="stx-memory-dream-review__meta-value">${escapeHtml(resolveTriggerReasonLabel(input.meta.triggerReason))}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="stx-memory-dream-review__hero-card stx-memory-dream-review__hero-card--findings">
                            <div class="stx-memory-dream-review__panel-title"><i class="fa-solid fa-sparkles"></i> 发现亮点</div>
                            <div class="stx-memory-dream-review__findings-kpis">
                                <div class="stx-memory-dream-review__kpi">
                                    <div class="stx-memory-dream-review__kpi-label">亮点</div>
                                    <div class="stx-memory-dream-review__kpi-value">${String(input.output.highlights.length || 0)}</div>
                                </div>
                                <div class="stx-memory-dream-review__kpi">
                                    <div class="stx-memory-dream-review__kpi-label">提案</div>
                                    <div class="stx-memory-dream-review__kpi-value">${String(input.output.proposedMutations.length + input.maintenanceProposals.length)}</div>
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__highlights" style="margin-top:6px;">
                                ${(input.output.highlights.length > 0 ? input.output.highlights : ['暂无']).map((item: string): string => `<span class="stx-memory-dream-review__highlight" title="${escapeAttr(item)}">${escapeHtml(truncateText(item, 16))}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="stx-memory-dream-review__grid">
                        <section class="stx-memory-dream-review__panel">
                            <div class="stx-memory-dream-review__section">
                                <div class="stx-memory-dream-review__panel-title"><i class="fa-solid fa-scroll"></i> 梦境叙事</div>
                                <div class="stx-memory-dream-review__narrative">${escapeHtml(input.output.narrative || '本轮未生成梦境叙事。')}</div>
                            </div>
                            <div class="stx-memory-dream-review__section">
                                <div class="stx-memory-dream-review__panel-title"><i class="fa-solid fa-book-journal-whills"></i> 来源记忆</div>
                                <div class="stx-memory-dream-review__sources">
                                    ${renderSourceGroup('recent', input.recall.recentHits, true)}
                                    ${renderSourceGroup('mid', input.recall.midHits)}
                                    ${renderSourceGroup('deep', input.recall.deepHits)}
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__section">
                                <div class="stx-memory-dream-review__panel-title">诊断</div>
                                ${renderDiagnosticsCard(input.diagnostics, input.graphSnapshot, recallTitleMap)}
                            </div>
                        </section>
                        <section class="stx-memory-dream-review__panel">
                            <div class="stx-memory-dream-review__toolbar">
                                <div class="stx-memory-dream-review__panel-title"><i class="fa-solid fa-check-double"></i> 统一审批</div>
                                <div>
                                    <button type="button" data-select-all="true">全选</button>
                                    <button type="button" data-clear-all="true">清空</button>
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__list">
                                ${input.output.proposedMutations.length > 0 ? `
                                    <div class="stx-memory-dream-review__panel-title">写回提案</div>
                                    ${input.output.proposedMutations.map((mutation: DreamMutationProposal): string => renderMutationCard(mutation, defaultSelected.has(mutation.mutationId), recallTitleMap)).join('')}
                                ` : ''}
                                ${input.maintenanceProposals.length > 0 ? `
                                    <div class="stx-memory-dream-review__panel-title"><i class="fa-solid fa-toolbox"></i> 梦后维护</div>
                                    ${input.maintenanceProposals.map((proposal: DreamMaintenanceProposalRecord): string => renderMaintenanceCard(proposal, defaultSelectedMaintenance.has(proposal.proposalId), recallTitleMap)).join('')}
                                ` : ''}
                                ${input.output.proposedMutations.length <= 0 && input.maintenanceProposals.length <= 0 ? `<div class="stx-memory-dream-review__hint">本轮没有可审批提案。</div>` : ''}
                            </div>
                        </section>
                    </div>
                    <div class="stx-memory-dream-review__actions">
                        <button type="button" data-action="defer">稍后</button>
                        <button type="button" data-action="approve">应用</button>
                    </div>
                </div>
            `,
            onMount: (instance: SharedDialogInstance): void => {
                const root = instance.content;
                const mutationInputs = (): HTMLInputElement[] =>
                    Array.from(root.querySelectorAll('input[data-dream-mutation]')).filter(
                        (item: Element): item is HTMLInputElement => item instanceof HTMLInputElement,
                    );
                const maintenanceInputs = (): HTMLInputElement[] =>
                    Array.from(root.querySelectorAll('input[data-dream-maintenance]')).filter(
                        (item: Element): item is HTMLInputElement => item instanceof HTMLInputElement,
                    );
                const syncCards = (): void => {
                    mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                        const mutationId = String(inputEl.dataset.dreamMutation ?? '').trim();
                        root.querySelector(`[data-mutation-card="${mutationId}"]`)?.classList.toggle('is-selected', inputEl.checked);
                    });
                    maintenanceInputs().forEach((inputEl: HTMLInputElement): void => {
                        const proposalId = String(inputEl.dataset.dreamMaintenance ?? '').trim();
                        const card = root.querySelector(`[data-maintenance-card="${proposalId}"]`);
                        card?.classList.toggle('is-selected', inputEl.checked);
                        card?.querySelector('[data-dream-maintenance-choice="approve"]')?.classList.toggle('is-active', inputEl.checked);
                        card?.querySelector('[data-dream-maintenance-choice="reject"]')?.classList.toggle('is-active', !inputEl.checked);
                    });
                };
                const readSelection = (): {
                    approvedMutations: string[];
                    rejectedMutations: string[];
                    approvedMaintenanceProposalIds: string[];
                    rejectedMaintenanceProposalIds: string[];
                } => {
                    const approvedMutations = mutationInputs()
                        .filter((item: HTMLInputElement): boolean => item.checked)
                        .map((item: HTMLInputElement): string => String(item.dataset.dreamMutation ?? '').trim())
                        .filter(Boolean);
                    const approvedMutationSet = new Set(approvedMutations);
                    const rejectedMutations = input.output.proposedMutations
                        .map((item: DreamMutationProposal): string => item.mutationId)
                        .filter((mutationId: string): boolean => !approvedMutationSet.has(mutationId));
                    const approvedMaintenanceProposalIds = maintenanceInputs()
                        .filter((item: HTMLInputElement): boolean => item.checked)
                        .map((item: HTMLInputElement): string => String(item.dataset.dreamMaintenance ?? '').trim())
                        .filter(Boolean);
                    const approvedMaintenanceSet = new Set(approvedMaintenanceProposalIds);
                    const rejectedMaintenanceProposalIds = input.maintenanceProposals
                        .map((item: DreamMaintenanceProposalRecord): string => item.proposalId)
                        .filter((proposalId: string): boolean => !approvedMaintenanceSet.has(proposalId));
                    return {
                        approvedMutations,
                        rejectedMutations,
                        approvedMaintenanceProposalIds,
                        rejectedMaintenanceProposalIds,
                    };
                };
                mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                    inputEl.addEventListener('change', syncCards);
                });
                maintenanceInputs().forEach((inputEl: HTMLInputElement): void => {
                    inputEl.addEventListener('change', syncCards);
                });
                root.querySelectorAll('[data-dream-maintenance-choice]').forEach((button: Element): void => {
                    button.addEventListener('click', (): void => {
                        const buttonEl = button as HTMLElement;
                        const proposalId = String(buttonEl.dataset.proposalId ?? '').trim();
                        const choice = String(buttonEl.dataset.dreamMaintenanceChoice ?? '').trim();
                        const targetInput = maintenanceInputs().find((inputEl: HTMLInputElement): boolean => {
                            return String(inputEl.dataset.dreamMaintenance ?? '').trim() === proposalId;
                        });
                        if (!targetInput) {
                            return;
                        }
                        targetInput.checked = choice === 'approve';
                        syncCards();
                    });
                });
                root.querySelector('[data-select-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = true;
                    });
                    maintenanceInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = true;
                    });
                    syncCards();
                });
                root.querySelector('[data-clear-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = false;
                    });
                    maintenanceInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = false;
                    });
                    syncCards();
                });
                root.querySelector('[data-action="defer"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({
                        decision: 'deferred',
                        approvedMutationIds: selection.approvedMutations,
                        rejectedMutationIds: selection.rejectedMutations,
                        approvedMaintenanceProposalIds: selection.approvedMaintenanceProposalIds,
                        rejectedMaintenanceProposalIds: selection.rejectedMaintenanceProposalIds,
                    });
                });
                root.querySelector('[data-action="approve"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({
                        decision: (selection.approvedMutations.length > 0 || selection.approvedMaintenanceProposalIds.length > 0) ? 'approved' : 'deferred',
                        approvedMutationIds: selection.approvedMutations,
                        rejectedMutationIds: selection.rejectedMutations,
                        approvedMaintenanceProposalIds: selection.approvedMaintenanceProposalIds,
                        rejectedMaintenanceProposalIds: selection.rejectedMaintenanceProposalIds,
                    });
                });
                syncCards();
            },
            onClose: (): void => {
                finish({
                    decision: 'deferred',
                    approvedMutationIds: [],
                    rejectedMutationIds: [],
                    approvedMaintenanceProposalIds: [],
                    rejectedMaintenanceProposalIds: [],
                });
            },
        });
    });
}
