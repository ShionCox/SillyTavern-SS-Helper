<!-- section: COLD_START_SYSTEM -->

你正在执行结构化记忆冷启动抽取任务。系统已经预置固定的用户角色卡，`actorKey` 固定为 `user`；如果关系对象是当前用户，只需要在 `relationships` 中引用 `user`，不要在 `actorCards` 中重复输出用户角色卡。

请严格遵循以下规则：
- 这不是自由创作任务，而是结构化抽取任务。只保留长期稳定、可复用、适合进入记忆系统的内容。
- `identity` 只描述当前主角色自身。
- `actorCards` 只收录稳定、反复出现、明确是人物的对象。
- `entityCards` 用于组织、城市、国家、地点等非人物实体；`entityCards.fields` 中要尽量写出 `leader`、`baseCity`、`nation`、`city`、`organization`、`status` 等稳定绑定线索。
- `relationships` 只用于“角色与角色之间”的结构化关系卡，必须完整填写 `sourceActorKey`、`targetActorKey`、`participants`、`relationTag`、`state`、`summary`、`trust`、`affection`、`tension`。
- `relationTag` 只能从以下值中选择：`亲人`、`朋友`、`盟友`、`恋人`、`暧昧`、`师徒`、`上下级`、`竞争者`、`情敌`、`宿敌`、`陌生人`。
- 只要某个非 `user` 角色出现在 `relationships` 中，就必须在 `actorCards` 中提供同 `actorKey` 的角色卡，且 `displayName` 不能为空。
- 语义输出字段面向用户可读；结构化字段面向稳定归并和调试，请优先保持稳定可复用。
- 如果角色属于组织、组织位于城市、地点从属于城市或国家，请在 `entityCards.fields` 中显式写出稳定绑定线索。
- 不要为了补满字段编造人物、组织、地点或关系；不确定时保持保守，不要写假设。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: COLD_START_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldProfileDetection", "worldBase", "relationships", "memoryRecords"],
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
      "required": ["organizations", "cities", "nations", "locations"],
      "additionalProperties": false,
      "properties": {
        "organizations": { "$ref": "#/$defs/entityCardList" },
        "cities": { "$ref": "#/$defs/entityCardList" },
        "nations": { "$ref": "#/$defs/entityCardList" },
        "locations": { "$ref": "#/$defs/entityCardList" }
      }
    },
    "worldProfileDetection": {
      "type": "object",
      "required": ["primaryProfile", "secondaryProfiles", "confidence", "reasonCodes"],
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
          "schemaId": { "type": "string" },
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
          "participants": { "type": "array", "items": { "type": "string" } },
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
  },
  "$defs": {
    "entityCardList": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entityType", "compareKey", "title", "aliases", "summary", "fields"],
        "additionalProperties": false,
        "properties": {
          "entityType": { "type": "string" },
          "compareKey": { "type": "string" },
          "title": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } },
          "summary": { "type": "string" },
          "fields": { "type": "object", "additionalProperties": true }
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
    "identityFacts": ["王都情报员"],
    "originFacts": ["来自北境边区"],
    "traits": ["冷静", "多疑"]
  },
  "actorCards": [
    {
      "actorKey": "captain_ron",
      "displayName": "罗恩队长",
      "aliases": ["老罗恩"],
      "identityFacts": ["王都守备队夜巡队长"],
      "originFacts": ["长期驻守北城门"],
      "traits": ["强硬", "守规矩"]
    }
  ],
  "entityCards": {
    "organizations": [
      {
        "entityType": "organization",
        "compareKey": "organization:military:守备队",
        "title": "王都守备队",
        "aliases": ["守备队"],
        "summary": "负责夜间巡逻、城门管制和战时秩序维护的常设武装力量。",
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
        "entityType": "city",
        "compareKey": "city:北境王国:王都",
        "title": "王都",
        "aliases": [],
        "summary": "北境王国的首都，当前处于战时管制状态。",
        "fields": {
          "nation": "北境王国",
          "status": "controlled"
        }
      }
    ],
    "nations": [],
    "locations": [
      {
        "entityType": "location",
        "compareKey": "location:王都:北城门",
        "title": "北城门",
        "aliases": ["北门"],
        "summary": "王都北侧主要出入口，夜间管制严格。",
        "fields": {
          "city": "王都",
          "organization": "王都守备队",
          "status": "guarded"
        }
      }
    ]
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
      "title": "王都夜禁",
      "summary": "夜间普通人未经许可不得擅自出城。",
      "scope": "global"
    }
  ],
  "relationships": [
    {
      "sourceActorKey": "char_erin",
      "targetActorKey": "user",
      "participants": ["char_erin", "user"],
      "relationTag": "陌生人",
      "state": "艾琳把{{userDisplayName}}视为需要继续观察的可疑对象，保持距离但暂未敌对。",
      "summary": "艾琳与{{userDisplayName}}刚建立接触，关系仍停留在谨慎观察阶段。",
      "trust": 0.22,
      "affection": 0.08,
      "tension": 0.15
    }
  ],
  "memoryRecords": [
    {
      "schemaId": "initial_state",
      "title": "初次接触",
      "summary": "艾琳首次与{{userDisplayName}}建立接触，并将其纳入观察对象。",
      "importance": 0.68
    }
  ]
}
```

<!-- section: SUMMARY_PLANNER_SYSTEM -->

你正在执行结构化记忆 `summary planner` 阶段。你的职责不是直接修改记忆，而是判断当前窗口是否值得更新长期记忆，并给出后续 mutation 的聚焦方向。

请严格遵循以下规则：
- `should_update=false` 是完全合法且优先保守的答案。
- `focus_types` 只能从 `allowedTypes` 中选择，数量尽量少，只保留真正值得处理的类型。
- `entities` 只填写本轮反复出现、且对召回和归并有帮助的稳定实体键或名称。
- `topics` 与 `reasons` 必须是简体中文，用于说明本轮为什么要更新，或为什么应该 `NOOP`。
- 优先依赖 `repairedFacts` 与 `windowFacts` 判断事实变化；`signals` 只能作为弱提示，不能升级成确定事实。
- 不要基于不完整信号脑补新关系、新任务、新实体或世界状态。
- 这是 `summary mutation` 的上游规划，不要把整份 mutation 提前写出来。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: SUMMARY_PLANNER_SCHEMA -->

```json
{
  "type": "object",
  "required": ["should_update", "focus_types", "entities", "topics", "reasons"],
  "additionalProperties": false,
  "properties": {
    "should_update": { "type": "boolean" },
    "focus_types": { "type": "array", "items": { "type": "string" } },
    "entities": { "type": "array", "items": { "type": "string" } },
    "topics": { "type": "array", "items": { "type": "string" } },
    "reasons": { "type": "array", "items": { "type": "string" } }
  }
}
```

<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->

```json
{
  "should_update": true,
  "focus_types": ["relationship", "initial_state", "persistent_goal", "task"],
  "entities": ["user", "char_erin", "王都守备队", "北城门"],
  "topics": ["关系推进", "地点状态变化", "任务持续推进"],
  "reasons": [
    "本轮出现了可持续的关系变化",
    "当前地点与组织绑定信息更加稳定",
    "任务目标和状态已形成可复用卡片"
  ]
}
```

<!-- section: SUMMARY_SYSTEM -->

你正在执行结构化记忆 `summary mutation` 任务。请只输出真正需要落库的 sparse patch，不要重写整份旧状态。

请严格遵循以下规则：
- `action`、`targetKind`、`candidateId`、`compareKey`、`reasonCodes` 是调试和归并字段；`title`、`summary`、`payload.fields.state` 等是语义字段。
- `payload` 只写变更部分；未变化字段不要重复回写。
- 任务对象要尽量补齐稳定 `title`、`summary`、`goal`、`status` 与 `bindings`；没有明确任务名时，按稳定动作模板生成标题。
- 如果对象之间存在稳定关系，请在 `payload.bindings` 中输出 `actors`、`organizations`、`cities`、`locations`、`nations`、`tasks`、`events`。
- 不确定是否同一对象时，优先 `NOOP`、`UPDATE` 或 `MERGE`，不要为了看起来完整而重复 `ADD`。
- 不要编造关系、任务、组织从属或长期世界状态；临时状态不要误写成长期属性。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

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
        "required": ["action", "targetKind", "candidateId", "compareKey", "payload", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "action": { "type": "string" },
          "targetKind": { "type": "string" },
          "candidateId": { "type": "string" },
          "compareKey": { "type": "string" },
          "payload": { "type": "object", "additionalProperties": true },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
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
    "fromTurn": 101,
    "toTurn": 120
  },
  "actions": [
    {
      "action": "UPDATE",
      "targetKind": "task",
      "candidateId": "candidate:task:escort",
      "compareKey": "task:护送密使离开王都",
      "payload": {
        "title": "护送密使离开王都",
        "summary": "任务已从确认情报升级为执行撤离。",
        "bindings": {
          "actors": ["user", "char_erin"],
          "organizations": ["王都守备队"],
          "cities": ["王都"],
          "locations": ["北城门"],
          "nations": [],
          "tasks": [],
          "events": []
        },
        "fields": {
          "objective": "护送密使离开王都",
          "status": "进行中",
          "goal": "确保密使安全离开王都"
        }
      },
      "reasonCodes": ["task_progressed", "bindings_refreshed"]
    }
  ]
}
```

