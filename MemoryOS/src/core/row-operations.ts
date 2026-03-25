import { db, patchSdkChatShared, type DBFact } from '../db/db';
import { logger } from '../index';
import { ChatStateManager } from './chat-state-manager';
import { buildMemoryCardDraftsFromFact, formatFactMemoryTextForDisplay } from './memory-card-text';
import { FactsManager } from './facts-manager';
import { AuditManager } from './audit-manager';
import { MemoryMutationHistoryManager } from './memory-mutation-history';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { MutationResult, MutationRequest } from '../proposal/types';
import type { RowMergeResult, RowSeedData, LogicTableQueryOpts, LogicTableRow } from '../types';


/**
 * 功能：负责逻辑表的行级增删改查操作。
 *
 * 参数：
 *   chatKey (string)：当前聊天键。
 *   chatStateManager (ChatStateManager)：聊天状态管理器。
 *   factsManager (FactsManager)：事实管理器。
 *   auditManager (AuditManager)：审计管理器。
 *
 * 返回：
 *   无。
 */
export class RowOperationsManager {
    private chatKey: string;
    private chatStateManager: ChatStateManager;
    private factsManager: FactsManager;
    private auditManager: AuditManager;
    private mutationHistoryManager: MemoryMutationHistoryManager;
    private writeGateway: { requestWrite(request: MutationRequest): Promise<MutationResult> };

    constructor(
        chatKey: string,
        chatStateManager: ChatStateManager,
        factsManager: FactsManager,
        auditManager: AuditManager,
        writeGateway: { requestWrite(request: MutationRequest): Promise<MutationResult> },
    ) {
        this.chatKey = chatKey;
        this.chatStateManager = chatStateManager;
        this.factsManager = factsManager;
        this.auditManager = auditManager;
        this.mutationHistoryManager = new MemoryMutationHistoryManager(chatKey);
        this.writeGateway = writeGateway;
    }

    /**
     * 功能：解析 redirect 链，得到最终可编辑的行 ID。
     * @param tableKey 表键
     * @param rowId 原始行 ID
     * @returns 最终行 ID
     */
    private async resolveCanonicalRowId(tableKey: string, rowId: string): Promise<string> {
        const redirects = await this.chatStateManager.getRowRedirects();
        const tableRedirects = redirects[tableKey] ?? {};
        let currentRowId = rowId;
        const visited = new Set<string>();
        while (tableRedirects[currentRowId] && !visited.has(currentRowId)) {
            visited.add(currentRowId);
            currentRowId = tableRedirects[currentRowId];
        }
        return currentRowId;
    }

