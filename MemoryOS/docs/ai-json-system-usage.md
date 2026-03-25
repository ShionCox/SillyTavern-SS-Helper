# 统一 AI JSON 系统使用说明

## 目标

这套系统用于统一 MemoryOS 内部的结构化 AI 输出协议，解决两个问题：

- 冷启动时，要求模型一次性返回完整的初始化 JSON。
- 总结更新时，要求模型只返回允许更新的字段级更新项。

系统核心特点：

- 所有能力都通过命名空间注册表统一注册。
- 同一份注册表同时生成 strict schema、字段说明、示例 JSON、可更新项列表。
- 外部输出永远使用同一个外壳：

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

- 不再使用旧的 `path / selector / matchMode / 任意 value` 协议。

## 核心文件

- `MemoryOS/src/core/ai-json-types.ts`
  定义字段注册、命名空间注册、更新项、提示资源包等类型。
- `MemoryOS/src/core/ai-json-namespaces.ts`
  默认命名空间注册表，当前内置 `semantic_summary`、`role`、`memory_proposal`。
- `MemoryOS/src/core/ai-json-system.ts`
  注册中心、更新定义生成、输出校验、结果应用。
- `MemoryOS/src/core/ai-json-builder.ts`
  从注册表生成 `schema`、`exampleJson`、`usageGuide`、`systemInstructions`、`allowedUpdateKeys`。

## 核心概念

### 1. 命名空间

每个系统能力都按命名空间注册，统一挂到根 JSON 的 `namespaces` 下。

每个命名空间至少包含：

- `namespaceKey`
- `title`
- `description`
- `description`
  统一使用 `createAiJsonDescription(...)` 生成的说明条目数组；`type: "base"` 放基础说明，`type: "coldstart"`、`type: "summary"` 等放阶段说明
  按阶段填写命名空间备注，可选
- `fields`
- `example`

如果命名空间内部有“主记录”概念，还需要补充：

- `entityKey`
  例如 `actorKey`
- `entityCollectionField`
  例如 `profiles`
- `entityCollectionStorage`
  例如 `record` 或 `array`

### 2. 字段

每个字段通过 `AiJsonFieldDefinition` 注册，核心属性如下：

- `fieldKey`
- `type`
  只能是 `string`、`number`、`boolean`、`enum`、`object`、`list`
- `requiredOnInit`
- `nullable`
- `description`
  这里放什么
- `example`
  按阶段填写字段备注，可选
  冷启动时怎么填
- `example`
- `updatable`
- `updateMode`
  只能是 `replace_scalar`、`replace_object`、`upsert_item`、`remove_item`

### 3. 集合主键

凡是允许按条目更新的 `list` 字段，必须声明：

- `itemPrimaryKey`

例如 `role.profiles.items` 里，条目主键可以是 `name`。  
这样系统才能自动生成：

- `role.profiles.items.upsert_item`
- `role.profiles.items.remove_item`

如果一个可更新集合没有 `itemPrimaryKey`，注册时会直接报错。

### 4. updateKey

`updateKey` 是总结更新模式里的唯一判别键，由系统根据注册表自动生成。

例如：

- `role.summary.overview.replace_scalar`
- `role.profiles.displayName.replace_scalar`
- `role.profiles.items.upsert_item`
- `role.profiles.items.remove_item`

后续校验和应用更新时，都是以 `updateKey` 为准，不再解析自由路径。

## 使用流程

## 一、初始化注册中心

首次使用前调用：

```ts
import { initAiJsonSystem } from '../src/core/ai-json-system';

initAiJsonSystem();
```

这一步会加载 `ai-json-namespaces.ts` 里定义的默认命名空间。

## 二、构建给模型的提示资源

使用 `buildAiJsonPromptBundle`：

```ts
import { buildAiJsonPromptBundle } from '../src/core/ai-json-builder';

const bundle = buildAiJsonPromptBundle({
    mode: 'init',
    namespaceKeys: ['semantic_summary', 'role'],
});
```

返回内容包含：

- `schema`
  直接给结构化输出接口使用的 strict schema
- `exampleJson`
  带备注的示例 JSON
- `usageGuide`
  当前模式下的统一使用说明
- `systemInstructions`
  命名空间、字段、主键、可更新项说明
- `allowedUpdateKeys`
  当前模式允许使用的更新键列表

推荐把这些内容拼进系统提示词中。

如果要进一步节省 token，可以不给命名空间或字段填写阶段备注；系统会只保留基础说明，不会强制展开所有阶段备注。

## 三、校验模型输出

模型返回 JSON 后，先调用：