<!-- section: TAKEOVER_BASELINE_SYSTEM -->

你正在执行旧聊天接管的静态基线抽取任务。你会收到角色卡、世界书、语义设定、用户资料等静态资料。请只提取长期稳定、适合作为接管起点的信息。

请严格遵循以下规则：
- 只保留长期设定，不要混入短期对话状态。
- 自然语言字段必须简洁、稳定、可复用。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: TAKEOVER_BASELINE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["staticBaseline", "personaBaseline", "worldBaseline", "ruleBaseline", "sourceSummary", "generatedAt"],
  "additionalProperties": false,
  "properties": {
    "staticBaseline": { "type": "string" },
    "personaBaseline": { "type": "string" },
    "worldBaseline": { "type": "string" },
    "ruleBaseline": { "type": "string" },
    "sourceSummary": { "type": "string" },
    "generatedAt": { "type": "number" }
  }
}
```

<!-- section: TAKEOVER_BASELINE_OUTPUT_SAMPLE -->

```json
{
  "staticBaseline": "当前主角色是谨慎冷静的情报员，长期以隐蔽调查为主要行动方式。",
  "personaBaseline": "{{userDisplayName}}倾向直接推进剧情，但会优先保护同伴。",
  "worldBaseline": "当前世界存在稳定的王都、边境战线与严密的夜间管制。",
  "ruleBaseline": "角色行动受到夜禁、通关凭证与身份保密规则约束。",
  "sourceSummary": "已完成角色卡、世界书与用户资料的静态抽取。",
  "generatedAt": 0
}
```

<!-- section: TAKEOVER_ACTIVE_SYSTEM -->

你正在执行旧聊天接管的最近活跃快照任务。你会收到最近楼层范围与消息列表。请提炼当前场景、地点、时间线索、活跃目标、活跃关系、未结线索与近期摘要。

请严格遵循以下规则：
- 只保留当前仍然有效的活跃状态，不要把远期历史写进 active snapshot。
- 自然语言字段必须稳定、简洁、面向用户可读。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: TAKEOVER_ACTIVE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["generatedAt", "currentScene", "currentLocation", "currentTimeHint", "activeGoals", "activeRelations", "openThreads", "recentDigest"],
  "additionalProperties": false,
  "properties": {
    "generatedAt": { "type": "number" },
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
  "generatedAt": 0,
  "currentScene": "{{userDisplayName}}与艾琳刚完成一轮关键对话，局势仍在推进。",
  "currentLocation": "王都北城门附近的临时驻点",
  "currentTimeHint": "深夜",
  "activeGoals": ["确认情报来源", "判断下一步是否同行"],
  "activeRelations": [
    {
      "target": "艾琳",
      "state": "双方维持谨慎合作，但仍在试探彼此底线。"
    }
  ],
  "openThreads": ["是否能安全通过北城门仍未确认"],
  "recentDigest": "最近几层主要围绕通行条件、身份试探与下一步行动选择展开。"
}
```

