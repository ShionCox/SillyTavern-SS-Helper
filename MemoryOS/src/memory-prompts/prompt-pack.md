<!-- section: COLD_START_SYSTEM -->

你正在执行结构化记忆系统的冷启动初始化任务。
你会收到一个 `sourceBundle`，其中固定包含：
- 当前角色卡：`name / description / personality / scenario / firstMessage / messageExample / creatorNotes / tags`
- Tavern 语义快照：`systemPrompt / firstMessage / authorNote / jailbreak / instruct / activeLorebooks`
- 用户 persona 快照
- 角色绑定世界书与已解析条目
- 最近事件文本窗口
- 触发原因

请严格遵循：
1. 仅提取有依据的结构化信息，禁止编造。
2. `worldBase.schemaId` 只能使用：`world_core_setting | world_hard_rule | world_global_state`。
3. `memoryRecords.schemaId` 与 `relationships` 必须可落库。
4. 若可判断世界模板，输出 `worldProfileDetection`；否则可留空。
5. 仅输出 JSON，不输出解释文本。

<!-- section: COLD_START_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "worldBase", "relationships", "memoryRecords"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string" },
    "identity": {
      "type": "object",
      "required": ["actorKey", "displayName", "aliases", "identityFacts", "originFacts", "traits"],
      "additionalProperties": false,
      "properties": {
        "actorKey": { "type": "string" },
        "displayName": { "type": "string" },
        "aliases": { "type": "array", "items": { "type": "string" } },
        "identityFacts": { "type": "array", "items": { "type": "string" } },
        "originFacts": { "type": "array", "items": { "type": "string" } },
        "traits": { "type": "array", "items": { "type": "string" } }
      }
    },
    "worldProfileDetection": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "primaryProfile": { "type": "string" },
        "secondaryProfiles": { "type": "array", "items": { "type": "string" } },
        "confidence": { "type": "number" },
        "reasonCodes": { "type": "array", "items": { "type": "string" } }
      }
    },
    "worldBase": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["schemaId", "title", "summary", "scope"],
        "additionalProperties": false,
        "properties": {
          "schemaId": {
            "type": "string",
            "enum": ["world_core_setting", "world_hard_rule", "world_global_state"]
          },
          "title": { "type": "string" },
          "summary": { "type": "string" },
          "scope": { "type": "string" }
        }
      }
    },
    "relationships": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["sourceActorKey", "targetActorKey", "summary"],
        "additionalProperties": false,
        "properties": {
          "sourceActorKey": { "type": "string" },
          "targetActorKey": { "type": "string" },
          "summary": { "type": "string" },
          "trust": { "type": "number" },
          "affection": { "type": "number" },
          "tension": { "type": "number" }
        }
      }
    },
    "memoryRecords": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["schemaId", "title", "summary"],
        "additionalProperties": false,
        "properties": {
          "schemaId": { "type": "string" },
          "title": { "type": "string" },
          "summary": { "type": "string" },
          "importance": { "type": "number" }
        }
      }
    }
  }
}
```

<!-- section: COLD_START_OUTPUT_SAMPLE -->

```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "char_erin",
    "displayName": "艾琳",
    "aliases": ["小艾"],
    "identityFacts": ["王都情报官"],
    "originFacts": ["来自北境边区"],
    "traits": ["冷静", "多疑"]
  },
  "worldProfileDetection": {
    "primaryProfile": "fantasy_magic",
    "secondaryProfiles": ["ancient_traditional"],
    "confidence": 0.86,
    "reasonCodes": ["contains_magic_system", "contains_kingdom_structure"]
  },
  "worldBase": [
    {
      "schemaId": "world_hard_rule",
      "title": "王都宵禁",
      "summary": "王都夜间禁止普通平民擅自出城。",
      "scope": "global"
    },
    {
      "schemaId": "world_global_state",
      "title": "前线补给紧张",
      "summary": "边境战线导致王都粮草与军械都在收紧配给。",
      "scope": "global"
    }
  ],
  "relationships": [
    {
      "sourceActorKey": "char_erin",
      "targetActorKey": "char_mc",
      "summary": "对对方保持观察与警惕。",
      "trust": 0.22,
      "affection": 0.08,
      "tension": 0.15
    }
  ],
  "memoryRecords": [
    {
      "schemaId": "actor_visible_event",
      "title": "首次接触",
      "summary": "艾琳首次与主角接触，并将其视为潜在观察对象。",
      "importance": 0.68
    }
  ]
}
```

<!-- section: SUMMARY_SYSTEM -->

你正在执行结构化记忆总结任务。
你会收到一个总结上下文，其中包含：
- `typeSchemas`: 每个 schemaId 的可写字段白名单（`editableFields`）
- `candidateRecords`: 本轮可引用的候选旧记录
- `worldProfileBias`: 世界模板偏置

请严格遵循：
1. `action` 仅可使用：`ADD | MERGE | UPDATE | INVALIDATE | DELETE | NOOP`。
2. `targetKind` 必须是精确 schemaId，禁止使用泛化类型（例如 `memory_record`）。
3. 只有出现在 `editableFields` 的字段可写，特别是 `fields.*` 也必须是显式路径。
4. 本任务是 mutation-only 语义；`NOOP` 仅代表“无结构变化”。
5. 若发生世界状态替换，请使用“旧状态 INVALIDATE + 新状态 ADD/UPDATE”的组合表达。
6. 仅输出 JSON，不输出解释文本。

<!-- section: SUMMARY_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "window", "actions"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string" },
    "window": {
      "type": "object",
      "required": ["fromTurn", "toTurn"],
      "additionalProperties": false,
      "properties": {
        "fromTurn": { "type": "integer" },
        "toTurn": { "type": "integer" }
      }
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "targetKind"],
        "additionalProperties": false,
        "properties": {
          "action": {
            "type": "string",
            "enum": ["ADD", "MERGE", "UPDATE", "INVALIDATE", "DELETE", "NOOP"]
          },
          "targetKind": { "type": "string" },
          "candidateId": { "type": "string" },
          "compareKey": { "type": "string" },
          "payload": {
            "type": "object",
            "additionalProperties": true
          },
          "reasonCodes": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  }
}
```

<!-- section: SUMMARY_OUTPUT_SAMPLE -->

```json
{
  "schemaVersion": "1.0.0",
  "window": {
    "fromTurn": 20,
    "toTurn": 28
  },
  "actions": [
    {
      "action": "INVALIDATE",
      "targetKind": "world_global_state",
      "candidateId": "cand_2",
      "payload": {
        "summary": "旧状态已被新法令取代。",
        "reasonCodes": ["policy_shift"],
        "supersededBy": "战时特别征召令"
      },
      "reasonCodes": ["state_replaced", "policy_shift"]
    },
    {
      "action": "ADD",
      "targetKind": "world_global_state",
      "payload": {
        "title": "战时特别征召令",
        "summary": "王都全面进入战时征召状态，兵员与后勤由军务署统一调配。",
        "scope": "global",
        "state": "active",
        "tags": ["war_mode", "global_state"]
      },
      "reasonCodes": ["new_state_takeover"]
    }
  ]
}
```
