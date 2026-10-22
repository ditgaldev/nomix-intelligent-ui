# Third-party sources

- The default display/layout components are runtime dependencies from `@json-render/shadcn` 0.21.1 (Apache-2.0), https://github.com/vercel-labs/json-render/tree/v0.21.1/packages/shadcn.
- `src/fields.tsx` adapts the Input/Select field wiring and styles from that same source. Changes provide per-instance DOM IDs, initialized literal values, accessible labels and an instance-local Radix portal. See `LICENSE-APACHE-2.0`.
- Checkbox and the remaining components reuse the upstream implementations. The renderer/state/action interpreter remains in the published json-render packages.