<!-- section: TAKEOVER_BATCH_SYSTEM -->

你正在执行旧聊天接管的历史批次分析任务。你会收到批次编号、楼层范围、消息列表，以及 `knownContext`（来自之前批次和现有 ledger 的已知上下文）。你的目标不是从零抽取，而是基于已有上下文做稳定归并。

请严格遵循以下规则：
- 当前批次不是从零抽取，必须优先参考 `knownContext`、`knownEntities`、已有 `compareKey` 与稳定对象键。
- 命中同一对象时优先 `UPDATE`；只有明确出现全新对象时才 `ADD`；不确定是否同一对象时，不要盲目新建，优先输出保守更新、`MERGE` 倾向、`openThreads` 或待确认线索。
- `compareKey`、稳定 `actorKey`、已有 `entityKey` 的优先级高于表面称呼；不要因为别名、视角说明、语气变化而拆出新对象。
- 只有稳定、反复出现、明确是人物的对象，才允许写入 `actorCards`。组织、势力、国家、城市、地点、规则、物品等非人物对象必须写入 `entityCards`、`entityTransitions` 或 `stableFacts`。
- `relationships` 只用于角色与角色之间的结构化关系卡；如果关系对象不是人物，请不要塞进 `relationships` 或 `actorCards`，而应通过 `relationTransitions`、`entityCards` 或 `entityTransitions` 表达。
- `relationTransitions.target` 可以是角色、组织、城市、国家或地点；请尽量填写 `relationTag` 与 `targetType`。
- 任务对象必须尽量补齐 `title`、`summary`、`description`、`goal`、`status`、`compareKey` 与 `bindings`。标题优先级是：明确任务名 > 稳定动作模板 > 兜底标题。
- 如果角色属于组织、组织位于城市、任务发生在地点、事件影响角色/组织/城市/地点，请在 `bindings` 中显式输出；不要只抽对象不抽边。
- 语义字段（`summary`、`title`、`description`、`goal`、`state`）面向用户可读；调试字段（`compareKey`、`reasonCodes`、`bindings`、`targetType`）面向归并、去重与问题排查。
- 不要为了补满字段编造关系、组织从属、地点归属或长期属性；临时状态不要误写成长期实体属性。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: TAKEOVER_BATCH_SCHEMA -->

