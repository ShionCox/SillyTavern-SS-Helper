/**
 * MemoryOS 旧数据库迁移工具
 *
 * 检测旧 `stx_memory_os` IndexedDB 是否存在，
 * 如果存在，将所有表数据批量导入到统一的 `ss-helper-db` 中。
 * 迁移完成后标记 flag，避免重复执行。
 */
import Dexie from 'dexie';
import { db } from './db';
import { Logger } from '../../../SDK/logger';

const logger = new Logger('MemoryOS-Migration');
const MIGRATION_FLAG_KEY = 'stx_memory_os_migrated_to_ss_helper_db';

/** 旧 stx_memory_os 表名 → 新 ss-helper-db 表名（完全一致） */
const TABLE_MAP: readonly string[] = [
    'events',
    'facts',
    'world_state',
    'summaries',
    'templates',
    'audit',
    'meta',
    'worldinfo_cache',
    'template_bindings',
    'vector_chunks',
    'vector_embeddings',
    'vector_meta',
] as const;

/**
 * 执行一次性迁移：stx_memory_os → ss-helper-db
 * 仅在首次调用且旧数据库存在时执行。
 */
export async function migrateMemoryOSLegacyData(): Promise<void> {
    // 已迁移则跳过
    if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return;

    // 检查旧数据库是否存在
    const databases = await Dexie.getDatabaseNames();
    if (!databases.includes('stx_memory_os')) {
        localStorage.setItem(MIGRATION_FLAG_KEY, '1');
        return;
    }

    logger.info('检测到旧数据库 stx_memory_os，开始迁移...');

    try {
        const legacyDb = new Dexie('stx_memory_os');
        // 打开不指定 schema 以读取任意版本
        await legacyDb.open();

        let totalRows = 0;

        for (const tableName of TABLE_MAP) {
            if (!legacyDb.tables.find(t => t.name === tableName)) continue;

            const legacyTable = legacyDb.table(tableName);
            const rows = await legacyTable.toArray();
            if (rows.length === 0) continue;

            const targetTable = (db as any)[tableName] as Dexie.Table;
            if (!targetTable) continue;

            // 分批写入，每批 200 条
            const BATCH_SIZE = 200;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                await targetTable.bulkPut(batch);
            }

            totalRows += rows.length;
            logger.info(`  迁移表 ${tableName}: ${rows.length} 条`);
        }

        legacyDb.close();
        localStorage.setItem(MIGRATION_FLAG_KEY, '1');
        logger.success(`旧数据库迁移完成，共迁移 ${totalRows} 条记录`);
    } catch (err) {
        logger.error('旧数据库迁移失败:', err);
        // 不标记 flag，下次重试
    }
}
