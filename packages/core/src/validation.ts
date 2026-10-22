import { validateSpec, VisibilityConditionStrictSchema, type Spec } from '@json-render/core';
import { z } from 'zod';
import { catalog as defaultCatalog, type UICatalog } from './catalog';

export interface UIIssue { code: string; path: string; message: string }
export class UIValidationError extends Error {
  constructor(public readonly issues: UIIssue[]) {
    super(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'UIValidationError';
  }
}
export interface ValidationOptions { catalog?: UICatalog }
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(code: string, path: string, message: string): never { throw new UIValidationError([{ code, path, message }]); }

/** Validate JSON data before cloning, rather than silently dropping functions/undefined. */
export function cloneJSON<T>(input: T): T {
  const active = new Set<object>();
  let count = 0;
  function visit(value: unknown, path: string, depth: number) {
    if (++count > 100000 || depth > 100) fail('json_limit', path, 'JSON input exceeds supported limits');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || value === null) fail('invalid_json', path, 'Expected JSON-safe data');
    if (active.has(value)) fail('cyclic_json', path, 'Cyclic JSON is not supported');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      fail('invalid_json', path, 'Only plain JSON objects are supported');
    active.add(value);
    if (Array.isArray(value) && (Object.keys(value).length !== value.length || Object.keys(value).some((key, i) => key !== String(i))))
      fail('invalid_array', path, 'Sparse arrays and non-index array properties cannot be saved');
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) fail('unsafe_key', `${path}/${key}`, 'Unsafe object key');
      visit(child, `${path}/${key}`, depth + 1);
    }
    active.delete(value);
  }
  visit(input, '', 0);
  return JSON.parse(JSON.stringify(input)) as T;
}