```json
{
  "type": "object",
  "required": ["batchId", "summary", "actorCards", "relationships", "entityCards", "entityTransitions", "stableFacts", "relationTransitions", "taskTransitions", "worldStateChanges", "openThreads", "chapterTags", "sourceRange"],
  "additionalProperties": false,
  "properties": {
    "batchId": { "type": "string" },
    "summary": { "type": "string" },
    "actorCards": { "type": "array", "items": { "type": "object" } },
    "relationships": { "type": "array", "items": { "type": "object" } },
    "entityCards": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entityType", "compareKey", "title", "aliases", "summary", "fields", "confidence", "bindings", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "entityType": { "type": "string", "enum": ["organization", "city", "nation", "location"] },
          "compareKey": { "type": "string" },
          "title": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } },
          "summary": { "type": "string" },
          "fields": { "type": "object", "additionalProperties": true },
          "confidence": { "type": "number" },
          "bindings": { "$ref": "#/$defs/bindings" },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "entityTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entityType", "compareKey", "title", "action", "reason", "payload", "bindings", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "entityType": { "type": "string", "enum": ["organization", "city", "nation", "location"] },
          "compareKey": { "type": "string" },
          "title": { "type": "string" },
          "action": { "type": "string", "enum": ["ADD", "UPDATE", "MERGE", "INVALIDATE", "DELETE"] },
          "reason": { "type": "string" },
          "payload": { "type": "object", "additionalProperties": true },
          "bindings": { "$ref": "#/$defs/bindings" },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "stableFacts": { "type": "array", "items": { "type": "object" } },
    "relationTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target", "from", "to", "reason", "relationTag", "targetType", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "target": { "type": "string" },
          "from": { "type": "string" },
          "to": { "type": "string" },
          "reason": { "type": "string" },
          "relationTag": { "type": "string" },
          "targetType": { "type": "string", "enum": ["actor", "organization", "city", "nation", "location", "unknown"] },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "taskTransitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["task", "from", "to", "title", "summary", "description", "goal", "status", "compareKey", "bindings", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "task": { "type": "string" },
          "from": { "type": "string" },
          "to": { "type": "string" },
          "title": { "type": "string" },
          "summary": { "type": "string" },
          "description": { "type": "string" },
          "goal": { "type": "string" },
          "status": { "type": "string" },
          "compareKey": { "type": "string" },
          "bindings": { "$ref": "#/$defs/bindings" },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "worldStateChanges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "value", "summary", "compareKey", "reasonCodes"],
        "additionalProperties": false,
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "string" },
          "summary": { "type": "string" },
          "compareKey": { "type": "string" },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
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
  },
  "$defs": {
    "bindings": {
      "type": "object",
      "required": ["actors", "organizations", "cities", "locations", "nations", "tasks", "events"],
      "additionalProperties": false,
      "properties": {
        "actors": { "type": "array", "items": { "type": "string" } },
        "organizations": { "type": "array", "items": { "type": "string" } },
        "cities": { "type": "array", "items": { "type": "string" } },
        "locations": { "type": "array", "items": { "type": "string" } },
        "nations": { "type": "array", "items": { "type": "string" } },
        "tasks": { "type": "array", "items": { "type": "string" } },
        "events": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

<!-- section: TAKEOVER_BATCH_OUTPUT_SAMPLE -->

```json
{
  "batchId": "takeover:demo:history:0001",
  "summary": "这一段历史主要建立了{{userDisplayName}}与艾琳之间的初步信任，并明确了“护送密使离开王都”的共同任务。",
  "actorCards": [
    {
      "actorKey": "char_erin",
      "displayName": "艾琳",
      "aliases": ["小艾"],
      "identityFacts": ["王都情报员"],
      "originFacts": ["来自北境边区"],
      "traits": ["冷静", "多疑"]
    }
  ],
  "relationships": [
    {
      "sourceActorKey": "user",
      "targetActorKey": "char_erin",
      "participants": ["user", "char_erin"],
      "relationTag": "朋友",
      "state": "{{userDisplayName}}与艾琳已经形成谨慎但有效的合作关系。",
      "summary": "双方在共同处理危机时建立了可持续推进的合作信任。",
      "trust": 0.72,
      "affection": 0.38,
      "tension": 0.17
    }
  ],
  "entityCards": [
    {
      "entityType": "organization",
      "compareKey": "organization:intelligence:夜鸦组",
      "title": "夜鸦组",
      "aliases": [],
      "summary": "艾琳所属的情报组织，负责王都与边境之间的秘密联络。",
      "fields": {
        "subtype": "intelligence",
        "leader": "灰羽",
        "baseCity": "王都",
        "status": "active"
      },
      "confidence": 0.88,
      "bindings": {
        "actors": ["char_erin"],
        "organizations": [],
        "cities": ["王都"],
        "locations": [],
        "nations": [],
        "tasks": ["task:护送密使离开王都"],
        "events": []
      },
      "reasonCodes": ["organization_referenced_repeatedly", "entity_update_preferred"]
    }
  ],
  "entityTransitions": [
    {
      "entityType": "location",
      "compareKey": "location:王都:北城门",
      "title": "北城门",
      "action": "UPDATE",
      "reason": "本批次明确了北城门与守备队、夜禁和撤离路线的稳定关联。",
      "payload": {
        "summary": "北城门仍由守备力量严密把守，是离开王都的关键通路。",
        "city": "王都",
        "organization": "王都守备队",
        "status": "guarded"
      },
      "bindings": {
        "actors": [],
        "organizations": ["王都守备队"],
        "cities": ["王都"],
        "locations": [],
        "nations": [],
        "tasks": ["task:护送密使离开王都"],
        "events": []
      },
      "reasonCodes": ["entity_update_preferred", "location_binding_confirmed"]
    }
  ],
  "stableFacts": [
    {
      "type": "event",
      "subject": "艾琳",
      "predicate": "确认",
      "value": "北城门是当前最可行的撤离路线",
      "confidence": 0.86
    }
  ],
  "relationTransitions": [
    {
      "target": "char_erin",
      "from": "陌生试探",
      "to": "谨慎合作",
      "reason": "双方明确共享短期目标，并愿意共同承担风险。",
      "relationTag": "朋友",
      "targetType": "actor",
      "reasonCodes": ["relationship_progressed", "shared_goal_confirmed"]
    }
  ],
  "taskTransitions": [
    {
      "task": "护送密使离开王都",
      "from": "未开始",
      "to": "进行中",
      "title": "护送密使离开王都",
      "summary": "双方已从确认情报升级为执行撤离任务。",
      "description": "当前重点是确保密使安全通过北城门并离开王都。",
      "goal": "确保密使安全离开王都",
      "status": "进行中",
      "compareKey": "task:护送密使离开王都",
      "bindings": {
        "actors": ["user", "char_erin"],
        "organizations": ["夜鸦组", "王都守备队"],
        "cities": ["王都"],
        "locations": ["北城门"],
        "nations": [],
        "tasks": [],
        "events": []
      },
      "reasonCodes": ["task_update_preferred", "task_title_stabilized", "task_bindings_confirmed"]
    }
  ],
  "worldStateChanges": [
    {
      "key": "王都夜禁",
      "value": "持续执行中",
      "summary": "夜禁仍然有效，直接影响撤离任务的路径选择。",
      "compareKey": "world_global_state:global:王都夜禁",
      "reasonCodes": ["world_state_confirmed"]
    }
  ],
  "openThreads": ["密使是否持有可通行的凭证仍未确认"],
  "chapterTags": ["关系推进", "任务开启", "地点绑定强化"],
  "sourceRange": {
    "startFloor": 1,
    "endFloor": 30
  }
}
```

<!-- section: COLD_START_CORE_SYSTEM -->

你正在执行冷启动 `Core Extract` 阶段。本阶段只关注 `identity`、`actorCards`、`entityCards`、`worldProfileDetection`、`worldBase`。

请严格遵循以下规则：
- `relationships` 与 `memoryRecords` 必须返回空数组。
- `identity`、`actorCards`、`entityCards` 的输出必须尽量稳定，优先保留长期设定而不是短期情绪。
- `entityCards.fields` 中尽量写出稳定绑定线索，例如 `leader`、`organization`、`city`、`nation`、`baseCity`、`status`。
- 不要把暂时状态误写成长期属性；不确定时宁可留空也不要猜测。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: COLD_START_CORE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldProfileDetection", "worldBase", "relationships", "memoryRecords"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string" },
    "identity": { "type": "object" },
    "actorCards": { "type": "array", "items": { "type": "object" } },
    "entityCards": { "type": "object" },
    "worldProfileDetection": { "type": "object" },
    "worldBase": { "type": "array", "items": { "type": "object" } },
    "relationships": { "type": "array", "items": { "type": "object" } },
    "memoryRecords": { "type": "array", "items": { "type": "object" } }
  }
}
```

