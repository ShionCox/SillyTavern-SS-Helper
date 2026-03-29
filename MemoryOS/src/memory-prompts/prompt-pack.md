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
4. 每条 `relationships` 都必须完整填写：`sourceActorKey / targetActorKey / participants / relationTag / state / summary / trust / affection / tension`，不能省略字段，不能只写部分字段。
5. 系统已经预置固定的用户角色卡，`actorKey` 固定为 `user`；不要在 `actorCards` 中重复输出 `user`，只需在关系里直接引用它。
6. 只要某个非 `user` 角色出现在 `relationships` 中，就必须在 `actorCards` 中提供同 `actorKey` 的角色卡。
7. 每条 `actorCards` 都必须完整填写：`actorKey / displayName / aliases / identityFacts / originFacts / traits`，其中 `displayName` 必须是可直接展示的人名或称呼，不能为空，不能直接照抄下划线风格的 `actorKey`。
8. `participants` 必须是字符串数组，且至少包含 `sourceActorKey` 与 `targetActorKey`。
9. `relationTag` 必须从以下预设中单选其一：`亲人 | 朋友 | 盟友 | 恋人 | 暧昧 | 师徒 | 上下级 | 竞争者 | 情敌 | 宿敌 | 陌生人`，禁止自由发明新标签。
10. `state` 必须是一句简体中文的关系现状描述，表达当前关系状态，不要留空，不要只重复键名。
11. 数值字段 `trust / affection / tension` 必须填写 `0~1` 之间的小数。
12. 若可判断世界模板，则输出 `worldProfileDetection`；否则可留空。
13. 当关系对象指向当前用户时，`targetActorKey` 或 `participants` 中必须固定使用 `user`，不要自行发明 `user_xxx`、`player_xxx`、用户名拼接键等变体。
14. 严格参照输出示例的字段结构与完整度。
15. 已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，所有自然语言字段都必须优先使用这个称呼，不要写成“用户”或“主角”；仅结构化锚点继续使用 `user`。
16. 仅输出 JSON，不输出解释文本。

<!-- section: COLD_START_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "worldBase", "relationships", "memoryRecords"],
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
    "actorCards": {
      "type": "array",
      "items": {
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
        "required": ["sourceActorKey", "targetActorKey", "participants", "relationTag", "state", "summary", "trust", "affection", "tension"],
        "additionalProperties": false,
        "properties": {
          "sourceActorKey": { "type": "string" },
          "targetActorKey": { "type": "string" },
          "participants": {
            "type": "array",
            "minItems": 2,
            "items": { "type": "string" }
          },
          "relationTag": {
            "type": "string",
            "enum": ["亲人", "朋友", "盟友", "恋人", "暧昧", "师徒", "上下级", "竞争者", "情敌", "宿敌", "陌生人"]
          },
          "state": { "type": "string" },
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
  "actorCards": [
    {
      "actorKey": "captain_ron",
      "displayName": "罗恩队长",
      "aliases": ["老罗恩"],
      "identityFacts": ["王都宵禁卫队队长"],
      "originFacts": ["长期驻守北城门"],
      "traits": ["强硬", "守规矩"]
    }
  ],
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
      "targetActorKey": "user",
      "participants": ["char_erin", "user"],
      "relationTag": "陌生人",
      "state": "艾琳把{{userDisplayName}}视为需要持续观察的可疑对象，保持距离但暂未敌对。",
      "summary": "艾琳刚与{{userDisplayName}}接触后，对其保持明显戒备与观察，尚未建立稳定信任。",
      "trust": 0.22,
      "affection": 0.08,
      "tension": 0.15
    }
  ],
  "memoryRecords": [
    {
      "schemaId": "actor_visible_event",
      "title": "首次接触",
      "summary": "艾琳首次与{{userDisplayName}}接触，并将其视为潜在观察对象。",
      "importance": 0.68
    }
  ]
}
```

<!-- section: SUMMARY_PLANNER_SYSTEM -->

你正在执行结构化记忆系统的总结 Planner 阶段。
你会收到一份轻量输入，包含以下字段：
- `window`：本轮未总结区间，含 `fromTurn`、`toTurn`、`turnCount`、`windowFacts`（事实帧列表）、`evidenceSnippets`（证据片段）
- `rollingDigest`：上一阶段的滚动摘要，含 `stableContext`、`taskState`、`relationState`、`unresolvedQuestions`
- `signalPack`：合并后的候选信号，含 `candidateTypes`、`focusPoints`、`evidenceSignals`、`shouldUpdate`
- `candidateCards`：与当前区间相关的已有记忆短卡片（`id`、`type`、`brief`、`entities`、`state`）
- `allowedTypes`：本轮允许处理的记忆类型列表
- `repairedFacts`：经残缺修复后的强事实列表（已通过本地验证，可信度高）
- `signals`：降级弱信号列表（语义不完整但有参考价值，仅作弱提示）
- `constraints`：硬性约束规则

请严格遵循：
1. 你的职责是判断"是否需要更新长期记忆"，而不是直接输出 mutation 动作。
2. `should_update=false` 是完全合法的答案；当当前区间只是闲聊、一次性情绪、短时动作、或没有稳定新事实时，应优先返回 `false`。
3. `focus_types` 只填写本轮真正值得处理的类型，必须来自 `allowedTypes`，尽量精简。
4. `entities` 只填写当前区间反复出现、且对召回已有记忆有帮助的实体键或实体名。
5. `topics` 用简体中文概括本轮主题，控制在少量高信号短语内。
6. `reasons` 必须是简体中文，说明为什么值得更新，或为什么应返回 `NOOP`。
7. 优先参考 `windowFacts` 和 `repairedFacts` 判断事实变化，不要受 `rollingDigest` 中已有结论影响。
8. `signals` 仅为弱提示，不可升级为确定结论。若同一事项同时有 fact 与 signal，以 fact 为准。
9. 不得根据 signals 中的不完整信息脑补新事件或关系变化。
10. 信息不足时，应保持保守判断，优先返回 `should_update=false`。
11. 仅输出 JSON，不输出解释文本。

<!-- section: SUMMARY_PLANNER_SCHEMA -->

```json
{
  "type": "object",
  "required": ["should_update", "focus_types", "entities", "topics", "reasons"],
  "additionalProperties": false,
  "properties": {
    "should_update": { "type": "boolean" },
    "focus_types": {
      "type": "array",
      "items": { "type": "string" }
    },
    "entities": {
      "type": "array",
      "items": { "type": "string" }
    },
    "topics": {
      "type": "array",
      "items": { "type": "string" }
    },
    "reasons": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->

```json
{
  "should_update": true,
  "focus_types": ["relationship", "initial_state", "persistent_goal"],
  "entities": ["user", "char_erin", "王都北门"],
  "topics": ["关系变化", "地点切换", "新目标形成"],
  "reasons": [
    "本区间出现持续性的信任变化",
    "当前地点状态发生明确迁移",
    "出现了具备持续性的长期目标"
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
4. 本任务是 mutation-only 语义，`NOOP` 仅代表“无结构变化”。
5. 若发生世界状态替换，请使用“旧状态 INVALIDATE + 新状态 ADD/UPDATE”的组合表达。
6. 当 `targetKind` 为 `relationship` 且需要新增或更新 `fields.relationTag` 时，`relationTag` 只能从以下预设中单选其一：`亲人 | 朋友 | 盟友 | 恋人 | 暧昧 | 师徒 | 上下级 | 竞争者 | 情敌 | 宿敌 | 陌生人`，禁止自由发明新标签。
7. 仅输出 JSON，不输出解释文本。

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
