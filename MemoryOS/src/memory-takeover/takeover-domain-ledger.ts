/**
 * 功能：领域账本入口 — 重导出本地归约层核心函数。
 *
 * 这些函数构成新架构的"本地归约主链骨架"：
 * - buildTakeoverSectionDigests: 构建分段摘要
 * - reduceTakeoverActors/Entities/Relationships/Tasks/World: 领域级本地归约
 * - mapTakeoverRecordsToLedger: 映射为 pipeline 账本记录
 *
 * 本地归约是默认主链的必经步骤，而不是 fallback。
 */
export {
    buildTakeoverSectionDigests,
    mapTakeoverRecordsToLedger,
    reduceTakeoverActors,
    reduceTakeoverEntities,
    reduceTakeoverFacts,
    reduceTakeoverRelationships,
    reduceTakeoverTasks,
    reduceTakeoverWorld,
} from './takeover-section-reducer';
