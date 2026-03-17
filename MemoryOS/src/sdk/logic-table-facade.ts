import { db, type DBFact, type DBWorldState } from '../db/db';
import { buildDisplayTables } from '../template/table-derivation';
import type { TemplateTableDef } from '../template/types';
import type {
    ChatSemanticSeed,
    DerivedRowCandidate,
    EditorSourceKind,
    GroupMemoryState,
    LogicCellValue,
    LogicColumnDef,
    LogicRowView,
    LogicTableRow,
    LogicTableStatus,
    LogicTableSummary,
    LogicTableViewModel,
    MemoryCandidate,
    MemoryCandidateBufferSnapshot,
    SourceRef,
} from '../../../SDK/stx';
import { ChatStateManager } from '../core/chat-state-manager';
import { RowOperationsManager } from '../core/row-operations';
import { TemplateManager } from '../template/template-manager';

interface LogicTableContext {
    table: TemplateTableDef;
    facts: DBFact[];
    states: DBWorldState[];
    rows: LogicTableRow[];
    semanticSeed: ChatSemanticSeed | null;
    groupMemory: GroupMemoryState | null;
    candidateSnapshot: MemoryCandidateBufferSnapshot;
    rowAliasIndex: Record<string, Record<string, string>>;
    rowRedirects: Record<string, Record<string, string>>;
    rowTombstones: Record<string, Record<string, unknown>>;
}

interface CandidateAccumulator {
    candidateId: string;
    tableKey: string;
    title: string;
    rowId: string;
    values: Record<string, LogicCellValue>;
    aliases: Set<string>;
    warnings: Set<string>;
    sourceRefs: SourceRef[];
    updatedAt?: number;
}

function normalizeText(value: unknown, fallback: string = ''): string {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || fallback;
}

function normalizeLookup(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

function textArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item: unknown): string[] => textArray(item)).filter(Boolean);
    }
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).flatMap((item: unknown): string[] => textArray(item)).filter(Boolean);
    }
    const text = normalizeText(value);
    return text ? [text] : [];
}

function uniqueStrings(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((value: unknown): void => {
        const text = normalizeText(value);
        if (!text) {
            return;
        }
        const key = normalizeLookup(text);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        result.push(text);
    });
    return result;
}

function makeSourceRef(kind: EditorSourceKind, label: string, options: {
    recordId?: string;
    path?: string;
    ts?: number;
    note?: string;
} = {}): SourceRef {
    return {
        kind,
        label,
        recordId: options.recordId,
        path: options.path,
        ts: options.ts,
        note: options.note,
    };
}

function mergeSourceRefs(current: SourceRef[], next: SourceRef): SourceRef[] {
    const signature = [next.kind, next.label, next.recordId, next.path, next.ts, next.note].join('|');
    if (current.some((item: SourceRef): boolean => [item.kind, item.label, item.recordId, item.path, item.ts, item.note].join('|') === signature)) {
        return current;
    }
    return current.concat(next);
}

function uniqueSourceRefs(values: SourceRef[]): SourceRef[] {
    return values.reduce((result: SourceRef[], item: SourceRef): SourceRef[] => mergeSourceRefs(result, item), []);
}

function makeCandidateId(tableKey: string, sourceKind: string, rowId: string): string {
    return `${tableKey}::${sourceKind}::${normalizeLookup(rowId)}`;
}

function isCharacterTable(table: TemplateTableDef): boolean {
    const key = normalizeLookup(table.key);
    const label = normalizeLookup(table.label);
    return /character|actor|role|persona|角色/.test(key) || /character|actor|role|persona|角色/.test(label);
}

function isLocationTable(table: TemplateTableDef): boolean {
    const key = normalizeLookup(table.key);
    const label = normalizeLookup(table.label);
    return /location|place|city|scene|地点|城市|场景/.test(key) || /location|place|city|scene|地点|城市|场景/.test(label);
}

function isEventTable(table: TemplateTableDef): boolean {
    const key = normalizeLookup(table.key);
    const label = normalizeLookup(table.label);
    return /event|quest|mission|incident|事件|任务/.test(key) || /event|quest|mission|incident|事件|任务/.test(label);
}

