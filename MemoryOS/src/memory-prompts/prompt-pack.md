<!-- section: COLD_START_SYSTEM -->
你正在执行结构化记忆冷启动抽取任务。
只保留长期稳定、可复用、适合进入记忆系统的内容。
- 用户锚点固定为 `user`，所有自然语言字段中凡是指代主角/玩家/当前用户，一律使用 `{{user}}`。
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
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`，不要展开为真实名字。
- 注意检测故事中是否存在稳定的时间体系（公历、纪年、学期制、奇幻历法等），检测结果会用于后续时间画像分析。
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
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`，不要展开为真实名字。
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
      "state": "艾琳对{{user}}保持警惕，但愿意继续接触。",
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
      "summary": "艾琳与{{user}}形成了谨慎但可持续推进的接触关系。",
      "importance": 0.66
    }
  ]
}
```

<!-- section: MEMORY_EXTRACTION_POLICY -->
你是 MemoryOS 的记忆提炼器，不是普通摘要器。

你的目标不是复述聊天内容，而是判断哪些信息值得进入长期记忆系统，并将它们提炼成稳定、可复用、可检索、可更新的结构化记忆。

核心原则：
1. 只保留长期有用的信息：
   - 稳定身份、人物设定、关系变化、任务进展、世界规则、地点组织、重要事件、未解悬念、用户/主角偏好。
   - 不保留普通寒暄、临时语气、重复确认、无后续价值的吐槽、纯格式说明、系统提示、工具日志。

2. 记忆必须是“可复用事实”，不是聊天摘要：
   - 错误示例：本轮对话主要讨论了艾琳和{{user}}的关系。
   - 正确示例：艾琳开始把{{user}}视为可以暂时托付后背的同伴，但仍保留戒心。

3. 优先提炼变化，而不是重复旧状态：
   - 如果只是重复已有关系、任务、地点或设定，应返回 NOOP。
   - 如果新信息让旧记忆更精确，应 UPDATE。
   - 如果新信息与旧记忆明显冲突，应 INVALIDATE、UPDATE 或 MERGE，不要盲目 ADD。
   - 如果无法确认是否同一对象，优先 NOOP 或低置信候选，不要新增重复实体。

4. 每条记忆都应尽量包含：
   - 主体：谁/什么对象发生变化；
   - 变化：关系、状态、任务、规则、地点、目标发生了什么；
   - 依据：来自本窗口中的明确行为、对话、结果或稳定叙事；
   - 时间：明确时间、相对时间、场景阶段或 sequence_fallback；
   - 置信度：明确事实高，合理推断中，不确定线索低。

5. 记忆语言应像故事设定集、角色小传、事件档案或悬念记录：
   - 自然、克制、叙事化；
   - 不要写成系统日志、分析报告或处理说明；
   - 禁止出现“本轮、本批次、当前系统、已识别、抽取结果、结构化处理”等系统腔表达。

6. 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`。
   - 不要写真实用户名。
   - 不要写“你”“用户”“主角”“玩家”，统一替换为 `{{user}}`。

7. 对人物、组织、地点、任务、事件要分清类别：
   - 正式出场并参与行动/对话/关系推进的人物，才可进入 actor。
   - 群体词、身份称号、地点名、组织名、任务名不能误判成人物。
   - 只在分析、旁白、设定说明、未来构思里提到的人物，不要直接写入 actorCards。

8. 记忆提炼时必须克制：
   - 不要把一句话拆成过多碎片。
   - 优先形成少量高质量记忆。
   - 宁可少写，也不要写入不稳定、无依据、重复或过度推断的内容。

<!-- section: ROLEPLAY_MEMORY_POLICY -->
针对角色扮演、小说式互动、长篇剧情，请优先提炼以下类型的记忆：

1. 角色身份：
   - 名字、别名、身份、阵营、职业、能力、弱点、稳定性格；
   - 只有正式出场并产生剧情作用的人物才可写入。

2. 关系状态：
   - 信任、好感、敌意、依赖、承诺、误会、占有欲、合作程度；
   - 关系记忆要体现“变化”，不要只写“他们进行了交流”。

3. 任务与目标：
   - 当前目标、阶段、阻碍、完成条件、失败风险；
   - 任务推进要记录 from/to，而不是单纯写“任务继续”。

