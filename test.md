# 记忆抽取稳态方案：更保守触发 + 结构化兼容降级

## 概要
保留现在“每次回复后做一次本地抽取判定”的架构，不改主入口；真正要改的是两件事：

- 让 `memory.extract` 更保守，只在明显有价值时才真正发 AI 请求，减少“看起来每回合都在抽取”的体感。
- 让 Tavern 路由对结构化输出更稳，遇到 `Bad Request` 时自动兼容降级，不再直接把抽取打死。

这样能同时解决“请求太频繁”和“抽取偶发 400”两个问题，而且不破坏现有 MemoryOS 主流程。

## 关键改动
### 1. 抽取触发改为更保守
在 `MemoryOS/src/core/extract-manager.ts` 调整抽取前置门控，保持 `generation_ended -> kickOffExtraction()` 不变，但更严格限制“真正发 AI 请求”的条件：

- 保留现有 turn-based 判定与窗口去重，不改入口事件。
- 提高兜底触发阈值：
  - `minUserMessageDelta` 从 `3` 提到 `4`
  - `minEventDelta` 从 `20` 提到 `28`
  - `duplicateWindowMs` 从 `8000` 提到 `20000`
- 调整 `buildProcessingDecision()` 的默认分支：
  - 当前默认 `plot_progress` 很容易落到 `light` 或 `medium`
  - 改为只有满足以下任一条件才允许进入 `light/medium/heavy`
    - `specialEventHit`
    - `mutationRepairSignal`
    - `stageCompletionSignal`
    - `longRunningSignal`
    - `postGate.shouldExtractWorldState`
    - `postGate.shouldExtractRelations`
    - `postGate.rebuildSummary`
  - 否则 `plot_progress` 直接落到 `level: 'none'`，并补充原因码 `plot_progress_deferred`
- `small_talk_noise`、`tool_result`、`setting_confirmed`、`relationship_shift` 的现有价值分类保留，不做放宽。

默认效果：
- 普通闲聊和轻微剧情推进更容易只做本地判定，不真正发 `memory.extract`
- 设定确认、关系变化、结构修复、长线阶段切换仍然会正常触发

### 2. Tavern 结构化输出做三级降级
在 `LLMHub/src/providers/tavern-provider.ts` 增加结构化兼容回退链，只在明显属于结构化参数不兼容时触发：

- 第一次：按原始请求发送
  - `jsonSchema + jsonMode`
- 第二次：如果失败且错误像 `Bad Request / response_format / json_schema`，降级为
  - `jsonMode: true`，不带 `jsonSchema`
- 第三次：如果还失败，再降级为
  - 不带 `jsonMode`、不带 `jsonSchema`
- 如果失败原因不是结构化兼容问题，例如限流、余额、网络异常，不重试，保持原样失败。

这个降级只发生在 Tavern Provider，不改 OpenAI Provider 现有逻辑。

### 3. 请求日志与任务面板补清晰说明
在 LLMHub 请求日志和任务记录里增加“本次是否发生结构化降级”的可见信息，避免用户只能看到一个模糊的 `Bad Request`：

- 给 Provider 返回结果补充调试字段：
  - `structuredFallbackStage: 'none' | 'json_object' | 'plain'`
  - `structuredFallbackTriggered: boolean`
- 请求日志里显示：
  - 初始请求格式
  - 最终成功格式
  - 是否发生兼容降级
- 如果最终是降级成功，不标成“硬失败”；显示为“已兼容降级成功”
- 如果最终仍失败，日志里明确写成：
  - “结构化输出不兼容，已尝试降级到 json_object/plain，仍失败”

### 4. 用户侧提示改成“检查”与“真正请求”分离
在 MemoryOS 的任务表现层保持现有 `memory.extract` 任务不变，但补一条轻量说明，避免误解成“每回复一次就一定请求模型”：

- 不为本地 `kickOffExtraction()` 检查单独建 AI 任务
- 仅在真正进入 `runProposalTask('memory.extract')` 时才显示 `memory.extract`
- 在相关帮助文案或状态说明中明确：
  - “每次回复后都会检查是否需要抽取，但只有满足条件时才会真正请求 AI”

## 接口与类型变化
- `LLMHub/src/providers/types.ts`
  - `LLMResponse.debugRequest` 保持兼容，新增可选调试字段用于记录结构化降级阶段
- 与外部调用方的公开调用方式不变：
  - `runGeneration`
  - `memory.extract`
  - `kickOffExtraction`
  都不改签名

## 测试与验收
### 抽取节奏
- 连续普通闲聊 1 到 3 回合，不应真正发 `memory.extract`
- 普通剧情推进但无设定/关系/世界状态变化时，应更常落到 `level: none`
- 关系变化、设定确认、世界状态更新、消息修订、分支切换，仍应触发抽取
- 同一窗口短时间重复触发，不应重复发相同抽取请求

### 结构化兼容
- Tavern 路由支持 `json_schema` 时，仍走原始结构化请求，不触发回退
- Tavern 路由拒绝 `json_schema` 但支持 `json_object` 时，应自动降级并成功
- Tavern 路由连 `json_object` 也不支持时，应自动退到 plain，并由后续 JSON 解析继续兜底
- 非结构化兼容类错误，例如网络失败、余额不足、限流，不应错误触发降级链

### 请求日志
- 成功直连时，日志显示 `structuredFallbackStage = none`
- 降级成功时，日志能看到原始格式与最终格式
- 最终失败时，日志能明确写出“已尝试兼容降级但仍失败”

## 假设与默认
- 默认保留 `generation_ended` 作为抽取检查入口，不改事件架构。
- 默认采用“静默自动降级”，不弹额外打扰式错误提示；详细信息进请求日志与任务详情。
- 默认优先减少无价值抽取请求，而不是追求每回合都及时更新记忆。
- 默认不新增新的设置项，先用更合理的内置策略解决；如果后续仍需细调，再考虑把“抽取节奏”开放成设置项。