function toCellValue(value: unknown, editable: boolean, sourceKinds: EditorSourceKind[], confidence?: number): LogicCellValue {
    return {
        value,
        editable,
        sourceKinds: Array.from(new Set(sourceKinds.filter(Boolean))),
        confidence: Number.isFinite(confidence) ? Number(confidence) : undefined,
    };
}

function inferDisplayName(rowId: string, values: Record<string, LogicCellValue>): string {
    const preferredKeys = ['name', 'title', 'label', 'displayname', 'summary'];
    for (const key of preferredKeys) {
        const matchKey = Object.keys(values).find((item: string): boolean => normalizeLookup(item) === key);
        if (!matchKey) {
            continue;
        }
        const text = normalizeText(values[matchKey]?.value);
        if (text) {
            return text;
        }
    }
    return normalizeText(rowId, '未命名行');
}

function inferFactSourceKind(fact: DBFact): EditorSourceKind {
    const extractor = normalizeLookup((fact.provenance as { extractor?: string } | undefined)?.extractor);
    if (extractor === 'manual') {
        return 'manual';
    }
    return 'fact';
}

function inferLogicStatus(summary: LogicTableSummary, warnings: string[]): LogicTableStatus {
    if (summary.materializedRowCount === 0 && summary.derivedRowCount === 0 && (summary.tombstonedRowCount > 0 || summary.redirectedRowCount > 0)) {
        return 'hidden';
    }
    if (summary.materializedRowCount === 0 && summary.derivedRowCount > 0) {
        return 'sparse';
    }
    if (warnings.length > 0 || summary.tombstonedRowCount > 0 || summary.redirectedRowCount > 0) {
        return 'needs_attention';
    }
    return 'healthy';
}

function getPrimaryField(table: TemplateTableDef): string {
    return normalizeText(table.primaryKeyField, 'id');
}

function getCandidateTitleFromPayload(payload: Record<string, unknown>, fallback: string): string {
    const keys = ['displayName', 'name', 'title', 'label', 'entityId', 'id', 'location', 'value'];
    for (const key of keys) {
        const text = normalizeText(payload[key]);
        if (text) {
            return text;
        }
    }
    return normalizeText(fallback, '候选行');
}

function buildColumns(table: TemplateTableDef): LogicColumnDef[] {
    return (table.fields ?? []).map((field) => ({
        key: field.key,
        label: field.label,
        editable: !Boolean(field.isPrimaryKey),
        tier: field.tier,
        isPrimaryKey: field.isPrimaryKey,
    }));
}

export class LogicTableFacade {
    private chatKey: string;
    private templateManager: TemplateManager;
    private chatStateManager: ChatStateManager;
    private rowOperations: RowOperationsManager;

    constructor(chatKey: string, templateManager: TemplateManager, chatStateManager: ChatStateManager, rowOperations: RowOperationsManager) {
        this.chatKey = chatKey;
        this.templateManager = templateManager;
        this.chatStateManager = chatStateManager;
        this.rowOperations = rowOperations;
    }

    async listLogicTables(): Promise<LogicTableSummary[]> {
        const tables = await this.getDisplayTables();
        const views = await Promise.all(tables.map((table: TemplateTableDef): Promise<LogicTableViewModel> => this.getLogicTableView(table.key)));
        return views.map((view: LogicTableViewModel): LogicTableSummary => ({
            tableKey: view.tableKey,
            title: view.title,
            status: view.status,
            materializedRowCount: view.sourceCoverage.factRows,
            derivedRowCount: view.sourceCoverage.derivedRows,
            tombstonedRowCount: view.sourceCoverage.tombstonedRows,
            redirectedRowCount: view.sourceCoverage.redirectedRows,
        }));
    }

    async listBackfillCandidates(tableKey: string): Promise<DerivedRowCandidate[]> {
        const context = await this.loadTableContext(tableKey);
        return this.buildDerivedCandidates(context);
    }

