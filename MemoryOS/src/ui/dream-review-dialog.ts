import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { renderDreamReviewExplainPanel } from './dream-review-explain-panel';
import {
    localizeDreamDisplayText,
    resolveDreamMutationTypeLabel,
    resolveDreamReviewSourceLabel,
    resolveDreamReviewWaveLabel,
} from './workbenchLocale';
import type {
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
        });
    });
    return titleMap;
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
        .map((entryId: string): string => titleMap.get(entryId) || entryId)
        .join('、');
}

function ensureDreamReviewStyle(): void {
    if (document.getElementById(DREAM_REVIEW_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = DREAM_REVIEW_STYLE_ID;
    style.textContent = `
        /* ========== Color Variables ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review {
            --dr-bg:var(--ss-theme-panel-bg, var(--SmartThemeBlurTintColor, rgba(18, 20, 24, 0.96)));
            --dr-panel:var(--ss-theme-surface-2, color-mix(in srgb, var(--dr-bg) 92%, black 8%));
            --dr-panel-2:var(--ss-theme-surface-3, color-mix(in srgb, var(--dr-bg) 84%, var(--ss-theme-text, #fff) 16%));
            --dr-line:var(--ss-theme-border, rgba(255,255,255,.14));
            --dr-line-strong:var(--ss-theme-border-strong, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 48%, transparent));
            --dr-text:var(--ss-theme-text, var(--SmartThemeBodyColor, #ececec));
            --dr-muted:var(--ss-theme-text-muted, var(--SmartThemeEmColor, rgba(255,255,255,.68)));
            --dr-accent:var(--ss-theme-accent, var(--SmartThemeQuoteColor, #c5a059));
            --dr-success:color-mix(in srgb, var(--ss-theme-accent, #c5a059) 42%, #22c55e);
            
            /* ========== Mutation Type Colors ========== */
            --dr-mutation-create:#22c55e;
            --dr-mutation-patch:#3b82f6;
            --dr-mutation-relationship:#a855f7;
            
            /* ========== Layout ========== */
            display:flex;
            flex-direction:column;
            gap:8px;
            min-width:0;
            width:100%;
            max-width:100%;
            height:min(86vh,1080px);
            overflow:hidden;
            color:var(--dr-text);
    
            /* ========== Containers ========== */
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid {
            display:grid;
            gap:10px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero {
            display:grid;
            grid-template-columns:minmax(0,1.32fr) minmax(0,.88fr);
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel {
            border:1px solid var(--dr-line);
            border-radius:12px;
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-panel) 96%, white 4%), color-mix(in srgb, var(--dr-bg) 98%, black 2%)), var(--dr-bg);
            min-height:0;
            min-width:0;
        }
        
        /* ========== Hero Section ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card {
            padding:10px 12px;
            box-shadow:inset 0 1px 0 color-mix(in srgb, var(--dr-text) 4%, transparent);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card--overview {
            background:linear-gradient(135deg, color-mix(in srgb, var(--dr-accent) 14%, transparent), color-mix(in srgb, var(--dr-panel) 98%, transparent) 54%, color-mix(in srgb, var(--dr-success) 10%, transparent)), var(--dr-bg);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-head {
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-title {
            font-size:15px;
            font-weight:800;
            letter-spacing:.4px;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-subtitle {
            margin-top:2px;
            font-size:11px;
            color:var(--dr-muted);
            line-height:1.5;
        }
        
        /* ========== Findings KPI ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hero-card--findings {
            display:flex;
            flex-direction:column;
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__findings-kpis {
            display:grid;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:6px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi {
            border:1px solid var(--dr-line);
            border-radius:10px;
            padding:7px 8px;
            background:color-mix(in srgb, var(--dr-panel-2) 72%, transparent);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi-label {
            font-size:10px;
            color:var(--dr-muted);
            line-height:1.4;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__kpi-value {
            margin:2px 0 0;
            font-size:15px;
            font-weight:800;
            color:var(--dr-text);
        }
        
        /* ========== Summary Section ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary {
            grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);
            align-items:start;
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-copy,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-meta,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-list {
            display:flex;
            flex-direction:column;
            gap:6px;
            min-width:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__overview-meta {
            max-height:200px;
            overflow:auto;
            padding-right:2px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-grid {
            display:grid;
            grid-template-columns:repeat(2, minmax(0,1fr));
            gap:6px;
        }
        
        /* ========== Meta Rows ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta-row {
            display:grid;
            grid-template-columns:80px minmax(0,1fr);
            gap:8px;
            align-items:start;
            border:1px solid var(--dr-line);
            border-radius:10px;
            padding:7px 8px;
            background:color-mix(in srgb, var(--dr-panel-2) 72%, transparent);
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
            gap:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel {
            padding:10px;
            overflow:auto;
            scrollbar-gutter:stable;
        }
        
        /* ========== Source Group ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-group {
            border:1px solid var(--dr-line);
            border-radius:10px;
            background:color-mix(in srgb, var(--dr-panel-2) 68%, transparent);
            overflow:hidden;
            margin-bottom:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary {
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            list-style:none;
            cursor:pointer;
            padding:8px 10px;
            font-size:11px;
            color:var(--dr-text);
            margin:0;
            background:color-mix(in srgb, var(--dr-panel) 100%, transparent);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary::-webkit-details-marker {
            display:none;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary::after {
            content:"展开";
            font-size:9px;
            color:var(--dr-muted);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-group[open] .stx-memory-dream-review__source-summary::after {
            content:"收起";
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-summary strong {
            font-size:11px;
            font-weight:700;
            color:var(--dr-text);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-count {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:24px;
            min-height:20px;
            padding:0 6px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--dr-line) 92%, transparent);
            background:color-mix(in srgb, var(--dr-panel) 78%, transparent);
            font-size:9px;
            color:var(--dr-muted);
            font-weight:700;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-body {
            display:flex;
            flex-direction:column;
            gap:6px;
            padding:0 8px 8px;
        }
        
        /* ========== Cards (Source, Metric, Mutation, Diag) ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-card,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__diag-card {
            border:1px solid var(--dr-line);
            border-radius:10px;
            padding:8px 9px;
            background:color-mix(in srgb, var(--dr-panel-2) 76%, transparent);
            min-width:0;
        }
        
        /* ========== Mutation Type Styling ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_create"] {
            border-color:color-mix(in srgb, var(--dr-mutation-create) 28%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-create) 8%, transparent), color-mix(in srgb, var(--dr-panel) 96%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_patch"] {
            border-color:color-mix(in srgb, var(--dr-mutation-patch) 28%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-patch) 8%, transparent), color-mix(in srgb, var(--dr-panel) 96%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="relationship_patch"] {
            border-color:color-mix(in srgb, var(--dr-mutation-relationship) 28%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-mutation-relationship) 8%, transparent), color-mix(in srgb, var(--dr-panel) 96%, transparent));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_create"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-create) 22%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-create) 42%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-create) 88%, white);
            font-weight:600;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="entry_patch"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-patch) 22%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-patch) 42%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-patch) 88%, white);
            font-weight:600;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation[data-mutation-type="relationship_patch"] .stx-memory-dream-review__pill:first-of-type {
            background:color-mix(in srgb, var(--dr-mutation-relationship) 22%, transparent);
            border-color:color-mix(in srgb, var(--dr-mutation-relationship) 42%, transparent);
            color:color-mix(in srgb, var(--dr-mutation-relationship) 88%, white);
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
            margin-top:2px;
            color:var(--dr-text);
            font-family:"Fira Code", monospace;
            font-size:11px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-title {
            margin:0 0 3px;
            color:var(--dr-text);
        }
        
        /* ========== Panel Title ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title {
            display:flex;
            align-items:center;
            gap:6px;
            margin:0 0 8px;
            color:var(--dr-text);
            text-transform:uppercase;
            letter-spacing:.6px;
            font-size:11px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title::before {
            content:"";
            width:3px;
            height:10px;
            border-radius:999px;
            background:var(--dr-accent);
            box-shadow:0 0 10px color-mix(in srgb, var(--dr-accent) 36%, transparent);
        }
        
        /* ========== Narrative ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__narrative {
            white-space:pre-wrap;
            line-height:1.6;
            font-size:11px;
            color:var(--dr-text);
            padding:8px 9px;
            border-radius:10px;
            border:1px solid color-mix(in srgb, var(--dr-line) 90%, transparent);
            background:color-mix(in srgb, var(--dr-bg) 82%, transparent);
            margin:0 0 6px;
        }
        
        /* ========== Lists & Sections ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__list,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__sources {
            display:flex;
            flex-direction:column;
            gap:6px;
            margin:0;
            min-width:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__section {
            display:flex;
            flex-direction:column;
            gap:6px;
            margin-bottom:8px;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__section + .stx-memory-dream-review__section {
            margin-top:0;
            padding-top:8px;
            border-top:1px solid color-mix(in srgb, var(--dr-line) 82%, transparent);
        }
        
        /* ========== Mutation Selection ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation.is-selected {
            border-color:color-mix(in srgb, var(--dr-success) 58%, transparent);
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-success) 12%, transparent), color-mix(in srgb, var(--dr-panel) 96%, transparent));
            box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dr-success) 18%, transparent);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-body {
            display:flex;
            flex-direction:column;
            gap:4px;
            min-width:0;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-meta {
            display:flex;
            flex-wrap:wrap;
            gap:4px;
            margin:2px 0 0;
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
            gap:6px;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field {
            border:1px solid var(--dr-line);
            border-radius:9px;
            padding:7px 8px;
            background:color-mix(in srgb, var(--dr-panel) 82%, transparent);
            min-width:0;
        }

        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__field-label {
            font-size:10px;
            line-height:1.35;
            color:var(--dr-muted);
            margin-bottom:2px;
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
            min-height:20px;
            padding:0 6px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--dr-line) 92%, transparent);
            background:color-mix(in srgb, var(--dr-panel-2) 80%, transparent);
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
        }
        
        /* ========== Badges & Highlights ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badges,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlights {
            display:flex;
            flex-wrap:wrap;
            gap:4px;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badge,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlight {
            border-radius:999px;
            padding:2px 7px;
            background:color-mix(in srgb, var(--dr-panel-2) 88%, transparent);
            border:1px solid color-mix(in srgb, var(--dr-line) 92%, transparent);
            color:var(--dr-text);
            font-size:9px;
            line-height:1.4;
            white-space:nowrap;
            margin:0;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlight {
            background:color-mix(in srgb, var(--dr-accent) 14%, transparent);
            border-color:color-mix(in srgb, var(--dr-accent) 26%, transparent);
        }
        
        /* ========== Toolbar ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar {
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:6px;
            flex-wrap:wrap;
            position:sticky;
            top:0;
            z-index:2;
            padding-bottom:6px;
            background:linear-gradient(180deg, color-mix(in srgb, var(--dr-panel) 98%, transparent), color-mix(in srgb, var(--dr-panel) 86%, transparent), rgba(0,0,0,0));
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar > div:last-child {
            display:flex;
            gap:4px;
            flex-wrap:wrap;
        }
        
        /* ========== Actions & Buttons ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions {
            display:flex;
            justify-content:space-between;
            gap:6px;
            flex-wrap:wrap;
            padding:8px 0 0;
            margin-top:8px;
            border-top:1px solid color-mix(in srgb, var(--dr-line) 88%, transparent);
            background:linear-gradient(180deg, rgba(0,0,0,0), color-mix(in srgb, var(--dr-bg) 82%, transparent) 22%);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar button {
            border:1px solid color-mix(in srgb, var(--dr-line) 96%, transparent);
            border-radius:8px;
            padding:6px 10px;
            background:color-mix(in srgb, var(--dr-panel-2) 84%, transparent);
            color:inherit;
            font-size:11px;
            font-weight:600;
            cursor:pointer;
            transition:background .15s ease, border-color .15s ease, transform .15s ease;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button:hover,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar button:hover {
            background:color-mix(in srgb, var(--dr-panel-2) 96%, transparent);
            border-color:color-mix(in srgb, var(--dr-accent) 34%, transparent);
            transform:translateY(-1px);
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button[data-action="approve"] {
            background:color-mix(in srgb, var(--dr-success) 16%, transparent);
            border-color:color-mix(in srgb, var(--dr-success) 34%, transparent);
        }
        
        /* ========== Payload & JSON Syntax Highlighting ========== */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload {
            margin:4px 0 0;
            padding:7px 8px;
            white-space:pre-wrap;
            word-break:break-word;
            overflow-wrap:anywhere;
            border-radius:8px;
            background:color-mix(in srgb, var(--dr-bg) 82%, transparent);
            border:1px dashed color-mix(in srgb, var(--dr-line) 88%, transparent);
            font-size:10px;
            max-height:160px;
            overflow:auto;
            font-family:"Fira Code", monospace;
            color:color-mix(in srgb, var(--dr-muted) 92%, white);
        }
        
        /* JSON Syntax Highlighting (via CSS pseudo-elements and patterns) */
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload {
            --json-key:#81c784;
            --json-string:#64b5f6;
            --json-number:#ffb74d;
            --json-boolean:#f06292;
            --json-null:#90caf9;
        }
        
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__explain {
            margin-top:6px;
            padding-top:6px;
            border-top:1px dashed color-mix(in srgb, var(--dr-line) 86%, transparent);
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
                gap:3px;
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
            <summary class="stx-memory-dream-review__source-summary">
                <strong>${escapeHtml(resolveDreamReviewSourceLabel(title))}</strong>
                <span class="stx-memory-dream-review__source-count">${String(hits.length)}</span>
            </summary>
            <div class="stx-memory-dream-review__source-body">
                ${renderSourceCards(title, hits)}
            </div>
        </details>
    `;
}

function renderDiagnosticsCard(diagnostics?: DreamSessionDiagnosticsRecord | null, graphSnapshot?: DreamSessionGraphSnapshotRecord | null): string {
    if (!diagnostics) {
        return `<div class="stx-memory-dream-review__diag-card"><div class="stx-memory-dream-review__hint">当前会话未保存诊断信息。</div></div>`;
    }
    return `
        <div class="stx-memory-dream-review__diag-card">
            <div class="stx-memory-dream-review__mutation-title">融合诊断</div>
            <div class="stx-memory-dream-review__meta">最终选 ${diagnostics.fusionResult.diagnostics.finalSelectedCount} / 去重 ${diagnostics.fusionResult.diagnostics.duplicateDropped}</div>
            <div class="stx-memory-dream-review__meta">新颖↑ ${diagnostics.fusionResult.diagnostics.boostedByNovelty} / 激活↑ ${diagnostics.fusionResult.diagnostics.boostedByActivation}</div>
            <div class="stx-memory-dream-review__hint">桥接：${escapeHtml(diagnostics.fusionResult.bridgeNodeKeys.slice(0, 6).join('、') || '无')}</div>
            ${diagnostics.waveOutputs
                .map(
                    (wave) => `
                <div class="stx-memory-dream-review__explain">
                    <div class="stx-memory-dream-review__meta">${escapeHtml(resolveDreamReviewWaveLabel(wave.waveType))}</div>
                    <div class="stx-memory-dream-review__hint">种子：${escapeHtml(wave.seedEntryIds.slice(0, 4).join('、') || '无')}</div>
                    <div class="stx-memory-dream-review__hint">激活：${escapeHtml(wave.activatedNodeKeys.slice(0, 6).join('、') || '无')}</div>
                </div>
            `,
                )
                .join('')}
            <div class="stx-memory-dream-review__explain">
                <div class="stx-memory-dream-review__meta">图快照</div>
                <div class="stx-memory-dream-review__hint">节 ${String(graphSnapshot?.activatedNodes.length ?? 0)} / 边 ${String(graphSnapshot?.activatedEdges.length ?? 0)}</div>
            </div>
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

function renderMutationPayloadVisual(mutation: DreamMutationProposal): string {
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
    return `
        <div class="stx-memory-dream-review__field-grid">
            ${renderField('标题', String(payload.title ?? mutation.preview ?? '').trim(), true)}
            ${renderField('类型', String(payload.entryType ?? '').trim())}
            ${renderField('摘要', String(payload.summary ?? mutation.reason ?? '').trim())}
            ${renderField('详情', String(payload.detail ?? '').trim())}
            ${renderFieldWithOptions('比较键', String(payload.compareKey ?? '').trim(), { truncate: true })}
            ${renderFieldWithOptions('实体键', String(payload.entityKey ?? '').trim(), { truncate: true })}
            ${renderFieldWithOptions('条目标识', String(payload.entryId ?? '').trim(), { truncate: true })}
            ${renderFieldChips('标签', toStringArray(payload.tags))}
            ${renderFieldChips('角色绑定', toStringArray(payload.actorBindings))}
            ${renderFieldChips('匹配键', toStringArray(payload.matchKeys))}
            ${renderFieldChips('详情字段', Object.keys(detailPayload))}
        </div>
    `;
}

/**
 * Render a mutation card with type-based styling.
 * Adds data-mutation-type attribute for CSS-based color coding.
 */
function renderMutationCard(mutation: DreamMutationProposal, checked: boolean, titleMap: Map<string, string>): string {
    const payload = toRecord(mutation.payload);
    const title = mutation.mutationType === 'relationship_patch'
        ? String(payload.relationTag ?? mutation.preview ?? mutation.mutationType).trim()
        : String(payload.title ?? mutation.preview ?? mutation.mutationType).trim();
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
                ${renderMutationPayloadVisual(mutation)}
                ${renderDreamReviewExplainPanel(mutation.explain)}
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
        const recallTitleMap = buildRecallTitleMap(input.recall);
        const selectedCount = input.output.proposedMutations.filter((mutation: DreamMutationProposal): boolean => {
            return defaultSelected.has(mutation.mutationId);
        }).length;
        openSharedDialog({
            id: DREAM_REVIEW_DIALOG_ID,
            size: 'xl',
            chrome: { title: '梦境审批' },
            bodyHtml: `
                <div class="stx-memory-dream-review">
                    <div class="stx-memory-dream-review__hero">
                        <div class="stx-memory-dream-review__hero-card stx-memory-dream-review__hero-card--overview">
                            <div class="stx-memory-dream-review__hero-head">
                                <div>
                                    <div class="stx-memory-dream-review__hero-title">梦境审批</div>
                                    <div class="stx-memory-dream-review__hero-subtitle">快速审查梦境叙事、来源记忆和提案价值。勾选想要应用的提案，然后提交。</div>
                                </div>
                                <div class="stx-memory-dream-review__badge">${escapeHtml(resolveTriggerReasonLabel(input.meta.triggerReason))}</div>
                            </div>
                            <div class="stx-memory-dream-review__summary" style="margin-top:8px;">
                                <div class="stx-memory-dream-review__overview-copy">
                                    <div class="stx-memory-dream-review__metric-grid">
                                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">融合召回</div><div class="stx-memory-dream-review__metric-value">${String(input.recall.fusedHits.length)}</div></div>
                                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">默选</div><div class="stx-memory-dream-review__metric-value">${String(selectedCount)}/${String(input.output.proposedMutations.length)}</div></div>
                                    </div>
                                    <div class="stx-memory-dream-review__narrative">${escapeHtml(input.output.narrative || '本轮未生成梦境叙事。')}</div>
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
                                            <div class="stx-memory-dream-review__meta-value">${String(input.output.proposedMutations.length)} 条</div>
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
                            <div class="stx-memory-dream-review__panel-title">发现亮点</div>
                            <div class="stx-memory-dream-review__findings-kpis">
                                <div class="stx-memory-dream-review__kpi">
                                    <div class="stx-memory-dream-review__kpi-label">亮点</div>
                                    <div class="stx-memory-dream-review__kpi-value">${String(input.output.highlights.length || 0)}</div>
                                </div>
                                <div class="stx-memory-dream-review__kpi">
                                    <div class="stx-memory-dream-review__kpi-label">提案</div>
                                    <div class="stx-memory-dream-review__kpi-value">${String(input.output.proposedMutations.length)}</div>
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
                                <div class="stx-memory-dream-review__panel-title">梦境叙事</div>
                                <div class="stx-memory-dream-review__narrative">${escapeHtml(input.output.narrative || '本轮未生成梦境叙事。')}</div>
                            </div>
                            <div class="stx-memory-dream-review__section">
                                <div class="stx-memory-dream-review__panel-title">来源记忆</div>
                                <div class="stx-memory-dream-review__sources">
                                    ${renderSourceGroup('recent', input.recall.recentHits, true)}
                                    ${renderSourceGroup('mid', input.recall.midHits)}
                                    ${renderSourceGroup('deep', input.recall.deepHits)}
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__section">
                                <div class="stx-memory-dream-review__panel-title">诊断</div>
                                ${renderDiagnosticsCard(input.diagnostics, input.graphSnapshot)}
                            </div>
                        </section>
                        <section class="stx-memory-dream-review__panel">
                            <div class="stx-memory-dream-review__toolbar">
                                <div class="stx-memory-dream-review__panel-title">提案审核</div>
                                <div>
                                    <button type="button" data-select-all="true">全选</button>
                                    <button type="button" data-clear-all="true">清空</button>
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__list">
                                ${input.output.proposedMutations.map((mutation: DreamMutationProposal): string => renderMutationCard(mutation, defaultSelected.has(mutation.mutationId), recallTitleMap)).join('')}
                            </div>
                        </section>
                    </div>
                    <div class="stx-memory-dream-review__actions">
                        <button type="button" data-action="defer">稍后</button>
                        <button type="button" data-action="reject">全拒</button>
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
                const syncCards = (): void => {
                    mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                        const mutationId = String(inputEl.dataset.dreamMutation ?? '').trim();
                        root.querySelector(`[data-mutation-card="${mutationId}"]`)?.classList.toggle('is-selected', inputEl.checked);
                    });
                };
                const readSelection = (): { approved: string[]; rejected: string[] } => {
                    const approved = mutationInputs()
                        .filter((item: HTMLInputElement): boolean => item.checked)
                        .map((item: HTMLInputElement): string => String(item.dataset.dreamMutation ?? '').trim())
                        .filter(Boolean);
                    const approvedSet = new Set(approved);
                    const rejected = input.output.proposedMutations
                        .map((item: DreamMutationProposal): string => item.mutationId)
                        .filter((mutationId: string): boolean => !approvedSet.has(mutationId));
                    return { approved, rejected };
                };
                mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                    inputEl.addEventListener('change', syncCards);
                });
                root.querySelector('[data-select-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = true;
                    });
                    syncCards();
                });
                root.querySelector('[data-clear-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = false;
                    });
                    syncCards();
                });
                root.querySelector('[data-action="defer"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({
                        decision: 'deferred',
                        approvedMutationIds: selection.approved,
                        rejectedMutationIds: selection.rejected,
                    });
                });
                root.querySelector('[data-action="reject"]')?.addEventListener('click', (): void => {
                    instance.close();
                    finish({
                        decision: 'rejected',
                        approvedMutationIds: [],
                        rejectedMutationIds: input.output.proposedMutations.map(
                            (item: DreamMutationProposal): string => item.mutationId,
                        ),
                    });
                });
                root.querySelector('[data-action="approve"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({
                        decision: selection.approved.length > 0 ? 'approved' : 'deferred',
                        approvedMutationIds: selection.approved,
                        rejectedMutationIds: selection.rejected,
                    });
                });
                syncCards();
            },
            onClose: (): void => {
                finish({
                    decision: 'deferred',
                    approvedMutationIds: [],
                    rejectedMutationIds: [],
                });
            },
        });
    });
}
