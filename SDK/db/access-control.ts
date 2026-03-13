import { db } from './database';
import type { DBChatPluginState, DBChatPluginRecord, DBChatDocumentShared } from './database';
import { Logger } from '../logger';

const logger = new Logger('SDK-AccessControl');

/**
 * 跨插件访问控制
 *
 * 规则：
 * - 所有插件可读：chat_documents.shared，其他插件的 summary
 * - 插件只能写：自己 pluginId 的 chat_plugin_state / chat_plugin_records
 * - 公共区 shared 通过 patchSdkChatShared 写入
 * - 修改其他插件数据必须通过 RPC 能力调用
 */

/** 读取任意插件的 summary（只返回 summary 字段，不返回完整 state） */
export async function readPluginChatSummary(
    pluginId: string,
    chatKey: string,
): Promise<Record<string, unknown> | null> {
    const row = await db.chat_plugin_state.get([pluginId, chatKey]);
    return row?.summary ?? null;
}

/** 读取指定聊天的公共 shared 数据 */
export async function readChatShared(chatKey: string): Promise<DBChatDocumentShared | null> {
    const doc = await db.chat_documents.get(chatKey);
    return doc?.shared ?? null;
}

/** 读取指定聊天中特定插件的 signal */
export async function readPluginSignal(
    chatKey: string,
    pluginId: string,
): Promise<Record<string, unknown> | null> {
    const doc = await db.chat_documents.get(chatKey);
    return doc?.shared?.signals?.[pluginId] ?? null;
}

/** 列出指定聊天中所有插件的 signal 摘要 */
export async function listAllPluginSignals(
    chatKey: string,
): Promise<Record<string, Record<string, unknown>>> {
    const doc = await db.chat_documents.get(chatKey);
    return doc?.shared?.signals ?? {};
}

/**
 * 验证写入权限：确保 callerPluginId 只写自己的数据
 * 返回 true 表示允许，false 表示拒绝
 */
export function validateWriteAccess(callerPluginId: string, targetPluginId: string): boolean {
    if (callerPluginId !== targetPluginId) {
        logger.warn(
            `[AccessControl] 拒绝写入: ${callerPluginId} 试图写 ${targetPluginId} 的数据，请使用 RPC 能力调用。`,
        );
        return false;
    }
    return true;
}
