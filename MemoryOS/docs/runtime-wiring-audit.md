# MemoryOS Runtime Wiring Audit

> 目的：把仓库里“已导出 / 已引用 / 真正跑到运行态 / 有测试覆盖”的能力分清楚，避免把假接入当成主链能力。

## 范围

- `MemoryOS` 主入口链路
- 结构化写入与 `trusted write`
- `recall -> prompt injection` 主链
- 诊断 UI 与 AI Health 证据卡
- 已下线的 `plugin:request:memory_append_outcome`

## 审计结果

| 模块 | 导出点 | 调用点数量 | 是否主链 | 建议动作 |
| --- | --- | ---: | --- | --- |
| `MemoryOS` 主链 trace / prompt injection | `MemoryOS/src/types/chat-state.ts`, `SDK/stx.d.ts`, `MemoryOS/src/sdk/memory-sdk.ts` | 3+ | 是 | 保留 |
| `MemoryOS` AI Health 证据卡 | `MemoryOS/src/ui/chatStrategyPanel.ts` | 2+ | 是 | 保留 |
| `trusted write` 统一入口 | `MemoryOS/src/proposal/proposal-manager.ts`, `MemoryOS/src/sdk/memory-sdk.ts` | 3+ | 是 | 保留 |
| `plugin:request:memory_append_outcome` | 已从 `SDK/bus/registry.ts` 与 `MemoryOS/src/index.ts` 移除 | 0 | 否 | 下线 |

## 详细说明

### 1. 已接入且主链使用

- `MemoryOS/src/index.ts`
  - 宿主消息入口创建统一 trace。
  - `CHAT_COMPLETION_PROMPT_READY` 统一走 `runMemoryPromptInjection(...)`。
- `MemoryOS/src/injection/injection-manager.ts`
  - `buildContext()` 只负责构建。
  - `runMemoryPromptInjection()` 负责回流、插入与主链 trace 记录。
- `MemoryOS/src/proposal/proposal-manager.ts`
  - `requestTrustedWrite` 进入后统一记录 trusted write trace。
- `MemoryOS/src/core/chat-state-manager.ts`
  - 持久化 `mainlineTraceSnapshot`。
- `MemoryOS/src/ui/chatStrategyPanel.ts`
  - AI Health 面板直接展示最近一次主链执行证据。
  - 证据卡由 `MemoryOS/test/mainline-trace-view.spec.ts` 覆盖。

### 2. 已接入但仅诊断/UI 可见

- `MemoryOS/src/ui/settingsCardExperience.ts`
  - 提供主链 trace 摘要和 mutation history 摘要。
- `MemoryOS/src/sdk/editor-facade.ts`
  - 将 `mainlineTraceSnapshot` 暴露给编辑器经验快照。

### 3. 已导出但没有真实调用方

- `plugin:request:memory_append_outcome`
  - 旧 RPC 已删除，不再注册，也不再有生产调用点。
  - 相关验证由 `MemoryOS/test/mainline-trace.spec.ts` 覆盖。

## 结论

当前仓库内，主链 trace、trusted write、prompt injection 与 AI Health 证据卡已经形成可观测闭环；`memory_append_outcome` 则按 P0 决策直接下线，不再保留兼容。