<!-- section: COLD_START_CORE_OUTPUT_SAMPLE -->

```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "char_erin",
    "displayName": "艾琳",
    "aliases": ["小艾"],
    "identityFacts": ["王都情报员"],
    "originFacts": ["来自北境边区"],
    "traits": ["冷静", "多疑"]
  },
  "actorCards": [],
  "entityCards": {
    "organizations": [],
    "cities": [],
    "nations": [],
    "locations": []
  },
  "worldProfileDetection": {
    "primaryProfile": "fantasy_magic",
    "secondaryProfiles": ["political_intrigue"],
    "confidence": 0.81,
    "reasonCodes": ["core_extract"]
  },
  "worldBase": [],
  "relationships": [],
  "memoryRecords": []
}
```

<!-- section: COLD_START_STATE_SYSTEM -->

你正在执行冷启动 `State Extract` 阶段。本阶段只关注 `relationships`、`memoryRecords` 与近期状态线索。

请严格遵循以下规则：
- `identity`、`actorCards`、`entityCards`、`worldBase` 如无新增可返回空集合。
- 关系与状态描述要面向用户可读，但 `relationTag`、`actorKey` 等结构化字段必须稳定。
- 不要把短期情绪夸大为长期关系；只有稳定、持续、有明确依据的变化才写入 `memoryRecords`。
- 当前用户自然语言名称优先使用 `{{userDisplayName}}`；结构化锚点继续使用 `user`。
- 除键名、schema 字段名、枚举值外，所有自然语言内容必须使用简体中文；只输出 JSON。

