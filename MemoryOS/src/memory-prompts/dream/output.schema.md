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
        "entryId": "string，缺省时填空字符串",
        "title": "string，缺省时填空字符串",
        "entryType": "string，entry_create / entry_patch 必填有效类型，relationship_patch 不适用时填空字符串",
        "summary": "string，缺省时填空字符串",
        "detail": "string，缺省时填空字符串",
        "fieldsJson": "{\"key\":\"value\"}，动态字段必须写成 JSON 对象字符串，无内容时写 {}",
        "detailPayloadJson": "{\"extra\":\"value\"}，扩展详情必须写成 JSON 对象字符串，无内容时写 {}",
        "tags": ["string"],
        "reasonCodes": ["string"],
        "compareKey": "string，缺省时填空字符串",
        "entityKey": "string，缺省时填空字符串",
        "matchKeys": ["string"],
        "actorBindings": ["string"],
        "ongoing": false,
        "relationshipId": "string，非 relationship_patch 时填空字符串",
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
- `proposedMutations`：高价值、低幻觉风险提案，数量受运行时上限控制。
- `sourceEntryRefs / sourceNodeRefs / bridgeNodeRefs`：只能使用当前 Prompt DTO 中提供的短引用别名，不得输出真实内部 ID。
- `preview`：一句话可读。
- `reason`：偏审批语言，不偏文学解释。
- `explanationSteps`：简洁、可追溯。
- `payload.fieldsJson / payload.detailPayloadJson`：必须是合法 JSON 对象字符串，不能直接输出自由对象。
- 严格模式下 `payload` 内所有字段都必须给出；不适用的字符串填 `""`，数组填 `[]`，数值填 `0`，布尔填 `false`，对象字符串填 `{}`。
