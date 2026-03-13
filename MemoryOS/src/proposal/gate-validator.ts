import type { WorldTemplate } from '../template/types';
import type { ProposalEnvelope, GateResult } from './types';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * 四道闸门校验器
 * 所有 AI 产出必须通过全部四道闸门才能落盘
 *
 * 1. Schema 校验：JSON 格式、字段类型正确
 * 2. Diff 校验：变化为空则丢弃（避免无意义写入）
 * 3. 权限校验：consumer 是否有写权限
 * 4. 审计记录：由调用方（ProposalManager）负责
 */
export class GateValidator {
    private factsManager: FactsManager;
    private stateManager: StateManager;

    constructor(factsManager: FactsManager, stateManager: StateManager) {
        this.factsManager = factsManager;
        this.stateManager = stateManager;
    }

    /**
     * 执行全部闸门校验
     */
    async validate(
        envelope: ProposalEnvelope,
        activeTemplate: WorldTemplate | null,
        consumerPluginId: string,
        allowedPlugins: string[]
    ): Promise<GateResult[]> {
        const results: GateResult[] = [];

        // 闸门 1：Schema 校验
        results.push(this.validateSchema(envelope, activeTemplate));

        // 闸门 2：Diff 校验
        results.push(await this.validateDiff(envelope));

        // 闸门 3：权限校验
        results.push(this.validatePermission(consumerPluginId, allowedPlugins));

        return results;
    }

    /**
     * 闸门 1 - Schema 校验
     * 检查提议内容的结构是否合法
     */
    private validateSchema(
        envelope: ProposalEnvelope,
        activeTemplate: WorldTemplate | null
    ): GateResult {
        const errors: string[] = [];

        if (!envelope.ok) {
            errors.push('提议标记为失败 (ok=false)');
        }

        if (!envelope.proposal) {
            errors.push('提议体为空');
            return { passed: false, gate: 'schema', errors };
        }

        const { facts, patches, summaries } = envelope.proposal;

        // 校验 facts 结构
        if (facts) {
            for (let i = 0; i < facts.length; i++) {
                const f = facts[i];
                if (!f) continue;
                if (!f.type) errors.push(`facts[${i}] 缺少 type 字段`);
                if (f.value === undefined) errors.push(`facts[${i}] 缺少 value 字段`);

                // 如果有活跃模板，校验 type 是否在模板 factTypes 中
                if (activeTemplate && activeTemplate.factTypes.length > 0) {
                    const validTypes = activeTemplate.factTypes.map(ft => ft.type);
                    if (!validTypes.includes(f.type)) {
                        errors.push(`facts[${i}] type "${f.type}" 不在当前模板的 factTypes 中 [${validTypes.join(', ')}]`);
                    }
                }
            }
        }

        // 校验 patches 结构
        if (patches) {
            for (let i = 0; i < patches.length; i++) {
                const p = patches[i];
                if (!p) continue;
                if (!['add', 'replace', 'remove'].includes(p.op)) {
                    errors.push(`patches[${i}] op "${p.op}" 不合法`);
                }
                if (!p.path) errors.push(`patches[${i}] 缺少 path 字段`);
                if (p.op !== 'remove' && p.value === undefined) {
                    errors.push(`patches[${i}] op="${p.op}" 但缺少 value`);
                }
            }
        }

        // 校验 summaries 结构
        if (summaries) {
            for (let i = 0; i < summaries.length; i++) {
                const s = summaries[i];
                if (!s) continue;
                if (!['message', 'scene', 'arc'].includes(s.level)) {
                    errors.push(`summaries[${i}] level "${s.level}" 不合法`);
                }
                if (!s.content) errors.push(`summaries[${i}] 缺少 content`);
            }
        }

        return { passed: errors.length === 0, gate: 'schema', errors };
    }

    /**
     * 闸门 2 - Diff 校验
     * 检查提议是否产生实际变化，无变化则拒绝（避免无意义写入）
     */
    private async validateDiff(envelope: ProposalEnvelope): Promise<GateResult> {
        const errors: string[] = [];
        const { facts, patches, summaries } = envelope.proposal;

        let hasChange = false;

        // 检查 facts 的 diff
        if (facts && facts.length > 0) {
            for (const f of facts) {
                if (!f) continue;
                if (f.factKey) {
                    const existing = await this.factsManager.get(f.factKey);
                    if (existing && JSON.stringify(existing.value) === JSON.stringify(f.value)) {
                        continue; // 无变化
                    }
                }
                hasChange = true;
                break;
            }
        }

        // 检查 patches 的 diff
        if (!hasChange && patches && patches.length > 0) {
            for (const p of patches) {
                if (!p) continue;
                const existing = await this.stateManager.get(p.path);
                if (p.op === 'remove' && existing === null) continue;
                if (p.op !== 'remove' && JSON.stringify(existing) === JSON.stringify(p.value)) continue;
                hasChange = true;
                break;
            }
        }

        // summaries 总是视为有变化
        if (!hasChange && summaries && summaries.length > 0) {
            hasChange = true;
        }

        if (!hasChange) {
            errors.push('提议内容与现有数据完全一致，无实际变化');
        }

        return { passed: hasChange, gate: 'diff', errors };
    }

    /**
     * 闸门 3 - 权限校验
     * 检查 consumer 插件是否被授权写入 facts/state
     */
    private validatePermission(
        consumerPluginId: string,
        allowedPlugins: string[]
    ): GateResult {
        const errors: string[] = [];

        // MemoryOS 自身始终有权限
        if (consumerPluginId === MEMORY_OS_PLUGIN_ID) {
            return { passed: true, gate: 'permission', errors };
        }

        if (!allowedPlugins.includes(consumerPluginId)) {
            errors.push(`插件 "${consumerPluginId}" 未被授权写入 facts/state，请在 Memory OS 设置中授权`);
        }

        return { passed: errors.length === 0, gate: 'permission', errors };
    }
}
