import { db, type DBWorldProfileBinding } from '../db/db';
import type { WorldProfileBinding } from '../types';

/**
 * 功能：读取指定聊天的世界模板绑定。
 * @param chatKey 聊天键。
 * @returns 世界模板绑定；不存在时返回 null。
 */
export async function getWorldProfileBinding(chatKey: string): Promise<WorldProfileBinding | null> {
    const normalizedChatKey = normalizeText(chatKey);
    if (!normalizedChatKey) {
        return null;
    }
    const row = await db.world_profile_bindings.get(normalizedChatKey);
    return row ? mapBinding(row) : null;
}

/**
 * 功能：保存指定聊天的世界模板绑定。
 * @param input 绑定输入。
 * @returns 保存后的绑定对象。
 */
export async function putWorldProfileBinding(input: {
    chatKey: string;
    primaryProfile: string;
    secondaryProfiles?: string[];
    confidence?: number;
    reasonCodes?: string[];
    detectedFrom?: string[];
}): Promise<WorldProfileBinding> {
    const chatKey = normalizeText(input.chatKey);
    const existing = chatKey ? await db.world_profile_bindings.get(chatKey) : null;
    const now = Date.now();
    const detectedFrom = dedupeStrings(input.detectedFrom ?? []);
    const row: DBWorldProfileBinding = {
        chatKey,
        primaryProfile: normalizeText(input.primaryProfile) || 'urban_modern',
        secondaryProfiles: dedupeStrings(input.secondaryProfiles ?? []),
        confidence: clamp01(input.confidence ?? 0),
        reasonCodes: dedupeStrings(input.reasonCodes ?? []),
        detectedFrom,
        sourceHash: buildWorldProfileSourceHash({
            chatKey,
            primaryProfile: input.primaryProfile,
            secondaryProfiles: input.secondaryProfiles ?? [],
            detectedFrom,
        }),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    await db.world_profile_bindings.put(row);
    return mapBinding(row);
}

/**
 * 功能：删除指定聊天的世界模板绑定。
 * @param chatKey 聊天键。
 */
export async function deleteWorldProfileBinding(chatKey: string): Promise<void> {
    const normalizedChatKey = normalizeText(chatKey);
    if (!normalizedChatKey) {
        return;
    }
    await db.world_profile_bindings.delete(normalizedChatKey);
}

/**
 * 功能：构建世界模板绑定的源哈希。
 * @param input 哈希输入。
 * @returns 32 位十六进制哈希。
 */
export function buildWorldProfileSourceHash(input: {
    chatKey: string;
    primaryProfile: string;
    secondaryProfiles: string[];
    detectedFrom: string[];
}): string {
    const seed = [
        normalizeText(input.chatKey),
        normalizeText(input.primaryProfile),
        dedupeStrings(input.secondaryProfiles).join('|'),
        dedupeStrings(input.detectedFrom).join('|'),
    ].join('::');
    let hash = 5381;
    for (let index = 0; index < seed.length; index += 1) {
        hash = ((hash << 5) + hash) ^ seed.charCodeAt(index);
    }
    return `wp:${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：映射数据库行到业务对象。
 * @param row 数据库行。
 * @returns 业务绑定对象。
 */
function mapBinding(row: DBWorldProfileBinding): WorldProfileBinding {
    return {
        chatKey: normalizeText(row.chatKey),
        primaryProfile: normalizeText(row.primaryProfile) || 'urban_modern',
        secondaryProfiles: dedupeStrings(row.secondaryProfiles ?? []),
        confidence: clamp01(row.confidence),
        reasonCodes: dedupeStrings(row.reasonCodes ?? []),
        detectedFrom: dedupeStrings(row.detectedFrom ?? []),
        sourceHash: normalizeText(row.sourceHash),
        createdAt: Math.max(0, Number(row.createdAt ?? 0) || 0),
        updatedAt: Math.max(0, Number(row.updatedAt ?? 0) || 0),
    };
}

/**
 * 功能：标准化文本。
 * @param value 原始值。
 * @returns 标准化文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重后的字符串数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：限制数值到 0~1。
 * @param value 原始数值。
 * @returns 限制后的数值。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}
