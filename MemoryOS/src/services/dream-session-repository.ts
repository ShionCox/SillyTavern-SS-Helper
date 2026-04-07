import {
    appendSdkPluginChatRecord,
    db,
    deleteSdkPluginChatRecords,
    queryLatestSdkPluginChatRecords,
    querySdkPluginChatRecords,
    type DBChatPluginRecord,
} from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type {
    DreamMaintenanceProposalRecord,
    DreamQualityReport,
    DreamRollbackMetadataRecord,
    DreamSchedulerStateRecord,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamRollbackSnapshotRecord,
    DreamSessionApprovalRecord,
    DreamSessionMetaRecord,
    DreamSessionOutputRecord,
    DreamSessionRecallRecord,
    DreamSessionRecord,
} from './dream-types';
import type { DreamLockRecord } from './dream-lock-types';

type DreamRecordCollection =
    | 'dream_session_meta'
    | 'dream_session_recall'
    | 'dream_session_output'
    | 'dream_session_approval'
    | 'dream_session_rollback'
    | 'dream_session_diagnostics'
    | 'dream_session_graph_snapshot'
    | 'dream_maintenance_proposal'
    | 'dream_quality_report'
    | 'dream_rollback_metadata'
    | 'dream_scheduler_state'
    | 'dream_lock_state';

/**
 * 功能：统一管理 dream session 在 chat_plugin_records 中的持久化。
 */
