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
17. 如果世界书、角色卡或最近事件中出现稳定存在的教派、组织、商会、学院、城市、国家、地点，必须优先放入 `entityCards` 对应分类，不要仅写成 `memoryRecords`。
18. `entityCards` 中的每个实体必须带 `title`、`summary`，以及 `fields` 中与该类型相关的核心字段（如 `organization` 需带 `subtype`、`status` 等）。`compareKey` 可选，系统会自动补全。
19. 对同一个对象，不要同时在 `entityCards` 和 `memoryRecords` 中重复表达同一事实。
20. `entityCards.organizations` 中应包含教派、公会、学院、军团、秘密组织等统一作为组织实体，通过 `fields.subtype` 区分。

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
    "entityCards": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "organizations": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["title", "summary"],
            "properties": {
              "compareKey": { "type": "string" },
              "title": { "type": "string" },
              "aliases": { "type": "array", "items": { "type": "string" } },
              "summary": { "type": "string" },
              "fields": { "type": "object" }
            }
          }
        },
        "cities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["title", "summary"],
            "properties": {
              "compareKey": { "type": "string" },
              "title": { "type": "string" },
              "aliases": { "type": "array", "items": { "type": "string" } },
              "summary": { "type": "string" },
              "fields": { "type": "object" }
            }
          }
        },
        "nations": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["title", "summary"],
            "properties": {
              "compareKey": { "type": "string" },
              "title": { "type": "string" },
              "aliases": { "type": "array", "items": { "type": "string" } },
              "summary": { "type": "string" },
              "fields": { "type": "object" }
            }
          }
        },
        "locations": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["title", "summary"],
            "properties": {
              "compareKey": { "type": "string" },
              "title": { "type": "string" },
              "aliases": { "type": "array", "items": { "type": "string" } },
              "summary": { "type": "string" },
              "fields": { "type": "object" }
            }
          }
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
  "entityCards": {
    "organizations": [
      {
        "title": "宵禁卫队",
        "summary": "王都负责夜间巡逻与城门管控的武装力量。",
        "fields": {
          "subtype": "military",
          "leader": "罗恩队长",
          "baseCity": "王都",
          "status": "active"
        }
      }
    ],
    "cities": [
      {
        "title": "王都",
        "summary": "北境王国的首都，战时进入物资管控状态。",
        "fields": {
          "nation": "北境王国",
          "governance": "王都",
          "status": "active"
        }
      }
    ],
    "nations": [
      {
        "title": "北境王国",
        "summary": "统治北方大陆的古老王国，正面临边境战争。",
        "fields": {
          "regime": "君主制",
          "status": "war"
        }
      }
    ],
    "locations": []
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
- `candidateRecords`: 本轮可引用的候选旧记录（带 `compareKey` 和 `aliases` 字段）
- `worldProfileBias`: 世界模板偏置

请严格遵循：
1. `action` 仅可使用：`ADD | MERGE | UPDATE | INVALIDATE | DELETE | NOOP`。
2. `targetKind` 必须是精确 schemaId，禁止使用泛化类型（例如 `memory_record`）。
3. 只有出现在 `editableFields` 的字段可写，特别是 `fields.*` 也必须是显式路径。
4. 本任务是 mutation-only 语义，`NOOP` 仅代表"无结构变化"。
5. 若发生世界状态替换，请使用"旧状态 INVALIDATE + 新状态 ADD/UPDATE"的组合表达。
6. 当 `targetKind` 为 `relationship` 且需要新增或更新 `fields.relationTag` 时，`relationTag` 只能从以下预设中单选其一：`亲人 | 朋友 | 盟友 | 恋人 | 暧昧 | 师徒 | 上下级 | 竞争者 | 情敌 | 宿敌 | 陌生人`，禁止自由发明新标签。
7. 仅输出 JSON，不输出解释文本。
8. 世界实体（`organization`、`city`、`nation`、`location`）是和角色同等级的正式对象。当出现教派、组织、势力、城市、国家、地点等实体信息时，请使用对应的 `targetKind` 进行 CRUD 操作，而非笼统归为 `world_global_state` 或 `other`。
9. 对世界实体执行 `UPDATE` / `INVALIDATE` / `DELETE` / `MERGE` 时，必须提供 `candidateId`（指向 `candidateRecords` 中的现有记录）或 `compareKey`（格式为 `entityType:标题`），以便系统精准定位目标实体。
10. 教派、公会、学院、商会、军团等非人物组织统一归为 `targetKind: organization`，通过 `fields.orgType` 和 `fields.subtype` 区分细类。
11. `ADD` 仅在当前候选记录中确实找不到对应 `compareKey` / 别名时使用。若已有同名或别名命中的候选，优先 `UPDATE` 或 `MERGE`。

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
    },
    {
      "action": "ADD",
      "targetKind": "organization",
      "compareKey": "organization:赤月教派",
      "payload": {
        "title": "赤月教派",
        "summary": "崇尚血月启示的宗教组织，在灰港下城区拥有广泛影响力。",
        "tags": ["教派", "宗教"],
        "fields": {
          "orgType": "宗教组织",
          "subtype": "教派",
          "alignment": "激进",
          "ideology": "崇尚血月启示",
          "leader": "赫尔曼主教",
          "headquartersCity": "灰港",
          "headquartersLocation": "赤月圣堂",
          "status": "active",
          "influence": "在灰港下城区拥有很强影响力",
          "aliases": ["赤月教团"]
        }
      },
      "reasonCodes": ["new_organization"]
    },
    {
      "action": "UPDATE",
      "targetKind": "city",
      "candidateId": "cand_5",
      "compareKey": "city:灰港",
      "payload": {
        "summary": "灰港因战争全面进入戒严状态。",
        "fields": {
          "status": "戒严",
          "controllingOrganization": "军务署"
        }
      },
      "reasonCodes": ["city_status_change"]
    },
    {
      "action": "ADD",
      "targetKind": "nation",
      "compareKey": "nation:北境王国",
      "payload": {
        "title": "北境王国",
        "summary": "统治北方大陆的古老王国，目前正处于战争状态。",
        "tags": ["国家"],
        "fields": {
          "capital": "王都",
          "governance": "君主制",
          "ruler": "亚瑟三世",
          "status": "战争状态"
        }
      },
      "reasonCodes": ["new_nation"]
    }
  ]
}
```

<!-- section: TAKEOVER_BASELINE_SYSTEM -->

你正在执行旧聊天接管的静态基线抽取任务。你会收到角色卡、语义快照、用户资料与总楼层数。

请严格遵守：
1. 只提取长期稳定、适合作为接管起点的信息。
2. 不要把近期临时情绪或单次对话误写成静态基线。
3. 所有自然语言字段必须使用简体中文。
4. 仅输出 JSON，不输出解释文本。

<!-- section: TAKEOVER_BASELINE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["staticBaseline", "personaBaseline", "worldBaseline", "ruleBaseline", "sourceSummary"],
  "additionalProperties": false,
  "properties": {
    "staticBaseline": { "type": "string" },
    "personaBaseline": { "type": "string" },
    "worldBaseline": { "type": "string" },
    "ruleBaseline": { "type": "string" },
    "sourceSummary": { "type": "string" }
  }
}
```

