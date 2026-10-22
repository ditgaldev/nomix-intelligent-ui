import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  baseComponents, catalog, createUICatalog, createUIDocument, createSpecStreamCompiler,
  parseUIDocument, serializeUIDocument, validateActionParams, validateUI, UIValidationError, createUIStore,
} from '../../packages/core/src';

const fixtureCatalog = createUICatalog({
  components: {
    Panel: { props: z.object({ title: z.string() }), slots: ['default', 'footer'] },
    Value: { props: z.object({ value: z.number() }), events: ['change'] },
  },
  actions: { save: { params: z.object({ count: z.number().int() }).strict() } },
  constraints: { Panel: { slots: { footer: { required: true, max: 1, allowedComponents: ['Button'] } } } },
});
const button = () => ({ type: 'Button', props: { label: 'Save', variant: null, disabled: null }, children: [] });
const fixture = () => ({
  root: 'panel', state: { count: 1 }, elements: {
    panel: { type: 'Panel', props: { title: 'Example' }, children: ['value'], slots: { footer: ['save'] } },
    value: { type: 'Value', props: { value: { $bindState: '/count' } }, children: [], visible: { $state: '/count', gte: 0 },
      on: { change: { action: 'save', params: { count: { $state: '/count' } } } },
      watch: { '/count': { action: 'save', params: { count: { $state: '/count' } } } } },
    save: button(),
  },
});
const opts = { catalog: fixtureCatalog };
function code(fn: () => unknown, expected: string) {
  try { fn(); throw new Error('Expected rejection'); }
  catch (e) { expect(e).toBeInstanceOf(UIValidationError); expect((e as UIValidationError).issues.some(i => i.code === expected)).toBe(true); }
}

describe('native Spec boundary', () => {
  it('copies only twelve definitions and returns a real official Catalog', () => {
    expect(Object.keys(baseComponents)).toHaveLength(12);
    expect(catalog.prompt()).toContain('Button');
    expect(catalog.jsonSchema()).toBeTruthy();
    expect(validateUI({ root: 'b', elements: { b: button() } })).toBeTruthy();
  });
  it('preserves bindings, conditions, events, watches and state without mutating input', () => {
    const input = fixture();
    const spec = validateUI(input, opts);
    expect(spec).toEqual(input);
    expect(spec).not.toBe(input);
  });
  it('checks literal props and required fields', () => {
    const input = fixture();
    (input.elements.panel.props as unknown as { title: number }).title = 42;
    code(() => validateUI(input, opts), 'schema');
    const extra = fixture(); Object.assign(extra.elements.panel.props, { unexpected: true });
    code(() => validateUI(extra, opts), 'schema');
  });
  it('rejects unknown actions and events, including watch actions', () => {
    const input = fixture(); input.elements.value.on.change.action = 'deleteEverything';
    code(() => validateUI(input, opts), 'unknown_action');
    input.elements.value.on.change.action = 'save';
    (input.elements.value.on as Record<string, unknown>).wrong = { action: 'save', params: { count: 1 } };
    code(() => validateUI(input, opts), 'unknown_event');
  });
  it('validates resolved action arguments immediately before execution', () => {
    expect(validateActionParams('save', { count: 2 }, opts)).toEqual({ count: 2 });
    code(() => validateActionParams('save', { count: '2' }, opts), 'schema');
    code(() => validateActionParams('save', { count: { $state: '/count' } }, opts), 'schema');
  });
  it('rejects callbacks rather than allowing hidden follow-up actions', () => {
    const input = fixture();
    Object.assign(input.elements.value.on.change, { onSuccess: { action: 'save' } });
    code(() => validateUI(input, opts), 'unsupported_action_callback');
  });
  it('rejects undeclared slots, invalid child types, missing children, cycles and orphans', () => {
    const input = fixture();
    Object.assign(input.elements.panel.slots, { unknown: ['save'] });
    code(() => validateUI(input, opts), 'invalid_slot');
    const wrong = fixture(); wrong.elements.panel.slots.footer = ['value'];
    code(() => validateUI(wrong, opts), 'slot_component');
    const missing = fixture(); missing.elements.panel.children = ['missing'];
    code(() => validateUI(missing, opts), 'missing_child');
    const cycle = fixture(); cycle.elements.panel.children = ['panel', 'value'];
    code(() => validateUI(cycle, opts), 'cycle');
    const orphan = fixture(); orphan.elements.panel.children = [];
    code(() => validateUI(orphan, opts), 'orphan');
  });
  it('checks nested fixed/slotted templates and required slots', () => {
    const input = fixture();
    Object.assign(input.elements, { nested: { ...input.elements.panel, children: ['value'], slots: { footer: ['nestedSave'] } }, nestedSave: button() });
    input.elements.panel.children = ['nested'];
    expect(validateUI(input, opts)).toEqual(input);
    input.elements.panel.slots.footer = [];
    code(() => validateUI(input, opts), 'slot_count');
  });
  it('enforces limits', () => {
    code(() => validateUI(fixture(), { catalog: createUICatalog({ ...fixtureCatalog.data, maxNodes: 2 }) }), 'node_limit');
    code(() => validateUI(fixture(), { catalog: createUICatalog({ ...fixtureCatalog.data, maxDepth: 1 }) }), 'depth_limit');
  });
  it('retains native repeat/computed and rejects malformed expressions', () => {
    const input = fixture();
    Object.assign(input.elements.panel, { repeat: { statePath: '/rows', key: 'id' } });
    Object.assign(input.state, { rows: [{ id: 'a', count: 1 }] });
    input.elements.value.props.value = { $computed: 'count', args: { input: { $item: 'count' } } } as never;
    expect(validateUI(input, opts).elements.panel.repeat).toEqual({ statePath: '/rows', key: 'id' });
    input.elements.value.props.value = { $state: '/count', extra: 1 } as never;
    code(() => validateUI(input, opts), 'invalid_expression');
  });
});

