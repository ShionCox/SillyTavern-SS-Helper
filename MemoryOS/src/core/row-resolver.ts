import { logger } from '../index';
import { ChatStateManager } from './chat-state-manager';
import type { RowRefResolution } from '../types';
import { FactsManager } from './facts-manager';


/**
 * 统一实体解析入口
 * 所有场景（UI、提取裁剪、世界书写回、行详情打开）都走同一读路径：
 * 1. 精确 row_id
 * 2. rowRedirects
 * 3. rowAliasIndex
 * 4. 模糊匹配 / 关键词召回
 */
export class RowResolver {
    private chatStateManager: ChatStateManager;
    private factsManager: FactsManager;

    constructor(chatStateManager: ChatStateManager, factsManager: FactsManager) {
        this.chatStateManager = chatStateManager;
        this.factsManager = factsManager;
    }

    /**
     * 解析行引用，返回最终的 rowId
     * @param tableKey 目标表
     * @param input 原始输入（可以是 rowId、别名、模糊名称）
     */
    async resolveRowRef(tableKey: string, input: string): Promise<RowRefResolution> {
        const trimmed = String(input ?? '').trim();
        if (!trimmed) {
            return { resolved: false, rowId: null, source: 'exact', input: trimmed };
        }

        // 检查是否 tombstoned
        const isTombstoned = await this.chatStateManager.isRowTombstoned(tableKey, trimmed);

        // 1. 精确匹配 row_id
        const exactFacts = await this.factsManager.query({
            entity: { kind: tableKey, id: trimmed },
            limit: 1,
        });
        if (exactFacts.length > 0 && !isTombstoned) {
            return { resolved: true, rowId: trimmed, source: 'exact', input: trimmed };
        }

        // 2. rowRedirects
        const redirects = await this.chatStateManager.getRowRedirects();
        const tableRedirects = redirects[tableKey] ?? {};
        const redirectTarget = tableRedirects[trimmed];
        if (redirectTarget) {
            // 检查是否需要进一步压平（A -> B -> C）
            const furtherTarget = tableRedirects[redirectTarget];
            if (furtherTarget) {
                // 压平: A -> C
                await this.chatStateManager.setRowRedirect(tableKey, trimmed, furtherTarget);
                logger.info(`压平 redirect 链: ${trimmed} -> ${redirectTarget} -> ${furtherTarget} => ${trimmed} -> ${furtherTarget}`);
                return {
                    resolved: true,
                    rowId: furtherTarget,
                    source: 'redirect',
                    input: trimmed,
                    flattenedRedirect: true,
                };
            }
            return { resolved: true, rowId: redirectTarget, source: 'redirect', input: trimmed };
        }

        // 3. rowAliasIndex
        try {
            const aliasIndex = await this.chatStateManager.getRowAliasIndex();
            const tableAliases = aliasIndex[tableKey] ?? {};
            const aliasTarget = tableAliases[trimmed] ?? tableAliases[trimmed.toLowerCase()];
            if (aliasTarget) {
                return { resolved: true, rowId: aliasTarget, source: 'alias', input: trimmed };
            }
        } catch (e) {
            // alias 索引损坏时忽略并记录告警
            logger.warn('rowAliasIndex 读取失败，忽略 alias 层', e);
        }

        // 4. 模糊匹配：按关键词在该表的已有行中搜索
        const fuzzyResult = await this.fuzzyMatch(tableKey, trimmed);
        if (fuzzyResult) {
            return { resolved: true, rowId: fuzzyResult, source: 'fuzzy', input: trimmed };
        }

        return { resolved: false, rowId: null, source: 'exact', input: trimmed };
    }

    /**
     * 模糊匹配：在指定表的所有行中搜索名称相似的实体
     */
    private async fuzzyMatch(tableKey: string, input: string): Promise<string | null> {
        const allFacts = await this.factsManager.query({
            type: tableKey,
            limit: 200,
        });

        // 按 entity.id 分组
        const rowIds = new Set<string>();
        for (const fact of allFacts) {
            if (fact.entity?.id) {
                rowIds.add(fact.entity.id);
            }
        }

        const normalized = input.toLowerCase().replace(/\s+/g, '');

        for (const rowId of rowIds) {
            // 检查 tombstone
            const isTombstoned = await this.chatStateManager.isRowTombstoned(tableKey, rowId);
            if (isTombstoned) continue;

            const normalizedRowId = rowId.toLowerCase().replace(/\s+/g, '');
            if (normalizedRowId.includes(normalized) || normalized.includes(normalizedRowId)) {
                return rowId;
            }
        }

        return null;
    }

    /**
     * 批量解析行引用
     */
    async resolveRowRefs(tableKey: string, inputs: string[]): Promise<RowRefResolution[]> {
        return Promise.all(inputs.map(input => this.resolveRowRef(tableKey, input)));
    }
}