```ts
import { validateAiJsonOutput } from '../src/core/ai-json-system';

const validated = validateAiJsonOutput({
    mode: 'init',
    namespaceKeys: ['semantic_summary', 'role'],
    payload: modelOutput,
});
```

返回：

- `ok`
  是否通过
- `errors`
  失败原因
- `payload`
  归一化后的统一外壳；失败时为 `null`

## 四、应用到当前文档

校验通过后，调用：

```ts
import { applyAiJsonOutput } from '../src/core/ai-json-system';

const applied = applyAiJsonOutput({
    document: currentDocument,
    payload: validated.payload!,
    namespaceKeys: ['semantic_summary', 'role'],
});
```

返回：

- `document`
  应用后的最新文档
- `appliedPaths`
  本次实际应用的命名空间或更新键

## 冷启动模式

冷启动时：

- `mode` 必须是 `init`
- `namespaces` 必须完整填写
- `updates` 必须返回空数组

示例：

```json
{
  "mode": "init",
  "namespaces": {
    "semantic_summary": {
      "roleSummary": "艾莉卡·暮影是一名冷静克制的调查者。",
      "worldSummary": "暮光城是魔法衰落与工业崛起碰撞的核心战场。",
      "identityFacts": ["暮影巡礼者"],
      "worldRules": ["公开施法会留下可追踪痕迹。"],
      "hardConstraints": [],
      "cities": [],
      "locations": [],
      "entities": [],
      "nations": [],
      "regions": [],
      "factions": [],
      "calendarSystems": [],
      "currencySystems": [],
      "socialSystems": [],
      "culturalPractices": [],
      "historicalEvents": [],
      "dangers": [],
      "otherWorldDetails": [],
      "characterGoals": [],
      "relationshipFacts": [],
      "catchphrases": [],
      "relationshipAnchors": [],
      "styleCues": [],
      "nationDetails": [],
      "regionDetails": [],
      "cityDetails": [],
      "locationDetails": [],
      "ruleDetails": [],
      "constraintDetails": [],
      "socialSystemDetails": [],
      "culturalPracticeDetails": [],
      "historicalEventDetails": [],
      "dangerDetails": [],
      "entityDetails": [],
      "otherWorldDetailDetails": []
    },
    "role": {
      "profiles": [
        {
          "actorKey": "erika",
          "displayName": "艾莉卡·暮影",
          "aliases": [],
          "identityFacts": [],
          "originFacts": [],
          "relationshipFacts": [],
          "items": [],
          "equipments": [],
          "updatedAt": 1735689600000
        }
      ],
      "activeActorKey": "erika",
      "summary": {
        "overview": "当前重点角色是艾莉卡·暮影。",
        "updatedAt": 1735689600000
      }
    }
  },
  "updates": [],
  "meta": {
    "note": "只输出 JSON，不要输出解释文本"
  }
}
```

当前实际调用点：

- 冷启动提示构建：
  `MemoryOS/src/core/chat-semantic-ai-summary.ts`
- 冷启动结果校验与应用：
  `MemoryOS/src/core/chat-semantic-ai-summary.ts`

默认命名空间组合：

- `semantic_summary`
- `role`

## 总结更新模式

总结更新时：

- `mode` 必须是 `update`
- `namespaces` 必须返回空对象
- `updates` 必须返回字段级更新项数组

### 1. 标量或对象字段更新

适用于：

- `replace_scalar`
- `replace_object`

格式：

```json
{
  "updateKey": "role.summary.overview.replace_scalar",
  "namespaceKey": "role",
  "targetPrimaryKey": "",
  "fieldKey": "overview",
  "op": "replace_scalar",
  "value": "当前重点角色资料已补全。",
  "reason": "根据本轮总结更新角色系统概览"
}
```

说明：

- 如果是命名空间根字段，`targetPrimaryKey` 返回空字符串。
- 如果是实体内字段，例如 `role.profiles.displayName`，则 `targetPrimaryKey` 必须填写目标实体主键，例如 `erika`。

### 2. 集合条目更新

适用于：

- `upsert_item`
- `remove_item`

格式：

```json
{
  "updateKey": "role.profiles.items.upsert_item",
  "namespaceKey": "role",
  "targetPrimaryKey": "erika",
  "collectionFieldKey": "items",
  "itemPrimaryKeyField": "name",
  "itemPrimaryKeyValue": "旧地图",
  "op": "upsert_item",
  "item": {
    "kind": "item",
    "name": "旧地图",
    "detail": "新增了通往旧港仓库的暗道标记。"
  },
  "reason": "补充角色物品细节"
}
```

删除条目时不需要 `item`：