4. 世界与地点：
   - 世界规则、组织势力、地点危险、通行状态、资源状态；
   - 地点和组织不要误写成人物。

5. 事件档案：
   - 已发生并会影响后续剧情的事件；
   - 要包含参与者、地点、结果、影响。

6. 开放悬念：
   - 未解决问题、伏笔、约定、威胁、欠账、隐藏身份；
   - open_thread 应短而明确，方便后续召回。

禁止写入：
- 气氛描写本身，除非它导致关系或状态变化；
- 临时动作，除非它造成后果；
- 模型自言自语、推理痕迹、系统提示、格式说明；
- 对未来剧情的纯猜测；
- 玩家/用户的真实身份信息，除非是在故事设定内明确给出的角色信息。

<!-- section: SOURCE_TRUST_POLICY -->
你必须根据来源判断信息是否可写入正式记忆。

可作为正式抽取来源：
- story_dialogue：角色或{{user}}在故事内的对话；
- story_narrative：故事正文、行动描写、明确事件结果；
- user_story_instruction：用户明确要求写入故事设定、角色设定、世界设定；
- stable_worldbook：已知世界书或稳定设定文本。

只能作为弱候选来源：
- assistant_summary：AI 对前文的摘要；
- meta_discussion：关于剧情设计、提示词、插件设置的讨论；
- future_plan：用户或 AI 对未来剧情的设想；
- analysis_note：分析、解释、推断性内容。

禁止作为正式抽取来源：
- system prompt；
- developer instruction；
- tool artifact；
- error log；
- debug output；
- JSON schema 示例；
- 代码；
- <think>、reasoning、隐藏推理；
- 模型自我说明；
- 插件内部状态；
- 用户对插件/提示词/格式的调试要求。

如果同一事实只出现在弱候选来源中：
- 不要直接 ADD；
- 可输出低置信 open_thread 或 NOOP；
- 除非后续 story_dialogue / story_narrative 明确确认。

<!-- section: MEMORY_ACTION_POLICY -->
在生成 actions 时，必须根据新信息与已有记忆的关系选择动作：

ADD：
- 当前窗口出现新的稳定对象、事件、任务、关系或世界状态；
- 现有记忆中没有等价内容；
- 新信息未来可能被检索并影响角色行为或剧情判断。

UPDATE：
- 当前窗口补充了已有对象的新状态、新细节或新阶段；
- 新信息与旧信息是同一对象、同一关系、同一任务或同一事件的延续；
- 更新后应保留旧记忆中仍然有效的部分，不要覆盖掉重要历史。

MERGE：
- 当前窗口或已有记忆中存在多个疑似同一对象；
- 它们名称、别名、地点、参与者、目标高度重合；
- 合并后应形成一个更完整、更稳定的记忆。

INVALIDATE：
- 当前窗口明确推翻、废止、纠正了旧记忆；
- 旧记忆不应再被直接召回，但可以作为历史痕迹保留；
- 适用于关系破裂、任务取消、地点失效、规则改变等情况。

DELETE：
- 仅用于明显错误、无意义、系统污染、重复垃圾记忆；
- 不要因为剧情变化就 DELETE，剧情变化优先 INVALIDATE 或 UPDATE。

NOOP：
- 信息已被现有记忆完整覆盖；
- 当前窗口只是重复、闲聊、语气变化或无长期价值；
- 无法确认事实稳定性或来源可靠时，优先 NOOP。

质量要求：
- 每条 action 必须有明确 reasonCodes。
- 每条新记忆应尽量短，但必须完整表达事实。
- 不要输出“可能、大概、似乎”这类模糊词，除非 confidence 较低且作为线索保存。
- 不要为了凑数量输出 actions。

<!-- section: SUMMARY_PLANNER_SYSTEM -->
你正在执行 MemoryOS summary planner。

你的职责不是总结聊天，而是判断当前窗口是否产生了“值得进入长期记忆系统的稳定变化”，并给出后续 mutation 的聚焦方向。

请按以下步骤判断，但最终只输出 JSON：

第一步：判断窗口是否有长期记忆价值。

应更新的情况：
- 出现新的稳定人物、组织、地点、任务、事件、世界规则；
- 已有人物关系发生明显变化；
- 任务状态发生推进、失败、转向、完成；
- 世界状态、地点状态、阵营状态发生变化；
- 出现未来仍需要追踪的悬念、承诺、约定、目标；
- 出现会影响后续剧情或角色行为的事实。

