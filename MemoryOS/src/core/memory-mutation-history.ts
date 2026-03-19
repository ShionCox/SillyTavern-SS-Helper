import Dexie from 'dexie';
import { db, type DBMemoryMutationHistory } from '../db/db';
import type { DBDerivationSource } from '../../../SDK/db';
import type { MemoryMutationHistoryAction, MemoryMutationHistoryEntry, MemoryMutationTargetKind } from '../types';

export interface MemoryMutationHistoryListOptions {
    sinceTs?: number;
    limit?: number;
    recordKey?: string;
    targetKind?: MemoryMutationTargetKind;
    action?: MemoryMutationHistoryAction;
}

export interface MemoryMutationHistoryAppendInput {
    source: string;
    consumerPluginId: string;
    targetKind: MemoryMutationTargetKind;
    action: MemoryMutationHistoryAction;
    title: string;
    compareKey: string;
    targetRecordKey?: string;
    existingRecordKeys?: string[];
    reasonCodes?: string[];
    before: unknown;
    after: unknown;
    visibleMessageIds?: string[];
    derivation?: DBDerivationSource;
    mutationId?: string;
    ts?: number;
}

/**
 * 功能：把任意历史字段值规范成可安全比较的字符串。
 * @param value 原始值。
 * @returns 规范化后的字符串。
 */
function normalizeHistoryText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：把历史数组字段规范成去重后的字符串数组。
 * @param values 原始值。
 * @returns 规范化后的字符串数组。
 */
function normalizeHistoryStrings(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(new Set(values.map((item: unknown): string => normalizeHistoryText(item)).filter(Boolean)));
}

/**
 * 功能：把数据库中的 mutation history 行转换成对外类型。
 * @param record 数据库记录。
 * @returns 对外历史条目。
 */
function normalizeHistoryEntry(record: DBMemoryMutationHistory): MemoryMutationHistoryEntry {
    return {
        mutationId: normalizeHistoryText(record.mutationId),
        chatKey: normalizeHistoryText(record.chatKey),
        ts: Math.max(0, Number(record.ts ?? 0) || 0),
        source: normalizeHistoryText(record.source),
        consumerPluginId: normalizeHistoryText(record.consumerPluginId),
        targetKind: record.targetKind,
        action: record.action,
        title: normalizeHistoryText(record.title),
        compareKey: normalizeHistoryText(record.compareKey),
        targetRecordKey: normalizeHistoryText(record.targetRecordKey) || undefined,
        existingRecordKeys: normalizeHistoryStrings(record.existingRecordKeys),
        reasonCodes: normalizeHistoryStrings(record.reasonCodes),
        before: record.before,
        after: record.after,
        visibleMessageIds: normalizeHistoryStrings(record.visibleMessageIds),
        derivation: record.derivation,
    };
}

/**
 * 功能：负责长期记忆变更历史的写入与读取。
 *
 * 说明：
 * - 只围绕 `memory_mutation_history` 表工作，不回退到 audit。
 * - 写入粒度是“真实执行过的一条 mutation”。
 */
export class MemoryMutationHistoryManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = normalizeHistoryText(chatKey);
    }

    /**
     * 功能：追加一条 mutation history。
     * @param input 历史条目输入。
     * @returns 写入后的 history ID。
     */
    async append(input: MemoryMutationHistoryAppendInput): Promise<string> {
        const mutationId = normalizeHistoryText(input.mutationId) || crypto.randomUUID();
        const record: DBMemoryMutationHistory = {
            mutationId,
            chatKey: this.chatKey,
            ts: Math.max(0, Number(input.ts ?? Date.now()) || Date.now()),
            source: normalizeHistoryText(input.source) || 'unknown',
            consumerPluginId: normalizeHistoryText(input.consumerPluginId) || 'unknown_plugin',
            targetKind: input.targetKind,
            action: input.action,
            title: normalizeHistoryText(input.title) || '未命名变更',
            compareKey: normalizeHistoryText(input.compareKey),
            targetRecordKey: normalizeHistoryText(input.targetRecordKey) || undefined,
            existingRecordKeys: normalizeHistoryStrings(input.existingRecordKeys),
            reasonCodes: normalizeHistoryStrings(input.reasonCodes),
            before: input.before,
            after: input.after,
            visibleMessageIds: normalizeHistoryStrings(input.visibleMessageIds),
            derivation: input.derivation,
        };
        await db.memory_mutation_history.add(record);
        return mutationId;
    }

    /**
     * 功能：查询当前聊天的 mutation history。
     * @param opts 过滤条件。
     * @returns 倒序排列的历史条目。
     */
    async list(opts: MemoryMutationHistoryListOptions = {}): Promise<MemoryMutationHistoryEntry[]> {
        const sinceTs = Math.max(0, Number(opts.sinceTs ?? 0) || 0);
        const rows = await db.memory_mutation_history
            .where('[chatKey+ts]')
            .between([this.chatKey, sinceTs], [this.chatKey, Dexie.maxKey])
            .reverse()
            .toArray();
        const recordKey = normalizeHistoryText(opts.recordKey);
        const targetKind = normalizeHistoryText(opts.targetKind);
        const action = normalizeHistoryText(opts.action);
        return rows
            .filter((row: DBMemoryMutationHistory): boolean => {
                if (recordKey && normalizeHistoryText(row.targetRecordKey) !== recordKey) {
                    return false;
                }
                if (targetKind && row.targetKind !== targetKind) {
                    return false;
                }
                if (action && row.action !== action) {
                    return false;
                }
                return true;
            })
            .slice(0, Math.max(1, Math.floor(Number(opts.limit ?? 100) || 100)))
            .map((row: DBMemoryMutationHistory): MemoryMutationHistoryEntry => normalizeHistoryEntry(row));
    }

    /**
     * 功能：按记录键查询 mutation history。
     * @param recordKey 目标记录键。
     * @param opts 额外过滤条件。
     * @returns 倒序排列的历史条目。
     */
    async listByRecord(recordKey: string, opts: Omit<MemoryMutationHistoryListOptions, 'recordKey'> = {}): Promise<MemoryMutationHistoryEntry[]> {
        return this.list({
            ...opts,
            recordKey,
        });
    }
}
