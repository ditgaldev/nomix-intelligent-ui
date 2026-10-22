# 前端与 Agent 后端接入

## 先运行现有例子

根目录执行 `npm run build` 后运行 `npm run dev`，打开 `http://127.0.0.1:5188`。

[连续更新示例](http://127.0.0.1:5188/updates) 提供通用的宿主数据更新、Spec 替换、会话切换与非法候选恢复入口。

- `examples/shared/demo.ts`：前后端共用的业务目录、固定组件与插槽约束、三种 Spec。
- `examples/agent/src/service.ts`：HTTP 服务、候选校验和生成注入点。
- `examples/playground/src/main.tsx`：请求、流编译、宿主动作、保存恢复。
- `examples/playground/src/registries.tsx`：React/Vue 两端业务组件实现。

此例真实走 HTTP，但模型输出和销售数据是确定性演示数据。`/api/ui/stream` 将完整候选校验后逐条发送原生 JSON Patch；它验证流传输与编译，并不模拟模型逐 token 生成的质量。

| 接口 | 请求 | 响应 |
| --- | --- | --- |
| `GET /api/health` | 无 | 服务状态、`source`、`modelVerified: false` |
| `POST /api/ui` | `{ "mode": "free" }`，或 `fixed/slotted` | `{ source, document: { catalogVersion, spec, state } }` |
| `POST /api/ui/stream` | 同上 | `application/x-ndjson`，每行一个原生 JSON Patch |
| `POST /api/sales` | `{ "month": "2026-09" }` | 模拟销售数据；支持 2026-08/09/10 |

非法请求返回 400，非法候选 Spec 返回 422，未处理的生成异常返回 500。接入真实业务时由宿主增加鉴权和业务接口。

## 安装到别的项目

当前尚未发布 npm，使用实际 tarball：

```sh
# 在 SDK 仓库中构建并生成 tarball，同时验证外部安装
npm run build
npm run test:packages
```

把 `.artifacts/packages/` 中所需文件复制到宿主的 `vendor/`，在宿主目录安装。例如 React：

```sh
npm install ./vendor/nomix-intelligent-ui-core-0.1.0.tgz ./vendor/nomix-intelligent-ui-react-0.1.0.tgz ./vendor/nomix-intelligent-ui-theme-0.1.0.tgz
```

Vue 将 `react` tarball 换为 `vue`；后端只安装 `core`。三者应一次安装，避免尚未发布的内部包被 npm 从网络解析。React 宿主需 React/ReactDOM 19.2.3+，Vue 宿主需 Vue 3.5+。这里只支持 ESM 导出。

## 1. 共用一份业务目录

以下是消费项目中的代码，导入名均为本 SDK 的实际 API。建议放入宿主的共享 TypeScript 模块：

```ts
// ui-contract.ts（宿主文件）
import { z } from 'zod';
import { createUICatalog } from '@nomix/intelligent-ui-core';

export const appCatalog = createUICatalog({
  version: 'reports/1',
  actions: {
    loadReport: {
      params: z.object({ month: z.string() }).strict(),
      description: '请求宿主的月报接口',
    },
  },
  allowedStatePaths: ['/month', '/report', '/note'],
});
```

目录中定义“能使用哪些组件、属性和动作”。它不包含网络请求实现。表单、内置动作和宿主动作的状态写入都经过同一个 store 的路径限制；可信宿主通过下文的 `updateHost` 入口提交数据时可写白名单外的路径。

## 2. Agent 后端产出文档

```ts
import { createUIDocument } from '@nomix/intelligent-ui-core';
import { appCatalog } from './ui-contract.js';

type Generate = (request: {
  system: string;
  prompt: string;
  schema: unknown;
}) => Promise<unknown>;

export async function generateUI(prompt: string, generate: Generate) {
  const candidate = await generate({
    system: appCatalog.prompt(),
    prompt,
    schema: appCatalog.jsonSchema(),
  });
  // 校验成功后才能返回前端；不接受模型返回的 HTML/JS 作为组件代码。
  return createUIDocument(candidate, { catalog: appCatalog });
}
```

`generate` 是宿主适配自己 Agent/model 框架的回调，不是 SDK 内置模型服务。宿主把返回值作为 HTTP JSON 发送给前端；业务工具查询、用户权限与错误重试仍在宿主。

目录 prompt/schema 帮助生成，不保证模型输出一定合法。原生 Spec 使用具名 `elements` 字典，首版不支持 `jsonSchema({ strict: true })`；该调用会明确抛错。若模型供应商仅接受受限 strict schema，应在宿主适配其生成方式，并对最终候选运行本 SDK 校验。

现有 Node 示例可直接替换生成来源：

```ts
import { createDemoService } from './service.js';
// hostAgentGenerate 由你的 Agent 提供，必须返回符合 demoCatalog 的候选 Spec。
createDemoService({ generateCandidate: request => hostAgentGenerate(request) })
  .listen(5189, '127.0.0.1');
```

Python/Java Agent 不需要引入 React/Vue。它们可以使用导出的 JSON Schema 和 HTTP 文档，最终候选交给 Node BFF 的 Core 进行同一套完整校验；本仓库当前不提供 Python/Java 原生 SDK。

## 3. 前端接收并渲染

先校验整个文档，避免错误版本被当成当前目录加载：

```ts
import { parseUIDocument } from '@nomix/intelligent-ui-core';
import { appCatalog } from './ui-contract.js';

const response = await fetch('/your-api/ui');
if (!response.ok) throw new Error(`加载失败：${response.status}`);
const document = parseUIDocument(await response.text(), { catalog: appCatalog });
```

上述宿主接口直接返回 `UIDocument`。本仓库演示接口外层还有 `source/document`，应先取 `result.document`，并使用对应 `demoCatalog` 和 demo registry；可直接参考工作台实现。

React：

```tsx
import { IntelligentUI } from '@nomix/intelligent-ui-react';
import '@nomix/intelligent-ui-theme/styles.css';
import { appCatalog } from './ui-contract.js';

<IntelligentUI
  spec={document.spec}
  initialState={document.state}
  catalog={appCatalog}
  actions={actions}
  theme="light"
  resetKey={documentId}
  onStateChange={snapshot => { latestState = snapshot; }}
  onError={error => { console.error(error); }}
/>
```

Vue：

```vue
<script setup lang="ts">
import { IntelligentUI } from '@nomix/intelligent-ui-vue';
import '@nomix/intelligent-ui-theme/styles.css';
import { appCatalog } from './ui-contract';
// document、documentId、actions、onStateChange、onError 由宿主 setup 提供。
</script>

<template>
  <IntelligentUI
    :spec="document.spec"
    :initial-state="document.state"
    :catalog="appCatalog"
    :actions="actions"
    :reset-key="documentId"
    theme="light"
    :on-state-change="onStateChange"
    :on-error="onError"
  />
</template>
```

`initialState` 是内部会话初值，不是受控状态 prop；更新初值后需改变 `resetKey` 才会重置。普通 Spec 替换保留当前状态，后续 `spec.state` 不自动覆盖或合并数据。catalog 应保持稳定引用；registry 对象可以替换，但相同组件的实现应保持引用，避免被框架视为另一种组件。

### 外部状态会话与宿主数据更新

需要在 UI 外持续更新数据时，使用 `createUIState`。每个会话创建一次 handle，React 可使用 `useState(() => createUIState(...))` 保存它，Vue 可在 `setup` 中创建；不要在每次 render 中重新创建。

```ts
import { createUICatalog, createUIState } from '@nomix/intelligent-ui-core';

const sessionCatalog = createUICatalog({ allowedStatePaths: ['/form'] });
const state = createUIState({
  catalog: sessionCatalog,
  initialState: { form: { note: '' }, data: { message: '初始结果' } },
});

// patches 是 JSON Pointer -> JSON 值的对象，不是 JSON Patch 操作数组。
const applied = state.updateHost(
  { '/data/message': '新的宿主结果' },
  { sessionId: state.sessionId, version: 0 },
); // true；只更新指定路径，保留当前 /form/note。

state.updateHost({ '/data/message': '重复结果' }, {
  sessionId: state.sessionId, version: 0,
}); // false；版本必须比该会话已接受的宿主版本大。
```

把 handle 传给渲染器：

```tsx
// React；spec 是符合 sessionCatalog 的完整 Spec。
<IntelligentUI spec={spec} state={state} actions={actions} />
```

```vue
<!-- Vue；spec/state/actions 来自宿主 setup。 -->
<IntelligentUI :spec="spec" :state="state" :actions="actions" />
```

handle 提供 `store`、`catalog`、`sessionId` 和 `updateHost`。它自身不可变，catalog 引用与 sessionId 在该会话中固定；store 是带写入保护的官方 json-render store。`state` 与 `initialState` 不能同时传。未传 `catalog` 时使用 `state.catalog`；显式传入的 catalog 必须与 handle 中的是同一引用。

`updateHost` 面向可信宿主，允许写入 `allowedStatePaths` 之外的数据，仍检查 JSON、安全 JSON Pointer 和数组边界。UI 绑定、内置动作、`context.setState` 和 `state.store.set/update` 仍受目录白名单约束。整个批次校验成功后一次提交；非法批次抛出 `UIValidationError` 且不消费版本。

`version` 是每会话的宿主提交版本，必须为非负安全整数。UI 输入和普通 `store.set/update` 不递增它；错 `sessionId` 或旧/重复版本返回 `false`。这两个字段用于关联和去重，不提供鉴权或网络取消。宿主应把异步结果关联到发起时的 handle 与自己的提交版本，再决定是否提交。

需要新会话时创建新的 `createUIState(...)` handle，并将组件的 `state` 替换为它。旧 handle 的迟到更新或 action 链仍只写旧 store，不会进入新会话。同一 handle 改变 `resetKey` 会被拒绝；更换 catalog 也必须创建新 handle。数据恢复同样使用新的 handle，而不是与 `state` 同传 `initialState`。

### 连续 Spec 更新与错误恢复

宿主提交完整的新 Spec 即可更新布局、属性或增删元素。保留元素 ID、组件类型及实现引用时，既有组件 DOM、焦点、输入与本地状态得以保留；主动移除或替换组件会按框架规则卸载。需要更新宿主数据时调用 `updateHost`，不要用新 `spec.state` 重放初值。

适配器在挂载前整体验证候选的 Spec、catalog、registry 与 actions。非法候选显示错误并通知 `onError`，上一份有效的 Spec、registry、actions、catalog 和 store 继续生效；未通过验证的 watch 与组件不会挂载。首次候选非法时只显示错误，修正后即可正常挂载。组件本身的渲染异常在局部显示，后续有效更新可恢复，其他组件保持挂载。

## 4. 动作连接业务后端

```ts
import type { UIActionHandlers } from '@nomix/intelligent-ui-core';

export const actions: UIActionHandlers = {
  loadReport: async (params, context) => {
    const response = await fetch('/your-api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error('月报获取失败，请重试');
    // 生产应用还应按自己的业务 schema 校验响应。
    context.setState('/report', await response.json());
  },
};
```

Spec 中按钮的事件为 `on: { press: { action: 'loadReport', params: { month: { $state: '/month' } } } }`。属性仍需包含目录要求的字段，例如 Button 的 `label/variant/disabled`；nullable 字段用 `null`，不能任意省略。

SDK 会在运行宿主 handler 前校验解析后的参数。后端仍需鉴权。异步动作绑定发起时的 store，切换会话后不会写新 store；它仍可能完成网络副作用。工作台示例使用请求序号、过期结果检查及超时，请按业务需要提供取消与幂等策略。

## 5. 定义固定组件与插槽

在 `createUICatalog({ components })` 声明 Zod props 和公开 slots，再在对应框架 `defineRegistry(catalog, { components, actions: {} }).registry` 注册实现，传给 `IntelligentUI.registry`。未覆盖的 12 个基础组件自动保留。

固定组件不声明插槽，布局写在可信的 React/Vue 实现里。可组合组件声明 `slots: ['header', 'default', 'footer']`，再提供约束：

```ts
constraints: {
  ReportPanel: { slots: {
    header: { required: true, max: 1, allowedComponents: ['SalesSummary'] },
    default: { required: true, max: 1, allowedComponents: ['Stack', 'Table'] },
    footer: { max: 1, allowedComponents: ['Button'] },
  } },
}
```

默认插槽来自 Spec 的 `children`；具名插槽来自 `slots.header/footer`。React 实现使用 `children`、`slots?.header`；Vue 使用 `slots.default?.()`、`slots.header?.()`。完整可运行代码见 demo 的目录和双端 registries。

### 可选展示组件

5 个通用展示组件需要同时启用共享定义和对应框架实现。它们不在默认目录或适配器根入口中；Core 定义可供 Agent 后端复用，不引入前端依赖。

```ts
// display-contract.ts（宿主共享文件）
import { createUICatalog, displayComponents, type Spec } from '@nomix/intelligent-ui-core';

export const displayCatalog = createUICatalog({ components: displayComponents });
export const displaySpec: Spec = {
  root: 'chart',
  elements: {
    chart: {
      type: 'LineChart',
      props: {
        title: '示例序列',
        labels: ['A', 'B', 'C'],
        series: [{ id: 'sample', label: '观测值', values: [0, null, 12] }],
        xLabel: '分类', yLabel: '数值', height: 240,
      },
      children: [],
    },
  },
};
```

React 从 `/display` 子路径导入实现：

```tsx
import { IntelligentUI } from '@nomix/intelligent-ui-react';
import { displayRegistry } from '@nomix/intelligent-ui-react/display';
import '@nomix/intelligent-ui-theme/styles.css';
import { displayCatalog, displaySpec } from './display-contract';

<IntelligentUI spec={displaySpec} catalog={displayCatalog} registry={displayRegistry} />
```

Vue 使用对应子路径：

```vue
<script setup lang="ts">
import { IntelligentUI } from '@nomix/intelligent-ui-vue';
import { displayRegistry } from '@nomix/intelligent-ui-vue/display';
import '@nomix/intelligent-ui-theme/styles.css';
import { displayCatalog, displaySpec } from './display-contract';
</script>

<template>
  <IntelligentUI :spec="displaySpec" :catalog="displayCatalog" :registry="displayRegistry" />
</template>
```

| 组件 | 数据契约与边界 |
| --- | --- |
| `LineChart` | `labels: string[]`，`series: { id, label, values: (number \| null)[] }[]`；每条序列长度必须等于标签数量。横轴按标签顺序等距排列，`null` 留断点；不转换时间、聚合或补值。`height` 可选，范围 120–800，默认 240。 |
| `DataTable` | 显式 `columns: { key, label, align? }[]` 和 `rows: { id, cells }[]`。每行 cells 必须与列 key 完全匹配；单元格接受字符串、有限数字、布尔或 null。`0` 显示为 `0`、`false` 为 `false`、`null` 为 `—`，保留输入顺序，不计算、排序或分页。 |
| `MetricGroup` | `items: { id, label, value, unit?, description? }[]`；值为字符串、有限数字或 null，单位直接展示，不换算。 |
| `Timeline` | `items: { id, time, title, description? }[]`；时间是展示文本，保留输入顺序，不解析或自动排序。 |
| `Steps` | `items: { id, title, description? }[]`；有序说明，不执行流程或维护工作流状态。 |

组件通用 `title/description` 可选；DataTable 另有 `caption`，LineChart 有 `xLabel/yLabel`。序列、行、项目的 `id` 和表格列的 `key` 在各自列表中唯一。完整 Zod 定义见 [display.ts](../packages/core/src/display.ts)。图表复用 [Chart.js 折线图](https://www.chartjs.org/docs/latest/charts/line.html)，同时提供可展开的数据表；Canvas 不可用时仍可读取原始值。展示计算前的数据清洗、指标口径及请求由宿主负责。

## 6. 主题、保存与流

导入 `styles.css` 即可获得基础样式。按实例覆盖 token，无需 fork 组件：

```css
.customer-brand.nomix-ui {
  --primary: #3e55b5;
  --primary-foreground: #ffffff;
  --radius: 0.5rem;
}
```

两端 `IntelligentUI` 都可传 `className`（React）或 `class`（Vue）。`theme="dark"` 使用独立暗色变量；暗色覆盖可使用 `.customer-brand.nomix-ui[data-theme="dark"]`。自定义业务组件可使用这些变量和普通 CSS。预编译样式不会包含任意运行时生成的 Tailwind 类。

保存时将最新 `onStateChange` 快照传给 `createUIDocument(spec, { catalog, state })`，再调用 `serializeUIDocument`。恢复调用 `parseUIDocument`：内部状态模式传恢复后的 `initialState` 并改变 `resetKey`；外部状态模式用恢复后的 state/catalog 创建新 handle。持久化文档保存 JSON 数据，不保存运行中的 handle 或宿主提交版本；新 handle 从新会话开始。加载时会检查 `catalogVersion`，版本不符需宿主提供显式迁移。

流式接收复用 `createSpecStreamCompiler()`：按原始字节流用 `TextDecoder` 拼接，逐块 `compiler.push(text)`；结束后对 `compiler.getResult()` 运行 `createUIDocument`。不要把未校验的部分结果挂载到可执行动作的正式实例。现有工作台会显示收到的 patch 数，最终校验通过后才替换界面。

其他表达式、写路径和兼容限制见 [Core 契约](../packages/core/README.md)。