export class DreamSessionRepository {
    private readonly chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
    }

    async saveDreamSessionMeta(record: DreamSessionMetaRecord): Promise<void> {
        await this.saveRecord('dream_session_meta', record.dreamId, record, record.updatedAt);
    }

    async saveDreamSessionRecall(record: DreamSessionRecallRecord): Promise<void> {
        await this.saveRecord('dream_session_recall', record.dreamId, record, record.updatedAt);
    }

    async saveDreamSessionOutput(record: DreamSessionOutputRecord): Promise<void> {
        await this.saveRecord('dream_session_output', record.dreamId, record, record.updatedAt);
    }

    async saveDreamSessionApproval(record: DreamSessionApprovalRecord): Promise<void> {
        await this.saveRecord('dream_session_approval', record.dreamId, record, record.updatedAt);
    }

    async saveDreamRollbackSnapshot(record: DreamRollbackSnapshotRecord): Promise<void> {
        await this.saveRecord('dream_session_rollback', record.dreamId, record, record.updatedAt);
    }

    async saveDreamDiagnostics(record: DreamSessionDiagnosticsRecord): Promise<void> {
        await this.saveRecord('dream_session_diagnostics', record.dreamId, record, record.updatedAt);
    }

    async saveDreamGraphSnapshot(record: DreamSessionGraphSnapshotRecord): Promise<void> {
        await this.saveRecord('dream_session_graph_snapshot', record.dreamId, record, record.updatedAt);
    }

    async saveDreamMaintenanceProposal(record: DreamMaintenanceProposalRecord): Promise<void> {
        await this.saveRecord('dream_maintenance_proposal', record.proposalId, record, record.updatedAt);
    }

    async saveDreamQualityReport(record: DreamQualityReport): Promise<void> {
        await this.saveRecord('dream_quality_report', record.dreamId, record, record.updatedAt);
    }

    async saveDreamRollbackMetadata(record: DreamRollbackMetadataRecord): Promise<void> {
        await this.saveRecord('dream_rollback_metadata', record.dreamId, record, record.updatedAt);
    }

    async saveDreamSchedulerState(record: DreamSchedulerStateRecord): Promise<void> {
        await this.saveRecord('dream_scheduler_state', record.chatKey || 'scheduler', record, record.updatedAt);
    }

    async saveDreamLockState(record: DreamLockRecord): Promise<void> {
        await this.saveRecord('dream_lock_state', record.lockKey, record, record.updatedAt);
    }

    async getDreamLockState(lockKey: string): Promise<DreamLockRecord | null> {
        return this.getSingleRecord<DreamLockRecord>('dream_lock_state', String(lockKey ?? '').trim());
    }

    async deleteDreamLockState(lockKey: string): Promise<void> {
        const normalizedLockKey = String(lockKey ?? '').trim();
        if (!normalizedLockKey) {
            return;
        }
        const rows = await querySdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, this.chatKey, 'dream_lock_state', {
            order: 'desc',
            limit: 2000,
        });
        const deleteIds = rows
            .filter((row: DBChatPluginRecord): boolean => String(row.recordId ?? '').trim() === normalizedLockKey)
            .map((row: DBChatPluginRecord): number => Number(row.id))
            .filter((rowId: number): boolean => Number.isFinite(rowId));
        if (deleteIds.length <= 0) {
            return;
        }
        await db.chat_plugin_records.bulkDelete(Array.from(new Set(deleteIds)));
    }

    /**
     * 功能：删除某个 dreamId 关联的会话记录，避免失败半成品残留。
     * @param dreamId 梦境会话 ID。
     * @returns 异步完成。
     */
    async deleteDreamSessionArtifacts(dreamId: string): Promise<void> {
        const normalizedDreamId = String(dreamId ?? '').trim();
        if (!normalizedDreamId) {
            return;
        }
        const collections: DreamRecordCollection[] = [
            'dream_session_meta',
            'dream_session_recall',
            'dream_session_output',
            'dream_session_approval',
            'dream_session_rollback',
            'dream_session_diagnostics',
            'dream_session_graph_snapshot',
            'dream_quality_report',
            'dream_rollback_metadata',
            'dream_maintenance_proposal',
        ];
        const deleteIds: number[] = [];
        for (const collection of collections) {
            const rows = await querySdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, this.chatKey, collection, {
                order: 'desc',
                limit: 2000,
            });
            rows.forEach((row: DBChatPluginRecord): void => {
                const recordId = String(row.recordId ?? '').trim();
                const payload = row.payload && typeof row.payload === 'object'
                    ? row.payload as Record<string, unknown>
                    : {};
                const payloadDreamId = String(payload.dreamId ?? '').trim();
                if (recordId === normalizedDreamId || payloadDreamId === normalizedDreamId) {
                    const rowId = Number(row.id);
                    if (Number.isFinite(rowId)) {
                        deleteIds.push(rowId);
                    }
                }
            });
        }
        if (deleteIds.length <= 0) {
            return;
        }
        await db.chat_plugin_records.bulkDelete(Array.from(new Set(deleteIds)));
    }

    /**
     * 功能：清理当前聊天下的全部梦境系统记录。
     * @returns 已删除的记录数量。
     */
    async clearAllDreamRecords(): Promise<number> {
        const collections: DreamRecordCollection[] = [
            'dream_session_meta',
            'dream_session_recall',
            'dream_session_output',
            'dream_session_approval',
            'dream_session_rollback',
            'dream_session_diagnostics',
            'dream_session_graph_snapshot',
            'dream_maintenance_proposal',
            'dream_quality_report',
            'dream_rollback_metadata',
            'dream_scheduler_state',
            'dream_lock_state',
        ];
        let deletedCount = 0;
        for (const collection of collections) {
            deletedCount += await deleteSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, this.chatKey, collection);
        }
        return deletedCount;
    }

    async getDreamSessionById(dreamId: string): Promise<DreamSessionRecord> {
        const normalizedDreamId = String(dreamId ?? '').trim();
        const [meta, recall, output, approval, rollback, diagnostics, graphSnapshot, maintenanceProposals, qualityReport, rollbackMetadata] = await Promise.all([
            this.getSingleRecord<DreamSessionMetaRecord>('dream_session_meta', normalizedDreamId),
            this.getSingleRecord<DreamSessionRecallRecord>('dream_session_recall', normalizedDreamId),
            this.getSingleRecord<DreamSessionOutputRecord>('dream_session_output', normalizedDreamId),
            this.getSingleRecord<DreamSessionApprovalRecord>('dream_session_approval', normalizedDreamId),
            this.getSingleRecord<DreamRollbackSnapshotRecord>('dream_session_rollback', normalizedDreamId),
            this.getSingleRecord<DreamSessionDiagnosticsRecord>('dream_session_diagnostics', normalizedDreamId),
            this.getSingleRecord<DreamSessionGraphSnapshotRecord>('dream_session_graph_snapshot', normalizedDreamId),
            this.listDreamMaintenanceProposalsByDreamId(normalizedDreamId),
            this.getSingleRecord<DreamQualityReport>('dream_quality_report', normalizedDreamId),
            this.getSingleRecord<DreamRollbackMetadataRecord>('dream_rollback_metadata', normalizedDreamId),
        ]);
        return {
            meta,
            recall,
            output,
            approval,
            rollback,
            diagnostics,
            graphSnapshot,
            maintenanceProposals,
            qualityReport,
            rollbackMetadata,
        };
    }

    async listDreamSessionMetas(limit = 20): Promise<DreamSessionMetaRecord[]> {
        return this.listRecords<DreamSessionMetaRecord>('dream_session_meta', limit);
    }

    async listDreamSessionOutputs(limit = 20): Promise<DreamSessionOutputRecord[]> {
        return this.listRecords<DreamSessionOutputRecord>('dream_session_output', limit);
    }

    async listDreamMaintenanceProposals(limit = 40): Promise<DreamMaintenanceProposalRecord[]> {
        return this.listRecords<DreamMaintenanceProposalRecord>('dream_maintenance_proposal', limit);
    }

    async listDreamMaintenanceProposalsByDreamId(dreamId: string): Promise<DreamMaintenanceProposalRecord[]> {
        const normalizedDreamId = String(dreamId ?? '').trim();
        const rows = await this.listRecords<DreamMaintenanceProposalRecord>('dream_maintenance_proposal', 200);
        return rows.filter((item: DreamMaintenanceProposalRecord): boolean => item.dreamId === normalizedDreamId);
    }

    async listDreamQualityReports(limit = 20): Promise<DreamQualityReport[]> {
        return this.listRecords<DreamQualityReport>('dream_quality_report', limit);
    }

    async getDreamSchedulerState(): Promise<DreamSchedulerStateRecord | null> {
        return this.getSingleRecord<DreamSchedulerStateRecord>('dream_scheduler_state', this.chatKey);
    }

    /**
     * 功能：列出所有 approval 状态为 pending 的梦境会话。
     * @param limit 最大返回数。
     * @returns 待审批的梦境会话列表。
     */
    async listPendingDreamSessions(limit = 20): Promise<DreamSessionRecord[]> {
        const approvals = await this.listRecords<DreamSessionApprovalRecord>('dream_session_approval', 200);
        const pendingApprovals = approvals.filter(
            (item: DreamSessionApprovalRecord): boolean => item.status === 'pending',
        );
        const results: DreamSessionRecord[] = [];
        for (const approval of pendingApprovals.slice(0, limit)) {
            const session = await this.getDreamSessionById(approval.dreamId);
            if (session.meta) {
                results.push(session);
            }
        }
        return results;
    }

    /**
     * 功能：获取最近完成（approved 或 generated 且非 pending）的梦境会话。
     * @returns 最近完成的会话，不存在返回 null。
     */
    async getLatestCompletedSession(): Promise<DreamSessionRecord | null> {
        const metas = await this.listDreamSessionMetas(20);
        const completedMeta = metas.find((m: DreamSessionMetaRecord): boolean =>
            m.status === 'approved' || m.status === 'generated',
        );
        if (!completedMeta) return null;
        return this.getDreamSessionById(completedMeta.dreamId);
    }

    /**
     * 功能：获取最近失败的梦境会话。
     * @returns 最近失败的会话，不存在返回 null。
     */
    async getLatestFailedSession(): Promise<DreamSessionRecord | null> {
        const metas = await this.listDreamSessionMetas(20);
        const failedMeta = metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'failed');
        if (!failedMeta) return null;
        return this.getDreamSessionById(failedMeta.dreamId);
    }

    /**
     * 功能：获取最近回滚的梦境会话。
     * @returns 最近回滚的会话，不存在返回 null。
     */
    async getLatestRolledBackSession(): Promise<DreamSessionRecord | null> {
        const metas = await this.listDreamSessionMetas(20);
        const rolledBackMeta = metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'rolled_back');
        if (!rolledBackMeta) return null;
        return this.getDreamSessionById(rolledBackMeta.dreamId);
    }

    private async saveRecord<T extends object>(
        collection: DreamRecordCollection,
        recordId: string,
        payload: T,
        ts: number,
    ): Promise<void> {
        await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, this.chatKey, collection, {
            recordId: String(recordId ?? '').trim(),
            payload: payload as unknown as Record<string, unknown>,
            ts: Number(ts ?? Date.now()) || Date.now(),
        });
    }

    private async getSingleRecord<T>(collection: DreamRecordCollection, dreamId: string): Promise<T | null> {
        const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, this.chatKey, collection, {
            order: 'desc',
            limit: 2000,
        });
        const row = rows.find((item: DBChatPluginRecord): boolean => String(item.recordId ?? '').trim() === dreamId);
        if (!row || !row.payload || typeof row.payload !== 'object') {
            return null;
        }
        return row.payload as T;
    }

    private async listRecords<T>(collection: DreamRecordCollection, limit: number): Promise<T[]> {
        const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, this.chatKey, collection, {
            order: 'desc',
            limit: Math.max(1, limit),
        });
        return rows
            .map((row: DBChatPluginRecord): T | null => {
                if (!row.payload || typeof row.payload !== 'object') {
                    return null;
                }
                return row.payload as T;
            })
            .filter((item: T | null): item is T => Boolean(item));
    }
}