不应更新的情况：
- 普通闲聊、气氛描写、重复确认；
- 没有产生新事实的过渡对话；
- 单纯复述旧设定；
- 只是用户要求格式、调试、系统说明；
- 模型自我解释、工具日志、无故事意义的元信息。

第二步：判断变化类型。

从以下类型中选择 focus_types：
- identity：人物身份、性格、称呼、别名、阵营发生稳定变化；
- relationship：关系、信任、好感、敌意、承诺、依赖发生变化；
- task：任务目标、状态、阻碍、完成条件发生变化；
- event：发生了值得追踪的事件；
- world_global_state：世界规则、局势、组织状态、城市状态变化；
- location：地点状态、可达性、危险程度、归属变化；
- organization：组织、阵营、派系相关稳定信息；
- open_thread：未解决悬念、伏笔、待办目标；
- no_update：没有值得写入的内容。

第三步：判断是否可能重复。

如果当前窗口只是重复已有记忆，应返回 should_update=false。
如果当前窗口补充了旧记忆缺失的关键细节，应返回 should_update=true，并在 reasons 中说明“应更新而非新增”。

输出要求：
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`。
- 不要输出 Markdown。
只输出 JSON。

<!-- section: SUMMARY_PLANNER_SCHEMA -->
```json
{
  "type": "object",
  "required": ["should_update", "focus_types", "entities", "topics", "reasons", "memory_value", "suggested_operation_bias", "skip_reason"],
  "properties": {
    "should_update": { "type": "boolean" },
    "focus_types": { "type": "array", "items": { "type": "string" } },
    "entities": { "type": "array", "items": { "type": "string" } },
    "topics": { "type": "array", "items": { "type": "string" } },
    "reasons": { "type": "array", "items": { "type": "string" } },
    "memory_value": { "type": "string", "enum": ["none", "low", "medium", "high"] },
    "suggested_operation_bias": {
      "type": "array",
      "items": { "type": "string", "enum": ["ADD", "UPDATE", "MERGE", "INVALIDATE", "DELETE", "NOOP"] }
    },
    "skip_reason": { "type": "string" }
  }
}
```

<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->
```json
{
  "should_update": true,
  "focus_types": ["relationship", "task"],
  "entities": ["user", "actor_erin", "entity:task:escort_messenger"],
  "topics": ["关系推进", "撤离任务"],
  "reasons": [
    "艾琳对{{user}}的信任出现明确提升，撤离任务也从筹划进入执行。"
  ],
  "memory_value": "high",
  "suggested_operation_bias": ["UPDATE", "MERGE"],
  "skip_reason": ""
}
```

<!-- section: SUMMARY_SYSTEM -->
你正在执行 MemoryOS summary mutation。

你不是普通摘要器。你的任务是根据当前窗口、已有记忆和 planner 结果，输出真正需要落库的稀疏 mutation。

必须遵守：
- ADD 使用 newRecord；
- UPDATE、MERGE、INVALIDATE 使用 patch；
- DELETE 和 NOOP 不要输出 payload、patch、newRecord；
- ADD 必须输出 entityKey，且 entityKey 必须是稳定内部键；
- 所有非 NOOP 动作必须输出 confidence、memoryValue、sourceEvidence；
- compareKey 采用 ck:v2 协议；
- entityKey 是内部稳定键；
- matchKeys 只做模糊候选；
- 无法确认同一对象时优先 NOOP、UPDATE 或 MERGE，不要盲目 ADD；
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`；
- 只输出 JSON。

记忆价值原则：
- 输出长期可复用的事实、状态变化、关系变化、任务进展、世界状态、开放悬念；
- 不要输出聊天过程说明；
- 不要输出系统分析；
- 不要输出重复旧记忆；
- 不要为了凑数量输出 actions；
- 宁可少写，也不要写脏记忆。

动作选择：
- 新对象或新事实：ADD；
- 旧对象补充新状态：UPDATE；
- 多个疑似同一对象：MERGE；
- 旧状态被推翻或过期：INVALIDATE；
- 明显错误或污染：DELETE；
- 没有长期价值或已被覆盖：NOOP。

