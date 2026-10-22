import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import { z } from 'zod';
import { IntelligentUI, defineRegistry, type IntelligentUIProps } from '@nomix/intelligent-ui-vue';
import { createUICatalog, type Spec, type UIActionContext } from '@nomix/intelligent-ui-core';

const mounted: VueWrapper[] = [];
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; });
function render(props: Record<string, unknown>) {
  // VTU recursively reads catalog's type-only getters when passed through its
  // props option. A consuming component passes it directly, as this host does.
  const { catalog, ...hostProps } = props;
  const Host = defineComponent((values: Omit<IntelligentUIProps, 'catalog'>, { attrs }) => () => h(IntelligentUI, { ...attrs, ...values, catalog } as never), {
    inheritAttrs: false, props: ['spec', 'initialState', 'actions', 'functions', 'registry', 'theme', 'resetKey', 'onStateChange', 'onError'],
  });
  const wrapper = mount(Host, { props: hostProps as Omit<IntelligentUIProps, 'catalog'>, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}
const text = (value: unknown) => ({ type: 'Text', props: { text: value, variant: null }, children: [] });
const input = () => ({ type: 'Input', props: {
  label: 'Name', name: 'name', type: 'text', placeholder: 'Your name', value: { $bindState: '/form/name' }, checks: null, validateOn: null,
}, children: [] });
const button = (label = 'Save') => ({ type: 'Button', props: { label, variant: 'primary', disabled: false }, children: [] });
function formSpec(): Spec {
  return {
    root: 'root', state: { form: { name: 'Initial' } }, elements: {
      root: { type: 'Stack', props: { direction: 'vertical', gap: 'md', align: null, justify: null, className: null }, children: ['input', 'echo'] },
      input: input(), echo: text({ $state: '/form/name' }),
    },
  };
}

describe('Vue IntelligentUI', () => {
  it('binds Input through the native state store and emits complete snapshots', async () => {
    const stateChange = vi.fn();
    const wrapper = render({ spec: formSpec(), onStateChange: stateChange });
    expect(wrapper.get('input').element.value).toBe('Initial');
    await wrapper.get('input').setValue('Ada');
    await flushPromises();
    expect(wrapper.text()).toContain('Ada');
    expect(stateChange).toHaveBeenLastCalledWith({ form: { name: 'Ada' } });
  });

  it('resolves named computed functions initially and after native state changes', async () => {
    const spec: Spec = {
      root: 'root', state: { amount: 12 }, elements: {
        root: { type: 'Stack', props: { direction: 'vertical', gap: 'md', align: null, justify: null, className: null }, children: ['formatted', 'update'] },
        formatted: text({ $computed: 'format', args: { value: { $state: '/amount' } } }),
        update: { ...button('Update amount'), on: { press: { action: 'setState', params: { statePath: '/amount', value: 27 } } } },
      },
    };
    const format = vi.fn(({ value }: Record<string, unknown>) => `Amount: ${value}`);
    const wrapper = render({ spec, functions: { format } });
    expect(wrapper.text()).toContain('Amount: 12');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Amount: 27');
    expect(format).toHaveBeenLastCalledWith({ value: 27 });
  });

  it('dispatches press and protects the store from mutations of host snapshots', async () => {
    const customCatalog = createUICatalog({ actions: { save: { params: z.object({ name: z.string() }) } } });
    const save = vi.fn((params: Record<string, unknown>, context: UIActionContext) => {
      const snapshot = context.getState();
      (snapshot.form as Record<string, unknown>).name = 'Mutated copy';
      expect((context.getState().form as Record<string, unknown>).name).toBe('Initial');
      context.setState('/form/name', params.name);
    });
    const spec = formSpec();
    spec.elements.root.children!.push('save');
    spec.elements.save = { ...button(), on: { press: { action: 'save', params: { name: 'Grace' } } } };
    const wrapper = render({ spec, catalog: customCatalog, actions: { save } });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(save).toHaveBeenCalledOnce();
    expect(wrapper.get('input').element.value).toBe('Grace');
  });

  it('binds Checkbox and dispatches change with the updated value', async () => {
    const customCatalog = createUICatalog({ actions: { changed: { params: z.object({ checked: z.boolean() }) } } });
    const changed = vi.fn();
    const spec: Spec = {
      root: 'check', state: { agreed: false }, elements: { check: {
        type: 'Checkbox', props: { label: 'Accept', name: 'agreed', checked: { $bindState: '/agreed' }, checks: null, validateOn: null }, children: [],
        on: { change: { action: 'changed', params: { checked: { $state: '/agreed' } } } },
      } },
    };
    const wrapper = render({ spec, catalog: customCatalog, actions: { changed } });
    await wrapper.get('[role="checkbox"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true');
    expect(changed.mock.calls[0][0]).toEqual({ checked: true });
  });

  it('binds Select, emits change, and keeps its popup under the instance theme', async () => {
    const customCatalog = createUICatalog({ actions: { changed: { params: z.object({ value: z.string() }) } } });
    const changed = vi.fn();
    const wrapper = render({ theme: 'dark', catalog: customCatalog, actions: { changed }, spec: {
      root: 'select', state: { status: 'Draft' }, elements: { select: {
        type: 'Select', props: { label: 'Status', name: 'status', options: ['Draft', 'Ready'], placeholder: null, value: { $bindState: '/status' }, checks: null, validateOn: null }, children: [],
        on: { change: { action: 'changed', params: { value: { $state: '/status' } } } },
      } },
    } });
    await flushPromises();
    expect(wrapper.get('[role="combobox"]').text()).toContain('Draft');
    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const popup = document.body.querySelector('[role="listbox"]');
    expect(popup?.closest('.nomix-ui')?.getAttribute('data-theme')).toBe('dark');
    const option = wrapper.findAll('[role="option"]').find(item => item.text() === 'Ready');
    expect(option).toBeDefined();
    await option!.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.get('[role="combobox"]').text()).toContain('Ready');
    expect(changed.mock.calls[0][0]).toEqual({ value: 'Ready' });
  });

  it('keeps two instances independent and restores only when resetKey changes', async () => {
    const spec = formSpec();
    const wrapper = mount(defineComponent({ setup: () => () => h('div', [
      h(IntelligentUI, { spec, initialState: { form: { name: 'First' } } }),
      h(IntelligentUI, { spec, initialState: { form: { name: 'Second' } } }),
    ]) }));
    mounted.push(wrapper);
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Changed');
    expect(inputs[1].element.value).toBe('Second');
    expect(inputs[0].attributes('id')).not.toBe(inputs[1].attributes('id'));

    const session = render({ spec, initialState: { form: { name: 'Recovered' } }, resetKey: 'one' });
    await session.get('input').setValue('Edited');
    await session.setProps({ initialState: { form: { name: 'New recovery' } } });
    expect(session.get('input').element.value).toBe('Edited');
    await session.setProps({ resetKey: 'two' });
    expect(session.get('input').element.value).toBe('New recovery');
  });

  it('passes native named slots to custom registry components', () => {
    const customCatalog = createUICatalog({
      components: { Layout: { props: z.object({}), slots: ['default', 'header'], description: 'Named layout' } },
      constraints: { Layout: { slots: { header: { required: true, min: 1, max: 1, allowedComponents: ['Text'] } } } },
    });
    const custom = defineRegistry(customCatalog, { components: {
      Layout: ({ slots }) => h('section', null, [h('header', null, slots.header?.()), h('main', null, slots.default?.())]),
    }, actions: {} });
    const wrapper = render({ catalog: customCatalog, registry: custom.registry, spec: {
      root: 'layout', elements: {
        layout: { type: 'Layout', props: {}, children: ['body'], slots: { header: ['title'] } },
        title: text('Named header'), body: text('Default content'),
      },
    } });
    expect(wrapper.get('header').text()).toBe('Named header');
    expect(wrapper.get('main').text()).toBe('Default content');
  });

  it('keeps a pending old action from changing a reset session or its error UI', async () => {
    const customCatalog = createUICatalog({ actions: { save: { params: z.object({}) } } });
    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const save = async (_params: Record<string, unknown>, context: UIActionContext) => {
      await pending;
      context.setState('/form/name', 'Stale request');
      throw new Error('Stale failure');
    };
    const spec = formSpec();
    spec.elements.root.children!.push('save');
    spec.elements.save = { ...button(), on: { press: { action: 'save', params: {} } } };
    const onError = vi.fn();
    const wrapper = render({ spec, catalog: customCatalog, actions: { save }, resetKey: 'first', onError });
    await wrapper.get('button').trigger('click');
    await wrapper.setProps({ resetKey: 'second', initialState: { form: { name: 'New session' } } });
    complete();
    await flushPromises();
    expect(wrapper.get('input').element.value).toBe('New session');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['resetKey', 'catalog'] as const)('isolates every later action in a pending event chain after %s changes', async (change) => {
    const initialCatalog = createUICatalog({ actions: {
      wait: { params: z.object({}) }, write: { params: z.object({ value: z.string() }) },
    } });
    // The new catalog deliberately rejects the old event's string parameter.
    // Its old provider must retain both its original catalog and its store.
    const replacementCatalog = createUICatalog({ actions: {
      wait: { params: z.object({}) }, write: { params: z.object({ value: z.number() }) },
    } });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const wait = vi.fn(() => pending);
    const write = vi.fn((params: Record<string, unknown>, context: UIActionContext) => {
      context.setState('/form/name', params.value);
      throw new Error('Late old-chain error');
    });
    const spec = formSpec();
    spec.elements.root.children!.push('save');
    spec.elements.save = { ...button(), on: { press: [
      { action: 'wait', params: {} }, { action: 'write', params: { value: { $state: '/writeValue' } } },
    ] } };
    const selectedCatalog = shallowRef(initialCatalog);
    const resetKey = ref('first');
    const initialState = shallowRef<Record<string, unknown>>({ form: { name: 'Current session' }, writeValue: 'Old-chain write' });
    const onError = vi.fn();
    const stateChange = vi.fn();
    const Host = defineComponent({ setup: () => () => h(IntelligentUI, {
      spec, catalog: selectedCatalog.value, resetKey: resetKey.value, initialState: initialState.value,
      actions: { wait, write }, onError, onStateChange: stateChange,
    }) });
    const wrapper = mount(Host, { attachTo: document.body });
    mounted.push(wrapper);
    await wrapper.get('button').trigger('click');
    expect(wait).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    if (change === 'resetKey') {
      initialState.value = { form: { name: 'Reset session' } };
      resetKey.value = 'second';
    } else selectedCatalog.value = replacementCatalog;
    await nextTick();
    release();
    await flushPromises();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0]).toEqual({ value: 'Old-chain write' });
    expect(wrapper.get('input').element.value).toBe(change === 'resetKey' ? 'Reset session' : 'Current session');
    expect(stateChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('rejects an invalid spec before a custom component or its watch can mount', async () => {
    const onError = vi.fn();
    const action = vi.fn();
    const component = vi.fn(() => h('div', 'must not mount'));
    const customCatalog = createUICatalog({ actions: { tracked: { params: z.object({}) } } });
    const custom = defineRegistry(customCatalog, { components: { Text: component }, actions: {} });
    const spec: Spec = { root: 'bad', state: { value: 1 }, elements: {
      bad: { ...text('Invalid'), slots: { forbidden: [] }, watch: { '/value': { action: 'tracked', params: {} } } },
    } };
    const wrapper = render({ spec, catalog: customCatalog, registry: custom.registry, actions: { tracked: action }, onError });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(component).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('reports catalog/consumer mismatches before mounting', () => {
    const customCatalog = createUICatalog({
      components: { Missing: { props: z.object({}), slots: [], description: 'Unimplemented' } },
      actions: { missing: { params: z.object({}) } },
    });
    const missingComponent = render({ catalog: customCatalog, spec: {
      root: 'missing', elements: { missing: { type: 'Missing', props: {}, children: [] } },
    } });
    expect(missingComponent.get('[role="alert"]').text()).toContain('No Vue implementation registered');
    const missingAction = render({ catalog: customCatalog, spec: {
      root: 'button', elements: { button: { ...button(), on: { press: { action: 'missing', params: {} } } } },
    } });
    expect(missingAction.get('[role="alert"]').text()).toContain('No handler registered for action: missing');
    expect(missingAction.find('button').exists()).toBe(false);
  });

  it('recovers from a rejected spec without losing edits', async () => {
    const wrapper = render({ spec: formSpec() });
    await wrapper.get('input').setValue('Keep this');
    const invalid = formSpec();
    invalid.elements.input.type = 'Missing';
    await wrapper.setProps({ spec: invalid });
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.setProps({ spec: formSpec() });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('input').element.value).toBe('Keep this');
  });

  it('reports a render failure and recovers a new spec with the same element id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const customCatalog = createUICatalog({ components: { Crash: { props: z.object({ fail: z.boolean() }), slots: [], description: 'Recovery probe' } } });
    const custom = defineRegistry(customCatalog, { components: {
      Crash: ({ props }) => { if ((props as { fail: boolean }).fail) throw new Error('Render failed'); return h('span', 'Recovered'); },
    }, actions: {} });
    const spec = (fail: boolean): Spec => ({ root: 'same', elements: { same: { type: 'Crash', props: { fail }, children: [] } } });
    const onError = vi.fn();
    const wrapper = render({ spec: spec(true), catalog: customCatalog, registry: custom.registry, onError });
    await nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain('Render failed');
    await wrapper.setProps({ spec: spec(false) });
    expect(wrapper.text()).toBe('Recovered');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('checks dynamically resolved action params before calling a host handler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const customCatalog = createUICatalog({ actions: { count: { params: z.object({ count: z.number() }) } } });
    const host = vi.fn();
    const wrapper = render({ catalog: customCatalog, actions: { count: host }, spec: {
      root: 'button', state: { count: 'bad type' }, elements: {
        button: { ...button(), on: { press: { action: 'count', params: { count: { $state: '/count' } } } } },
      },
    } });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(host).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it('keeps a valid UI mounted after an async action fails and retries the same button', async () => {
    const customCatalog = createUICatalog({ actions: { save: { params: z.object({}) } } });
    let finishRetry!: () => void;
    const retry = new Promise<void>(resolve => { finishRetry = resolve; });
    let attempt = 0;
    const save = vi.fn(async (_params: Record<string, unknown>, context: UIActionContext) => {
      if (++attempt === 1) throw new Error('Try saving again');
      await retry;
      context.setState('/form/name', 'Saved');
    });
    const spec = formSpec();
    spec.elements.root.children!.push('save');
    spec.elements.save = { ...button(), on: { press: { action: 'save', params: {} } } };
    const onError = vi.fn();
    const wrapper = render({ spec, catalog: customCatalog, actions: { save }, onError });
    await wrapper.get('input').setValue('Edited before save');
    const originalButton = wrapper.get('button').element;
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('.nomix-ui-error[role="alert"]').text()).toContain('Try saving again');
    expect(wrapper.get('input').element.value).toBe('Edited before save');
    expect(wrapper.get('button').element).toBe(originalButton);
    await wrapper.get('button').trigger('click');
    await nextTick();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('button').element).toBe(originalButton);
    finishRetry();
    await flushPromises();
    expect(wrapper.get('input').element.value).toBe('Saved');
    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('uses native field validation and shows its errors', async () => {
    const spec = formSpec();
    spec.elements.input.props.checks = [{ type: 'required', message: 'Name is required' }];
    const wrapper = render({ spec });
    await wrapper.get('input').setValue('');
    await wrapper.get('input').trigger('blur');
    await flushPromises();
    expect(wrapper.text()).toContain('Name is required');
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
  });
});
