<!-- section: COLD_START_SYSTEM -->
你正在执行结构化记忆冷启动抽取任务。
只保留长期稳定、可复用、适合进入记忆系统的内容。
- 用户锚点固定为 `user`，自然语言称呼优先使用 `{{userDisplayName}}`。
- 所有 actorKey 只能使用 `user` 或 `actor_*`；禁止输出 `char_*`、`ck:*`、`ek:*` 或任何临时引用。
- compareKey 采用 `ck:v2:<kind>:...` 协议；entityKey 是内部稳定主键；matchKeys 只用于模糊候选。
- 不要输出 `targetKind: "actor_profile"` 或 `targetKind: "relationship"` 这类旧 entry 主链动作。
- 非人物对象请放进 entityCards，不要误写进 actorCards。
- `actorCards` 对应 `actor_memory_profiles` 主表，`relationships` 对应 `memory_relationships` 主表，不会写入 `memory_entries`。
- 只输出 JSON。

<!-- section: COLD_START_SCHEMA -->
```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldProfileDetection", "worldBase", "relationships", "memoryRecords"]
}
```

<!-- section: COLD_START_OUTPUT_SAMPLE -->
```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "actor_erin",
    "displayName": "艾琳",
    "aliases": ["小艾"],
    "identityFacts": ["王都情报员"],
    "originFacts": ["来自北境边区"],
    "traits": ["冷静", "多疑"]
  },
  "actorCards": [],
  "entityCards": {
    "organizations": [
      {
        "entityType": "organization",
        "entityKey": "entity:organization:night_raven",
        "compareKey": "ck:v2:organization:夜鸦组:王都",
        "matchKeys": ["mk:organization:夜鸦组"],
        "schemaVersion": "v2",
        "canonicalName": "夜鸦组",
        "title": "夜鸦组",
        "aliases": [],
        "summary": "负责王都秘密联络的情报组织。",
        "fields": {
          "subtype": "intelligence",
          "baseCity": "王都",
          "status": "active"
        }
      }
    ],
    "cities": [],
    "nations": [],
    "locations": []
  },
  "worldProfileDetection": {
    "primaryProfile": "fantasy_magic",
    "secondaryProfiles": ["political_intrigue"],
    "confidence": 0.88,
    "reasonCodes": ["core_extract"]
  },
  "worldBase": [],
  "relationships": [],
  "memoryRecords": []
}
```

<!-- section: COLD_START_CORE_SYSTEM -->
你正在执行冷启动 Core Extract 阶段。
只关注 identity、actorCards、entityCards、worldProfileDetection、worldBase。
relationships 与 memoryRecords 必须返回空数组。
只输出 JSON。

<!-- section: COLD_START_CORE_SCHEMA -->
```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldProfileDetection", "worldBase", "relationships", "memoryRecords"]
}
```

