# MemoryOS Authoritative Source Architecture

## 主链真相源

- facts / state / summaries / relationships 的结构化持久层：事实、世界状态、摘要、关系的 authoritative source。
- relationship_memory：关系状态的 authoritative storage。
- memory_recall_log：本轮 exact recall log 的 authoritative storage。
- memoryRecallLog：本轮实际进入召回主链后的 exact recall 结果。
- latestRecallExplanation：围绕 exact recall 结果生成的解释快照。
- memoryLifecycleIndex / memoryTuningProfile：生命周期与调参的 authoritative runtime state。
- logicalChatView：聊天视图与最近可见上下文的 authoritative source。

## 非真相源

- preview ranking
- section 内部临时评分缓存
- MemoryOSChatState 中已经删除的旧镜像副本字段
- 迁移阶段字段对运行读路径的影响

## 模块分级

| 模块 / 概念 | 等级 | 说明 |
| --- | --- | --- |
| src/injection/injection-manager.ts | authoritative | 只负责 orchestration、决策生成、渲染与主链写回。 |
| src/recall/recall-planner.ts | authoritative | 负责 intent -> source recipe / section budget / 排序窗口。 |
| src/recall/recall-assembler.ts | authoritative | 汇总多 source 候选，不再拼旁路文本。 |
| src/recall/recall-ranker.ts | authoritative | 两阶段排序、去重、冲突抑制、预算裁剪。 |
| src/core/recall-explanation.ts | authoritative | 只根据 actual recall log 生成 explanation。 |
| src/core/chat-state-manager.ts 中的 DB hydrate / persist | authoritative | 事实、摘要、关系、recall log 的主读主写入口。 |
| db.relationship_memory | authoritative | 关系状态的结构化真相源，空表时才回退到现算。 |
| db.memory_recall_log | authoritative | 实际注入对应的 exact recall log 真相源。 |
| db.memory_candidate_buffer | delete | v3 schema 已移除；候选缓冲不再落库。 |
| src/core/chat-state-manager.ts::recomputeRecallRanking | delete | 已移除，避免 preview ranking 再次旁路主链。 |
| MemoryMigrationStatus | delete | 已移除，不再作为 SDK、UI 或运行时状态的一部分。 |
| backfillMemoryMigration / runMemoryMigrationMaintenanceInternal | delete | 已移除，手动迁移维护入口不再暴露。 |
| MemoryOSChatState.memoryCandidateBuffer | delete | 已从状态类型、运行时回退逻辑和结构化表中移除。 |
| MemoryOSChatState.memoryRecallLog | delete | 已从状态类型与运行时回退逻辑移除，召回日志只保留在结构化表。 |
| MemoryOSChatState.relationshipStateMap | delete | 已从状态类型与运行时回退逻辑移除，关系状态改为结构化表/现算。 |
| stage-based DB mirror read branch | delete | Phase 3 已移除，读路径改为 DB 优先、旧副本兜底。 |
| automatic migration maintenance on load/status read | delete | Phase 3 已移除，迁移状态不再借机推动运行逻辑。 |

## 当前约束

- 新的 recall / relationship 结果必须先写 authoritative source，再由调试界面读取。
- debug 面板解释只能读取 latestRecallExplanation 与 memoryRecallLog，不能再自行推断另一套结果。
- 已删除的 compat 副本不得以任何形式重新进入“该注入什么”的决策链。