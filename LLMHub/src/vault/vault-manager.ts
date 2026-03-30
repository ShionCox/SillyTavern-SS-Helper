/**
 * 凭据管理器 (Vault) —— 密钥集中安全存储
 * 所有 API Key 集中在 LLM Hub 管理，Memory OS 和其他插件不保存明文
 *
 * 存储策略：统一 ss-helper-db Dexie 表 `llm_credentials`
 * 密钥使用 base64 混淆 + 前缀标识（生产环境建议替换为 ST secure storage API）
 */
import Dexie from 'dexie';
import { db, type DBLlmCredential } from '../../../SDK/db';
import { logger } from '../index';

const MIGRATION_FLAG_KEY = 'stx_llm_vault_migrated_to_ss_helper_db';

interface StoredCredentialPayload {
    apiKey?: string;
    key?: string;
    createdAt?: number;
}

export class VaultManager {
    private static readonly OBFUSCATION_PREFIX = 'stx_v1_';

    private cache: Map<string, string> = new Map();
    private migrationDone: Promise<void>;

    constructor() {
        this.migrationDone = this.migrateLegacyVault();
    }

    /**
     * 一次性迁移：旧 stx_llm_vault IndexedDB → ss-helper-db.llm_credentials
     */
    private async migrateLegacyVault(): Promise<void> {
        if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return;

        try {
            const databases = await Dexie.getDatabaseNames();
            if (!databases.includes('stx_llm_vault')) {
                localStorage.setItem(MIGRATION_FLAG_KEY, '1');
                return;
            }

            logger.info('检测到旧凭据库 stx_llm_vault，开始迁移...');

            const legacyDb = new Dexie('stx_llm_vault');
            legacyDb.version(1).stores({ credentials: 'providerId' });
            await legacyDb.open();

            const rows = await legacyDb.table('credentials').toArray();
            if (rows.length > 0) {
                const entries: DBLlmCredential[] = rows.map((row: any) => ({
                    providerId: row.resourceId ?? row.providerId,
                    updatedAt: row.updatedAt ?? Date.now(),
                    apiKeyMasked: this.maskApiKey(String(row.key ?? '')),
                    payload: {
                        apiKey: String(row.key ?? ''),
                        createdAt: Number(row.createdAt ?? Date.now()),
                    },
                }));
                await db.llm_credentials.bulkPut(entries);
                logger.success(`迁移了 ${entries.length} 条凭据记录`);
            }

            legacyDb.close();
            localStorage.setItem(MIGRATION_FLAG_KEY, '1');
        } catch (err) {
            logger.error('旧凭据库迁移失败:', err);
        }
    }

    /** 存储凭据 */
    async setCredential(resourceId: string, apiKey: string): Promise<void> {
        await this.migrationDone;
        const obfuscated = this.obfuscate(apiKey);
        const now = Date.now();

        const existing = await db.llm_credentials.get(resourceId);
        const entry: DBLlmCredential = {
            providerId: resourceId,
            updatedAt: now,
            apiKeyMasked: this.maskApiKey(apiKey),
            payload: {
                apiKey: obfuscated,
                createdAt: this.readCreatedAt(existing) ?? now,
            },
        };

        await db.llm_credentials.put(entry);
        this.cache.set(resourceId, apiKey);
    }

    /** 获取凭据（优先从缓存读取） */
    async getCredential(resourceId: string): Promise<string | null> {
        await this.migrationDone;
        const cached = this.cache.get(resourceId);
        if (cached) return cached;

        const entry = await db.llm_credentials.get(resourceId);
        if (entry) {
            const apiKey = this.readStoredApiKey(entry);
            if (!apiKey) {
                return null;
            }
            this.cache.set(resourceId, apiKey);
            return apiKey;
        }
        return null;
    }

    /** 删除凭据 */
    async removeCredential(resourceId: string): Promise<void> {
        await this.migrationDone;
        await db.llm_credentials.delete(resourceId);
        this.cache.delete(resourceId);
    }

    /** 列出所有已存储的资源 ID */
    async listResourceIds(): Promise<string[]> {
        await this.migrationDone;
        const keys = await db.llm_credentials.toCollection().primaryKeys();
        return keys as string[];
    }

    /** 检查凭据是否存在 */
    async hasCredential(resourceId: string): Promise<boolean> {
        const key = await this.getCredential(resourceId);
        return key !== null;
    }

    // --- 混淆/反混淆（简易方案，生产环境应替换为加密） ---

    private obfuscate(plain: string): string {
        return VaultManager.OBFUSCATION_PREFIX + btoa(encodeURIComponent(plain));
    }

    /**
     * 功能：读取当前凭据记录中的创建时间。
     * @param entry 凭据记录
     * @returns 创建时间
     */
    private readCreatedAt(entry: DBLlmCredential | undefined): number | undefined {
        const payload = (entry?.payload ?? {}) as StoredCredentialPayload;
        return typeof payload.createdAt === 'number' ? payload.createdAt : undefined;
    }

    /**
     * 功能：读取并解码存储的密钥。
     * @param entry 凭据记录
     * @returns 解码后的密钥
     */
    private readStoredApiKey(entry: DBLlmCredential): string | null {
        const payload = (entry.payload ?? {}) as StoredCredentialPayload;
        const storedValue = String(payload.apiKey ?? payload.key ?? '').trim();
        if (!storedValue) {
            return null;
        }
        return this.deobfuscate(storedValue);
    }

    /**
     * 功能：生成用于展示的掩码密钥。
     * @param apiKey 原始密钥
     * @returns 掩码后的密钥
     */
    private maskApiKey(apiKey: string): string {
        const normalized = String(apiKey ?? '').trim();
        if (!normalized) {
            return '';
        }
        if (normalized.length <= 8) {
            return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
        }
        return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
    }

    private deobfuscate(obfuscated: string): string {
        if (!obfuscated.startsWith(VaultManager.OBFUSCATION_PREFIX)) {
            return obfuscated;
        }
        const encoded = obfuscated.slice(VaultManager.OBFUSCATION_PREFIX.length);
        return decodeURIComponent(atob(encoded));
    }
}
