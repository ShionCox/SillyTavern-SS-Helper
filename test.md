# 最优先的优化方向

## 1. 把 recall 分成“全局池”和“角色池”

这是我认为收益最高的一步。

你现在的 `RecallSourceContext` 已经包含：

* `logicalView`
* `groupMemory`
* `relationships`
* `personaProfile`
* `lifecycleIndex`
* `chatStateManager` 

这已经足够支持你做双池 recall。

### 我建议怎么拆

#### 全局池

只放共享上下文：

* recent events
* shared scene / groupMemory
* world state
* lorebook
* 共享 summary
* 公共 relationship 变化

这部分给“导演层”。

#### 角色池

只放当前 active actor 相关：

* `ownerActorKey === activeActorKey` 的记忆
* `perActorMetrics[activeActorKey]` 仍未 forgotten 的记忆
* 当前 actor 对他人的 relationship
* 当前 actor 的目标 / 情绪 /偏见

这部分给“角色边界层”。

### 为什么现在就适合做

你类型里已经有：

* `activeActorKey`
* `personaMemoryProfiles`
* `ownerActorKey`
* `perActorMetrics`
* `MemoryActorRetentionState` 

所以不用重做模型，只是 recall planner / assembler 要学会按 actor 过滤。

---

## 2. 在 `RecallPlan` 里加一个“viewpoint”

你现在 `RecallPlan` 已经有：

* intent
* sections
* budgets
* sourceWeights
* sourceLimits
* sectionWeights
* coarseTopK/fineTopK 

下一步最应该加的是：

```ts
viewpoint: {
  mode: 'omniscient_director' | 'actor_bounded';
  activeActorKey?: string | null;
  allowSharedScene: boolean;
  allowWorldState: boolean;
  allowForeignPrivateMemory: boolean;
}
```

### 作用

这样 planner 不只是决定“找哪些 source”，还决定“这轮用谁的视角找”。

### 最实用的默认规则

* narrator / scene continuation：`omniscient_director`
* 角色台词 / 角色行动：`actor_bounded`

这样模型还是一个，但 recall 不再是一锅炖。

---

## 3. 在 `buildScoredCandidate()` 里加入 actor 可见性特征

现在 `buildScoredCandidate()` 主要看：

* keywordScore
* vectorScore
* recencyScore
* continuityScore
* relationshipScore
* emotionScore
* privacyPenalty
* conflictPenalty
* persona/tuning influence 

这已经很好了，但还缺一个关键维度：

### `actorVisibilityScore`

比如：

* 该条记忆 owner 就是当前 actor → 1.0
* 该条记忆在 `perActorMetrics[currentActor]` 中且未 forgotten → 0.85
* 共享场景 / 公共世界信息 → 0.7
* 其他角色私人记忆 → 0 或极低

然后把它并入 roughScore / fineScore。

### 这样做的好处

你就不是“最后在 prompt 提醒模型别乱用”，而是**在召回阶段就不让不该出现的私人记忆进来**。

---

## 4. 把 `perActorMetrics` 真正接进 recall source

这是目前最大机会点之一。

现在 `MemoryLifecycleState` 明明已经有 `perActorMetrics?: MemoryActorRetentionMap` 
但从 `shared.ts` 和各 source 的建 candidate 逻辑看，主要还是在读：

* lifecycle.stage
* relationScope
* emotionTag
* personaProfile
* relationshipWeight 

### 也就是说

“每个 actor 的遗忘状态”这张好牌，当前还没真正成为 recall 主逻辑的一等特征。

### 我建议

在 `readLifecycle()` 基础上，再加：

```ts
readActorRetention(context, recordKey, actorKey)
```

然后在 candidate 里新增：

* `actorForgetProbability`
* `actorForgotten`
* `actorRetentionBias`

然后排序里做：

* actorForgotten → 强抑制
* forgetProbability 高 → 降分或改 tone
* blur/distorted → uncertain tone

这样“角色有自己的记性”才会真正体现在输出里。

---

# 第二优先级优化

## 5. 明确“共享记忆”和“私人记忆”的规则

你现在已经有：

* `ownerActorKey`
* `sourceScope`
* `memoryType`
* `memorySubtype` 

但系统还缺一个更直观的 recall 规则表。

### 我建议直接定死

#### 共享记忆

可进入全局池：

* world
* current_scene
* current_conflict
* public event
* shared relationship shift

#### 私人记忆

只进入角色池：

* secret
* promise
* emotion_imprint
* bond
* self-identity detail
* private preference

#### 模糊地带

按 `sourceScope` 和 `ownerActorKey` 判：

* `sourceScope = group/world` → 偏共享
* `sourceScope = self/target` → 偏私人

这样后续 source provider 写起来会非常清楚。

---

## 6. 给 ranker 增加“角色边界压制”

`rankRecallCandidates()` 现在已经有：

* priority
* duplicate suppression
* visible duplicate suppression
* contradiction penalty
* token cost penalty
* scene continuity bonus 等 

下一步再加一个规则就会非常强：

### `foreign_private_memory_suppressed`

触发条件：

