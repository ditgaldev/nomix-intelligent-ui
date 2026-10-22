# Nomix Intelligent UI

可定义样式、可扩展组件，让固定模板与自由组合共存的生成式 UI SDK。同一份原生 json-render Spec 在 React 和 Vue 中渲染；Agent 后端使用共享目录与校验，不依赖前端框架。

这是独立演进的 **0.1.0 初始版本**。原 OpenUI fork 的代码与 Git 历史保留在 [open-intelligent-ui-reference](https://github.com/ditgaldev/open-intelligent-ui-reference)。四个 SDK 包已能构建和独立安装验证，**尚未发布到 npm**。

## 运行

使用 Node.js 22.12+ 和 npm 11.6.2。首次安装推荐显式调用锁定的 npm 版本：

```sh
npx --yes npm@11.6.2 ci
npm run build
npm run dev
```

打开 [接入工作台](http://127.0.0.1:5188)，示例 API 位于 `127.0.0.1:5189`。工作台同时展示 React/Vue，包含自由组合、固定销售摘要、受约束插槽、明暗主题、月份查询、独立状态、保存恢复和 JSONL 流接收。

[连续更新示例](http://127.0.0.1:5188/updates) 展示业务无关的宿主数据更新、Spec 替换、会话切换与错误恢复。普通 Spec 更新保留相同组件的状态和焦点；外部数据通过 `createUIState().updateHost()` 提交，后续 `spec.state` 不自动覆盖用户输入。

示例使用明确标识的模拟数据，默认不调用模型。`examples/agent/src/service.ts` 提供 `generateCandidate` 注入点，可连接宿主 Agent。

## 包与职责

| 包 | 使用位置 | 职责 |
| --- | --- | --- |
| `@nomix/intelligent-ui-core` | Agent 后端与前端 | 共享目录、Spec 校验、插槽约束、状态会话与写入保护、可选展示定义、文档保存恢复 |
| `@nomix/intelligent-ui-theme` | 前端 | 编译 CSS、明暗主题和可覆盖的语义 tokens |
| `@nomix/intelligent-ui-react` | React 19.2.3+ | 官方 React runtime、shadcn 组件与接入边界 |
| `@nomix/intelligent-ui-vue` | Vue 3.5+ | 官方 Vue runtime、shadcn-vue 控件与共享目录适配 |

首批 12 个基础组件：`Stack`、`Grid`、`Card`、`Heading`、`Text`、`Badge`、`Separator`、`Button`、`Input`、`Select`、`Checkbox`、`Table`。业务组件通过目录与各框架 registry 扩展，示例提供 `SalesSummary` 和 `ReportPanel`。

另有 5 个按需注册的纯展示组件：`LineChart`、`DataTable`、`MetricGroup`、`Timeline`、`Steps`。共享定义 `displayComponents` 从 core 导入，框架实现 `displayRegistry` 从 `@nomix/intelligent-ui-react/display` 或 `@nomix/intelligent-ui-vue/display` 导入；适配器根入口不导出它们。数据计算、排序与业务执行仍由宿主负责，详见[展示组件接入](docs/integration.md#可选展示组件)。

```text
宿主 Agent：业务工具与模型 → 候选 Spec → core 校验 → HTTP 文档/JSONL
                                                   ↓
宿主前端：React 或 Vue SDK + theme → 展示与状态 → 宿主 action → 业务 API
```

模型、权限、业务请求、数据库和持久化策略由宿主负责。

## 接入与开发

- [前端与 Agent 后端接入](docs/integration.md)：实际导入、HTTP、动作、扩展、主题、保存与流处理。
- [架构与演进边界](docs/architecture.md)：选型理由、复用范围和两端契约。
- [首版验收与已知限制](docs/acceptance.md)：验证层级与尚未完成的生产验证。
- [Core 详细契约](packages/core/README.md)：表达式、约束和初版兼容限制。
- [来源和许可证](docs/provenance.md)：复制代码与依赖的来源。

```sh
npm run check           # 构建、类型检查、单元/契约/HTTP 测试
npm run test:packages   # 打包后，在工作区外安装 Node/React/Vue 消费者
npx playwright install chromium
npm run test:e2e        # 自动启动本地服务，验证 Chromium 交互和移动布局
```

外部消费者验证生成 `.artifacts/packages/*.tgz` 与 `consumer-report.json`。当前可将相应 tarball 及 core/theme 一起安装到其他项目，详见接入文档。

自有代码使用 MIT；从 json-render 和 shadcn-vue 复用的部分保留各自许可证与来源说明。
