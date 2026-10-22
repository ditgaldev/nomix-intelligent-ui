# 来源与许可证

本项目新代码采用 MIT。以下复用代码保留原许可证，不因放入本仓库而改为 MIT。

| 来源 | 使用方式 | 许可证与记录 |
| --- | --- | --- |
| [json-render v0.21.1](https://github.com/vercel-labs/json-render/tree/v0.21.1) | Core/React/Vue 作为 npm 依赖；12 个 shadcn 属性定义、原生 schema 与 React 表单接线局部复用 | Apache-2.0；各包 THIRD_PARTY_NOTICES 与 LICENSE-APACHE-2.0 |
| [shadcn-vue 指定修订](https://github.com/unovue/shadcn-vue/tree/de1f76cbb4b319ea26b0dea175dc00c18fce3bd0/apps/v4/registry/new-york-v4/ui) | 选择基础控件，调整 utility 导入与 Select portal | MIT；`packages/vue/licenses/shadcn-vue-MIT.txt` |
| [官方 vite-renderers 示例](https://github.com/vercel-labs/json-render/tree/v0.21.1/examples/vite-renderers) | 共享目录、独立 registry 与 Vite 双框架组织参考 | 架构参考，宿主示例在本仓库实现 |

详见 [React notices](../packages/react/THIRD_PARTY_NOTICES.md)、[Vue notices](../packages/vue/THIRD_PARTY_NOTICES.md) 和 [Core notices](../packages/core/THIRD_PARTY_NOTICES.md)。

Volver、Nuxt UI、Vizual 等项目用于比较组件覆盖、主题与业务块设计；本初始版本没有复制其代码，也没有引入其旧 runtime。

## 原仓库保全

原 HEAD `03213439358bf3408ad61a46ec9e3230c5572e48` 的完整目录与 Git 历史保留于 `D:/zyjpro/github_pro/open-intelligent-ui`，远端重命名为 [ditgaldev/open-intelligent-ui-reference](https://github.com/ditgaldev/open-intelligent-ui-reference)，继续保留 fork 关系。

迁移核对包含 114 个工作区文件的哈希、干净 Git 状态与 `git fsck`。本项目在原路径重新初始化；[ditgaldev/nomix-intelligent-ui](https://github.com/ditgaldev/nomix-intelligent-ui) 是新的独立仓库。两个仓库各有自己的历史和远端。
