# 架构与演进边界

## 目标与选择

项目重点是“可定义样式 + 固定业务组件 + 受约束插槽 + 自由组合”。选用 json-render 原生 Spec 表达界面结构和状态绑定，复用其目录、表达式、事件、状态和流编译机制；React/Vue 使用同版官方 runtime。美观度由主题与组件设计决定，语言选型本身不保证视觉质量。

结构化、具名属性的 Spec 便于生成、保存、检查和程序构造。官方已有双端 runtime，维护精力可以集中于组件外观与共享行为。项目不引入另一套 UI DSL，也不移植 OpenUI 解释器。公开 API、主题和组件选择由本项目独立演进；参考项目作为可追溯的复用来源。

## 目录与依赖

```text
packages/
  core/       共享定义、约束、校验、文档、官方 store 的写入保护与会话
  theme/      编译 CSS、语义 tokens
  react/      React renderer 边界与 registry
  vue/        Vue renderer 边界与 registry、复用的基础控件
examples/
  shared/     业务目录、三种模式的 Spec、模拟业务数据
  agent/      Node HTTP 服务与宿主生成注入点
  playground/ 同页 React/Vue 接入与独立状态
tests/
  core/ react/ vue/ conformance/ e2e/
scripts/check-packages.mjs  工作区外消费者验证
```

Core 仅依赖 `@json-render/core` 和 Zod。选取官方 shadcn 的 12 个纯属性定义，保留来源后放入 Core，避免后端或 Vue 安装 `@json-render/shadcn` 时同时带入 React。React 直接复用该组件库；Vue 使用 shadcn-vue 控件，加上事件、绑定、校验和插槽映射。

`displayComponents` 在 Core 中提供 5 个可选展示组件的纯 Zod 定义。React/Vue 的 `displayRegistry` 分别从适配器的 `/display` 子路径加载；根入口保留基础组件。折线图复用 Chart.js 4.5.1，图表引擎留在前端适配器，Core 不依赖 DOM 或 Chart.js。

## 固定与自由

1. 自由组合：目录允许的基础组件组成原生树，主题提供一致外观。
2. 固定组件：宿主注册可信 `SalesSummary` 实现；生成侧只能填声明的属性，不能改内部结构。
3. 受约束插槽：`ReportPanel` 公开 `header/default/footer`，Core 约束必填、数量与允许组件类型；插槽里可继续放固定组件或允许的组合。

限制在完整 Spec 校验时执行，早于 Renderer、watch 和事件挂载。提示词帮助生成，不能替代运行时校验。自定义组件和动作属于受信任的宿主代码，SDK 不对任意宿主 JavaScript 做沙箱隔离。

## 状态、交互与持久化

未传 `state` 时，每个 `IntelligentUI` 实例持有独立 store。普通 Spec 更新保留当前状态；改变 `resetKey` 按 `initialState` / `spec.state` 创建新会话。更换 catalog 保留 JSON 状态快照，并重建 store/provider，使旧事件链仍绑定旧 store。

需要从界面外持续写入数据时，宿主使用 `createUIState({ initialState?, catalog? })` 创建会话，再把 handle 传给 `IntelligentUI.state`。handle 固定 `store`、`catalog` 引用和 `sessionId`，内部 store 复用官方实现。`state` 与 `initialState` 互斥；组件默认选用 `state.catalog`，显式传 `catalog` 时必须是相同引用。外部会话通过换新 handle 重置；同一 handle 改 `resetKey` 或另传 catalog 会被拒绝。目录变化也应创建新 handle，不要原地修改目录。

宿主调用 `updateHost(patches, { sessionId, version })` 写入 JSON Pointer 到 JSON 值的批次。该入口允许可信宿主更新 `allowedStatePaths` 之外的数据，但保留 JSON 安全、路径与数组边界检查；UI 绑定、内置动作、宿主 handler 的 `context.setState` 及直接调用 `store.set/update` 仍受白名单约束。批次先整体验证，再提交给同一官方 store。

`version` 是当前会话的宿主提交版本，必须为非负安全整数并严格递增；UI 输入不递增它。错会话或不比已接受版本新的更新返回 `false`，非法批次抛错且不推进版本。`sessionId/version` 用于关联和去重，不是授权凭证，也不取消网络请求。换 handle 后旧更新和旧 action 链只影响旧 store；宿主仍应取消或忽略过期网络请求，旧业务动作不会被 SDK 自动撤销。

Spec 是界面声明。会话建立后，新 `spec.state` 不自动合并或覆盖当前状态；新增宿主数据通过 `updateHost` 明确提交。连续更新中保持元素 ID、组件类型及实现引用，可保留既有 DOM、焦点与组件本地状态。框架适配器先整体验证候选 Spec、catalog、registry 和 actions，再替换生效配置；非法候选展示错误并保留上一份有效配置与 store，首次非法则不挂载。修正后的有效候选可继续更新；组件渲染异常由局部边界显示并在后续有效更新中恢复。

前后端使用相同目录校验完整 Spec。组件事件触发显式注册的 action；动态参数在调用宿主前重新通过 Zod 校验，状态写入经过 JSON Pointer 和可选路径白名单检查。业务授权始终由后端校验。`onStateChange` 提供状态副本，宿主选择保存频率与存储位置。

持久化封装为 `{ catalogVersion, spec, state }`，内部仍是原生 Spec。恢复时校验版本与结构；不会默默迁移旧目录。可持久化业务目录发生不兼容变化时，宿主应升级 version 并提供明确迁移。

## 样式与扩展

主题导出可直接消费的 CSS，不要求宿主再跑 Tailwind。语义变量位于 `.nomix-ui`，支持每实例明暗主题和局部覆盖。业务组件的自有 CSS 由宿主维护；任意动态 Tailwind 类名不会自动出现在预编译 CSS 中。

扩展需要共享 props/events/slots/action 定义与对应 React/Vue registry。优先复用成熟控件；每个新组件加入跨框架 fixture，核对受控值、事件、插槽、可访问性和主题。依赖升级经过契约、浏览器和真实打包验证，不能只按版本号推断两端一致。

展示组件只接收宿主已准备的数据：`LineChart` 按标签顺序绘制分类轴等距折线，`null` 留断点，不推算时间间距、补点或聚合；`DataTable` 保留输入顺序和 `0/false/null` 含义，不计算、排序或分页。`MetricGroup` 展示值和单位，`Timeline` 保留事件顺序和时间文本，`Steps` 展示步骤说明。它们不负责业务指标计算或流程执行。图表同时提供可展开的数据表，Canvas 不可用时仍可读取数据。

复用接口参考 [json-render Vue providers 与 renderer](https://json-render.dev/docs/api/vue)、[React API](https://json-render.dev/docs/api/react)；图表行为参考 [Chart.js 折线图](https://www.chartjs.org/docs/latest/charts/line.html)。具体复用范围和许可证见[来源记录](provenance.md)。

初版限制见 [Core 契约](../packages/core/README.md) 与 [验收记录](acceptance.md)。