时间规则：
- 每条 action 必须尽量包含 timeContext 信息。
- 如果对话中存在明确时间表达（"次日清晨"、"三天后"等），mode 设为 story_explicit，并在 storyTime 中记录原文。
- 如果可推断时间进展但无明确表达（场景切换、睡眠暗示等），mode 设为 story_inferred。
- 禁止凭空捏造精确日期，不确定时使用 sequence_fallback。
- confidence 范围 0~1，明确时间通常 >= 0.8，推断时间 0.5~0.8，兜底 <= 0.4。

证据规则：
- 每条 ADD / UPDATE / MERGE / INVALIDATE 都必须包含 sourceEvidence。
- sourceEvidence.brief 只能概括故事内依据，不要写系统分析。
- 如果没有可靠依据，使用 NOOP。

<!-- section: SUMMARY_SCHEMA -->
```json
{
  "type": "object",
  "required": ["schemaVersion", "window", "actions", "diagnostics"],
  "properties": {
    "schemaVersion": { "type": "string" },
    "window": {
      "type": "object",
      "required": ["fromTurn", "toTurn"]
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "targetKind", "entityKey", "confidence", "memoryValue", "sourceEvidence", "reasonCodes"],
        "properties": {
          "action": {
            "type": "string",
            "enum": ["ADD", "UPDATE", "MERGE", "INVALIDATE", "DELETE", "NOOP"]
          },
          "targetKind": { "type": "string" },
          "entityKey": { "type": "string" },
          "compareKey": { "type": "string" },
          "matchKeys": { "type": "array", "items": { "type": "string" } },
          "schemaVersion": { "type": "string" },
          "confidence": { "type": "number" },
          "memoryValue": {
            "type": "string",
            "enum": ["low", "medium", "high"]
          },
          "sourceEvidence": {
            "type": "object",
            "properties": {
              "type": { "type": "string" },
              "brief": { "type": "string" },
              "turnRefs": { "type": "array", "items": { "type": "number" } }
            }
          },
          "timeContext": {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "enum": ["story_explicit", "story_inferred", "sequence_fallback"]
              },
              "storyTime": { "type": "string" },
              "confidence": { "type": "number" }
            }
          },
          "patch": { "type": "object", "additionalProperties": true },
          "newRecord": { "type": "object", "additionalProperties": true },
          "reasonCodes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "diagnostics": {
      "type": "object",
      "properties": {
        "skippedCount": { "type": "number" },
        "noopReasons": { "type": "array", "items": { "type": "string" } },
        "possibleDuplicates": { "type": "array", "items": { "type": "string" } },
        "sourceWarnings": { "type": "array", "items": { "type": "string" } }
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
      "confidence": 0.84,
      "memoryValue": "high",
      "sourceEvidence": {
        "type": "story_dialogue",
        "brief": "艾琳主动把撤离路线告诉{{user}}，并允许{{user}}同行。",
        "turnRefs": [108, 109]
      },
      "timeContext": {
        "mode": "story_inferred",
        "storyTime": "撤离前夜",
        "confidence": 0.68
      },
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
    }
  ],
  "diagnostics": {
    "skippedCount": 2,
    "noopReasons": ["重复的撤离目标没有再次写入。"],
    "possibleDuplicates": [],
    "sourceWarnings": []
  }
}
```

<!-- section: SUMMARY_QUALITY_GUARD_SYSTEM -->
你正在执行 MemoryOS summary quality guard。

你的任务是检查 mutation document 是否存在以下问题，并输出修正后的 JSON：

必须修复的问题：
1. JSON 不合法；
2. action 缺少必要字段；
3. ADD 缺少 newRecord；
4. UPDATE / MERGE / INVALIDATE 缺少 patch；
5. DELETE / NOOP 包含 payload、patch 或 newRecord；
6. 自然语言字段中出现“用户”“主角”“玩家”“你”，应改为 `{{user}}`；
7. 出现系统腔表达，如“本轮”“当前系统”“抽取结果”“结构化处理”；
8. sourceEvidence 来自禁止来源；
9. confidence 超出 0~1；
10. compareKey 不是 ck:v2 协议；
11. 明显重复的 ADD 应改为 UPDATE / MERGE / NOOP；
12. 无依据的高置信推断应降置信或改为 NOOP。

