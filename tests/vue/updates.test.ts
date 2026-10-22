import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, onMounted, ref, shallowRef } from 'vue';
import { z } from 'zod';
import { IntelligentUI, defineRegistry } from '@nomix/intelligent-ui-vue';
import { createUICatalog, createUIState, type Spec, type UIActionContext } from '@nomix/intelligent-ui-core';

const mounted: VueWrapper[] = [];
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; });
const text = (value: unknown) => ({ type: 'Text', props: { text: value, variant: null }, children: [] });
function formSpec(label = 'First'): Spec {
  return { root: 'root', state: { form: { name: 'Seed' }, host: label }, elements: {
    root: { type: 'Stack', props: { direction: 'vertical', gap: 'md', align: null, justify: null, className: null }, children: ['input', 'label'] },
    input: { type: 'Input', props: { label: 'Name', name: 'name', type: 'text', placeholder: null, value: { $bindState: '/form/name' }, checks: null, validateOn: null }, children: [] },
    label: text(label),
  } };
}
function host(initial: Record<string, unknown>) {
  const values = shallowRef(initial);
  const wrapper = mount(defineComponent({ setup: () => () => h(IntelligentUI, values.value as never) }), { attachTo: document.body });
  mounted.push(wrapper);
  return { wrapper, update: async (patch: Record<string, unknown>) => { values.value = { ...values.value, ...patch }; await nextTick(); } };
}

it('preserves native input DOM, focus and local component state on continuous spec/registry updates', async () => {
  const mounts = vi.fn();
  const Details = defineComponent({ setup() {
    const count = ref(0); onMounted(mounts);
    return () => h('details', null, [h('summary', { onClick: () => count.value++ }, `Clicks ${count.value}`)]);
  } });
  const catalog = createUICatalog({ components: { Details: { props: z.object({}), slots: [] } } });
  const spec = formSpec(); spec.elements.root.children!.push('details'); spec.elements.details = { type: 'Details', props: {}, children: [] };
  const registry = { Details };
  const { wrapper, update } = host({ spec, catalog, registry });
  await wrapper.get('input').setValue('User edit');
  await wrapper.get('summary').trigger('click');
  const input = wrapper.get('input').element;
  const details = wrapper.get('details').element;
  details.open = true; input.focus();
  const next = { ...spec, elements: { ...spec.elements, root: { ...spec.elements.root, children: [...spec.elements.root.children!, 'extra'] }, label: text('Second'), extra: text('New block') } };
  await update({ spec: next, registry: { ...registry } });
  expect(wrapper.get('input').element).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(wrapper.get('details').element).toBe(details);
  expect(details.open).toBe(true);
  expect(wrapper.get('summary').text()).toBe('Clicks 1');
  expect(mounts).toHaveBeenCalledOnce();
  expect(wrapper.get('input').element.value).toBe('User edit');
  expect(wrapper.text()).toContain('Second');
  expect(wrapper.text()).toContain('New block');
});

it('accepts external host data updates without overwriting user edits with new spec seeds', async () => {
  const state = createUIState({ initialState: { form: { name: 'Recovered' }, host: 'Old host' } });
  const spec = formSpec(); spec.elements.label = text({ $state: '/host' });
  const onStateChange = vi.fn();
  const { wrapper, update } = host({ spec, state, onStateChange });
  expect(wrapper.get('input').element.value).toBe('Recovered');
  await wrapper.get('input').setValue('Edited');
  const input = wrapper.get('input').element;
  state.updateHost({ '/host': 'New host' }, { sessionId: state.sessionId, version: 1 });
  await update({ spec: { ...spec, state: { form: { name: 'Ignored seed' }, host: 'Ignored host' } } });
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('input').element.value).toBe('Edited');
  expect(wrapper.text()).toContain('New host');
  expect(onStateChange).toHaveBeenLastCalledWith({ form: { name: 'Edited' }, host: 'New host' });
});

it('keeps the last valid spec and handlers while rejecting a candidate, then clears its error', async () => {
  const catalog = createUICatalog({ actions: { save: { params: z.object({}) }, watched: { params: z.object({}) } } });
  const save = vi.fn(); const watched = vi.fn(); const onError = vi.fn();
  const spec = formSpec(); spec.elements.root.children!.push('save');
  spec.elements.save = { type: 'Button', props: { label: 'Save', variant: 'primary', disabled: false }, children: [], on: { press: { action: 'save', params: {} } } };
  const { wrapper, update } = host({ spec, catalog, actions: { save }, onError });
  const input = wrapper.get('input').element;
  await wrapper.get('input').setValue('Keep');
  const invalid = { ...spec, elements: { ...spec.elements, label: { ...text('Rejected'), slots: { forbidden: [] }, watch: { '/host': { action: 'watched', params: {} } } } } };
  await update({ spec: invalid, actions: { watched } });
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(save).toHaveBeenCalledOnce(); expect(watched).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledOnce();
  await update({ spec: formSpec('Recovered'), actions: {} });
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('input').element.value).toBe('Keep');
});

