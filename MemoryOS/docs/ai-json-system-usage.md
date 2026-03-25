# 统一 AI JSON 系统使用说明（单协议）

## 目标

MemoryOS 现已统一为单一最终写入协议：

- 冷启动使用 `init` 模式，命名空间：`semantic_summary`、`role`
- 增量写入使用 `update` 模式，最终写入域：`memory_facts`、`world_state`、`memory_summaries`、`schema_changes`、`entity_resolutions`
- 最终写入统一走 `AiJsonOutputEnvelope(mode='update', updates[])`

旧中间层协议已移除，不再保留兼容路径。

## 输出外壳

```json
{
  "mode": "init | update",
  "namespaces": {},
  "updates": [],
  "meta": {
    "note": ""
  }
}
```

## 核心流程

1. 初始化注册中心

```ts
import { initAiJsonSystem } from '../src/core/ai-json-system';

initAiJsonSystem();
```

2. 生成提示资源

```ts
import { buildAiJsonPromptBundle } from '../src/core/ai-json-builder';

const initBundle = buildAiJsonPromptBundle({
  mode: 'init',
  namespaceKeys: ['semantic_summary', 'role'],
});

const updateBundle = buildAiJsonPromptBundle({
  mode: 'update',
  namespaceKeys: ['memory_facts', 'world_state', 'memory_summaries', 'schema_changes', 'entity_resolutions'],
});
```

3. 校验模型输出

```ts
import { validateAiJsonOutput } from '../src/core/ai-json-system';

const validated = validateAiJsonOutput({
  mode: 'update',
  namespaceKeys: ['memory_facts', 'world_state', 'memory_summaries', 'schema_changes', 'entity_resolutions'],
  payload: modelOutput,
});
```

4. 应用更新协议

```ts
import { applyAiJsonOutput } from '../src/core/ai-json-system';

const applied = applyAiJsonOutput({
  document: currentDocument,
  payload: validated.payload!,
  namespaceKeys: ['memory_facts', 'world_state', 'memory_summaries', 'schema_changes', 'entity_resolutions'],
});
```

## 模式约束

### init

- `mode` 必须是 `init`
- `namespaces` 必须完整
- `updates` 必须为空数组

### update

- `mode` 必须是 `update`
- `namespaces` 必须为空对象
- `updates` 必须至少 1 条
- 更新项必须使用已注册 `updateKey`

## 当前内置命名空间

- 冷启动域：
  - `semantic_summary`
  - `role`
- 增量写入域：
  - `memory_facts`
  - `world_state`
  - `memory_summaries`
  - `schema_changes`
  - `entity_resolutions`

## 约束

- 输出必须是纯 JSON 对象
- 不允许输出 Markdown、解释文本、代码块
- 不允许使用未注册字段和未注册更新键
- 可更新集合必须声明主键（`itemPrimaryKey`）