    async getLogicTableView(tableKey: string): Promise<LogicTableViewModel> {
        const context = await this.loadTableContext(tableKey);
        const columns = buildColumns(context.table);
        const materializedRows = this.buildMaterializedRows(context, columns);
        const redirectedRows = this.buildRedirectedRows(context, columns, new Set(materializedRows.map((row: LogicRowView): string => normalizeLookup(row.rowId))));
        const derivedCandidates = this.buildDerivedCandidates(context);
        const existingRowIds = new Set(materializedRows.concat(redirectedRows).map((row: LogicRowView): string => normalizeLookup(row.rowId)));
        const derivedRows = derivedCandidates
            .filter((candidate: DerivedRowCandidate): boolean => !existingRowIds.has(normalizeLookup(candidate.rowId)))
            .map((candidate: DerivedRowCandidate): LogicRowView => ({
                rowId: candidate.rowId,
                displayName: candidate.title,
                rowKind: 'derived',
                values: candidate.values,
                aliases: candidate.aliases,
                warnings: candidate.warnings,
                sourceRefs: candidate.sourceRefs,
                updatedAt: candidate.updatedAt,
            }));
        const rows = materializedRows.concat(redirectedRows, derivedRows).sort((left: LogicRowView, right: LogicRowView): number => {
            const kindOrder: Record<LogicRowView['rowKind'], number> = {
                materialized: 0,
                derived: 1,
                redirected: 2,
                tombstoned: 3,
            };
            const byKind = kindOrder[left.rowKind] - kindOrder[right.rowKind];
            if (byKind !== 0) {
                return byKind;
            }
            const byTime = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            if (byTime !== 0) {
                return byTime;
            }
            return left.displayName.localeCompare(right.displayName, 'zh-CN');
        });

        const summary: LogicTableSummary = {
            tableKey: context.table.key,
            title: context.table.label,
            status: 'healthy',
            materializedRowCount: materializedRows.filter((row: LogicRowView): boolean => row.rowKind === 'materialized').length,
            derivedRowCount: derivedRows.length,
            tombstonedRowCount: materializedRows.filter((row: LogicRowView): boolean => row.rowKind === 'tombstoned').length,
            redirectedRowCount: redirectedRows.length,
        };
        const warnings = this.buildTableWarnings(context, summary, rows);
        const status = inferLogicStatus(summary, warnings);

        return {
            tableKey: context.table.key,
            title: context.table.label,
            columns,
            status,
            sourceCoverage: {
                factRows: summary.materializedRowCount,
                derivedRows: summary.derivedRowCount,
                redirectedRows: summary.redirectedRowCount,
                tombstonedRows: summary.tombstonedRowCount,
                aliasCount: Object.keys(context.rowAliasIndex[context.table.key] ?? {}).length,
            },
            rows,
            warnings,
        };
    }

    async promoteDerivedRow(tableKey: string, candidateId: string): Promise<void> {
        const candidates = await this.listBackfillCandidates(tableKey);
        const candidate = candidates.find((item: DerivedRowCandidate): boolean => item.candidateId === candidateId);
        if (!candidate) {
            throw new Error('候选行不存在');
        }
        const rows = await this.rowOperations.listTableRows(tableKey, { includeTombstones: true, limit: 500 });
        const existing = rows.find((row: LogicTableRow): boolean => normalizeLookup(row.rowId) === normalizeLookup(candidate.rowId)) ?? null;
        if (existing?.tombstoned) {
            await this.rowOperations.restoreRow(tableKey, existing.rowId);
        }
        if (!existing) {
            const seed: Record<string, unknown> = {};
            Object.entries(candidate.values).forEach(([fieldKey, cell]: [string, LogicCellValue]): void => {
                if (!cell.editable) {
                    return;
                }
                seed[fieldKey] = cell.value;
            });
            await this.rowOperations.createRow(tableKey, candidate.rowId, seed);
        } else {
            const updates = Object.entries(candidate.values)
                .filter(([, cell]: [string, LogicCellValue]): boolean => cell.editable)
                .map(([fieldKey, cell]: [string, LogicCellValue]): Promise<string> => this.rowOperations.updateCell(tableKey, existing.rowId, fieldKey, cell.value));
            await Promise.all(updates);
        }
        for (const alias of candidate.aliases) {
            await this.chatStateManager.setRowAlias(tableKey, alias, candidate.rowId);
        }
    }

