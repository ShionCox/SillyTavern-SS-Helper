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
      "payload": {},
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