it('recovers an individual rendering component without remounting its healthy sibling', async () => {
  const catalog = createUICatalog({ components: { Crash: { props: z.object({ fail: z.boolean() }), slots: [] } } });
  const custom = defineRegistry(catalog, { components: { Crash: ({ props }) => {
    if ((props as { fail: boolean }).fail) throw new Error('Local render failure'); return h('span', 'Recovered component');
  } }, actions: {} });
  const spec = formSpec(); spec.elements.root.children!.push('crash'); spec.elements.crash = { type: 'Crash', props: { fail: false }, children: [] };
  const onError = vi.fn();
  const { wrapper, update } = host({ spec, catalog, registry: custom.registry, onError });
  const input = wrapper.get('input').element; input.focus();
  await update({ spec: { ...spec, elements: { ...spec.elements, crash: { ...spec.elements.crash, props: { fail: true } } } } });
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.text()).toContain('Local render failure');
  await update({ spec: { ...spec } });
  expect(wrapper.get('input').element).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.text()).toContain('Recovered component');
  expect(onError).toHaveBeenCalledOnce();
});

it('recovers invalid state-bound component props through host updates alone while preserving healthy DOM and focus', async () => {
  const probeProps = z.object({ value: z.string() });
  const catalog = createUICatalog({ components: {
    Probe: { props: probeProps, slots: [] }, Healthy: { props: z.object({}), slots: [] },
  } });
  const healthyMounts = vi.fn();
  const Healthy = defineComponent({ setup() {
    const clicks = ref(0); onMounted(healthyMounts);
    return () => h('button', { 'data-healthy': '', onClick: () => clicks.value++ }, `Clicks ${clicks.value}`);
  } });
  const custom = defineRegistry(catalog, { components: {
    Probe: ({ props }) => h('span', { 'data-probe': '' }, probeProps.parse(props).value),
  }, actions: {} });
  const registry = { ...custom.registry, Healthy };
  const state = createUIState({ catalog, initialState: { form: { name: 'Initial' }, probe: { value: 'Ready' } } });
  const spec = formSpec(); spec.elements.root.children!.push('probe', 'healthy');
  spec.elements.probe = { type: 'Probe', props: { value: { $state: '/probe/value' } }, children: [] };
  spec.elements.healthy = { type: 'Healthy', props: {}, children: [] };
  const onError = vi.fn();
  const { wrapper } = host({ spec, state, registry, onError });
  await wrapper.get('input').setValue('User edit');
  await wrapper.get('[data-healthy]').trigger('click');
  const input = wrapper.get('input').element, healthy = wrapper.get('[data-healthy]').element;
  input.focus();
  expect(wrapper.get('[data-probe]').text()).toBe('Ready');
  expect(state.updateHost({ '/probe/value': 42 }, { sessionId: state.sessionId, version: 0 })).toBe(true);
  await nextTick();
  expect(wrapper.find('.nomix-ui-component-error').exists()).toBe(true);
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('[data-healthy]').element).toBe(healthy);
  expect(document.activeElement).toBe(input);
  expect(onError).toHaveBeenCalledOnce();

  expect(state.updateHost({ '/probe/value': 'Recovered' }, { sessionId: state.sessionId, version: 1 })).toBe(true);
  await nextTick();
  expect(wrapper.get('[data-probe]').text()).toBe('Recovered');
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.find('.nomix-ui-component-error').exists()).toBe(false);
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('input').element.value).toBe('User edit');
  expect(wrapper.get('[data-healthy]').element).toBe(healthy);
  expect(wrapper.get('[data-healthy]').text()).toBe('Clicks 1');
  expect(document.activeElement).toBe(input);
  expect(healthyMounts).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledOnce();
});

it('rejects reset/catalog changes on the same external handle and accepts a replacement session', async () => {
  const state = createUIState({ initialState: { form: { name: 'First session' } } });
  const onError = vi.fn(); const { wrapper, update } = host({ spec: formSpec(), state, resetKey: 'first', onError });
  const input = wrapper.get('input').element;
  await update({ resetKey: 'second' });
  expect(wrapper.get('[role="alert"]').text()).toContain('state');
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('input').element.value).toBe('First session');
  await update({ resetKey: 'first', catalog: createUICatalog() });
  expect(wrapper.get('[role="alert"]').text()).toContain('catalog');
  expect(wrapper.get('input').element).toBe(input);
  const replacement = createUIState({ initialState: { form: { name: 'Second session' } } });
  await update({ state: replacement, catalog: replacement.catalog, resetKey: 'second' });
  state.updateHost({ '/form/name': 'Late old host' }, { sessionId: state.sessionId, version: 1 }); await nextTick();
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.get('input').element.value).toBe('Second session');
});

