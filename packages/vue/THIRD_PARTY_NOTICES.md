# Third-party source

The controls under `src/ui` are selected from [unovue/shadcn-vue](https://github.com/unovue/shadcn-vue/tree/de1f76cbb4b319ea26b0dea175dc00c18fce3bd0/apps/v4/registry/new-york-v4/ui), revision `de1f76cbb4b319ea26b0dea175dc00c18fce3bd0`, under the MIT license. Copyright (c) 2023 unovue. The complete license is included in `licenses/shadcn-vue-MIT.txt`.

The original control directories are `button`, `badge`, `input`, `label`, `checkbox`, `separator`, `card`, `select`, and `table`. Imports of the upstream `cn` utility are redirected to the local equivalent. The Select content portal is scoped to the nearest `.nomix-ui` theme container. Select barrel exports include only the copied controls.

The registry in `src/components.ts` adapts these controls to the selected official `@json-render/shadcn` 0.21.1 props in `@nomix/intelligent-ui-core`. The parser, expression evaluation, actions, state store and renderer come from the published `@json-render/vue` 0.21.1 runtime (Apache-2.0); this adapter does not copy its implementation.