<!-- section: COLD_START_CORE_OUTPUT_SAMPLE -->
```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "actor_erin",
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
你正在执行冷启动 State Extract 阶段。
只关注 relationships、memoryRecords 和近期稳定状态线索。
identity、actorCards、entityCards、worldBase 没有新增时可返回空集合。
只输出 JSON。

<!-- section: COLD_START_STATE_SCHEMA -->
```json
{
  "type": "object",
  "required": ["schemaVersion", "identity", "actorCards", "entityCards", "worldBase", "relationships", "memoryRecords"]
}
```

<!-- section: COLD_START_STATE_OUTPUT_SAMPLE -->
```json
{
  "schemaVersion": "1.0.0",
  "identity": {
    "actorKey": "actor_erin",
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
      "sourceActorKey": "actor_erin",
      "targetActorKey": "user",
      "participants": ["actor_erin", "user"],
      "relationTag": "陌生人",
      "state": "艾琳对{{userDisplayName}}保持警惕，但愿意继续接触。",
      "summary": "双方建立了可继续推进的初始接触。",
      "trust": 0.31,
      "affection": 0.12,
      "tension": 0.21
    }
  ],
  "memoryRecords": [
    {
      "schemaId": "initial_state",
      "title": "建立初始接触",
      "summary": "艾琳与{{userDisplayName}}形成了谨慎但可持续推进的接触关系。",
      "importance": 0.66
    }
  ]
}
```

<!-- section: SUMMARY_PLANNER_SYSTEM -->
你正在执行 summary planner。
你的职责是判断当前窗口是否值得更新长期记忆，并给出后续 mutation 的聚焦方向。
如窗口只是闲聊、重复确认或没有形成稳定事实，应返回 should_update=false。
只输出 JSON。

<!-- section: SUMMARY_PLANNER_SCHEMA -->
```json
{
  "type": "object",
  "required": ["should_update", "focus_types", "entities", "topics", "reasons"]
}
```

<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->
```json
{
  "should_update": true,
  "focus_types": ["relationship", "task", "world_global_state"],
  "entities": ["user", "actor_erin", "ck:v2:task:护送密使离开王都:王都"],
  "topics": ["关系推进", "任务进展", "夜禁状态变化"],
  "reasons": ["当前窗口形成了稳定任务推进与关系变化。"]
}
```

<!-- section: SUMMARY_SYSTEM -->
你正在执行 summary mutation。
请输出真正需要落库的稀疏 mutation，而不是重写整份旧状态。
- ADD 使用 newRecord；UPDATE、MERGE、INVALIDATE 使用 patch；DELETE 和 NOOP 不要输出 payload、patch、newRecord。
- compareKey 采用 ck:v2 协议；entityKey 是内部稳定键；matchKeys 只做模糊候选。
- 无法确认同一对象时优先 NOOP、UPDATE 或 MERGE，不要盲目 ADD。
- 只输出 JSON。

<!-- section: SUMMARY_SCHEMA -->
```json
{
  "type": "object",
  "required": ["schemaVersion", "window", "actions"],
  "properties": {
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "targetKind"],
        "properties": {
          "action": { "type": "string" },
          "targetKind": { "type": "string" },
          "entityKey": { "type": "string" },
          "compareKey": { "type": "string" },
          "matchKeys": { "type": "array", "items": { "type": "string" } },
          "schemaVersion": { "type": "string" },
          "patch": { "type": "object", "additionalProperties": true },
          "newRecord": { "type": "object", "additionalProperties": true },
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
      "entityKey": "entity:task:escort_messenger",
      "compareKey": "ck:v2:task:护送密使离开王都:王都",
      "matchKeys": ["mk:task:护送密使离开王都"],
      "schemaVersion": "v2",
      "patch": {
        "summary": "任务已从确认情报升级为正式撤离执行。",
        "bindings": {
          "actors": ["user", "actor_erin"],
          "organizations": ["entity:organization:night_raven"],
          "cities": ["entity:city:royal_capital"]
        },
        "fields": {
          "objective": "护送密使离开王都",
          "status": "进行中",
          "goal": "确保密使安全离城"
        }
      },
      "reasonCodes": ["task_progressed", "bindings_refreshed"]
    },
  ]
}
```

<!-- section: TAKEOVER_BASELINE_SYSTEM -->
你正在执行旧聊天接管的静态基线抽取任务。
提取稳定设定、人格基线、世界规则和静态背景。
只输出 JSON。

<!-- section: TAKEOVER_BASELINE_SCHEMA -->
```json
{
  "type": "object",
  "required": ["staticBaseline", "personaBaseline", "worldBaseline", "ruleBaseline", "sourceSummary", "generatedAt"]
}
```

<!-- section: TAKEOVER_BASELINE_OUTPUT_SAMPLE -->
```json
{
  "staticBaseline": "艾琳是谨慎冷静的情报员。",
  "personaBaseline": "用户倾向直接推进剧情。",
  "worldBaseline": "王都处于夜禁与边境紧张并存的状态。",
  "ruleBaseline": "夜间通行受到严格审查。",
  "sourceSummary": "已完成静态设定抽取。",
  "generatedAt": 0
}
```

<!-- section: TAKEOVER_ACTIVE_SYSTEM -->
你正在执行旧聊天接管的最近活跃快照任务。
总结当前场景、地点、时间线索、活跃目标、活跃关系和未结线索。
只输出 JSON。

<!-- section: TAKEOVER_ACTIVE_SCHEMA -->
```json
{
  "type": "object",
  "required": ["generatedAt", "currentScene", "currentLocation", "currentTimeHint", "activeGoals", "activeRelations", "openThreads", "recentDigest"]
}
```

<!-- section: TAKEOVER_ACTIVE_OUTPUT_SAMPLE -->
```json
{
  "generatedAt": 0,
  "currentScene": "双方刚刚交换完关键情报，正在决定撤离路线。",
  "currentLocation": "王都北城门附近",
  "currentTimeHint": "深夜",
  "activeGoals": ["确认密使状态", "选择安全撤离路线"],
  "activeRelations": [
    {
      "target": "艾琳",
      "state": "谨慎合作"
    }
  ],
  "openThreads": ["北城门是否仍可通行"],
  "recentDigest": "最近主要围绕夜禁、密使撤离与合作关系展开。"
}
```

<!-- section: TAKEOVER_BATCH_SYSTEM -->
你正在执行旧聊天接管的历史批次分析任务。
请优先复用 knownContext 与 knownEntities，保持 compareKey、entityKey、bindings 的稳定性。
- compareKey 采用 ck:v2 协议。
- entityKey 是内部稳定主键，compareKey 是跨流程归并键，matchKeys 只做模糊候选。
- 关系必须保留 sourceActorKey、targetActorKey、relationTag 的结构语义。
- 任务、事件、世界状态、实体优先输出结构化主源，不要只给模糊摘要。
- 你输出的是故事世界内部可读的记忆文本，不是系统日志、不是批处理说明、不是分析报告。
- 所有自然语言字段中，凡是指代主角/玩家，一律使用 `{{user}}`。
- 禁止使用：用户、主角、你、主人公、对方、本批次、本轮、当前剧情、当前场景、当前设置地点、当前设置、首次识别到、已触发、已确认、结构化、绑定、主链、输出内容、处理结果、待补全、需要进一步确认。
- 只有 story_narrative 与 story_dialogue 可作为正式抽取主源；meta 分析、instruction、tool artifact、thought-like 文本不能直接产出正式角色与主链事实。
- 正式角色仅限于：在正文里实际出场并参与行动、对话、关系推进的人物；与 `{{user}}` 或其他已确认角色形成明确关系的人物；在本批因果链中起关键作用的人物。
- 只在分析说明、未来构思、summary、details、tableEdit、think 文本里出现的人物，只能视为候选线索，不得直接写入 actorCards。
- 群体词、身份 title、地点名、组织名、任务名不得误判成角色。
- 只输出 JSON。

<!-- section: TAKEOVER_BATCH_SCHEMA -->
```json
{
  "type": "object",
  "required": ["batchId", "summary", "actorCards", "relationships", "entityCards", "entityTransitions", "stableFacts", "relationTransitions", "taskTransitions", "worldStateChanges", "openThreads", "chapterTags", "sourceRange"]
}
```

<!-- section: TAKEOVER_BATCH_OUTPUT_SAMPLE -->
```json
{
  "batchId": "takeover:demo:history:0001",
  "summary": "{{user}}一行人在撤离途中进一步稳固了同行关系，任务线也因此继续向前推进。",
  "actorCards": [
    {
      "actorKey": "actor_erin",
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
      "targetActorKey": "actor_erin",
      "participants": ["user", "actor_erin"],
      "relationTag": "朋友",
      "state": "{{user}}与艾琳已经形成谨慎但有效的合作关系。",
      "summary": "两人在同行与试探中逐渐建立起可持续推进的信任。",
      "trust": 0.72,
      "affection": 0.38,
      "tension": 0.17
    }
  ],
  "entityCards": [
    {
      "entityType": "organization",
      "entityKey": "entity:organization:night_raven",
      "compareKey": "ck:v2:organization:夜鸦组:王都",
      "matchKeys": ["mk:organization:夜鸦组"],
      "schemaVersion": "v2",
      "canonicalName": "夜鸦组",
      "title": "夜鸦组",
      "aliases": [],
      "summary": "艾琳所属的情报组织。",
      "fields": {
        "subtype": "intelligence",
        "baseCity": "王都",
        "status": "active"
      },
      "confidence": 0.88,
      "bindings": {
        "actors": ["actor_erin"],
        "organizations": [],
        "cities": ["entity:city:royal_capital"],
        "locations": [],
        "nations": [],
        "tasks": ["entity:task:escort_messenger"],
        "events": []
      },
      "reasonCodes": ["organization_referenced_repeatedly"]
    }
  ],
  "entityTransitions": [],
  "stableFacts": [
    {
      "type": "event",
      "subject": "艾琳",
      "predicate": "确认",
      "value": "北城门是当前最可行的撤离路线",
      "confidence": 0.86,
      "title": "确认北城门撤离路线",
      "summary": "艾琳确认北城门是当前阶段最可行的撤离路线。",
      "entityKey": "entity:event:north_gate_route",
      "compareKey": "ck:v2:event:确认北城门撤离路线:王都",
      "matchKeys": ["mk:event:确认北城门撤离路线"],
      "schemaVersion": "v2",
      "canonicalName": "确认北城门撤离路线",
      "bindings": {
        "actors": ["actor_erin", "user"],
        "organizations": ["entity:organization:night_raven"],
        "cities": ["entity:city:royal_capital"],
        "locations": ["entity:location:north_gate"],
        "nations": [],
        "tasks": ["entity:task:escort_messenger"],
        "events": []
      },
      "status": "active",
      "importance": 0.82,
      "reasonCodes": ["event_bindings_confirmed"]
    }
  ],
  "relationTransitions": [
    {
      "target": "actor_erin",
      "from": "陌生试探",
      "to": "谨慎合作",
      "reason": "双方确认共同目标并共同承担风险。",
      "relationTag": "朋友",
      "targetType": "actor",
      "bindings": {
        "actors": ["user", "actor_erin"],
        "organizations": [],
        "cities": ["entity:city:royal_capital"],
        "locations": ["entity:location:north_gate"],
        "nations": [],
        "tasks": ["entity:task:escort_messenger"],
        "events": ["entity:event:north_gate_route"]
      },
      "reasonCodes": ["relationship_progressed"]
    }
  ],
  "taskTransitions": [
    {
      "task": "护送密使离开王都",
      "from": "未开始",
      "to": "进行中",
      "title": "护送密使离开王都",
      "summary": "双方已经从确认情报进入正式撤离执行。",
      "description": "当前重点是确保密使安全通过北城门。",
      "goal": "确保密使安全离城",
      "status": "进行中",
      "entityKey": "entity:task:escort_messenger",
      "compareKey": "ck:v2:task:护送密使离开王都:王都",
      "matchKeys": ["mk:task:护送密使离开王都"],
      "schemaVersion": "v2",
      "canonicalName": "护送密使离开王都",
      "bindings": {
        "actors": ["user", "actor_erin"],
        "organizations": ["entity:organization:night_raven"],
        "cities": ["entity:city:royal_capital"],
        "locations": ["entity:location:north_gate"],
        "nations": [],
        "tasks": [],
        "events": []
      },
      "reasonCodes": ["task_update_preferred"]
    }
  ],
  "worldStateChanges": [
    {
      "key": "王都夜禁",
      "value": "持续执行中",
      "summary": "夜禁仍然有效，直接影响撤离路径选择。",
      "bindings": {
        "actors": ["user", "actor_erin"],
        "organizations": ["entity:organization:night_raven"],
        "cities": ["entity:city:royal_capital"],
        "locations": ["entity:location:north_gate"],
        "nations": [],
        "tasks": ["entity:task:escort_messenger"],
        "events": ["entity:event:north_gate_route"]
      },
      "entityKey": "entity:world_state:royal_capital_curfew",
      "compareKey": "ck:v2:world_global_state:王都夜禁:global",
      "matchKeys": ["mk:world_global_state:王都夜禁"],
      "schemaVersion": "v2",
      "canonicalName": "王都夜禁",
      "reasonCodes": ["world_state_confirmed"]
    }
  ],
  "openThreads": ["北城门是否会临时关闭仍未确认"],
  "chapterTags": ["关系推进", "任务开启", "夜禁影响"],
  "sourceRange": {
    "startFloor": 1,
    "endFloor": 30
  }
}
```

<!-- section: TAKEOVER_CONFLICT_RESOLUTION_SCHEMA -->
```json
{
  "type": "object",
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
      "primaryKey": "entity:organization:night_raven",
      "secondaryKeys": ["entity:organization:night_raven_alias"],
      "fieldOverrides": {},
      "reasonCodes": ["llm_conflict_merge"]
    }
  ]
}
```

<!-- section: TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA -->
```json
{
  "type": "object",
  "required": ["domain", "conflictType", "buckets", "patches"],
  "properties": {
    "domain": { "type": "string" },
    "conflictType": { "type": "string" },
    "buckets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["bucketId", "domain", "conflictType", "records"]
      }
    },
    "patches": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["bucketId", "domain", "resolutions"]
      }
    }
  }
}
```

<!-- section: TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE -->
```json
{
  "domain": "relationship",
  "conflictType": "state_divergence",
  "buckets": [
    {
      "bucketId": "relationship/state_divergence/user_actor_erin",
      "domain": "relationship",
      "conflictType": "state_divergence",
      "records": [
        {
          "sourceActorKey": "user",
          "targetActorKey": "actor_erin",
          "participants": ["user", "actor_erin"],
          "relationTag": "朋友",
          "state": "双方已建立谨慎合作。",
          "summary": "形成了可继续推进的合作关系。"
        }
      ]
    }
  ],
  "patches": [
    {
      "bucketId": "relationship/state_divergence/user_actor_erin",
      "domain": "relationship",
      "resolutions": [
        {
          "action": "merge",
          "primaryKey": "relationship:user:actor_erin:朋友",
          "secondaryKeys": [],
          "fieldOverrides": {},
          "reasonCodes": ["llm_conflict_merge"]
        }
      ]
    }
  ]
}
```