    private async getDisplayTables(): Promise<TemplateTableDef[]> {
        const activeTemplate = await this.templateManager.getActiveTemplate();
        const template = activeTemplate || (await this.templateManager.listByChatKey()).slice(-1)[0] || null;
        if (!template) {
            return [];
        }
        const facts = await db.facts.where('[chatKey+updatedAt]').between([this.chatKey, 0], [this.chatKey, Infinity]).toArray();
        return buildDisplayTables(template.tables || [], facts);
    }

    private async loadTableContext(tableKey: string): Promise<LogicTableContext> {
        const tables = await this.getDisplayTables();
        const table = tables.find((item: TemplateTableDef): boolean => item.key === tableKey) ?? null;
        if (!table) {
            throw new Error(`未找到逻辑表：${tableKey}`);
        }
        const [facts, states, rows, semanticSeed, groupMemory, candidateSnapshot, rowAliasIndex, rowRedirects, rowTombstones] = await Promise.all([
            db.facts.where('[chatKey+type]').equals([this.chatKey, table.key]).toArray(),
            db.world_state.where('[chatKey+path]').between([this.chatKey, ''], [this.chatKey, '\uffff']).toArray(),
            this.rowOperations.listTableRows(table.key, { includeTombstones: true, limit: 500 }),
            this.chatStateManager.getSemanticSeed(),
            this.chatStateManager.getGroupMemory(),
            this.chatStateManager.getCandidateBufferSnapshot(),
            this.chatStateManager.getRowAliasIndex(),
            this.chatStateManager.getRowRedirects(),
            this.chatStateManager.getRowTombstones(),
        ]);
        return {
            table,
            facts,
            states,
            rows,
            semanticSeed,
            groupMemory,
            candidateSnapshot,
            rowAliasIndex,
            rowRedirects,
            rowTombstones,
        };
    }

    private buildMaterializedRows(context: LogicTableContext, columns: LogicColumnDef[]): LogicRowView[] {
        const factsByRowAndPath = new Map<string, DBFact>();
        context.facts.forEach((fact: DBFact): void => {
            const rowId = normalizeText(fact.entity?.id);
            const path = normalizeText(fact.path);
            if (!rowId || !path) {
                return;
            }
            factsByRowAndPath.set(`${normalizeLookup(rowId)}::${normalizeLookup(path)}`, fact);
        });
        return context.rows.map((row: LogicTableRow): LogicRowView => {
            const values: Record<string, LogicCellValue> = {};
            const sourceRefs: SourceRef[] = [];
            columns.forEach((column: LogicColumnDef): void => {
                const rawValue = row.values[column.key] ?? (column.isPrimaryKey ? row.rowId : '');
                const fact = factsByRowAndPath.get(`${normalizeLookup(row.rowId)}::${normalizeLookup(column.key)}`) ?? null;
                const sourceKind = fact ? inferFactSourceKind(fact) : 'derived';
                if (fact) {
                    sourceRefs.push(makeSourceRef(sourceKind, fact.type || context.table.key, {
                        recordId: fact.factKey,
                        path: fact.path,
                        ts: fact.updatedAt,
                    }));
                }
                values[column.key] = toCellValue(rawValue, !row.tombstoned && !row.redirectedTo && column.editable, [sourceKind], fact?.confidence);
            });
            const warnings: string[] = [];
            let rowKind: LogicRowView['rowKind'] = 'materialized';
            if (row.tombstoned) {
                rowKind = 'tombstoned';
                warnings.push('该行已逻辑删除，可恢复后再编辑。');
            } else if (row.redirectedTo) {
                rowKind = 'redirected';
                warnings.push(`该行已重定向到 ${row.redirectedTo}。`);
            }
            if (Object.values(values).every((cell: LogicCellValue): boolean => !normalizeText(cell.value))) {
                warnings.push('当前行没有稳定字段值。');
            }
            if (sourceRefs.length === 0) {
                warnings.push('当前行来源信息不足。');
            }
            return {
                rowId: row.rowId,
                displayName: inferDisplayName(row.rowId, values),
                rowKind,
                values,
                aliases: row.aliases,
                redirectedTo: row.redirectedTo,
                warnings,
                sourceRefs: uniqueSourceRefs(sourceRefs),
                updatedAt: row.updatedAt,
            };
        });
    }

