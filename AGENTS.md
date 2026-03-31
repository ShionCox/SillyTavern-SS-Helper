# Repository Guidelines

## 项目结构与模块组织
- `MemoryOS/`、`LLMHub/`、`RollHelper/` 是 `pnpm` 工作区中的三个插件包；源码分别位于各自的 `src/`，构建产物输出到 `dist/`。
- `SDK/` 提供总线、主题、Tavern 适配与数据库等共享能力；`_Components/` 存放跨插件复用的 UI 组件；`assets/` 存放图片与字体；`scripts/` 存放构建和冒烟脚本；`_TemplatePlugin/` 用作新插件模板。
- 优先修改源文件，不要手工编辑 `dist/` 或其他生成产物。

## 构建、测试与开发命令
- `pnpm install`：安装根工作区依赖。
- `pnpm build`：通过根目录 `build.js` 构建全部插件。
- `pnpm build:memory`、`pnpm build:llm`、`pnpm build:roll`：只构建单个包。
- `pnpm vite:watch`、`pnpm watch:memory`、`pnpm watch:llm`、`pnpm watch:roll`：本地监听构建。
- `cd MemoryOS && pnpm test`：运行 `Vitest` 自动化测试。
- `pnpm roll:test`：启动 `RollHelper/test` 的本地测试页。
- `node scripts/smoke-check.mjs`：执行跨模块冒烟检查，适合改动 `SDK/`、`LLMHub/` 或共享 UI 后使用。

## 编码风格与命名约定
- 仓库以 TypeScript 为主，当前没有项目级 `ESLint` 或 `Prettier` 配置；提交前请保持“就地一致”，沿用所在文件的缩进、引号和分号风格。
- 新增函数优先补充显式类型与中文 `JSDoc`；共享宿主能力放入 `SDK/`，共享界面片段放入 `_Components/`，避免在各包内重复实现。
- 文件名多数使用 `kebab-case`；管理器类使用 `PascalCase`；`RollHelper` 事件模块保持 `*Event.ts` 后缀，例如 `promptEvent.ts`。

## 测试规范
- 自动化测试目前主要集中在 `MemoryOS/test/**/*.spec.ts`；新测试沿用 `*.spec.ts` 命名，需要夹具时放入 `MemoryOS/test/fixtures/`。
- `LLMHub` 当前没有独立自动化测试脚本；修改其路由、协议或结构化输出逻辑时，至少补跑一次 `node scripts/smoke-check.mjs`。
- 涉及 `RollHelper` 设置页或卡片渲染的改动，除构建通过外，还应通过 `pnpm roll:test` 做手动验证。

## 提交与 Pull Request 规范
- 现有提交历史多为自动生成的文件列表式说明，可读性较弱。新提交请改用“包名: 动词 + 结果”的单行摘要，例如 `MemoryOS: 修复 recall 排序` 或 `SDK: 新增 user 适配器`。
- Pull Request 需写清影响包、核心改动、已执行命令及结果；涉及 UI 的改动附截图；涉及发布元数据时同步更新对应包的 `manifest.json` 或 `changelog.json`。
- 每个 PR 保持单一主题，避免把共享 SDK 重构、界面调整和测试补丁混在同一次提交中。

## 注意
- 必须使用utf-8编码，否则会乱码！
- Your code must use the UTF-8 encoding format.
- 如需logger打印，请引入各自插件里的index.ts文件的logger和toast实例