* actor-bounded mode
* candidate 属于其他 actor 的私人记忆
* 且不是共享 scene/world

那么：

* 降分
* 标记 reasonCodes
* 默认不 selected

### 这样效果会很明显

模型还是用统一 prompt，但不会再轻易表现成“所有角色共享脑子”。

---

## 7. 让 explanation 直接展示“为什么这条记忆能被当前角色看到”

`LatestRecallExplanation` 现在已经很好了，但它更偏：

* selected
* conflictSuppressed
* rejectedCandidates 

下一步如果你真要把“角色边界”做成系统卖点，解释层最好加两个 reason 方向：

* `viewpoint:shared`
* `viewpoint:owned_by_actor`
* `viewpoint:retained_for_actor`
* `viewpoint:foreign_private_suppressed`

这样你调试的时候会特别直观。

---

# 第三优先级优化

## 8. 让 `groupMemory.actorSalience` 真正驱动 active actor

你现在 `groupMemory` 已经有：

* lanes
* sharedScene
* actorSalience 

而 `ChatStateManager` 里也会根据 view 重建 lanes 和 salience 

### 但下一步应该更进一步

每轮生成前先决定：

* 当前主视角 actorKey
* 次要相关 actorKeys
* 全局池和角色池各自的 budget

比如：

* 当前说话人 actor → 主
* salience top1/2 → 辅
* 其他人只走共享信息

这样 recall 会更像“场上谁在活跃，就优先给谁的脑子”。

---

## 9. relationship 也该逐步接入统一遗忘/可见性

这是现在还不够统一的一层。

`RelationshipState` 目前是结构化状态，没有原生 `forgetProbability / forgotten` 字段 
所以你现在虽然能用 relationship 做 recall weight，但还不够像“角色自己的关系记忆”。

### 建议

短期先不改表结构太猛，可以先：

* 保留 `relationship_memory` 作为关系真相源
* 在 recall 阶段根据 active actor 和生命周期，临时映射出“该 actor 对这段关系的可见性/记忆强度”
* 后面再决定要不要把遗忘字段真正写回 relationship rows

---

## 10. vector source 要改成“直接回源记录”，别再靠文本反查

这是架构外但非常值的一刀。

现在 `vector-source.ts` 还是：

* search hits
* normalized content
* 去 factMap/summaryMap 反查原记录 

### 问题

这会有偶发错配/丢配。

### 最值得改的方式

索引时直接在 chunk metadata 里带：

* sourceRecordKey
* sourceRecordKind
* ownerActorKey
* sourceScope
* maybe memoryType / memorySubtype

这样向量 hit 一回来，就直接知道：

* 它是谁的记忆
* 它是不是私人记忆
* 当前 actor 能不能看

这个改动和“角色边界 recall”是强耦合的，收益很大。

---

# 冗余和结构清理建议

## 11. 把 `InjectionManager` 里的旧 section builder 残留删掉

这是现在最明显的技术债。

当前主链已经是 candidate 驱动，但文件里还残留大量旧函数：

* `buildFactsSection`
* `buildSummarySection`
* `buildWorldStateSectionV2`
* `buildRelationshipsSection`
* `buildLastSceneSection`
* `scoreSectionCandidate`
* `RecallSectionCandidate` 等 

### 我的建议

这批东西如果确认不再走主链，就：

* 直接删
* 不要再留在主注入文件里

因为现在最大的可维护性负担，就是“新架构已经成立，但旧流还躺在一个大文件里”。

---

## 12. 再把 `InjectionManager` 瘦一层

我会继续拆出：

* `recall-context-builder.ts`
* `prompt-memory-renderer.ts`
* `recall-log-mapper.ts`
* `viewpoint-policy.ts`

这样以后你调“角色边界”时，只改 recall 层和 viewpoint 层，不会碰太多 prompt orchestration。

---

# 如果你要一套最实际的优化落地顺序

我建议按下面顺序做，性价比最高：

## 第一步

**引入 viewpoint 模式**

* 在 `RecallPlan` 里加 active actor / viewpoint
* planner 决定这轮是 director 还是 actor-bounded

## 第二步

**candidate 增加 actor 可见性**

* 读取 ownerActorKey / perActorMetrics
* 加 `actorVisibilityScore`
* ranker 加 `foreign_private_memory_suppressed`

## 第三步

**双池注入**

* Global Director Context
* Active Character Memory

## 第四步

**vector metadata 直连回源**

* 不再靠文本反查

## 第五步

**清理旧 section builder / 瘦身 InjectionManager**

* 收技术债

---

# 最后的整体判断

你这套系统最新版已经不需要“重新设计一遍”，而是应该进入：

**从“主链正确”升级到“视角正确”。**

也就是：

* 现在已经会找记忆了
* 下一步要学会“按谁的脑子找记忆”

这是最关键的升级方向。

一句话总结：

**保留 AI 的上帝视角调度能力，但把角色边界前移到 recall/rank 阶段，而不是等 prompt 最后再口头提醒。**

如果你愿意，我下一条可以直接给你一份 **“按文件修改的具体优化 patch 方案”**。