    private buildRedirectedRows(context: LogicTableContext, columns: LogicColumnDef[], existing: Set<string>): LogicRowView[] {
        const redirects = context.rowRedirects[context.table.key] ?? {};
        const rows: LogicRowView[] = [];
        Object.entries(redirects).forEach(([fromRowId, toRowId]: [string, string]): void => {
            if (!normalizeText(fromRowId) || existing.has(normalizeLookup(fromRowId))) {
                return;
            }
            const values: Record<string, LogicCellValue> = {};
            columns.forEach((column: LogicColumnDef): void => {
                values[column.key] = toCellValue(column.isPrimaryKey ? fromRowId : '', false, ['derived']);
            });
            rows.push({
                rowId: fromRowId,
                displayName: fromRowId,
                rowKind: 'redirected',
                values,
                aliases: [],
                redirectedTo: toRowId,
                warnings: [`该行已合并到 ${toRowId}。`],
                sourceRefs: [makeSourceRef('derived', '行重定向', { note: `${fromRowId} -> ${toRowId}` })],
                updatedAt: 0,
            });
        });
        return rows;
    }

    private buildDerivedCandidates(context: LogicTableContext): DerivedRowCandidate[] {
        const candidateMap = new Map<string, CandidateAccumulator>();
        const primaryField = getPrimaryField(context.table);
        const fieldLookup = new Set((context.table.fields ?? []).map((field) => normalizeLookup(field.key)));
        const nameField = (context.table.fields ?? []).find((field) => /name|title|label|名称|标题/.test(normalizeLookup(field.key)))?.key || primaryField;
        const summaryField = (context.table.fields ?? []).find((field) => /summary|description|desc|内容|摘要|描述/.test(normalizeLookup(field.key)))?.key || null;

        const ensureCandidate = (rowId: string, title: string, sourceKind: EditorSourceKind, sourceRef: SourceRef, updatedAt?: number): CandidateAccumulator => {
            const normalizedRowId = normalizeText(rowId);
            const existing = candidateMap.get(normalizeLookup(normalizedRowId));
            if (existing) {
                existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, sourceRef);
                existing.updatedAt = Math.max(Number(existing.updatedAt ?? 0), Number(updatedAt ?? 0)) || existing.updatedAt;
                return existing;
            }
            const next: CandidateAccumulator = {
                candidateId: makeCandidateId(context.table.key, sourceKind, normalizedRowId),
                tableKey: context.table.key,
                title: normalizeText(title, normalizedRowId),
                rowId: normalizedRowId,
                values: {
                    [primaryField]: toCellValue(normalizedRowId, false, ['derived', sourceKind]),
                },
                aliases: new Set<string>(),
                warnings: new Set<string>(['候选行，仅在确认后才会写回事实层。']),
                sourceRefs: [sourceRef],
                updatedAt: Number(updatedAt ?? 0) || undefined,
            };
            candidateMap.set(normalizeLookup(normalizedRowId), next);
            return next;
        };

        const writeCandidateCell = (candidate: CandidateAccumulator, fieldKey: string, value: unknown, sourceKind: EditorSourceKind, confidence?: number): void => {
            const normalizedFieldKey = normalizeText(fieldKey);
            if (!normalizedFieldKey) {
                return;
            }
            const current = candidate.values[normalizedFieldKey];
            if (current && normalizeText(current.value)) {
                return;
            }
            candidate.values[normalizedFieldKey] = toCellValue(value, false, ['derived', sourceKind], confidence);
        };

