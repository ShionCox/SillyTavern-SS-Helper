import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * Scope 管理器 —— 支持 chat / character / global 三种数据隔离级别
 *
 * - chat：默认，按 chatKey 隔离
 * - character：角色卡专属，同 chat 可多角色
 * - global：跨聊天共享（如用户偏好设定）
 */

export type ScopeLevel = 'chat' | 'character' | 'global';

export interface ScopeContext {
    chatKey: string;
    characterId?: string;
    scope: ScopeLevel;
}

/**
 * 根据 scope 级别生成用于存储的实际 key 前缀
 */
export function buildScopePrefix(ctx: ScopeContext): string {
    switch (ctx.scope) {
        case 'global':
            return 'global::';
        case 'character':
            if (!ctx.characterId) {
                throw new Error('[ScopeManager] character scope 需要提供 characterId');
            }
            return `char::${ctx.characterId}::`;
        case 'chat':
        default:
            return `${ctx.chatKey}::`;
    }
}

/**
 * 将带 scope 的 key 转换为实际存储 key
 */
export function buildScopedKey(ctx: ScopeContext, key: string): string {
    return `${buildScopePrefix(ctx)}${key}`;
}

/**
 * 验证一个插件是否有权限访问指定 scope
 * global scope 需要额外授权
 */
export function validateScopeAccess(
    pluginId: string,
    scope: ScopeLevel,
    globalAllowedPlugins: string[] = [MEMORY_OS_PLUGIN_ID]
): { allowed: boolean; reason?: string } {
    if (scope === 'global' && !globalAllowedPlugins.includes(pluginId)) {
        return {
            allowed: false,
            reason: `插件 "${pluginId}" 未被授权访问 global scope`,
        };
    }
    return { allowed: true };
}