    /**
     * 功能：把当前聊天的 MemoryOS 轻量摘要写回 shared.signals。
     * @returns 无返回值
     */
    private async syncSharedSignal(): Promise<void> {
        const [factCount, eventCount, activeTemplateId, latestSummary] = await Promise.all([
            db.facts.where('[chatKey+updatedAt]').between([this.chatKey, 0], [this.chatKey, Infinity]).count(),
            db.events.where('[chatKey+ts]').between([this.chatKey, 0], [this.chatKey, Infinity]).count(),
            db.meta.get(this.chatKey).then((meta) => meta?.activeTemplateId ?? null),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([this.chatKey, '', 0], [this.chatKey, '\uffff', Infinity])
                .last(),
        ]);

        await patchSdkChatShared(this.chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: {
                    activeTemplate: activeTemplateId,
                    eventCount,
                    factCount,
                    lastSummaryAt: latestSummary?.createdAt ?? null,
                },
            },
        });
    }

    /**
     * 功能：把一条手动写入的事实同步到严格向量链。
     * @param factKey 事实键。
     * @returns 无返回值。
     */
    private async syncFactVectorAfterWrite(factKey: string): Promise<void> {
        if (!this.chatStateManager) {
            return;
        }
        const fact = await this.factsManager.get(factKey);
        if (!fact) {
            return;
        }
        const candidate = await this.chatStateManager.buildMemoryCandidate({
            candidateId: fact.factKey,
            kind: 'fact',
            source: 'row_operations',
            summary: buildMemoryCardDraftsFromFact(fact as DBFact).map((item) => item.memoryText).join('\n') || formatFactMemoryTextForDisplay(fact as DBFact),
            payload: {
                type: fact.type,
                entity: fact.entity,
                path: fact.path,
                value: fact.value,
                confidence: fact.confidence,
                provenance: fact.provenance,
            },
            extractedAt: Number(fact.updatedAt ?? Date.now()),
        });
        await this.chatStateManager.applyEncodingToRecord(fact.factKey, 'fact', candidate.encoding);
    }

    /**
     * 功能：把单条 fact 的手工变更写入 mutation history。
     * @param action 变更动作。
     * @param title 变更标题。
     * @param compareKey 变更比较键。
     * @param factKey 目标 factKey。
     * @param before 执行前快照。
     * @param after 执行后快照。
     * @param reasonCodes 原因码。
     * @returns void。
     */
    private async appendFactHistory(
        action: 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE',
        title: string,
        compareKey: string,
        factKey: string,
        before: unknown,
        after: unknown,
        reasonCodes: string[],
    ): Promise<void> {
        await this.mutationHistoryManager.append({
            source: 'row_operations',
            consumerPluginId: MEMORY_OS_PLUGIN_ID,
            targetKind: 'fact',
            action,
            title,
            compareKey,
            targetRecordKey: factKey,
            existingRecordKeys: [factKey],
            reasonCodes,
            before,
            after,
            visibleMessageIds: [],
        });
    }

    /**
     * 功能：创建新逻辑行并立即写入初始字段。
     * @param tableKey 目标表
     * @param rowId 新行 ID
     * @param seed 初始字段值
     * @returns 新行 ID
     */
    async createRow(tableKey: string, rowId: string, seed?: RowSeedData): Promise<string> {
        const normalizedRowId = String(rowId ?? '').trim();
        if (!normalizedRowId) {
            throw new Error('行 ID 不能为空');
        }

        const factKeys: string[] = [];
        const normalizedSeed = seed ?? {};
        for (const [fieldKey, value] of Object.entries(normalizedSeed)) {
            const normalizedFieldKey = String(fieldKey ?? '').trim();
            if (!normalizedFieldKey) {
                continue;
            }
            const factKey = await this.factsManager.upsert({
                type: tableKey,
                entity: { kind: tableKey, id: normalizedRowId },
                path: normalizedFieldKey,
                value,
                confidence: 1.0,
                provenance: { extractor: 'manual' },
            });
            factKeys.push(factKey);
            await this.syncFactVectorAfterWrite(factKey);
            await this.appendFactHistory(
                'ADD',
                `${tableKey}/${normalizedRowId}.${normalizedFieldKey}`,
                `${tableKey}::${normalizedRowId}::${normalizedFieldKey}`,
                factKey,
                null,
                await this.factsManager.get(factKey),
                ['manual_row_create'],
            );
        }

        await this.auditManager.log({
            action: 'row.created',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: {},
            after: { tableKey, rowId: normalizedRowId, factKeys, seed: normalizedSeed },
        });
        await this.syncSharedSignal();
        return normalizedRowId;
    }

    /**
     * 功能：列出指定逻辑表的有效行视图。
     * @param tableKey 目标表
     * @param opts 查询选项
     * @returns 逻辑行数组
     */
    async listTableRows(
        tableKey: string,
        opts: LogicTableQueryOpts = {},
    ): Promise<LogicTableRow[]> {
        const facts = await db.facts.where('[chatKey+type]').equals([this.chatKey, tableKey]).toArray();
        const aliasIndex = await this.chatStateManager.getRowAliasIndex();
        const redirects = await this.chatStateManager.getRowRedirects();
        const tombstones = await this.chatStateManager.getRowTombstones();
        const tableAliases = aliasIndex[tableKey] ?? {};
        const tableRedirects = redirects[tableKey] ?? {};
        const tableTombstones = tombstones[tableKey] ?? {};
        const rowMap = new Map<string, LogicTableRow>();

        for (const fact of facts) {
            const sourceRowId = String(fact.entity?.id ?? '').trim();
            if (!sourceRowId) {
                continue;
            }

            const canonicalRowId = await this.resolveCanonicalRowId(tableKey, sourceRowId);
            const currentRow = rowMap.get(canonicalRowId) ?? {
                rowId: canonicalRowId,
                tableKey,
                values: {},
                factKeys: {},
                tombstoned: Boolean(tableTombstones[canonicalRowId]),
                redirectedTo: tableRedirects[canonicalRowId] ?? null,
                aliases: [],
                updatedAt: 0,
            };

            if (fact.path) {
                currentRow.values[fact.path] = fact.value;
                currentRow.factKeys[fact.path] = fact.factKey;
            }
            currentRow.updatedAt = Math.max(currentRow.updatedAt, Number(fact.updatedAt ?? 0));
            rowMap.set(canonicalRowId, currentRow);
        }

        for (const rowId of Object.keys(tableTombstones)) {
            if (rowMap.has(rowId)) {
                continue;
            }
            rowMap.set(rowId, {
                rowId,
                tableKey,
                values: {},
                factKeys: {},
                tombstoned: true,
                redirectedTo: tableRedirects[rowId] ?? null,
                aliases: [],
                updatedAt: Number(tableTombstones[rowId]?.deletedAt ?? 0),
            });
        }

        for (const row of rowMap.values()) {
            row.aliases = Object.entries(tableAliases)
                .filter(([, targetRowId]: [string, string]): boolean => targetRowId === row.rowId)
                .map(([alias]: [string, string]): string => alias);
        }

        let rows = Array.from(rowMap.values());
        if (!opts.includeTombstones) {
            rows = rows.filter((row: LogicTableRow): boolean => !row.tombstoned);
        }

        const keywords = (opts.keywords ?? [])
            .map((keyword: string): string => String(keyword ?? '').trim().toLowerCase())
            .filter(Boolean);
        if (keywords.length > 0) {
            rows = rows.filter((row: LogicTableRow): boolean => {
                const haystack = [
                    row.rowId,
                    ...Object.keys(row.values),
                    ...Object.values(row.values).map((value: unknown): string => JSON.stringify(value)),
                    ...row.aliases,
                ]
                    .join(' ')
                    .toLowerCase();
                return keywords.every((keyword: string): boolean => haystack.includes(keyword));
            });
        }

        rows.sort((left: LogicTableRow, right: LogicTableRow): number => {
            const byTime = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            if (byTime !== 0) {
                return byTime;
            }
            return left.rowId.localeCompare(right.rowId);
        });

        if (typeof opts.limit === 'number' && opts.limit > 0) {
            return rows.slice(0, opts.limit);
        }
        return rows;
    }

    /**
     * 功能：立即更新单元格并写入审计。
     * @param tableKey 目标表
     * @param rowId 行 ID
     * @param fieldKey 字段键
     * @param value 新值
     * @returns 写入后的 factKey
     */
    async updateCell(
        tableKey: string,
        rowId: string,
        fieldKey: string,
        value: unknown,
    ): Promise<string> {
        const normalizedRowId = await this.resolveCanonicalRowId(tableKey, String(rowId ?? '').trim());
        const normalizedFieldKey = String(fieldKey ?? '').trim();
        if (!normalizedRowId) {
            throw new Error('行 ID 不能为空');
        }
        if (!normalizedFieldKey) {
            throw new Error('字段键不能为空');
        }

        const isTombstoned = await this.chatStateManager.isRowTombstoned(tableKey, normalizedRowId);
        if (isTombstoned) {
            throw new Error('已删除行不能编辑');
        }

        const existingFacts = await this.factsManager.query({
            entity: { kind: tableKey, id: normalizedRowId },
            limit: 500,
        });
        const currentFact = existingFacts.find((fact: DBFact): boolean => fact.path === normalizedFieldKey) ?? null;
        const factKey = await this.factsManager.upsert({
            factKey: currentFact?.factKey,
            type: tableKey,
            entity: { kind: tableKey, id: normalizedRowId },
            path: normalizedFieldKey,
            value,
            confidence: 1.0,
            provenance: { extractor: 'manual' },
        });

        const beforeSnapshot = currentFact ? { ...currentFact } : null;
        await this.auditManager.log({
            action: 'row.cell_updated',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: {
                tableKey,
                rowId: normalizedRowId,
                fieldKey: normalizedFieldKey,
                value: currentFact?.value,
            },
            after: {
                tableKey,
                rowId: normalizedRowId,
                fieldKey: normalizedFieldKey,
                factKey,
                value,
            },
        });

        await this.syncFactVectorAfterWrite(factKey);
        await this.appendFactHistory(
            currentFact ? 'UPDATE' : 'ADD',
            `${tableKey}/${normalizedRowId}.${normalizedFieldKey}`,
            `${tableKey}::${normalizedRowId}::${normalizedFieldKey}`,
            factKey,
            beforeSnapshot,
            await this.factsManager.get(factKey),
            currentFact ? ['manual_cell_update'] : ['manual_cell_create'],
        );
        await this.syncSharedSignal();
        return factKey;
    }

    /**
     * 功能：合并两行，将来源行事实迁移到目标行。
     * @param tableKey 表键
     * @param fromRowId 来源行 ID
     * @param toRowId 目标行 ID
     * @returns 合并结果
     */
    async mergeRows(tableKey: string, fromRowId: string, toRowId: string): Promise<RowMergeResult> {
        if (fromRowId === toRowId) {
            return {
                success: false,
                migratedFactKeys: [],
                updatedRedirects: 0,
                updatedAliases: 0,
                error: '来源行和目标行不能相同',
            };
        }

        if (this.writeGateway) {
            try {
                const fromFacts = await this.factsManager.query({
                    entity: { kind: tableKey, id: fromRowId },
                    limit: 500,
                });
                const migratedFactKeys: string[] = [];

                for (const fact of fromFacts) {
                    const targetFactKey = `${this.chatKey}::${fact.type}::${tableKey}:${toRowId}::${fact.path ?? '_'}`;
                    const result = await this.writeGateway.requestWrite({
                        source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                        chatKey: this.chatKey,
                        reason: 'logic_table.merge_rows',
                        mutations: {
                            facts: [{
                                factKey: targetFactKey,
                                targetRecordKey: targetFactKey,
                                action: 'auto',
                                type: fact.type,
                                entity: { kind: tableKey, id: toRowId },
                                path: fact.path,
                                value: fact.value,
                                confidence: fact.confidence,
                                provenance: fact.provenance,
                            }],
                        },
                    });
                    migratedFactKeys.push(result.applied.factKeys[0] ?? targetFactKey);
                    await this.writeGateway.requestWrite({
                        source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                        chatKey: this.chatKey,
                        reason: 'logic_table.merge_rows_cleanup',
                        mutations: {
                            facts: [{
                                factKey: fact.factKey,
                                targetRecordKey: fact.factKey,
                                action: 'delete',
                                type: fact.type,
                                entity: fact.entity,
                                path: fact.path,
                                value: fact.value,
                                confidence: fact.confidence,
                                provenance: fact.provenance,
                            }],
                        },
                    });
                }

                await this.chatStateManager.setRowRedirect(tableKey, fromRowId, toRowId);
                const aliasIndex = await this.chatStateManager.getRowAliasIndex();
                const tableAliases = aliasIndex[tableKey] ?? {};
                let updatedAliases = 0;
                for (const [alias, targetId] of Object.entries(tableAliases)) {
                    if (targetId !== fromRowId) {
                        continue;
                    }
                    await this.chatStateManager.setRowAlias(tableKey, alias, toRowId);
                    updatedAliases += 1;
                }

                const auditId = await this.auditManager.log({
                    action: 'row.merged',
                    actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                    before: { tableKey, fromRowId, factCount: fromFacts.length },
                    after: { tableKey, toRowId, migratedFactKeys, updatedAliases },
                });

                await this.syncSharedSignal();
                logger.success(`行合并完成 ${tableKey}/${fromRowId} -> ${toRowId}，迁移 ${migratedFactKeys.length} 条事实`);
                return {
                    success: true,
                    migratedFactKeys,
                    updatedRedirects: 1,
                    updatedAliases,
                    auditId,
                };
            } catch (error) {
                logger.error(`行合并失败 ${tableKey}/${fromRowId} -> ${toRowId}`, error);
                return {
                    success: false,
                    migratedFactKeys: [],
                    updatedRedirects: 0,
                    updatedAliases: 0,
                    error: String(error),
                };
            }
        }

        try {
            const fromFacts = await this.factsManager.query({
                entity: { kind: tableKey, id: fromRowId },
                limit: 500,
            });
            const migratedFactKeys: string[] = [];

            await db.transaction('rw', [db.facts, db.audit], async (): Promise<void> => {
                for (const fact of fromFacts) {
                    await db.facts.delete(fact.factKey);
                    const newFact: DBFact = {
                        ...fact,
                        factKey: `${this.chatKey}::${fact.type}::${tableKey}:${toRowId}::${fact.path ?? '_'}`,
                        entity: { kind: tableKey, id: toRowId },
                        updatedAt: Date.now(),
                    };
                    await db.facts.put(newFact);
                    migratedFactKeys.push(newFact.factKey);
                }
            });

            await this.chatStateManager.archiveFactKeys(fromFacts.map((fact: DBFact): string => fact.factKey));
            await this.chatStateManager.setRowRedirect(tableKey, fromRowId, toRowId);

            const aliasIndex = await this.chatStateManager.getRowAliasIndex();
            const tableAliases = aliasIndex[tableKey] ?? {};
            let updatedAliases = 0;
            for (const [alias, targetId] of Object.entries(tableAliases)) {
                if (targetId !== fromRowId) {
                    continue;
                }
                await this.chatStateManager.setRowAlias(tableKey, alias, toRowId);
                updatedAliases += 1;
            }

            for (let index = 0; index < migratedFactKeys.length; index += 1) {
                const factKey = migratedFactKeys[index];
                const sourceFact = fromFacts[index];
                await this.syncFactVectorAfterWrite(factKey);
                await this.appendFactHistory(
                    'MERGE',
                    `${tableKey}/${toRowId}.${String(sourceFact?.path ?? '_')}`,
                    `${tableKey}::${toRowId}::${String(sourceFact?.path ?? '_')}`,
                    factKey,
                    sourceFact ? { ...sourceFact } : null,
                    await this.factsManager.get(factKey),
                    ['manual_row_merge'],
                );
            }

            const auditId = await this.auditManager.log({
                action: 'row.merged',
                actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                before: { tableKey, fromRowId, factCount: fromFacts.length },
                after: { tableKey, toRowId, migratedFactKeys, updatedAliases },
            });

            await this.syncSharedSignal();
            logger.success(`行合并完成 ${tableKey}/${fromRowId} -> ${toRowId}，迁移 ${migratedFactKeys.length} 条事实`);

            return {
                success: true,
                migratedFactKeys,
                updatedRedirects: 1,
                updatedAliases,
                auditId,
            };
        } catch (error) {
            logger.error(`行合并失败 ${tableKey}/${fromRowId} -> ${toRowId}`, error);
            return {
                success: false,
                migratedFactKeys: [],
                updatedRedirects: 0,
                updatedAliases: 0,
                error: String(error),
            };
        }
    }

    /**
     * 功能：软删除指定行。
     * @param tableKey 表键
     * @param rowId 行 ID
     * @returns 无返回值
     */
    async deleteRow(tableKey: string, rowId: string): Promise<void> {
        const retentionPolicy = await this.chatStateManager.getRetentionPolicy();
        const rowFacts = await this.factsManager.query({
            entity: { kind: tableKey, id: rowId },
            limit: 500,
        });
        const factKeys = rowFacts.map((fact: DBFact): string => fact.factKey);
        if (this.writeGateway) {
            if (retentionPolicy.deletionStrategy === 'immediate_purge') {
                for (const fact of rowFacts) {
                    await this.writeGateway.requestWrite({
                        source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                        chatKey: this.chatKey,
                        reason: 'logic_table.delete_row_purge',
                        mutations: {
                            facts: [{
                                factKey: fact.factKey,
                                targetRecordKey: fact.factKey,
                                action: 'delete',
                                type: fact.type,
                                entity: fact.entity,
                                path: fact.path,
                                value: fact.value,
                                confidence: fact.confidence,
                                provenance: fact.provenance,
                            }],
                        },
                    });
                }
                await this.chatStateManager.removeRowTombstone(tableKey, rowId);
                await this.chatStateManager.unarchiveFactKeys(factKeys);
                await this.auditManager.log({
                    action: 'row.purged',
                    actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                    before: { tableKey, rowId, factKeys },
                    after: { tableKey, rowId, purged: true },
                });
                await this.syncSharedSignal();
                logger.info(`立即清除行 ${tableKey}/${rowId}`);
                return;
            }

            await this.chatStateManager.addRowTombstone(tableKey, rowId, MEMORY_OS_PLUGIN_ID);
            for (const fact of rowFacts) {
                await this.writeGateway.requestWrite({
                    source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                    chatKey: this.chatKey,
                    reason: 'logic_table.delete_row_soft',
                    mutations: {
                        facts: [{
                            factKey: fact.factKey,
                            targetRecordKey: fact.factKey,
                            action: 'invalidate',
                            type: fact.type,
                            entity: fact.entity,
                            path: fact.path,
                            value: fact.value,
                            confidence: fact.confidence,
                            provenance: fact.provenance,
                        }],
                    },
                });
            }
            await this.auditManager.log({
                action: 'row.soft_deleted',
                actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                before: { tableKey, rowId, factKeys },
                after: { tableKey, rowId, tombstoned: true, factKeys },
            });
            await this.syncSharedSignal();
            logger.info(`软删除行: ${tableKey}/${rowId}`);
            return;
        }
        if (retentionPolicy.deletionStrategy === 'immediate_purge') {
            await this.chatStateManager.archiveFactKeys(factKeys);
            for (const fact of rowFacts) {
                await this.appendFactHistory(
                    'DELETE',
                    `${tableKey}/${rowId}.${String(fact.path ?? '_')}`,
                    `${tableKey}::${rowId}::${String(fact.path ?? '_')}`,
                    fact.factKey,
                    { ...fact },
                    null,
                    ['manual_row_purge'],
                );
            }
            await db.transaction('rw', [db.facts], async (): Promise<void> => {
                await Promise.all(rowFacts.map((fact: DBFact): Promise<void> => db.facts.delete(fact.factKey)));
            });
            await this.chatStateManager.removeRowTombstone(tableKey, rowId);
            await this.chatStateManager.unarchiveFactKeys(factKeys);
            await this.auditManager.log({
                action: 'row.purged',
                actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                before: { tableKey, rowId, factKeys },
                after: { tableKey, rowId, purged: true },
            });
            await this.syncSharedSignal();
            logger.info(`立即清除行: ${tableKey}/${rowId}`);
            return;
        }
        await this.chatStateManager.archiveFactKeys(factKeys);
        await this.chatStateManager.addRowTombstone(tableKey, rowId, MEMORY_OS_PLUGIN_ID);
        for (const fact of rowFacts) {
            await this.appendFactHistory(
                'INVALIDATE',
                `${tableKey}/${rowId}.${String(fact.path ?? '_')}`,
                `${tableKey}::${rowId}::${String(fact.path ?? '_')}`,
                fact.factKey,
                { ...fact },
                {
                    ...fact,
                    tombstoned: true,
                    archived: true,
                },
                ['manual_row_soft_delete'],
            );
        }
        await this.auditManager.log({
            action: 'row.soft_deleted',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: { tableKey, rowId, factKeys },
            after: { tableKey, rowId, tombstoned: true, factKeys },
        });
        await this.syncSharedSignal();
        logger.info(`软删除行: ${tableKey}/${rowId}`);
    }

    /**
     * 功能：恢复软删除的行。
     * @param tableKey 表键
     * @param rowId 行 ID
     * @returns 无返回值
     */
    async restoreRow(tableKey: string, rowId: string): Promise<void> {
        const rowFacts = await this.factsManager.query({
            entity: { kind: tableKey, id: rowId },
            limit: 500,
        });
        if (this.writeGateway) {
            for (const fact of rowFacts) {
                await this.writeGateway.requestWrite({
                    source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                    chatKey: this.chatKey,
                    reason: 'logic_table.restore_row',
                    mutations: {
                        facts: [{
                            factKey: fact.factKey,
                            targetRecordKey: fact.factKey,
                            action: 'update',
                            type: fact.type,
                            entity: fact.entity,
                            path: fact.path,
                            value: fact.value,
                            confidence: fact.confidence,
                            provenance: fact.provenance,
                        }],
                    },
                });
            }
            await this.chatStateManager.unarchiveFactKeys(rowFacts.map((fact: DBFact): string => fact.factKey));
            await this.chatStateManager.removeRowTombstone(tableKey, rowId);
            await this.auditManager.log({
                action: 'row.restored',
                actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                before: { tableKey, rowId, tombstoned: true },
                after: { tableKey, rowId, tombstoned: false },
            });
            await this.syncSharedSignal();
            logger.info(`恢复行 ${tableKey}/${rowId}`);
            return;
        }
        await this.chatStateManager.unarchiveFactKeys(rowFacts.map((fact: DBFact): string => fact.factKey));
        await this.chatStateManager.removeRowTombstone(tableKey, rowId);
        for (const fact of rowFacts) {
            await this.syncFactVectorAfterWrite(fact.factKey);
            await this.appendFactHistory(
                'UPDATE',
                `${tableKey}/${rowId}.${String(fact.path ?? '_')}`,
                `${tableKey}::${rowId}::${String(fact.path ?? '_')}`,
                fact.factKey,
                {
                    ...fact,
                    tombstoned: true,
                    archived: true,
                },
                { ...fact },
                ['manual_row_restore'],
            );
        }
        await this.auditManager.log({
            action: 'row.restored',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: { tableKey, rowId, tombstoned: true },
            after: { tableKey, rowId, tombstoned: false },
        });
        await this.syncSharedSignal();
        logger.info(`恢复行: ${tableKey}/${rowId}`);
    }
}
