# 前端与 Agent 后端接入

## 先运行现有例子

根目录执行 `npm run build` 后运行 `npm run dev`，打开 `http://127.0.0.1:5188`。

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

目录中定义“能使用哪些组件、属性和动作”。它不包含网络请求实现。表单、内置动作和宿主动作的状态写入都经过同一个 store 的路径限制。

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

`initialState` 是会话初值，不是受控状态 prop；更新初值后需改变 `resetKey` 才会重置。普通 Spec 替换保留当前状态。目录和 registry 宜保持稳定引用，不要在每次 render 中重新构造。

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

保存时将最新 `onStateChange` 快照传给 `createUIDocument(spec, { catalog, state })`，再调用 `serializeUIDocument`。恢复调用 `parseUIDocument`，并改变 `resetKey`。加载时会检查 `catalogVersion`，版本不符需宿主提供显式迁移。

流式接收复用 `createSpecStreamCompiler()`：按原始字节流用 `TextDecoder` 拼接，逐块 `compiler.push(text)`；结束后对 `compiler.getResult()` 运行 `createUIDocument`。不要把未校验的部分结果挂载到可执行动作的正式实例。现有工作台会显示收到的 patch 数，最终校验通过后才替换界面。

其他表达式、写路径和兼容限制见 [Core 契约](../packages/core/README.md)。
