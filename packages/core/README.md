# Core contract

This package contains no framework or DOM dependency. It reuses json-render's
native Spec, catalog, streaming compiler and state store. Component definitions
are selected from the upstream shadcn catalog; nullable fields remain required.

`createUICatalog({ components, actions, constraints, version, allowedStatePaths,
maxNodes, maxDepth })` extends the twelve base components and four native state
actions. Register action implementations in the host. Built-in action schemas
cannot be overridden. The result is an official Catalog with version, constraints
and policy metadata. Give changed persisted contracts a new version.
Use `catalog.jsonSchema()` for the native schema. `jsonSchema({ strict: true })`
is unsupported and throws; use the normal schema with `validateUI` instead.

`validateUI(input, { catalog })` validates a complete native Spec and returns an
independent JSON copy. It checks native shape/catalog/integrity, literal props,
declared events/actions, references, cycles, reachable nodes, limits and slot
constraints. Default slot content is `children`; named content is `slots`.
Constraints are `{ [type]: { slots: { [slot]: { required, min, max,
allowedComponents } } } }`. Default limits are 500 nodes and depth 32.

State, on, watch, repeat, visible and native dynamic props are retained. Dynamic
props support `$state`, `$bindState`, `$item`, `$bindItem`, `$index`, `$computed`
and `$cond/$then/$else`; named computed functions are supplied by the host.
This boundary does not evaluate expressions or prove dynamic result types.
Nested dynamic values may defer their own schema checks, including union
branches; unrelated invalid literal values still fail validation.
Call `validateActionParams(name, resolvedParams, { catalog })` immediately before
a custom handler runs; its return value contains Zod-parsed parameters. The
function throws UIValidationError on invalid resolved values. A schema check
does not authorize a business operation: authorization remains in the host.

Version 0.1 deliberately rejects action `onSuccess/onError` callbacks
(`unsupported_action_callback`) and `$template` expressions. Built-in action
write paths must be literal, non-root JSON Pointers. All writes reject prototype
segments. By default safe state paths are allowed; `allowedStatePaths` restricts
writes to listed prefixes (a prefix includes its descendants). With an explicit
allowlist, relative `$bindItem` writes are rejected; use an absolute binding.
Use `createUIStore(initialState, { catalog })` in both adapters: this thin wrapper
checks the official store's set/update entry points, including built-in actions
and two-way bindings that bypass host handlers. State must remain JSON data;
write through set/update, never mutate getSnapshot() results directly.
Array indices must be canonical nonnegative integers within bounds; `-` is
accepted only as the final append segment. Sparse arrays are rejected. A failed
update batch leaves the original store unchanged. The native `removeState`
action requires a literal nonnegative integer `index`.

`createUIDocument(spec, { catalog, state })` stores `{ catalogVersion, spec,
state }`. `serializeUIDocument` checks JSON safety; `parseUIDocument` additionally
checks the exact version and revalidates the complete Spec. No implicit migration
is performed. Each load owns independent state. Stream chunks use the upstream
`createSpecStreamCompiler`; validate its final result before activation. Partial
streams are not valid documents and should not activate actions.

For React/Vue parity, a repeat container cannot itself have visibility containing
`$item` or `$index` (`unsupported_repeat_visibility`). Put that condition on its
child instead. This restriction follows the different evaluation order in the
upstream 0.21.1 React and Vue renderer source; matching versions do not imply
identical behavior.
