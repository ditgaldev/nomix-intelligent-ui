import { defineCatalog, defineSchema } from '@json-render/core';
import { z } from 'zod';
import { baseComponents } from './components';

export const catalogVersion = '0.1.0';
export interface ComponentDefinition {
  props: z.ZodType;
  slots?: string[];
  events?: string[];
  description?: string;
  example?: Record<string, unknown>;
}
export interface ActionDefinition { params: z.ZodType; description?: string }
export interface SlotConstraint { required?: boolean; min?: number; max?: number; allowedComponents?: string[] }
export type UIConstraints = Record<string, { slots?: Record<string, SlotConstraint> }>;
export interface UIPolicy { allowedStatePaths?: string[]; maxNodes: number; maxDepth: number }
export interface UIActionContext { getState(): Record<string, unknown>; setState(path: string, value: unknown): void }
export type UIActionHandler = (params: Record<string, unknown>, context: UIActionContext) => void | Promise<void>;
export type UIActionHandlers = Record<string, UIActionHandler>;

export const baseActions = {
  setState: { params: z.object({ statePath: z.string(), value: z.unknown() }).strict(), description: 'Set a state value.' },
  pushState: { params: z.object({ statePath: z.string(), value: z.unknown(), clearStatePath: z.string().optional() }).strict(), description: 'Append an array item.' },
  removeState: { params: z.object({ statePath: z.string(), index: z.number().int().nonnegative() }).strict(), description: 'Remove an array item.' },
  validateForm: { params: z.object({ statePath: z.string().optional() }).strict(), description: 'Validate form fields.' },
};

// Native web Spec, adapted from json-render v0.21.1 (Apache-2.0).
// Explicitly retain native state/on/watch fields omitted by upstream schema.ts.
export const schema = defineSchema(s => ({
  spec: s.object({
    root: s.string(),
    elements: s.record(s.object({
      type: s.ref('catalog.components'), props: s.propsOf('catalog.components'),
      children: s.array(s.string()),
      slots: { ...s.record(s.array(s.string())), ...s.optional() },
      visible: { ...s.any(), ...s.optional() }, repeat: { ...s.any(), ...s.optional() },
      on: { ...s.any(), ...s.optional() }, watch: { ...s.any(), ...s.optional() },
    })),
    state: { ...s.any(), ...s.optional() },
  }),
  catalog: s.object({
    components: s.map({ props: s.zod(), slots: s.array(s.string()), events: s.array(s.string()), description: s.string(), example: s.any() }),
    actions: s.map({ params: s.zod(), description: s.string() }),
  }),
}));

export interface CreateUICatalogOptions {
  components?: Record<string, ComponentDefinition>;
  actions?: Record<string, ActionDefinition>;
  constraints?: UIConstraints;
  version?: string;
  allowedStatePaths?: string[];
  maxNodes?: number;
  maxDepth?: number;
}

export function createUICatalog(options: CreateUICatalogOptions = {}) {
  const data = {
    components: { ...baseComponents, ...options.components } as Record<string, ComponentDefinition>,
    actions: { ...baseActions, ...options.actions } as Record<string, ActionDefinition>,
  };
  // Built-in execution schemas cannot be overridden by a catalog extension.
  Object.assign(data.actions, baseActions);
  const native = defineCatalog(schema, data);
  const jsonSchema = native.jsonSchema.bind(native);
  native.jsonSchema = (options = {}) => {
    if (options.strict) throw new Error('Strict JSON Schema cannot represent native Spec.elements. Use catalog.jsonSchema() with validateUI after generation.');
    return jsonSchema(options);
  };
  return Object.assign(native, {
    version: options.version ?? catalogVersion,
    constraints: options.constraints ?? {} as UIConstraints,
    policy: { allowedStatePaths: options.allowedStatePaths, maxNodes: options.maxNodes ?? 500, maxDepth: options.maxDepth ?? 32 } as UIPolicy,
  });
}
export type UICatalog = ReturnType<typeof createUICatalog>;
export const catalog = createUICatalog();
