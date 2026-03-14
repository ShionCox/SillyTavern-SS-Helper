/**
 * 凭据管理器 (Vault) —— 密钥集中安全存储
 * 所有 API Key 集中在 LLM Hub 管理，Memory OS 和其他插件不保存明文
 *
 * 存储策略：统一 ss-helper-db Dexie 表 `llm_credentials`
 * 密钥使用 base64 混淆 + 前缀标识（生产环境建议替换为 ST secure storage API）
 */
import Dexie from 'dexie';
import { db, type DBLlmCredential } from '../../../SDK/db';
import { Logger } from '../../../SDK/logger';

const logger = new Logger('LLMHub-Vault');
const MIGRATION_FLAG_KEY = 'stx_llm_vault_migrated_to_ss_helper_db';

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
                    key: row.key,
                    createdAt: row.createdAt ?? Date.now(),
                    updatedAt: row.updatedAt ?? Date.now(),
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
            key: obfuscated,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
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
            const apiKey = this.deobfuscate(entry.key);
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

    private deobfuscate(obfuscated: string): string {
        const encoded = obfuscated.slice(VaultManager.OBFUSCATION_PREFIX.length);
        return decodeURIComponent(atob(encoded));
    }
}