function segments(path: string) { return path.split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')); }
export function validateStatePath(path: string, options: ValidationOptions = {}): string {
  const cat = options.catalog ?? defaultCatalog;
  if (typeof path !== 'string' || !path.startsWith('/') || path === '/' || /~(?![01])/u.test(path))
    fail('invalid_state_path', path, 'Expected a non-root JSON Pointer');
  if (segments(path).some(s => forbidden.has(s))) fail('unsafe_path', path, 'Unsafe state path');
  if (segments(path).slice(0, -1).includes('-')) fail('invalid_state_path', path, '- is only supported as the final append segment');
  if (cat.policy.allowedStatePaths && !cat.policy.allowedStatePaths.some(p => path === p || path.startsWith(`${p}/`)))
    fail('state_path_denied', path, 'State write outside allowedStatePaths');
  return path;
}
function readPath(path: unknown, at: string, relative = false) {
  if (typeof path !== 'string') fail('invalid_path', at, 'Path must be a literal string');
  if (!relative && !path.startsWith('/')) fail('invalid_path', at, 'Expected JSON Pointer');
  if (path.split(/[/.]/).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')).some(s => forbidden.has(s)))
    fail('unsafe_path', at, 'Unsafe path segment');
}
const dynamicKeys = ['$state', '$bindState', '$item', '$bindItem', '$index', '$computed', '$cond'];
function expression(v: unknown): boolean { return record(v) && dynamicKeys.some(k => k in v); }
function checkExpressions(v: unknown, cat: UICatalog, at: string): void {
  if (Array.isArray(v)) { v.forEach((x, i) => checkExpressions(x, cat, `${at}/${i}`)); return; }
  if (!record(v)) return;
  if ('$template' in v) fail('unsupported_expression', at, '$template is not in the initial supported subset');
  if (expression(v)) {
    const keys = dynamicKeys.filter(k => k in v);
    if (keys.length !== 1) fail('invalid_expression', at, 'Use one expression per value');
    const allowed = keys[0] === '$cond' ? ['$cond', '$then', '$else'] : keys[0] === '$computed' ? ['$computed', 'args'] : keys;
    if (Object.keys(v).some(k => !allowed.includes(k))) fail('invalid_expression', at, 'Unexpected expression key');
  }
  for (const key of ['$state', '$bindState', '$item', '$bindItem']) {
    if (!(key in v)) continue;
    readPath(v[key], `${at}/${key}`, key === '$item' || key === '$bindItem');
    if (key === '$bindState') validateStatePath(v[key] as string, { catalog: cat });
    if (key === '$bindItem' && cat.policy.allowedStatePaths)
      fail('unsupported_scoped_write', at, '$bindItem with a write allowlist requires an explicit absolute binding');
  }
  if ('$index' in v && v.$index !== true) fail('invalid_expression', at, '$index must be true');
  if ('$computed' in v && typeof v.$computed !== 'string') fail('invalid_expression', at, '$computed must name a registered host function');
  if ('$computed' in v && v.args !== undefined && !record(v.args)) fail('invalid_expression', at, 'Computed args must be an object');
  if ('$cond' in v) {
    if (!('$then' in v) || !('$else' in v)) fail('invalid_expression', at, 'Conditional expression needs both branches');
    if (!VisibilityConditionStrictSchema.safeParse(v.$cond).success) fail('invalid_condition', at, 'Invalid condition');
    checkReadPaths(v.$cond, at);
  }
  for (const [key, value] of Object.entries(v)) if (key !== '$cond') checkExpressions(value, cat, `${at}/${key}`);
}

function checkReadPaths(v: unknown, at: string): void {
  if (Array.isArray(v)) { v.forEach(x => checkReadPaths(x, at)); return; }
  if (!record(v)) return;
  if ('$state' in v) readPath(v.$state, at);
  if ('$item' in v) readPath(v.$item, at, true);
  Object.values(v).forEach(x => checkReadPaths(x, at));
}
function usesRepeatValue(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(usesRepeatValue);
  return record(v) && ('$item' in v || '$index' in v || Object.values(v).some(usesRepeatValue));
}

// Validate literal portions with the original Zod schema. Dynamic values are
// validated by the host after resolution; never evaluate model expressions here.
function validateSchema(schema: z.ZodType, value: unknown, at: string, dynamic: boolean) {
  const result = (schema instanceof z.ZodObject ? schema.strict() : schema).safeParse(value);
  if (result.success) return result.data;
  function deferred(path: PropertyKey[]) {
    let current: unknown = value;
    for (const key of path) {
      if (dynamic && expression(current)) return true;
      current = current != null ? (current as Record<PropertyKey, unknown>)[key] : undefined;
    }
    return dynamic && expression(current);
  }
  function acceptable(issue: z.core.$ZodIssue, prefix: PropertyKey[] = []): boolean {
    const path = [...prefix, ...issue.path];
    if (deferred(path)) return true;
    if (issue.code === 'invalid_union') return issue.errors.some(branch => branch.every(child => acceptable(child, path)));
    return false;
  }
  const issues = result.error.issues.filter(issue => !acceptable(issue));
  if (issues.length) throw new UIValidationError(issues.map(i => ({ code: 'schema', path: `${at}/${i.path.map(String).join('/')}`, message: i.message })));
  return value;
}

function writableParams(name: string, params: Record<string, unknown>, cat: UICatalog) {
  if (name === 'removeState' && (!Number.isInteger(params.index) || (params.index as number) < 0)) fail('static_remove_index', name, 'removeState index must be a literal nonnegative integer; use a typed host action for dynamic removal');
  if (['setState', 'pushState'].includes(name) && !Object.hasOwn(params, 'value')) fail('action_params', name, 'value is required');
  if (['setState', 'pushState', 'removeState', 'validateForm'].includes(name)) {
    validateStatePath((params.statePath ?? (name === 'validateForm' ? '/formValidation' : undefined)) as string, { catalog: cat });
    if (params.clearStatePath !== undefined) validateStatePath(params.clearStatePath as string, { catalog: cat });
  }
}
/** Must be called immediately before a host handler receives resolved params. */
export function validateActionParams(name: string, params: unknown, options: ValidationOptions = {}): Record<string, unknown> {
  const cat = options.catalog ?? defaultCatalog;
  if (!Object.hasOwn(cat.data.actions, name)) fail('unknown_action', name, 'Action is not registered');
  const input = cloneJSON(params);
  const parsed = validateSchema(cat.data.actions[name].params, input, `actions/${name}`, false);
  if (!record(parsed)) fail('action_params', name, 'Action params must be an object');
  writableParams(name, parsed, cat);
  return cloneJSON(parsed);
}

const bindingShape = z.object({
  action: z.string(), params: z.record(z.string(), z.unknown()).optional(),
  preventDefault: z.boolean().optional(),
  confirm: z.object({ title: z.string(), message: z.string(), confirmLabel: z.string().optional(), cancelLabel: z.string().optional(), variant: z.enum(['default', 'danger']).optional() }).strict().optional(),
  onSuccess: z.unknown().optional(), onError: z.unknown().optional(),
}).strict();
const elementShape = z.object({
  type: z.string(), props: z.record(z.string(), z.unknown()), children: z.array(z.string()),
  slots: z.record(z.string(), z.array(z.string())).optional(), visible: z.unknown().optional(),
  repeat: z.object({ statePath: z.union([z.string(), z.object({ $item: z.string() }).strict()]), key: z.string().optional() }).strict().optional(),
  on: z.record(z.string(), z.union([bindingShape, z.array(bindingShape)])).optional(),
  watch: z.record(z.string(), z.union([bindingShape, z.array(bindingShape)])).optional(),
}).strict();
const specShape = z.object({ root: z.string().min(1), elements: z.record(z.string(), elementShape), state: z.record(z.string(), z.unknown()).optional() }).strict();

export function validateUI(input: unknown, options: ValidationOptions = {}): Spec {
  const cat = options.catalog ?? defaultCatalog;
  const data = cloneJSON(input);
  const parsed = specShape.safeParse(data);
  if (!parsed.success) throw new UIValidationError(parsed.error.issues.map(i => ({ code: 'spec_shape', path: i.path.map(String).join('/'), message: i.message })));
  const spec = parsed.data;
  const keys = Object.keys(spec.elements);
  if (keys.length > cat.policy.maxNodes) fail('node_limit', 'elements', 'Too many nodes');
  if (!Object.hasOwn(spec.elements, spec.root)) fail('missing_root', 'root', 'Root does not exist');
  const official = cat.validate(spec);
  if (!official.success) fail('catalog', '', official.error?.message ?? 'Invalid catalog spec');
  // Keep native fields: do not return catalog.validate().data, which may strip fields.
  for (const [id, el] of Object.entries(spec.elements)) {
    if (!Object.hasOwn(cat.data.components, el.type)) fail('unknown_component', id, 'Component is not registered');
    const definition = cat.data.components[el.type];
    checkExpressions(el.props, cat, `${id}/props`);
    validateSchema(definition.props, el.props, `${id}/props`, true);
    if (el.visible !== undefined) checkReadPaths(el.visible, `${id}/visible`);
    if (el.repeat && usesRepeatValue(el.visible)) fail('unsupported_repeat_visibility', id, 'Move item/index visibility to a child of the repeat container for React/Vue parity');
    if (el.repeat) { readPath(typeof el.repeat.statePath === 'string' ? el.repeat.statePath : el.repeat.statePath.$item, `${id}/repeat`, typeof el.repeat.statePath !== 'string'); }
    const slots = { default: el.children, ...el.slots };
    if (el.slots && 'default' in el.slots) fail('invalid_slot', id, 'Use children for the default slot');
    for (const [name, children] of Object.entries(slots)) {
      if ((name !== 'default' || children.length) && !definition.slots?.includes(name)) fail('invalid_slot', `${id}/${name}`, 'Slot is not declared');
      for (const child of children) if (!Object.hasOwn(spec.elements, child)) fail('missing_child', `${id}/${name}`, `Missing node ${child}`);
    }
    for (const [name, rule] of Object.entries(cat.constraints[el.type]?.slots ?? {})) {
      const children = slots[name as keyof typeof slots] ?? [];
      if (children.length < Math.max(rule.min ?? 0, rule.required ? 1 : 0) || children.length > (rule.max ?? Infinity)) fail('slot_count', `${id}/${name}`, 'Slot count constraint failed');
      if (rule.allowedComponents && children.some(key => !rule.allowedComponents!.includes(spec.elements[key].type))) fail('slot_component', `${id}/${name}`, 'Child type is not allowed');
    }
    for (const [kind, events] of [['on', el.on], ['watch', el.watch]] as const) {
      for (const [event, bindings] of Object.entries(events ?? {})) {
        if (kind === 'on' && !definition.events?.includes(event)) fail('unknown_event', `${id}/${event}`, 'Event is not declared');
        if (kind === 'watch') readPath(event, `${id}/watch`);
        for (const binding of Array.isArray(bindings) ? bindings : [bindings]) {
          if (binding.onSuccess !== undefined || binding.onError !== undefined) fail('unsupported_action_callback', id, 'onSuccess/onError are not supported in version 0.1');
          if (!Object.hasOwn(cat.data.actions, binding.action)) fail('unknown_action', id, `Unknown action ${binding.action}`);
          const params = binding.params ?? {};
          checkExpressions(params, cat, `${id}/params`);
          writableParams(binding.action, params, cat);
          validateSchema(cat.data.actions[binding.action].params, params, `${id}/params`, true);
        }
      }
    }
  }
  const visited = new Set<string>();
  let traversals = 0;
  function walk(id: string, ancestors: Set<string>, depth: number) {
    if (++traversals > cat.policy.maxNodes * cat.policy.maxDepth) fail('tree_limit', id, 'Too many expanded node references');
    if (ancestors.has(id)) fail('cycle', id, 'Cyclic node reference');
    if (depth > cat.policy.maxDepth) fail('depth_limit', id, 'Tree exceeds maximum depth');
    visited.add(id);
    const next = new Set(ancestors).add(id);
    const el = spec.elements[id];
    for (const child of [...el.children, ...Object.values(el.slots ?? {}).flat()]) walk(child, next, depth + 1);
  }
  walk(spec.root, new Set(), 1);
  if (visited.size !== keys.length) fail('orphan', 'elements', 'All nodes must be reachable from root');
  const integrity = validateSpec(spec as Spec);
  const errors = integrity.issues.filter(i => i.severity === 'error');
  if (errors.length) throw new UIValidationError(errors.map(i => ({ code: i.code, path: i.elementKey ?? '', message: i.message })));
  return spec as Spec;
}