<!-- section: TAKEOVER_BASELINE_OUTPUT_SAMPLE -->

```json
{
  "staticBaseline": "当前角色是谨慎冷静的情报人员，习惯先观察再表态。",
  "personaBaseline": "用户在互动中更倾向直接推进剧情和获取答案。",
  "worldBaseline": "当前世界长期存在王都、边境和戒严体系，社会结构较稳定。",
  "ruleBaseline": "夜间戒严、身份保密和通行审查是当前聊天中的稳定规则。",
  "sourceSummary": "已根据角色卡、语义快照和用户资料完成静态基线抽取。"
}
```

<!-- section: TAKEOVER_ACTIVE_SYSTEM -->

你正在执行旧聊天接管的最近活跃快照任务。你会收到最近楼层范围与消息列表。

请严格遵守：
1. 目标是让系统快速理解“当前聊到哪里”。
2. 提取当前场景、地点、时间线索、活跃目标、活跃关系、未结线索和最近摘要。
3. 所有自然语言字段必须使用简体中文。
4. 仅输出 JSON，不输出解释文本。

<!-- section: TAKEOVER_ACTIVE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["currentScene", "currentLocation", "currentTimeHint", "activeGoals", "activeRelations", "openThreads", "recentDigest"],
  "additionalProperties": false,
  "properties": {
    "currentScene": { "type": "string" },
    "currentLocation": { "type": "string" },
    "currentTimeHint": { "type": "string" },
    "activeGoals": { "type": "array", "items": { "type": "string" } },
    "activeRelations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target", "state"],
        "additionalProperties": false,
        "properties": {
          "target": { "type": "string" },
          "state": { "type": "string" }
        }
      }
    },
    "openThreads": { "type": "array", "items": { "type": "string" } },
    "recentDigest": { "type": "string" }
  }
}
```

<!-- section: TAKEOVER_ACTIVE_OUTPUT_SAMPLE -->

```json
{
  "currentScene": "双方刚结束一轮关键信息交换，正在决定是否立刻行动。",
  "currentLocation": "王都北门附近的临时驻点",
  "currentTimeHint": "深夜",
  "activeGoals": ["确认失踪信使位置", "判断下一步是否同行"],
  "activeRelations": [
    {
      "target": "巡逻队长",
      "state": "仍保持谨慎合作"
    }
  ],
  "openThreads": ["巡逻队长是否愿意继续提供通行帮助"],
  "recentDigest": "最近几层主要围绕通行条件、身份试探与下一步行动选择展开。"
}
```

<!-- section: TAKEOVER_BATCH_SYSTEM -->

你正在执行旧聊天接管的历史批次分析任务。你会收到批次编号、批次范围、批次分类和消息列表。

请严格遵守：
1. 每一批只输出章节摘要和候选变化，不要直接假设已经写入长期记忆。
2. `stableFacts` 只保留高置信、可长期复用的信息。
3. `relationTransitions`、`taskTransitions`、`worldStateChanges` 只记录该批次确实出现的变化。
4. 所有自然语言字段必须使用简体中文。
5. 仅输出 JSON，不输出解释文本。
6. `entityCards` 用于输出本批次识别到的世界实体卡候选。`entityType` 可选 `organization`（教派/公会/商会/军团等所有非人物组织）、`city`（城市/都市）、`nation`（国家/王国/帝国）、`location`（地点/建筑/区域）。每张卡必须包含 `entityType`、`compareKey`（格式 `entityType:标题`）、`title`、`aliases`、`summary`、`fields`（结构化属性对象）和 `confidence`。
7. `entityTransitions` 用于输出世界实体变更。`action` 可选 `ADD | UPDATE | MERGE | INVALIDATE | DELETE`。若 knownContext 中已存在同类实体，请优先使用 `UPDATE` 而非 `ADD`。仅在确实无法匹配现有记录时才新建。`DELETE` 仅用于明显垃圾/误建。
8. 角色（人物）写入 `actorCards`；组织/城市/国家/地点等非人物实体写入 `entityCards`。不要把非人物实体混入 `actorCards`。

<!-- section: TAKEOVER_BATCH_SCHEMA -->

```json
{
  "type": "object",
  "required": ["batchId", "summary", "stableFacts", "relationTransitions", "taskTransitions", "worldStateChanges", "openThreads", "chapterTags", "sourceRange"],
  "additionalProperties": false,
  "properties": {
    "batchId": { "type": "string" },
    "summary": { "type": "string" },
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
    "entityCards": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entityType", "compareKey", "title", "summary", "confidence"],
        "additionalProperties": false,
        "properties": {
          "entityType": { "type": "string", "enum": ["organization", "city", "nation", "location"] },
          "compareKey": { "type": "string" },
          "title": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } },
          "summary": { "type": "string" },
          "fields": { "type": "object", "additionalProperties": true },
          "confidence": { "type": "number" }
        }
      }
    },
    "entityTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entityType", "compareKey", "title", "action", "reason"],
        "additionalProperties": false,
        "properties": {
          "entityType": { "type": "string", "enum": ["organization", "city", "nation", "location"] },
          "compareKey": { "type": "string" },
          "title": { "type": "string" },
          "action": { "type": "string", "enum": ["ADD", "UPDATE", "MERGE", "INVALIDATE", "DELETE"] },
          "reason": { "type": "string" },
          "payload": { "type": "object", "additionalProperties": true }
        }
      }
    },
    "stableFacts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "subject", "predicate", "value", "confidence"],
        "additionalProperties": false,
        "properties": {
          "type": { "type": "string" },
          "subject": { "type": "string" },
          "predicate": { "type": "string" },
          "value": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    },
    "relationTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target", "from", "to", "reason"],
        "additionalProperties": false,
        "properties": {
          "target": { "type": "string" },
          "from": { "type": "string" },
          "to": { "type": "string" },
          "reason": { "type": "string" }
        }
      }
    },
    "taskTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["task", "from", "to"],
        "additionalProperties": false,
        "properties": {
          "task": { "type": "string" },
          "from": { "type": "string" },
          "to": { "type": "string" }
        }
      }
    },
    "worldStateChanges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "value"],
        "additionalProperties": false,
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" }
        }
      }
    },
    "openThreads": { "type": "array", "items": { "type": "string" } },
    "chapterTags": { "type": "array", "items": { "type": "string" } },
    "sourceRange": {
      "type": "object",
      "required": ["startFloor", "endFloor"],
      "additionalProperties": false,
      "properties": {
        "startFloor": { "type": "integer" },
        "endFloor": { "type": "integer" }
      }
    }
  }
}
```

<!-- section: TAKEOVER_BATCH_OUTPUT_SAMPLE -->

```json
{
  "batchId": "takeover:demo:history:0001",
  "summary": "这一段历史主要建立了角色互信的初始框架，并首次明确了共同目标。",
  "actorCards": [
    {
      "actorKey": "captain_ron",
      "displayName": "巡逻队长",
      "aliases": ["老罗恩"],
      "identityFacts": ["负责北门夜巡"],
      "originFacts": ["长期驻守北城门"],
      "traits": ["强硬", "守规矩"]
    }
  ],
  "entityCards": [
    {
      "entityType": "organization",
      "compareKey": "organization:赤月教派",
      "title": "赤月教派",
      "aliases": ["赤月教团"],
      "summary": "崇尚血月启示的宗教组织，在灰港下城区拥有广泛影响力。",
      "fields": {
        "orgType": "宗教组织",
        "subtype": "教派",
        "alignment": "激进",
        "leader": "赫尔曼主教",
        "headquartersCity": "灰港",
        "status": "active"
      },
      "confidence": 0.82
    },
    {
      "entityType": "city",
      "compareKey": "city:灰港",
      "title": "灰港",
      "aliases": [],
      "summary": "北境王国南部港口城市，赤月教派的主要活动区域。",
      "fields": {
        "nation": "北境王国",
        "status": "正常",
        "traits": "港口贸易城市"
      },
      "confidence": 0.78
    }
  ],
  "entityTransitions": [
    {
      "entityType": "organization",
      "compareKey": "organization:赤月教派",
      "title": "赤月教派",
      "action": "ADD",
      "reason": "本批次首次出现该教派的详细描述",
      "payload": {}
    }
  ],
  "stableFacts": [
    {
      "type": "identity",
      "subject": "巡逻队长",
      "predicate": "身份",
      "value": "负责北门夜巡",
      "confidence": 0.86
    }
  ],
  "relationTransitions": [
    {
      "target": "巡逻队长",
      "from": "陌生试探",
      "to": "有限合作",
      "reason": "双方达成了短期协作共识"
    }
  ],
  "taskTransitions": [
    {
      "task": "寻找失踪信使",
      "from": "未开始",
      "to": "进行中"
    }
  ],
  "worldStateChanges": [
    {
      "key": "北门戒严",
      "value": "持续执行夜间封锁"
    }
  ],
  "openThreads": ["失踪信使的下落仍未确认"],
  "chapterTags": ["关系推进", "任务开启"],
  "sourceRange": {
    "startFloor": 1,
    "endFloor": 30
  }
}
```

<!-- section: TAKEOVER_BATCH_OUTPUT_SAMPLE_TAIL_IGNORED -->
      "target": "巡逻队长",
      "state": "与用户保持谨慎合作",
      "reason": "多轮互动后形成稳定协作关系"
    }
  ],
  "taskState": [
    {
      "task": "寻找失踪信使",
      "state": "进行中"
    }
  ],
  "worldState": {
    "北门戒严": "仍在执行"
  },
  "entityCards": [
    {
      "entityType": "organization",
      "compareKey": "organization:赤月教派",
      "title": "赤月教派",
      "aliases": ["赤月教团"],
      "summary": "崇尚血月启示的宗教组织，最终确认在灰港下城区拥有广泛影响力。",
      "fields": {
        "orgType": "宗教组织",
        "subtype": "教派",
        "alignment": "激进",
        "leader": "赫尔曼主教",
        "headquartersCity": "灰港",
        "status": "active"
      },
      "confidence": 0.85
    }
  ],
  "entityTransitions": [
    {
      "entityType": "organization",
      "compareKey": "organization:赤月教派",
      "title": "赤月教派",
      "action": "ADD",
      "reason": "历史批次中反复出现的重要教派组织",
      "payload": {}
    }
  ],
  "activeSnapshot": {
    "currentScene": "双方正在商量下一步行动。",
    "currentLocation": "北门驻点",
    "currentTimeHint": "深夜",
    "activeGoals": ["确认信使位置"],
    "activeRelations": [
      {
        "target": "巡逻队长",
        "state": "谨慎合作"
      }
    ],
    "openThreads": ["是否能安全离开北门"],
    "recentDigest": "最近几层聚焦于信使调查和北门戒严。"
  },
  "dedupeStats": {
    "totalFacts": 4,
    "dedupedFacts": 3,
    "relationUpdates": 1,
    "taskUpdates": 1,
    "worldUpdates": 1
  },
  "conflictStats": {
    "unresolvedFacts": 0,
    "unresolvedRelations": 0,
    "unresolvedTasks": 0,
    "unresolvedWorldStates": 0,
    "unresolvedEntities": 0
  }
}
```