<!-- section: COLD_START_STATE_SCHEMA -->

```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldBase", "relationships", "memoryRecords"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string" },
    "identity": { "type": "object" },
    "actorCards": { "type": "array", "items": { "type": "object" } },
    "entityCards": { "type": "object" },
    "worldBase": { "type": "array", "items": { "type": "object" } },
    "relationships": { "type": "array", "items": { "type": "object" } },
    "memoryRecords": { "type": "array", "items": { "type": "object" } }
  }
}
```

<!-- section: COLD_START_STATE_OUTPUT_SAMPLE -->

```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "char_erin",
    "displayName": "艾琳",
    "aliases": [],
    "identityFacts": [],
    "originFacts": [],
    "traits": []
  },
  "actorCards": [],
  "entityCards": {
    "organizations": [],
    "cities": [],
    "nations": [],
    "locations": []
  },
  "worldBase": [],
  "relationships": [
    {
      "sourceActorKey": "char_erin",
      "targetActorKey": "user",
      "participants": ["char_erin", "user"],
      "relationTag": "陌生人",
      "state": "艾琳对{{userDisplayName}}保持明显戒备，但愿意继续接触观察。",
      "summary": "双方建立了谨慎但可持续推进的初始接触关系。",
      "trust": 0.31,
      "affection": 0.12,
      "tension": 0.21
    }
  ],
  "memoryRecords": [
    {
      "schemaId": "initial_state",
      "title": "建立初始接触",
      "summary": "艾琳与{{userDisplayName}}形成了可继续推进的初始接触关系。",
      "importance": 0.66
    }
  ]
}
```

<!-- section: TAKEOVER_CONFLICT_RESOLUTION_SCHEMA -->

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "bucketId": { "type": "string" },
    "domain": { "type": "string" },
    "resolutions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "action": {
            "type": "string",
            "enum": ["merge", "keep_primary", "replace", "invalidate", "split"]
          },
          "primaryKey": { "type": "string" },
          "secondaryKeys": { "type": "array", "items": { "type": "string" } },
          "fieldOverrides": { "type": "object", "additionalProperties": true },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["action", "primaryKey", "secondaryKeys", "fieldOverrides", "reasonCodes"]
      }
    }
  },
  "required": ["bucketId", "domain", "resolutions"]
}
```

<!-- section: TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE -->

```json
{
  "bucketId": "takeover:entity:0001",
  "domain": "entity",
  "resolutions": [
    {
      "action": "merge",
      "primaryKey": "organization:intelligence:夜鸦组",
      "secondaryKeys": ["organization:intelligence:夜鸦情报组"],
      "fieldOverrides": {},
      "reasonCodes": ["llm_conflict_merge"]
    }
  ]
}
```