it('does not mount an initial external state/initialState conflict and recovers after correction', async () => {
  const state = createUIState({ initialState: { form: { name: 'External' } } });
  const onError = vi.fn();
  const { wrapper, update } = host({ spec: formSpec(), state, initialState: { form: { name: 'Conflict' } }, onError });
  expect(wrapper.find('input').exists()).toBe(false);
  expect(onError).toHaveBeenCalledOnce();
  await update({ initialState: undefined });
  expect(wrapper.get('input').element.value).toBe('External');
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
});

it('isolates a late action chain after replacing an external state handle', async () => {
  const catalog = createUICatalog({ actions: { wait: { params: z.object({}) }, write: { params: z.object({}) } } });
  const state = createUIState({ catalog, initialState: { form: { name: 'Old' } } });
  const replacement = createUIState({ catalog, initialState: { form: { name: 'New' } } });
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const wait = () => pending;
  const write = vi.fn((_params: Record<string, unknown>, context: UIActionContext) => { context.setState('/form/name', 'Late write'); throw new Error('Old error'); });
  const spec = formSpec(); spec.elements.root.children!.push('save'); spec.elements.save = { type: 'Button', props: { label: 'Save', variant: 'primary', disabled: false }, children: [], on: { press: [{ action: 'wait', params: {} }, { action: 'write', params: {} }] } };
  const onError = vi.fn(); const onStateChange = vi.fn();
  const { wrapper, update } = host({ spec, state, actions: { wait, write }, onError, onStateChange });
  await wrapper.get('button').trigger('click'); await update({ state: replacement }); release(); await flushPromises();
  expect(write).toHaveBeenCalledOnce();
  expect(state.store.get('/form/name')).toBe('Late write');
  expect(wrapper.get('input').element.value).toBe('New');
  expect(onError).not.toHaveBeenCalled(); expect(onStateChange).not.toHaveBeenCalled();
});

it.each(['emit', 'on'] as const)('preserves the native event promise for custom components that await %s', async (method) => {
  const catalog = createUICatalog({ components: { AwaitButton: { props: z.object({}), slots: [], events: ['press'] } }, actions: { save: { params: z.object({}) } } });
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const completed = vi.fn();
  const custom = defineRegistry(catalog, { components: { AwaitButton: ({ emit, on }) => h('button', { onClick: async () => { await (method === 'emit' ? emit('press') : on('press').emit()); completed(); } }, 'Wait') }, actions: {} });
  const { wrapper } = host({ catalog, registry: custom.registry, actions: { save: () => pending }, spec: { root: 'button', elements: { button: { type: 'AwaitButton', props: {}, children: [], on: { press: { action: 'save', params: {} } } } } } });
  await wrapper.get('button').trigger('click'); await flushPromises(); expect(completed).not.toHaveBeenCalled();
  release(); await flushPromises(); expect(completed).toHaveBeenCalledOnce();
});

it.each(['catalog', 'registry', 'actions'] as const)('rejects an invalid %s atomically and retains the previous view and action map', async (candidate) => {
  const catalog = createUICatalog({ components: { Probe: { props: z.object({}), slots: [] } }, actions: { save: { params: z.object({}) } } });
  const Probe = defineComponent({ setup: () => () => h('span', 'Probe') });
  const save = vi.fn(); const onError = vi.fn();
  const registry = { Probe };
  const spec = formSpec(); spec.elements.root.children!.push('probe', 'save');
  spec.elements.probe = { type: 'Probe', props: {}, children: [] };
  spec.elements.save = { type: 'Button', props: { label: 'Save', variant: 'primary', disabled: false }, children: [], on: { press: { action: 'save', params: {} } } };
  const { wrapper, update } = host({ spec, catalog, registry, actions: { save }, onError });
  const input = wrapper.get('input').element; await wrapper.get('input').setValue('Kept');
  const invalid = candidate === 'catalog' ? createUICatalog() : {};
  await update({ [candidate]: invalid });
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.text()).toContain('Probe');
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(save).toHaveBeenCalledOnce(); expect(onError).toHaveBeenCalledOnce();
  await update({ catalog, registry, actions: { save } });
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.get('input').element).toBe(input);
  expect(wrapper.get('input').element.value).toBe('Kept');
});