```json
{
  "updateKey": "role.profiles.equipments.remove_item",
  "namespaceKey": "role",
  "targetPrimaryKey": "erika",
  "collectionFieldKey": "equipments",
  "itemPrimaryKeyField": "name",
  "itemPrimaryKeyValue": "暮影短刃",
  "op": "remove_item",
  "reason": "该装备已经损毁"
}
```

### 3. 总结更新调用点

当前实际调用点：

- 提示构建：
  `MemoryOS/src/core/extract-manager.ts`
- 结果校验与应用：
  `MemoryOS/src/core/extract-manager.ts`

当前默认命名空间组合：

- `memory_proposal`

说明：

- `memory_proposal` 当前主要用于提案输出，不参与常规字段级更新。
- 其内部动态负载已改为真实对象字段：`facts[].value`、`facts[].provenance`、`patches[].value`、`summaries[].source.provenance`、`schemaChanges[].payload`。
- `memory_proposal` 现在在外层 envelope 校验通过后还会执行命名空间二级校验，并按模板 `valueSchema/patchSchemas` 校验对象结构。

## 新增一个命名空间

新增系统时，推荐按下面顺序接入。

### 1. 在 `ai-json-namespaces.ts` 增加字段定义

至少定义：

- 字段类型
- 字段说明
- 冷启动填写说明
- 总结更新说明
- 示例值
- 是否允许更新
- 更新模式

如果是可更新集合，必须额外声明：

- `itemPrimaryKey`

### 2. 组装 `AiJsonNamespaceDefinition`

至少补齐：

- `namespaceKey`
- `title`
- `description`
- `description`
- `fields`
- `example`

如果这个命名空间有主记录集合，例如角色、实体、任务列表，再补：

- `entityKey`
- `entityCollectionField`
- `entityCollectionStorage`

### 3. 提供归一化钩子

推荐在 `hooks` 中补两个能力：

- `normalizeInitDocument`
  冷启动写入前做归一化
- `afterApply`
  更新应用后再次归一化

常见用途：

- 数组去重
- 文本裁剪
- 枚举兜底
- `profiles` 数组转内部字典
- JSON 字符串转对象

说明：

- `description` 里的阶段条目不是必填项，只在确实需要区分阶段说明时再填写。
- 推荐只给真正需要额外提示的字段补备注。
- 如果后续增加新阶段，可以直接继续往 `description` 里追加新的 `{ type, text }` 条目，不需要修改统一外壳协议。

### 4. 重新初始化注册中心

调用：

```ts
initAiJsonSystem();
```

然后再通过：

```ts
buildAiJsonPromptBundle({
    mode: 'init',
    namespaceKeys: ['你的命名空间'],
});
```

检查是否已经生成：

- strict schema
- 示例 JSON
- 字段说明
- `allowedUpdateKeys`

## 当前内置命名空间

### semantic_summary

用途：

- 世界观总览
- 角色摘要
- 规则、限制、危险、历史、文化等细节

特点：

- 适合冷启动初始化
- 支持字段级更新
- 细节数组按对象结构严格约束

### role

用途：

- 角色名册
- 角色资料
- 角色摘要

特点：

- 命名空间主键是 `actorKey`
- 主记录集合字段是 `profiles`
- 冷启动时外部输出允许是数组
- 系统内部会归一化为字典结构

### memory_proposal

用途：

- 统一承载事实提案、补丁提案、摘要提案、结构建议

特点：

- 主要用于提案型输出
- 动态对象统一改为 JSON 字符串字段
- 当前不参与常规字段级总结更新

## 常见约束

- 所有命名空间都必须是固定结构，不支持运行时动态申请任意字段。
- 所有对象节点都必须满足 strict schema 的要求。
- 所有可更新集合都必须有明确主键。
- 冷启动负责完整初始化，不要在 `init` 模式里混入增量更新。
- 总结更新负责字段级修正，不要在 `update` 模式里回填整份 `namespaces`。
- 模型输出必须是纯 JSON，不要混入解释文本、Markdown 或代码块。

## 推荐接入模板

如果你只是要接一个新的结构化 AI 能力，推荐按这个顺序做：

1. 在 `ai-json-namespaces.ts` 设计字段和示例。
2. 保证所有集合字段的主键已经声明。
3. 调用 `buildAiJsonPromptBundle` 生成提示资源。
4. 把 `schema`、`usageGuide`、`systemInstructions`、`exampleJson` 拼到提示词。
5. 模型返回后先走 `validateAiJsonOutput`。
6. 校验通过后再走 `applyAiJsonOutput`。
7. 最后对目标业务对象做一次链路回归测试。
