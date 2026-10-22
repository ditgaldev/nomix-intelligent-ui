import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { z } from 'zod';
import { createUICatalog, createUIDocument, parseUIDocument, serializeUIDocument, type Spec } from '@nomix/intelligent-ui-core';
import { IntelligentUI, type ComponentRegistry } from '@nomix/intelligent-ui-react';

afterEach(cleanup);
const input = (value: unknown = { $bindState: '/note' }) => ({ type: 'Input', props: { label: '备注', name: 'note', type: 'text', placeholder: null, value, checks: null, validateOn: null }, children: [] });
const stackProps = { direction: 'vertical', gap: 'md', align: 'stretch', justify: null, className: null };
const form = (): Spec => ({ root: 'root', elements: {
  root: { type: 'Stack', props: stackProps, children: ['note', 'label'] },
  note: input(), label: { type: 'Text', props: { text: { $state: '/note' }, variant: null }, children: [] },
}, state: { note: '初始备注' } });

describe('React SDK adapter', () => {
  it('keeps two instances independent and labels point to unique inputs', () => {
    const view = render(<><IntelligentUI spec={form()} /><IntelligentUI spec={form()} /></>);
    const fields = screen.getAllByLabelText('备注') as HTMLInputElement[];
    expect(fields[0].id).not.toBe(fields[1].id);
    fireEvent.change(fields[1], { target: { value: '只改右侧' } });
    expect(fields.map(field => field.value)).toEqual(['初始备注', '只改右侧']);
    expect(view.getByText('只改右侧')).toBeTruthy();
  });
  it('preserves state during spec updates and explicitly restores with resetKey', () => {
    const change = vi.fn();
    const spec = form();
    const view = render(<IntelligentUI spec={spec} onStateChange={change} />);
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '保存后的内容' } });
    const document = createUIDocument(spec, { state: change.mock.calls.at(-1)![0] });
    const restored = parseUIDocument(serializeUIDocument(document));
    view.rerender(<IntelligentUI spec={{ ...spec }} initialState={{ note: '忽略初值变化' }} />);
    expect((screen.getByLabelText('备注') as HTMLInputElement).value).toBe('保存后的内容');
    view.rerender(<IntelligentUI spec={restored.spec} initialState={restored.state} resetKey="restored" />);
    expect((screen.getByLabelText('备注') as HTMLInputElement).value).toBe('保存后的内容');
  });
  it('uses a literal input value when no binding is supplied', () => {
    render(<IntelligentUI spec={{ root: 'input', elements: { input: input('直接传入') } }} />);
    expect((screen.getByLabelText('备注') as HTMLInputElement).value).toBe('直接传入');
  });
  it('executes a host action with resolved state and updates the view', async () => {
    const catalog = createUICatalog({ actions: { save: { params: z.object({ note: z.string() }) } } });
    const spec = form();
    spec.elements.root.children!.push('save');
    spec.elements.save = { type: 'Button', props: { label: '保存', variant: 'primary', disabled: null }, children: [], on: { press: { action: 'save', params: { note: { $state: '/note' } } } } };
    const action = vi.fn(async (params, context) => { context.setState('/note', `已保存：${params.note}`); });
    render(<IntelligentUI spec={spec} catalog={catalog} actions={{ save: action }} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByText('已保存：初始备注')).toBeTruthy());
    expect(action.mock.calls[0][0]).toEqual({ note: '初始备注' });
  });
  it('rejects resolved action params before calling the host and shows an error', async () => {
    const catalog = createUICatalog({ actions: { submit: { params: z.object({ count: z.number() }) } } });
    const action = vi.fn();
    const onError = vi.fn();
    const spec: Spec = { root: 'button', state: { count: '错误类型' }, elements: { button: { type: 'Button', props: { label: '提交', variant: null, disabled: null }, children: [], on: { press: { action: 'submit', params: { count: { $state: '/count' } } } } } } };
    render(<IntelligentUI spec={spec} catalog={catalog} actions={{ submit: action }} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('操作未完成'));
    expect(action).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
  it('blocks invalid trees before mounting components or watchers', () => {
    const mount = vi.fn(() => <div>mounted</div>);
    const catalog = createUICatalog({ components: { Probe: { props: z.object({}), slots: ['default'] } } });
    render(<IntelligentUI spec={{ root: 'p', elements: { p: { type: 'Probe', props: {}, children: ['missing'] } } }} catalog={catalog} registry={{ Probe: mount }} />);
    expect(screen.getByRole('alert').textContent).toContain('校验');
    expect(mount).not.toHaveBeenCalled();
  });
  it('reports missing implementations and recovers after corrected props', () => {
    const catalog = createUICatalog({ components: { Probe: { props: z.object({}), slots: [] } } });
    const spec = { root: 'p', elements: { p: { type: 'Probe', props: {}, children: [] } } };
    const view = render(<IntelligentUI spec={spec} catalog={catalog} />);
    expect(screen.getByRole('alert').textContent).toContain('缺少渲染实现');
    view.rerender(<IntelligentUI spec={spec} catalog={catalog} registry={{ Probe: () => <p>恢复成功</p> }} />);
    expect(screen.getByText('恢复成功')).toBeTruthy();
  });
  it('passes named slots and filters repeated children with native bindings', () => {
    const catalog = createUICatalog({ components: { Panel: { props: z.object({}), slots: ['header', 'default'] } } });
    const components: ComponentRegistry = { Panel: ({ slots, children }) => <section><header>{slots?.header}</header><main>{children}</main></section> };
    const spec: Spec = { root: 'panel', state: { items: [{ name: '显示这项', show: true }, { name: '隐藏这项', show: false }] }, elements: {
      panel: { type: 'Panel', props: {}, slots: { header: ['title'] }, children: ['list'] },
      title: { type: 'Heading', props: { text: '具名区域', level: 'h3' }, children: [] },
      list: { type: 'Stack', props: stackProps, children: ['item'], repeat: { statePath: '/items' } },
      item: { type: 'Text', props: { text: { $item: 'name' }, variant: null }, children: [], visible: { $item: 'show', eq: true } },
    } };
    const view = render(<IntelligentUI spec={spec} catalog={catalog} registry={components} />);
    expect(within(view.container.querySelector('header')!).getByText('具名区域')).toBeTruthy();
    expect(screen.getByText('显示这项')).toBeTruthy();
    expect(screen.queryByText('隐藏这项')).toBeNull();
  });
  it.each(['reset', 'catalog'] as const)('isolates a pending event chain after %s changes', async boundary => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const options = { actions: { wait: { params: z.object({}) }, finish: { params: z.object({}) } } };
    const first = createUICatalog(options);
    const second = createUICatalog(options);
    const finish = vi.fn();
    const actions = { wait: () => pending, finish };
    const spec = form();
    spec.elements.root.children!.push('start');
    spec.elements.start = { type: 'Button', props: { label: '开始', variant: null, disabled: null }, children: [], on: { press: [
      { action: 'wait', params: {} },
      { action: 'setState', params: { statePath: '/note', value: '旧会话写入' } },
      { action: 'finish', params: {} },
    ] } };
    const view = render(<IntelligentUI spec={spec} catalog={first} actions={actions} resetKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    view.rerender(<IntelligentUI spec={spec} catalog={boundary === 'catalog' ? second : first} actions={actions} resetKey={boundary === 'reset' ? 1 : 0} />);
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(finish).toHaveBeenCalledOnce());
    expect((screen.getByLabelText('备注') as HTMLInputElement).value).toBe('初始备注');
  });
  it('does not report an old asynchronous failure into a replacement catalog session', async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; });
    const options = { actions: { wait: { params: z.object({}) } } };
    const first = createUICatalog(options);
    const second = createUICatalog(options);
    const onError = vi.fn();
    const actions = { wait: () => pending };
    const spec: Spec = { root: 'start', elements: { start: { type: 'Button', props: { label: '开始', variant: null, disabled: null }, children: [], on: { press: { action: 'wait', params: {} } } } } };
    const view = render(<IntelligentUI spec={spec} catalog={first} actions={actions} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    view.rerender(<IntelligentUI spec={spec} catalog={second} actions={actions} onError={onError} />);
    await act(async () => { reject(new Error('旧请求失败')); await pending.catch(() => {}); });
    expect(onError).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
