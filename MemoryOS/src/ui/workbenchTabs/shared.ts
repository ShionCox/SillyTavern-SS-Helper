import { escapeHtml } from '../editorShared';
import type {
    ActorMemoryProfile,
    MemoryEntry,
    MemoryEntryType,
    MemoryEntryTypeField,
    PromptAssemblySnapshot,
    RoleEntryMemory,
    SummarySnapshot,
} from '../../types';

export type WorkbenchView = 'entries' | 'types' | 'actors' | 'preview';
export type ActorSubView = 'items' | 'attributes' | 'relationships' | 'memory';

export interface WorkbenchState {
    currentView: WorkbenchView;
    currentActorTab: ActorSubView;
    selectedEntryId: string;
    selectedTypeKey: string;
    selectedActorKey: string;
    entryQuery: string;
    previewQuery: string;
    bindEntryId: string;
}

export interface WorkbenchSnapshot {
    entryTypes: MemoryEntryType[];
    entries: MemoryEntry[];
    actors: ActorMemoryProfile[];
    roleMemories: RoleEntryMemory[];
    summaries: SummarySnapshot[];
    preview: PromptAssemblySnapshot | null;
}

export function escapeAttr(value: unknown): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

export function readInputValue(root: HTMLElement, selector: string): string {
    const element = root.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    return String(element?.value ?? '').trim();
}

export function readCheckedValue(root: HTMLElement, selector: string): boolean {
    const element = root.querySelector(selector) as HTMLInputElement | null;
    return element?.checked === true;
}

export function parseTagText(value: string): string[] {
    return Array.from(new Set(
        String(value ?? '')
            .split(/[,\n，、]/)
            .map((item: string) => item.trim())
            .filter(Boolean),
    ));
}

export function parseTypeFieldsJson(raw: string): MemoryEntryTypeField[] {
    const normalized = String(raw ?? '').trim();
    if (!normalized) {
        return [];
    }
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
        throw new Error('字段定义必须是数组');
    }
    return parsed.map((item: unknown): MemoryEntryTypeField => {
        const record = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
        return {
            key: String(record.key ?? '').trim(),
            label: String(record.label ?? record.key ?? '').trim(),
            kind: String(record.kind ?? 'text').trim() as MemoryEntryTypeField['kind'],
            placeholder: String(record.placeholder ?? '').trim() || undefined,
            required: record.required === true,
        };
    }).filter((item: MemoryEntryTypeField) => Boolean(item.key));
}

export function collectDetailPayload(root: HTMLElement): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    root.querySelectorAll<HTMLElement>('[data-entry-field-key]').forEach((element: HTMLElement) => {
        const fieldKey = String(element.dataset.entryFieldKey ?? '').trim();
        if (!fieldKey) {
            return;
        }
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            payload[fieldKey] = element.checked;
            return;
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            const rawValue = String(element.value ?? '').trim();
            if (!rawValue) {
                return;
            }
            if (element.dataset.entryFieldKind === 'number') {
                payload[fieldKey] = Number(rawValue);
                return;
            }
            if (element.dataset.entryFieldKind === 'tags') {
                payload[fieldKey] = parseTagText(rawValue);
                return;
            }
            payload[fieldKey] = rawValue;
        }
    });
    return payload;
}

export function formatTypeFieldsJson(fields: MemoryEntryTypeField[]): string {
    return JSON.stringify(fields ?? [], null, 2);
}

export function buildMeterStyle(percent: number): string {
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return `width:${safe}%;`;
}

export function createDraftEntry(entryType?: MemoryEntryType | null): Partial<MemoryEntry> {
    return {
        entryType: entryType?.key || 'other',
        category: entryType?.category || '其他',
        tags: [],
        summary: '',
        detail: '',
        detailPayload: {},
    };
}

export function resolveSelectedEntry(snapshot: WorkbenchSnapshot, state: WorkbenchState): MemoryEntry | null {
    return snapshot.entries.find((entry) => entry.entryId === state.selectedEntryId) ?? null;
}

export function resolveSelectedType(snapshot: WorkbenchSnapshot, state: WorkbenchState): MemoryEntryType | null {
    return snapshot.entryTypes.find((item) => item.key === state.selectedTypeKey) ?? null;
}

export function resolveSelectedActor(snapshot: WorkbenchSnapshot, state: WorkbenchState): ActorMemoryProfile | null {
    return snapshot.actors.find((item) => item.actorKey === state.selectedActorKey) ?? null;
}

export function buildDynamicFieldMarkup(
    selectedEntryType: MemoryEntryType | null,
    detailPayload: Record<string, unknown> | undefined,
): string {
    return (selectedEntryType?.fields ?? []).map((field: MemoryEntryTypeField) => {
        const fieldValue = detailPayload?.[field.key];
        if (field.kind === 'textarea') {
            return `
                <div class="stx-memory-workbench__field-stack">
                    <label>${escapeHtml(field.label)}</label>
                    <textarea class="stx-memory-workbench__textarea" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-kind="${escapeAttr(field.kind)}" placeholder="${escapeAttr(field.placeholder ?? '')}">${escapeHtml(fieldValue ?? '')}</textarea>
                </div>
            `;
        }
        if (field.kind === 'boolean') {
            return `
                <div class="stx-memory-workbench__field-stack">
                    <label>${escapeHtml(field.label)}</label>
                    <input class="stx-memory-workbench__input" style="width:auto;margin-top:4px;" type="checkbox" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-kind="${escapeAttr(field.kind)}"${fieldValue === true ? ' checked' : ''}>
                </div>
            `;
        }
        return `
            <div class="stx-memory-workbench__field">
                <label>${escapeHtml(field.label)}</label>
                <input class="stx-memory-workbench__input" type="${field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}" value="${escapeAttr(Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue ?? '')}" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-kind="${escapeAttr(field.kind)}" placeholder="${escapeAttr(field.placeholder ?? '')}">
            </div>
        `;
    }).join('');
}
