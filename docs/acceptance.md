# 0.1.0 SDK 验收

验证日期：2026-10-22。以下证据覆盖初始 SDK、连续更新与通用展示扩展，共 96 项单元/契约/HTTP 测试和 7 项浏览器场景；不等同于真实模型生成质量或生产业务验收。

## 已验证

| 层级 | 验证内容 | 结果 |
| --- | --- | --- |
| 构建与类型 | 四个 SDK 包、双框架工作台、Agent 示例、测试类型 | 构建和类型检查通过 |
| Core | 25 项：目录/Spec/事件/插槽/JSON 写入保护，以及宿主批次原子提交、版本与会话拒绝、重入通知、UI 写入隔离 | 通过 |
| React | 18 项：原有能力，加连续更新的 DOM/焦点/本地状态保持、非法候选保留、外部会话、Spec 与动态数据错误恢复 | 通过 |
| Vue | 30 项：原有能力，加相同连续更新/外部会话/候选保留，以及局部错误恢复、emit Promise 与旧会话隔离 | 通过 |
| HTTP 与跨端契约 | 23 项：原有三模式 HTTP/流/SSR，以及 5 个展示组件共享 fixture、值保真、空集合、schema、图表生命周期 | 通过；生命周期测试使用 mock，不单独证明绘图 |
| 浏览器 | 7 项 Chromium 场景：原有 4 项，加两端连续更新/焦点/展开状态/旧版本/旧会话，以及真实 Canvas 绘制和 375px 明暗主题 | 通过；图表实际像素非空、主题切换重新绘制，数值表保留 0/false/null |
| 外部消费者 | tarball 在工作区外分别安装 Node/React/Vue；严格类型、Node/SSR、Vite/CSS、外部 state 与 /display 子路径 | 通过；Node 不带框架/Chart.js，React/Vue 不互相带入；基础适配器构建依赖图不含图表引擎 |
| 干净安装 | 新临时目录只复制当前 workspace manifests 与锁文件，无 node_modules，执行实际 npm ci | 通过，352 个包安装成功；保留此前已验证的 bundled peer 锁记录 |
| 视觉复核 | 原工作台，以及 /updates 桌面和 375px 的明暗主题；检查可读性、断点折线、表格和溢出 | 已检查实际浏览器截图；截图跳过主题过渡动画 |
| 原仓库保全 | 原工作区 114 文件哈希、Git HEAD/状态与 fsck | 已核对，完整历史保留 |

可重现命令：

```sh
npm run check
npm run test:packages
npx playwright install chromium
npm run test:e2e
```

测试产物位于忽略目录：`.artifacts/packages/consumer-report.json`、`.artifacts/screenshots/`、`playwright-report/`。GitHub Actions 配置执行相同检查，具体运行状态见仓库 Actions。

## 实施中修复的缺陷

- React 重复依赖导致的 Invalid hook call：统一工作区 React/ReactDOM 版本，并用工作区外安装验证。
- 控件字面量初值、标签 ID 和下拉 portal：适配首批表单组件，验证两个实例互不串值、下拉沿用所在实例主题。
- 更换 catalog/reset 时旧异步动作链污染新 store：先通过回归复现，再使两端旧 provider/handler 持有旧 store 和目录，迟到错误不进入新界面。
- Vue 动作失败卸载界面：动作错误与初始化/渲染错误分开，保持输入并支持同一按钮重试。
- React 同一动作错误重复通知：事件捕获和 handler 捕获合并为一次回调。
- 示例次要文字误用同名背景 token：隔离工作台变量并重新核对明暗截图。
- 首次 GitHub CI 的干净安装失败：在全新克隆复现后重新生成锁文件，补齐 Tailwind WASI 包的两个 bundled peer 记录；未升级应用依赖。实际 npm ci 再次通过。
- 普通 Spec/registry 对象更新使整棵界面重挂：保留原生 Renderer，按实际组件实现缓存边界，验证输入 DOM、焦点、展开状态及组件本地状态保持。
- 非法后续候选替换有效界面：先验证整个 Spec/catalog/registry/actions，再提交配置；失败时保留上一份有效配置。
- 仅修正宿主数据时错误未恢复：Vue 为失败局部边界增加当前 store 更新重试，React 在局部恢复后清理对应全局错误；两端回归先失败、修复后通过。

## 首版限制

- 未调用真实模型、未接真实业务数据、未验证生成成功率和答案质量。示例流来自完整候选校验后的分块传输，不是模型生成过程的渐进预览。
- 默认 12 个基础组件、5 个可选展示组件与示例业务块经过这些检查，未声称支持 json-render 全量组件或所有原生语法。折线图仅支持分类等距横轴；时间轴推断、地图和完整聊天产品未纳入范围。
- 暂不支持原生 action 的 `onSuccess/onError`、`$template`、严格 JSON Schema；repeat 容器自身依赖 `$item/$index` 的 visible 被拒绝，请将条件放在子节点。相对 `$bindItem` 与显式路径白名单组合也被拒绝。详见 Core 契约。
- 动态表达式结果的业务类型、权限和远端副作用不由静态 Spec 校验证明。展示组件会校验解析后的 props；非法宿主数据可触发局部错误，不会自动撤销已经提交的宿主批次。修正数据后可恢复。旧网络请求不会被 SDK 自动取消；宿主负责超时、幂等与结果版本。
- 浏览器验收为 Chromium 桌面与模拟窄视口；未验证真实移动设备、Safari/Firefox、完整可访问性审计或大型页面性能。
- 工作台为了并排展示而同时打包 React/Vue，构建有大 chunk 提示；不能用这个双框架演示包大小代替单一宿主的实际体积分析。
- npm 尚未发布，生产部署、真实 Agent 接入、版本升级迁移和持久化后端属于后续集成。
