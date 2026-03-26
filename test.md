### 1. 把 recall need 从“硬规则判 lane”收成“宽 gate + lane hint”

现在 `shouldRunVectorRecall()` 已经是宽 gate 了，只要策略允许，就会开搜；但 `classifyRecallNeed()` 仍然主要靠 regex 把 query 归类，然后 `resolveVectorRecallLanes()` 决定 lane。也就是说，**主 gate 已经对了，但 lane 侧还偏规则驱动**。

这一阶段里建议直接收成：

* `shouldRunVectorRecall()` 保持现在这种“只看 policy + mode”的宽 gate，不再加回任何 cheap/cache 硬阻断。
* `classifyRecallNeed()` 从“强决定器”降成“lane hint 生成器”。
* `resolveVectorRecallLanes()` 默认给一个更宽的候选 lane 集，identity / relationship / rule / state 这种强 query 再做 lane 收窄；`ambiguous_recall` 不要只落到 `['event','style']`，至少补上 `relationship` 和 `state`。

这样做的目标是：**query 理解错误时，最多影响排序效率，不再影响召回是否发生。**

### 2. 去掉 `new` 生命周期对 vector 的 hard-off

目前 `applyLifecycleBias()` 在 `stage === 'new'` 时仍然直接把：

* `vectorEnabled = false`
* `vectorMode = 'off'`
  这会导致你前面已经修好的宽 gate，在新聊天里又被生命周期偏置二次打回去。

这一阶段里建议直接改成：

* `new` 阶段只放宽预算和刷新频率，不再强关 vector。
* 真正是否搜索，统一交给 `inferVectorMode()`：

  * 没 index 才 `off`
  * 精度差或 idle 才退到 `search`
  * 状态健康才 `search_rerank`。

也就是说，**生命周期不再决定“能不能搜”，只决定“搜得多激进”。**

### 3. 把 maintenance 从“建议/面板”收成“自动闭环”

你现在已经有 maintenance 的信号和建议体系了：

* `retrieval_precision_low`
* `memory_card_embeddings_missing`
* `memory_card_rebuild`
* `compress / rebuild_summary / schema_cleanup`
* 以及维护冷却和队列上限常量。 

但从现在能看到的链路看，更多还是：
**评分 -> reasonCodes -> advice -> insight/UI**，而不是明确的
**评分 -> 自动入队 -> 后台执行 -> 回写生命周期/诊断**。 

所以这一阶段建议一次补齐：

* 当 `retrieval_precision_low` 连续命中，或 `memory_card_embeddings_missing` 命中时，直接 enqueue `memory_card_rebuild`
* 当 `duplicate_rate_high` 命中时，enqueue `compress`
* 当 `summary_freshness_low` 命中时，enqueue `rebuild_summary`
* 执行后必须回写：

  * `lastMaintenanceAt`
  * `lastMaintenanceAction`
  * `vectorLifecycle.reasonCodes / memoryQuality`
  * 对应卡片的 `needsRebuild / sourceMissing / duplicateCount` 派生状态。

目标是把 maintenance 从“能看见问题”变成“问题会自己收敛”。

### 4. 把旧配置字段和 UI 残留一次删干净

现在 `VectorMode` 已经收敛成 `off | search | search_rerank`，这是对的。

但 `ChatProfileVectorStrategy` 里还留着：

* `activationFacts`
* `activationSummaries`
  而且 UI 面板上也还有 `vectorActivationFactsId / vectorActivationSummariesId`。这两个字段和现在的主链已经不匹配了，会继续误导配置语义。 

这一阶段里建议直接：

* 从 `SDK/stx.d.ts`
* `MemoryOS/src/types/chat-state.ts`
* 面板表单与默认值
* 任意 profile override / persistence 映射
  里**一并删掉**这两个字段。 

---

## 我会把这个单阶段定义成什么

我建议名字就叫：

**阶段：Recall Mainline Closure**

只做一件事：
**让“召回是否发生、召回怎么收敛、维护怎么自愈、配置怎么表达”全部统一到同一套心智模型里。**

---

## 这个阶段的完成标准

你可以直接把 Done 定成下面 6 条：

1. 任意允许 vector 的聊天里，召回开关只由 `policy.vectorEnabled + vectorMode` 决定，不再被 cheap/cache/lifecycle 二次硬关。
2. `classifyRecallNeed` 只影响 lane hint，不再成为召回成败的决定因素。
3. `new` 阶段不再 hard-off vector，vector 降级统一走 `inferVectorMode()`。
4. recall cache 继续只做 rank boost，不做 shortcut；这点现在已经对了，保持即可。
5. maintenance 能从质量分和 reason code 自动入队、执行、回写，而不是只给 advice。
6. `activationFacts / activationSummaries` 从类型、配置、UI 一起移除。