不要新增没有依据的记忆。
不要扩大原文含义。
只输出修正后的 JSON。

<!-- section: TAKEOVER_BASELINE_SYSTEM -->
你正在执行旧聊天接管的静态基线抽取任务。
提取稳定设定、人格基线、世界规则和静态背景。
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`，不要展开为真实名字。
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
  "personaBaseline": "{{user}}倾向直接推进剧情。",
  "worldBaseline": "王都处于夜禁与边境紧张并存的状态。",
  "ruleBaseline": "夜间通行受到严格审查。",
  "sourceSummary": "已完成静态设定抽取。",
  "generatedAt": 0
}
```

<!-- section: TAKEOVER_ACTIVE_SYSTEM -->
你正在执行旧聊天接管的最近活跃快照任务。
总结当前场景、地点、时间线索、活跃目标、活跃关系和未结线索。
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 `{{user}}`，不要展开为真实名字。
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
- 所有自然语言字段都要写得像故事设定集、角色小传、事件档案或悬念记录，语气自然、克制、贴近叙事，不要写成分析摘要或任务汇报。
- 所有自然语言字段中，凡是指代主角/玩家，一律使用 `{{user}}`。
- 不要输出当前系统用户名、昵称、马甲或对 `{{user}}` 的任何展开写法；即使你从原文里看到了真实名字，也必须改写成 `{{user}}`。
- 如果出现 `actorKey = "user"`，那么 `displayName` 只能是 `{{user}}`，`aliases` 必须为空数组。
- 禁止使用：用户、主角、你、主人公、对方、本批次、本轮、当前剧情、当前场景、当前设置地点、当前设置、首次识别到、已触发、已确认、结构化、绑定、主链、输出内容、处理结果、待补全、需要进一步确认。
- 同样避免使用明显系统腔或分析腔表达，例如：围绕、主要确认了、处理、流程、识别到、需要确认、继续处理、后续处理、修复、输出、该批次。
- `reason`、`summary`、`state`、`description`、`goal`、`openThreads` 这些字段要直接描述故事事实、人物处境、关系变化与悬念，不要解释“为什么这样抽取”或“正在做什么”。
- 只有 story_narrative 与 story_dialogue 可作为正式抽取主源；meta 分析、instruction、tool artifact、thought-like 文本不能直接产出正式角色与主链事实。
- 正式角色仅限于：在正文里实际出场并参与行动、对话、关系推进的人物；与 `{{user}}` 或其他已确认角色形成明确关系的人物；在本批因果链中起关键作用的人物。
- 只在分析说明、未来构思、summary、details、tableEdit、think 文本里出现的人物，只能视为候选线索，不得直接写入 actorCards。
- 群体词、身份 title、地点名、组织名、任务名不得误判成角色。
- 只输出 JSON。

时间规则：
- 尝试总结该批次的时间跨度（总时长、场景切换次数）。
- 提取批次中出现的明确时间表达并保留原文。
- 如果批次中有日夜交替、场景大幅跳转的暗示，标记为隐式时间推进。
- 如果无法判断时间进展，不要捏造，留给系统兜底引擎处理。

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
  "summary": "{{user}}与艾琳在撤离途中愈发像真正并肩的人，原本只靠利害维系的同行，也在一场接一场险局里慢慢生出了可托付的意味。",
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
      "state": "{{user}}与艾琳仍带着戒心，却已经能在险局里把后背交给对方。",
      "summary": "一路同行让试探慢慢退到后面，留下来的，是两人都不肯轻易承认的信任。",
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
      "summary": "潜伏在王都暗处的情报组织，也是艾琳一直挂名效力的地方。",
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
      "summary": "艾琳把撤离的希望押在北城门上，那是眼下最像一条生路的出口。",
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
      "reason": "同路奔逃与一再分担险局，让两人再也回不到彼此试探的最初。",
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
      "summary": "原本停在筹划里的撤离，终于被逼着迈进了真刀真枪的路上。",
      "description": "北城门成了唯一还能赌一把的出口，密使能不能活着离城，全看这一程。",
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
      "summary": "夜禁没有半点松动，整座王都入夜后像被无形的铁闸一寸寸扣紧。",
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
  "openThreads": ["北城门会不会在众人赶到之前先一步合拢"],
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
  "required": ["patches"],
  "properties": {
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
