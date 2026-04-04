# DreamReviewDialog 交互说明

## 目标

用于承接 Dream Pipeline v1 的人工审批环节，确保梦境输出只作为候选，不直接污染主记忆链。

## 界面分区

### 1. 梦境概览

- `dreamId`
- 触发原因
- 创建时间
- 召回总数

### 2. 梦境叙事

- 展示 `narrative`
- 展示 `highlights`

### 3. 来源记忆

- 按 `recent / mid / deep` 三组分别展示
- 每条来源显示：
  - 标题
  - entryId
  - 摘要
  - score
  - tags

### 4. mutation 审批区

- 每条提案单独展示
- 默认勾选高于阈值的提案
- 每条提案显示：
  - `mutationType`
  - `preview`
  - `confidence`
  - `reason`
  - `sourceEntryIds`
  - `payload` JSON 预览

## 操作按钮

- `应用所选`
  - 仅将当前勾选的 mutation 交给 `DreamMutationApplier`
- `全部拒绝`
  - 写入 rejection 审批记录
  - 不修改主记忆表
- `稍后处理`
  - 保留 `pending` 审批状态
  - 当前不写回主链

## 第一阶段约束

- 不允许绕过审批弹窗直接写入
- 不允许 delete
- 单次 dream mutation 数量上限为 8
- mutation 必须保留 `sourceEntryIds`
- 写回后必须记录 rollback 快照