describe('state and document boundaries', () => {
  it('requires per-item visibility on repeat children for framework parity', () => {
    const input = fixture();
    Object.assign(input.elements.panel, { repeat: { statePath: '/rows' }, visible: { $and: [{ $item: 'active', eq: true }] } });
    Object.assign(input.state, { rows: [{ active: true }] });
    code(() => validateUI(input, opts), 'unsupported_repeat_visibility');
    delete (input.elements.panel as { visible?: unknown }).visible;
    input.elements.value.visible = { $item: 'active', eq: true } as never;
    expect(validateUI(input, opts)).toBeTruthy();
  });
  it('wraps official store writes and validates a batch before any mutation', () => {
    const cat = createUICatalog({ allowedStatePaths: ['/form'] });
    const initial = { form: { count: 1 } };
    const store = createUIStore(initial, { catalog: cat });
    initial.form.count = 99;
    expect(store.get('/form/count')).toBe(1);
    store.set('/form/count', 2);
    expect(store.get('/form/count')).toBe(2);
    code(() => store.set('/outside', 1), 'state_path_denied');
    code(() => store.set('/form/value', undefined), 'invalid_json');
    code(() => store.update({ '/form/count': 3, '/constructor/prototype/x': true }), 'unsafe_path');
    expect(store.get('/form/count')).toBe(2);
  });
  it('rejects pollution paths and dangerous JSON keys', () => {
    code(() => validateActionParams('setState', { statePath: '/__proto__/x', value: true }), 'unsafe_path');
    code(() => validateActionParams('setState', { statePath: '/constructor/x', value: true }), 'unsafe_path');
    code(() => createUIDocument(JSON.parse('{"root":"a","elements":{},"state":{"__proto__":{}}}')), 'unsafe_key');
  });
  it('enforces write allowlists and static built-in action paths', () => {
    const scoped = createUICatalog({ allowedStatePaths: ['/form'] });
    expect(validateActionParams('setState', { statePath: '/form/name', value: 'A' }, { catalog: scoped })).toBeTruthy();
    code(() => validateActionParams('setState', { statePath: '/formOther', value: 1 }, { catalog: scoped }), 'state_path_denied');
    const input = fixture();
    input.elements.value.on.change = { action: 'setState', params: { statePath: { $state: '/target' }, value: 1 } } as never;
    code(() => validateUI(input, opts), 'invalid_state_path');
  });
  it('round-trips isolated state and rejects version mismatch / non-JSON state', () => {
    const doc = createUIDocument(fixture(), { ...opts, state: { count: 9 } });
    const saved = serializeUIDocument(doc);
    const a = parseUIDocument(saved, opts), b = parseUIDocument(saved, opts);
    a.state.count = 10;
    expect(b.state.count).toBe(9);
    expect(a.spec.state?.count).toBe(1);
    code(() => parseUIDocument(saved, { catalog: createUICatalog({ version: '2' }) }), 'catalog_version');
    code(() => createUIDocument(fixture(), { ...opts, state: { bad: undefined } }), 'invalid_json');
  });
  it('validates the final result of the official streaming compiler', () => {
    const compiler = createSpecStreamCompiler();
    const input = fixture();
    compiler.push(JSON.stringify({ op: 'add', path: '/root', value: input.root }) + '\n');
    compiler.push(JSON.stringify({ op: 'add', path: '/elements', value: input.elements }) + '\n');
    compiler.push(JSON.stringify({ op: 'add', path: '/state', value: input.state }) + '\n');
    expect(validateUI(compiler.getResult(), opts)).toEqual(input);
  });
});

it('rejects lossy array writes atomically while preserving native append', () => {
 const store=createUIStore({items:['a']});const {set}=store;
 for(const path of ['/items/-1','/items/2','/items/01','/items/a','/items/-/x']) expect(()=>set(path,'x')).toThrow(UIValidationError);
 expect(()=>store.update({'/items/0':'b','/items/3':'c'})).toThrow(UIValidationError);
 expect(store.get('/items/0')).toBe('a');set('/items/-','b');set('/items/1','c');
 expect(store.get('/items')).toEqual(['a','c']);
 expect(()=>createUIStore({items:new Array(2)})).toThrow(UIValidationError);
});
it('validates union branches without rejecting nested dynamic fields or ignoring literal errors',()=>{
 const c=createUICatalog({components:{X:{props:z.object({payload:z.union([z.object({name:z.string(),count:z.number()}),z.null()])})}}});
 const spec={root:'x',elements:{x:{type:'X',props:{payload:{name:{$state:'/name'},count:1}},children:[]}},state:{name:'A'}};
 expect(validateUI(spec,{catalog:c})).toEqual(spec);
 spec.elements.x.props.payload.count='bad' as never;
 expect(()=>validateUI(spec,{catalog:c})).toThrow(UIValidationError);
});
it('rejects dynamic builtin remove indices and unusable strict generation schema',()=>{
 const input=fixture();input.elements.value.on.change={action:'removeState',params:{statePath:'/rows',index:{$state:'/index'}}} as never;
 code(()=>validateUI(input,opts),'static_remove_index');
 expect(()=>catalog.jsonSchema({strict:true})).toThrow('validateUI');
 expect(catalog.jsonSchema()).toHaveProperty('properties.elements.additionalProperties');
});
