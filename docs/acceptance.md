# 0.1.0 首版验收

验证日期：2026-10-22。以下证据对应初始 SDK 与确定性示例，不等同于真实模型生成质量或生产业务验收。

## 已验证

| 层级 | 验证内容 | 结果 |
| --- | --- | --- |
| 构建与类型 | 四个 SDK 包、双框架工作台、Agent 示例、测试类型 | 构建和类型检查通过 |
| Core | 19 项：目录、字面量/动态值、插槽约束、非法树、事件动作、JSON Pointer 写入、版本与恢复 | 通过 |
| React | 11 项：隔离实例、绑定、宿主动作参数、插槽/repeat、保存恢复、非法挂载、旧异步链隔离 | 通过 |
| Vue | 17 项：相同能力、computed、动态 catalog、旧异步链隔离、动作失败后原界面重试 | 通过 |
| HTTP 与跨端契约 | 15 项：三模式文档/流、官方 compiler 等价、400/422/500、宿主候选注入、相同 Spec 的双端 SSR | 通过 |
| 浏览器 | 4 项 Chromium 场景：独立输入/保存恢复/真实 HTTP 刷新；固定与插槽/流/非法拦截；主题 portal/375px；请求失败后重试 | 通过 |
| 外部消费者 | 打包 tarball，在工作区外分别安装 Node/React/Vue；严格类型、Node/SSR、前端 Vite/CSS 构建、依赖图 | 通过，Node 不带框架，React/Vue 不互相带入 |
| 视觉复核 | 桌面浅色、桌面深色、375px 浅色；检查可读性、溢出、下拉主题 | 已检查实际浏览器截图 |
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

## 首版限制

- 未调用真实模型、未接真实业务数据、未验证生成成功率和答案质量。示例流来自完整候选校验后的分块传输，不是模型生成过程的渐进预览。
- 仅首批 12 个组件与示例业务块经过这些检查，未声称支持 json-render 全量组件或所有原生语法。图表、地图、完整聊天产品未纳入本次范围。
- 暂不支持原生 action 的 `onSuccess/onError`、`$template`、严格 JSON Schema；repeat 容器自身依赖 `$item/$index` 的 visible 被拒绝，请将条件放在子节点。相对 `$bindItem` 与显式路径白名单组合也被拒绝。详见 Core 契约。
- 动态表达式结果的业务类型、权限和远端副作用不由静态 Spec 校验证明。旧网络请求不会被 SDK 自动取消；宿主负责超时、幂等与过期结果处理。
- 浏览器验收为 Chromium 桌面与模拟窄视口；未验证真实移动设备、Safari/Firefox、完整可访问性审计或大型页面性能。
- 工作台为了并排展示而同时打包 React/Vue，构建有大 chunk 提示；不能用这个双框架演示包大小代替单一宿主的实际体积分析。
- npm 尚未发布，生产部署、真实 Agent 接入、版本升级迁移和持久化后端属于后续集成。
