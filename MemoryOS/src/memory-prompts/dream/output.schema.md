输出结构：

```json
{
  "narrative": "string",
  "highlights": ["string"],
  "proposedMutations": [
    {
      "mutationId": "string",
      "mutationType": "entry_create | entry_patch | relationship_patch",
      "confidence": 0.0,
      "reason": "string",
      "sourceWave": "recent | mid | deep | fused",
      "sourceEntryRefs": ["E1"],
      "preview": "string",
      "payload": {
        "targetRef": "string，entry_patch / relationship_patch 必须来自 writableTargets.patchTargets；entry_create 填空字符串",
        "title": "string，缺省时填空字符串",
        "entryType": "string，entry_create / entry_patch 必填有效类型，relationship_patch 不适用时填空字符串",
        "summary": "string，缺省时填空字符串",
        "detail": "string，缺省时填空字符串",
        "patch": "object，entry_patch / relationship_patch 只写变化字段；其余类型填 {}",
        "newRecord": "object，entry_create 的新记忆内容；其余类型填 {}",
        "keySeed": {
          "kind": "string，entry_create 的目标类型",
          "title": "string，稳定键标题种子",
          "qualifier": "string，地点、阶段、状态等限定语",
          "participants": ["string"]
        },
        "tags": ["string"],
        "reasonCodes": ["string"],
        "matchKeys": ["string"],
        "actorBindings": ["string"],
        "ongoing": false,
        "sourceActorKey": "string，非 relationship_patch 时填空字符串",
        "targetActorKey": "string，非 relationship_patch 时填空字符串",
        "relationTag": "string，非 relationship_patch 时填空字符串",
        "state": "string，非 relationship_patch 时填空字符串",
        "trust": 0,
        "affection": 0,
        "tension": 0,
        "participants": ["string"]
      },
      "explain": {
        "sourceWave": "recent | mid | deep | fused",
        "sourceEntryRefs": ["E1"],
        "sourceNodeRefs": ["N1"],
        "bridgeNodeRefs": ["N2"],
        "explanationSteps": ["step 1", "step 2"],
        "confidenceBreakdown": {
          "retrieval": 0.0,
          "activation": 0.0,
          "novelty": 0.0,
          "repetitionPenalty": 0.0,
          "final": 0.0
        }
      }
    }
  ]
}
```

字段要求：
- `narrative`：中等长度，压缩梦境叙事。
- `highlights`：2 到运行时上限条，去重，便于 UI 展示。
- `proposedMutations`：高价值、低幻觉风险提案，数量受运行时上限控制；只有能确定正式主记忆类型时才输出 `entry_create`。
- `sourceEntryRefs / sourceNodeRefs / bridgeNodeRefs / targetRef`：只能使用当前 Prompt DTO 中提供的短引用别名，不得输出真实内部 ID。
- `preview`：一句话可读。
- `reason`：偏审批语言，不偏文学解释。
- `explanationSteps`：简洁、可追溯。
- `entry_patch / relationship_patch`：必须从 `writableTargets.patchTargets` 选择 `targetRef`，不得输出 `entryId` 或 `relationshipId`。
- `entry_patch / relationship_patch`：`payload.patch` 只包含发生变化且 `editablePaths` 允许的字段；不要复制未变化的旧内容。
- `entry_create`：必须输出 `payload.keySeed` 和 `payload.newRecord`；不得输出 `compareKey`、`entityKey` 或真实内部 ID，系统会生成稳定键。
- 严格模式下 `payload` 内所有字段都必须给出；不适用的字符串填 `""`，数组填 `[]`，对象填 `{}`，数值填 `0`，布尔填 `false`。
- 梦境洞察、象征性联想、低置信弱推断只写入 `narrative` / `highlights`，不要用 `entryType: "other"` 创建记忆块。
- `entry_create` 的 `entryType` 必须是 `event`、`task`、`scene_shared_state`、`world_global_state`、`world_hard_rule`、`item`、`organization`、`city`、`nation`、`location` 等明确类型之一。