        const candidateItems = Array.isArray(context.candidateSnapshot.items) ? context.candidateSnapshot.items : [];
        candidateItems.forEach((item: MemoryCandidate): void => {
            const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
                ? item.payload as Record<string, unknown>
                : {};
            const directFieldMatches = Object.keys(payload).filter((key: string): boolean => fieldLookup.has(normalizeLookup(key)));
            const tableRelevant = directFieldMatches.length > 0
                || (isCharacterTable(context.table) && ['fact', 'relationship'].includes(item.kind))
                || (isLocationTable(context.table) && ['state', 'fact'].includes(item.kind))
                || (isEventTable(context.table) && ['summary', 'state'].includes(item.kind));
            if (!tableRelevant) {
                return;
            }
            const title = getCandidateTitleFromPayload(payload, item.summary);
            const rowId = normalizeText(payload[primaryField] ?? title);
            if (!rowId) {
                return;
            }
            const candidate = ensureCandidate(rowId, title, 'derived', makeSourceRef('derived', '候选缓冲区', {
                recordId: item.candidateId,
                note: item.source,
                ts: item.extractedAt,
            }), item.extractedAt);
            directFieldMatches.forEach((fieldKey: string): void => {
                writeCandidateCell(candidate, fieldKey, payload[fieldKey], 'derived', item.encoding?.totalScore);
            });
            writeCandidateCell(candidate, nameField, title, 'derived', item.encoding?.totalScore);
            if (summaryField) {
                writeCandidateCell(candidate, summaryField, item.summary, 'derived', item.encoding?.totalScore);
            }
            if (!item.encoding?.accepted) {
                candidate.warnings.add('该候选尚未通过自动写入阈值。');
            }
        });

        if (isCharacterTable(context.table)) {
            const seed = context.semanticSeed?.identitySeed;
            if (seed) {
                const rowId = normalizeText(seed.roleKey || seed.displayName);
                if (rowId) {
                    const candidate = ensureCandidate(rowId, seed.displayName || rowId, 'semantic_seed', makeSourceRef('semantic_seed', '身份种子', { ts: context.semanticSeed?.collectedAt }), context.semanticSeed?.collectedAt);
                    writeCandidateCell(candidate, nameField, seed.displayName || rowId, 'semantic_seed', 0.72);
                    if (summaryField) {
                        writeCandidateCell(candidate, summaryField, seed.identity[0] || seed.relationshipAnchors[0] || '待确认角色', 'semantic_seed', 0.68);
                    }
                    seed.aliases.forEach((alias: string): void => {
                        candidate.aliases.add(alias);
                    });
                }
            }
            (context.groupMemory?.lanes ?? []).forEach((lane): void => {
                const rowId = normalizeText(lane.actorKey || lane.displayName);
                if (!rowId) {
                    return;
                }
                const candidate = ensureCandidate(rowId, lane.displayName || rowId, 'group_memory', makeSourceRef('group_memory', '角色分轨', { note: lane.actorKey, ts: lane.lastActiveAt }), lane.lastActiveAt);
                writeCandidateCell(candidate, nameField, lane.displayName || rowId, 'group_memory', 0.66);
                if (summaryField) {
                    writeCandidateCell(candidate, summaryField, lane.relationshipDelta || lane.recentGoal || lane.lastEmotion || '待补充角色信息', 'group_memory', 0.62);
                }
            });
            uniqueStrings(context.semanticSeed?.groupMembers ?? []).forEach((name: string): void => {
                const candidate = ensureCandidate(name, name, 'semantic_seed', makeSourceRef('semantic_seed', '群组成员', { ts: context.semanticSeed?.collectedAt }), context.semanticSeed?.collectedAt);
                writeCandidateCell(candidate, nameField, name, 'semantic_seed', 0.6);
            });
        }

        if (isLocationTable(context.table)) {
            uniqueStrings(context.semanticSeed?.worldSeed.locations ?? []).forEach((location: string): void => {
                const candidate = ensureCandidate(location, location, 'semantic_seed', makeSourceRef('semantic_seed', '世界地点', { ts: context.semanticSeed?.collectedAt }), context.semanticSeed?.collectedAt);
                writeCandidateCell(candidate, nameField, location, 'semantic_seed', 0.64);
            });
        }

        if (isEventTable(context.table)) {
            uniqueStrings(context.groupMemory?.sharedScene?.pendingEvents ?? []).forEach((eventName: string): void => {
                const candidate = ensureCandidate(eventName, eventName, 'group_memory', makeSourceRef('group_memory', '待处理事件', { ts: context.groupMemory?.sharedScene?.updatedAt }), context.groupMemory?.sharedScene?.updatedAt);
                writeCandidateCell(candidate, nameField, eventName, 'group_memory', 0.62);
                if (summaryField) {
                    writeCandidateCell(candidate, summaryField, context.groupMemory?.sharedScene?.currentConflict || '待处理事件候选', 'group_memory', 0.58);
                }
            });
        }

