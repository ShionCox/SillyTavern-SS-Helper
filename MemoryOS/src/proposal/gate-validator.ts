import type { WorldTemplate } from '../template/types';
import type { GateResult, MemoryProposalDocument } from './types';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * 功能：执行提案文档的闸门校验。
 * @param factsManager 事实管理器。
 * @param stateManager 状态管理器。
 * @returns 闸门校验器实例。
 */
export class GateValidator {
    private factsManager: FactsManager;
    private stateManager: StateManager;

    constructor(factsManager: FactsManager, stateManager: StateManager) {
        this.factsManager = factsManager;
        this.stateManager = stateManager;
    }

    /**
     * 功能：执行全部闸门校验。
     * @param document 提案文档。
     * @param activeTemplate 当前激活模板。
     * @param consumerPluginId 调用方插件标识。
     * @param allowedPlugins 已授权插件列表。
     * @returns 闸门结果列表。
     */
    async validate(
        document: MemoryProposalDocument,
        activeTemplate: WorldTemplate | null,
        consumerPluginId: string,
        allowedPlugins: string[]
    ): Promise<GateResult[]> {
        const results: GateResult[] = [];
        results.push(this.validateSchema(document, activeTemplate));
        results.push(await this.validateDiff(document));
        results.push(this.validatePermission(consumerPluginId, allowedPlugins));
        return results;
    }

    /**
     * 功能：校验提案文档的结构是否合法。
     * @param document 提案文档。
     * @param activeTemplate 当前激活模板。
     * @returns Schema 闸门结果。
     */
    private validateSchema(
        document: MemoryProposalDocument,
        activeTemplate: WorldTemplate | null
    ): GateResult {
        const errors: string[] = [];
        const { facts, patches, summaries } = document;

        if (facts) {
            for (let index = 0; index < facts.length; index += 1) {
                const fact = facts[index];
                if (!fact) {
                    continue;
                }
                if (!fact.type) {
                    errors.push(`facts[${index}] 缺少 type 字段`);
                }
                if (fact.value === undefined) {
                    errors.push(`facts[${index}] 缺少 value 字段`);
                }
                if (activeTemplate && activeTemplate.factTypes.length > 0) {
                    const validTypes = activeTemplate.factTypes.map((item): string => item.type);
                    if (!validTypes.includes(fact.type)) {
                        errors.push(`facts[${index}] type "${fact.type}" 不在当前模板的 factTypes 中 [${validTypes.join(', ')}]`);
                    }
                }
            }
        }

        if (patches) {
            for (let index = 0; index < patches.length; index += 1) {
                const patch = patches[index];
                if (!patch) {
                    continue;
                }
                if (!['add', 'replace', 'remove'].includes(patch.op)) {
                    errors.push(`patches[${index}] op "${patch.op}" 不合法`);
                }
                if (!patch.path) {
                    errors.push(`patches[${index}] 缺少 path 字段`);
                }
                if (patch.op !== 'remove' && patch.value === undefined) {
                    errors.push(`patches[${index}] op="${patch.op}" 但缺少 value`);
                }
            }
        }

        if (summaries) {
            for (let index = 0; index < summaries.length; index += 1) {
                const summary = summaries[index];
                if (!summary) {
                    continue;
                }
                if (!['message', 'scene', 'arc'].includes(summary.level)) {
                    errors.push(`summaries[${index}] level "${summary.level}" 不合法`);
                }
                if (!summary.content) {
                    errors.push(`summaries[${index}] 缺少 content`);
                }
            }
        }

        return { passed: errors.length === 0, gate: 'schema', errors };
    }

    /**
     * 功能：校验提案文档是否包含真实变化。
     * @param document 提案文档。
     * @returns Diff 闸门结果。
     */
    private async validateDiff(document: MemoryProposalDocument): Promise<GateResult> {
        const errors: string[] = [];
        const { facts, patches, summaries } = document;

        let hasChange = false;

        if (facts && facts.length > 0) {
            for (const fact of facts) {
                if (!fact) {
                    continue;
                }
                if (fact.factKey) {
                    const existing = await this.factsManager.get(fact.factKey);
                    if (existing && JSON.stringify(existing.value) === JSON.stringify(fact.value)) {
                        continue;
                    }
                }
                hasChange = true;
                break;
            }
        }

        if (!hasChange && patches && patches.length > 0) {
            for (const patch of patches) {
                if (!patch) {
                    continue;
                }
                const existing = await this.stateManager.get(patch.path);
                if (patch.op === 'remove' && existing === null) {
                    continue;
                }
                if (patch.op !== 'remove' && JSON.stringify(existing) === JSON.stringify(patch.value)) {
                    continue;
                }
                hasChange = true;
                break;
            }
        }

        if (!hasChange && summaries && summaries.length > 0) {
            hasChange = true;
        }

        if (!hasChange) {
            errors.push('提案内容与现有数据完全一致，没有实际变化');
        }

        return { passed: hasChange, gate: 'diff', errors };
    }

    /**
     * 功能：校验调用方是否具备写入权限。
     * @param consumerPluginId 调用方插件标识。
     * @param allowedPlugins 已授权插件列表。
     * @returns 权限闸门结果。
     */
    private validatePermission(
        consumerPluginId: string,
        allowedPlugins: string[]
    ): GateResult {
        const errors: string[] = [];

        if (consumerPluginId === MEMORY_OS_PLUGIN_ID) {
            return { passed: true, gate: 'permission', errors };
        }

        if (!allowedPlugins.includes(consumerPluginId)) {
            errors.push(`插件 "${consumerPluginId}" 未被授权写入 facts/state，请在 MemoryOS 设置中授权`);
        }

        return { passed: errors.length === 0, gate: 'permission', errors };
    }
}
