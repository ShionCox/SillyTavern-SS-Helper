/**
 * 凭据管理器 (Vault) —— 密钥集中安全存储
 * 所有 API Key 集中在 LLM Hub 管理，Memory OS 和其他插件不保存明文
 *
 * 存储策略：IndexedDB 加密存储（简单的 base64 混淆 + 前缀标识）
 * 生产环境建议替换为 ST 提供的 secure storage API
 */

interface VaultEntry {
    providerId: string;
    key: string;        // 混淆后的密钥
    createdAt: number;
    updatedAt: number;
}

export class VaultManager {
    private static readonly DB_NAME = 'stx_llm_vault';
    private static readonly STORE_NAME = 'credentials';
    private static readonly OBFUSCATION_PREFIX = 'stx_v1_';

    private cache: Map<string, string> = new Map();
    private dbReady: Promise<IDBDatabase>;

    constructor() {
        this.dbReady = this.initDB();
    }

    /** 初始化 IndexedDB */
    private initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(VaultManager.DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(VaultManager.STORE_NAME)) {
                    db.createObjectStore(VaultManager.STORE_NAME, { keyPath: 'providerId' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /** 存储凭据 */
    async setCredential(providerId: string, apiKey: string): Promise<void> {
        const obfuscated = this.obfuscate(apiKey);
        const entry: VaultEntry = {
            providerId,
            key: obfuscated,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const db = await this.dbReady;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VaultManager.STORE_NAME, 'readwrite');
            tx.objectStore(VaultManager.STORE_NAME).put(entry);
            tx.oncomplete = () => {
                this.cache.set(providerId, apiKey);
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    /** 获取凭据（优先从缓存读取） */
    async getCredential(providerId: string): Promise<string | null> {
        // 缓存命中
        const cached = this.cache.get(providerId);
        if (cached) return cached;

        // 从 IndexedDB 读取
        const db = await this.dbReady;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VaultManager.STORE_NAME, 'readonly');
            const request = tx.objectStore(VaultManager.STORE_NAME).get(providerId);
            request.onsuccess = () => {
                const entry = request.result as VaultEntry | undefined;
                if (entry) {
                    const apiKey = this.deobfuscate(entry.key);
                    this.cache.set(providerId, apiKey);
                    resolve(apiKey);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /** 删除凭据 */
    async removeCredential(providerId: string): Promise<void> {
        const db = await this.dbReady;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VaultManager.STORE_NAME, 'readwrite');
            tx.objectStore(VaultManager.STORE_NAME).delete(providerId);
            tx.oncomplete = () => {
                this.cache.delete(providerId);
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    /** 列出所有已存储的 Provider Id */
    async listProviderIds(): Promise<string[]> {
        const db = await this.dbReady;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(VaultManager.STORE_NAME, 'readonly');
            const request = tx.objectStore(VaultManager.STORE_NAME).getAllKeys();
            request.onsuccess = () => resolve(request.result as string[]);
            request.onerror = () => reject(request.error);
        });
    }

    /** 检查凭据是否存在 */
    async hasCredential(providerId: string): Promise<boolean> {
        const key = await this.getCredential(providerId);
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