        context.states.forEach((state: DBWorldState): void => {
            const path = normalizeLookup(state.path);
            const segments = String(state.path ?? '').split('/').filter(Boolean);
            const tableIndex = segments.findIndex((segment: string): boolean => normalizeLookup(segment) === normalizeLookup(context.table.key));
            if (tableIndex >= 0) {
                const rowId = normalizeText(segments[tableIndex + 1] ?? textArray(state.value)[0] ?? state.stateKey);
                if (!rowId) {
                    return;
                }
                const fieldHint = normalizeText(segments[tableIndex + 2] ?? nameField, nameField);
                const fieldKey = (context.table.fields ?? []).find((field) => normalizeLookup(field.key) === normalizeLookup(fieldHint))?.key || nameField;
                const candidate = ensureCandidate(rowId, rowId, 'world_state', makeSourceRef('world_state', '状态路径', {
                    recordId: state.stateKey,
                    path: state.path,
                    ts: state.updatedAt,
                }), state.updatedAt);
                writeCandidateCell(candidate, fieldKey, textArray(state.value)[0] || rowId, 'world_state', 0.58);
                return;
            }
            if (isLocationTable(context.table) && path.includes('location')) {
                textArray(state.value).forEach((location: string): void => {
                    const candidate = ensureCandidate(location, location, 'world_state', makeSourceRef('world_state', '地点状态', {
                        recordId: state.stateKey,
                        path: state.path,
                        ts: state.updatedAt,
                    }), state.updatedAt);
                    writeCandidateCell(candidate, nameField, location, 'world_state', 0.56);
                });
            }
        });

        const existingAliases = context.rowAliasIndex[context.table.key] ?? {};
        return Array.from(candidateMap.values()).map((candidate: CandidateAccumulator): DerivedRowCandidate => {
            Object.entries(existingAliases).forEach(([alias, target]: [string, string]): void => {
                if (normalizeLookup(alias) === normalizeLookup(candidate.rowId) && normalizeLookup(target) !== normalizeLookup(candidate.rowId)) {
                    candidate.warnings.add(`该候选名称与现有 alias 冲突，当前指向 ${target}。`);
                }
            });
            return {
                candidateId: candidate.candidateId,
                tableKey: candidate.tableKey,
                title: candidate.title,
                rowId: candidate.rowId,
                values: candidate.values,
                aliases: Array.from(candidate.aliases),
                warnings: Array.from(candidate.warnings),
                sourceRefs: uniqueSourceRefs(candidate.sourceRefs),
                updatedAt: candidate.updatedAt,
            };
        }).sort((left: DerivedRowCandidate, right: DerivedRowCandidate): number => {
            const byTime = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            if (byTime !== 0) {
                return byTime;
            }
            return left.title.localeCompare(right.title, 'zh-CN');
        });
    }

    private buildTableWarnings(context: LogicTableContext, summary: LogicTableSummary, rows: LogicRowView[]): string[] {
        const warnings: string[] = [];
        if (summary.materializedRowCount === 0 && summary.derivedRowCount > 0) {
            warnings.push('facts 稀疏，当前主要展示候选行。');
        }
        if (summary.materializedRowCount === 0 && summary.derivedRowCount === 0) {
            warnings.push('当前表没有稳定事实行，也没有可映射候选。');
        }
        if (summary.redirectedRowCount > 0) {
            warnings.push(`存在 ${summary.redirectedRowCount} 条已隐藏的 redirect 行。`);
        }
        if (summary.tombstonedRowCount > 0) {
            warnings.push(`存在 ${summary.tombstonedRowCount} 条 tombstone 行。`);
        }
        if (Object.keys(context.rowAliasIndex[context.table.key] ?? {}).length > 0) {
            warnings.push(`当前表维护了 ${Object.keys(context.rowAliasIndex[context.table.key] ?? {}).length} 条 alias。`);
        }
        if (rows.some((row: LogicRowView): boolean => row.warnings.length > 0)) {
            warnings.push('部分行存在来源不足、重定向或待确认提示。');
        }
        return uniqueStrings(warnings);
    }
}
