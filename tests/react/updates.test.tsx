import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createUICatalog, createUIState, type Spec } from '@nomix/intelligent-ui-core';
import { IntelligentUI, type ComponentRegistry } from '@nomix/intelligent-ui-react';

afterEach(cleanup);
const stack = { direction: 'vertical', gap: 'md', align: null, justify: null, className: null };
function form(): Spec {
  return { root: 'root', state: { draft: 'initial', result: 10 }, elements: {
    root: { type: 'Stack', props: stack, children: ['input', 'result'] },
    input: { type: 'Input', props: { label: 'Draft', name: 'draft', type: 'text', placeholder: null,
      value: { $bindState: '/draft' }, checks: null, validateOn: null }, children: [] },
    result: { type: 'Text', props: { text: { $computed: 'format', args: { value: { $state: '/result' } } }, variant: null }, children: [] },
  } };
}
const functions = { format: (args: Record<string, unknown>) => `Result: ${args.value}` };
const catalog = createUICatalog({ allowedStatePaths: ['/draft'], components: {
  Detail: { props: z.object({}) }, Probe: { props: z.object({ fail: z.boolean() }) },
} });
const entries: ComponentRegistry = {
  Detail: () => { const [count, setCount] = useState(0); return <details><summary>Details</summary><button onClick={() => setCount(count + 1)}>Count {count}</button></details>; },
  Probe: ({ element }) => { if (element.props.fail) throw new Error('component failure'); return <p>Recovered component</p>; },
};

describe('React continuous updates', () => {
  it('preserves DOM, focus and local state across spec and registry object updates', () => {
    const spec = form(); spec.elements.root.children!.push('detail'); spec.elements.detail = { type: 'Detail', props: {}, children: [] };
    const view = render(<IntelligentUI spec={spec} catalog={catalog} registry={entries} functions={functions} />);
    const input = screen.getByLabelText('Draft') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my draft' } });
    const detail = view.container.querySelector('details')!; detail.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' })); input.focus();
    const next = structuredClone(spec); next.elements.root.children!.push('new'); next.elements.new = { type: 'Text', props: { text: 'Added', variant: null }, children: [] };
    view.rerender(<IntelligentUI spec={next} catalog={catalog} registry={{ ...entries }} functions={functions} />);
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('my draft');
    expect(view.container.querySelector('details')).toBe(detail);
    expect(detail.open).toBe(true);
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy();
    expect(screen.getByText('Added')).toBeTruthy();
  });

  it('retains the accepted view and input while an invalid update is rejected, then recovers', () => {
    const spec = form(), onError = vi.fn();
    const view = render(<IntelligentUI spec={spec} functions={functions} onError={onError} />);
    const input = screen.getByLabelText('Draft'); input.focus();
    const bad = structuredClone(spec); bad.elements.root.children!.push('missing');
    view.rerender(<IntelligentUI spec={bad} functions={functions} onError={onError} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(onError).toHaveBeenCalledOnce();
    view.rerender(<IntelligentUI spec={{ ...spec }} functions={functions} onError={onError} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Draft')).toBe(input);
  });

  it('recovers a failed component without remounting its unaffected sibling', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spec = form(); spec.elements.root.children!.push('probe'); spec.elements.probe = { type: 'Probe', props: { fail: false }, children: [] };
    const view = render(<IntelligentUI spec={spec} catalog={catalog} registry={entries} functions={functions} />);
    const input = screen.getByLabelText('Draft'); input.focus();
    const bad = structuredClone(spec); bad.elements.probe.props.fail = true;
    view.rerender(<IntelligentUI spec={bad} catalog={catalog} registry={entries} functions={functions} />);
    expect(screen.getByLabelText('Draft')).toBe(input);
    view.rerender(<IntelligentUI spec={{ ...spec }} catalog={catalog} registry={entries} functions={functions} />);
    expect(screen.getByText('Recovered component')).toBeTruthy();
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('accepts ordered host data without overwriting an edited value', () => {
    const state = createUIState({ initialState: { draft: 'initial', result: 10 }, catalog });
    const view = render(<IntelligentUI spec={form()} state={state} functions={functions} />);
    const input = screen.getByLabelText('Draft') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'editing' } }); input.focus();
    act(() => { expect(state.updateHost({ '/result': 30 }, { sessionId: state.sessionId, version: 2 })).toBe(true); });
    act(() => { expect(state.updateHost({ '/result': 20 }, { sessionId: state.sessionId, version: 1 })).toBe(false); });
    expect(screen.getByText('Result: 30')).toBeTruthy();
    expect(input.value).toBe('editing'); expect(document.activeElement).toBe(input);
    expect(() => state.store.set('/result', 99)).toThrow();
    view.unmount();
  });

  it('recovers from a state-driven component error on the next host update', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spec = form(); spec.elements.root.children!.push('probe');
    spec.elements.probe = { type: 'Probe', props: { fail: { $state: '/fail' } }, children: [] };
    const state = createUIState({ catalog, initialState: { draft: 'editing', result: 10, fail: false } });
    render(<IntelligentUI spec={spec} state={state} registry={entries} functions={functions} />);
    const input = screen.getByLabelText('Draft'); input.focus();
    act(() => { state.updateHost({ '/fail': true }, { sessionId: state.sessionId, version: 0 }); });
    expect(screen.queryByText('Recovered component')).toBeNull();
    act(() => { state.updateHost({ '/fail': false }, { sessionId: state.sessionId, version: 1 }); });
    expect(screen.getByText('Recovered component')).toBeTruthy();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('rejects a reset with the same external handle and resets only with a new handle', () => {
    const spec = form(), first = createUIState({ initialState: { draft: 'first', result: 1 }, catalog });
    const view = render(<IntelligentUI spec={spec} state={first} functions={functions} resetKey="a" />);
    const input = screen.getByLabelText('Draft') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'editing' } });
    view.rerender(<IntelligentUI spec={spec} state={first} functions={functions} resetKey="b" />);
    expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.getByLabelText('Draft')).toBe(input); expect(input.value).toBe('editing');
    const second = createUIState({ initialState: { draft: 'second', result: 2 }, catalog });
    view.rerender(<IntelligentUI spec={spec} state={second} functions={functions} resetKey="b" />);
    expect(screen.queryByRole('alert')).toBeNull(); expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('second');
  });

  it('does not apply old host results or pending action writes to a new handle', async () => {
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    const actionCatalog = createUICatalog({ actions: { wait: { params: z.object({}) } } });
    const actions = { wait: async (_: Record<string, unknown>, context: { setState(path: string, value: unknown): void }) => { await pending; context.setState('/draft', 'late action'); } };
    const spec = form(); spec.elements.root.children!.push('go'); spec.elements.go = { type: 'Button', props: { label: 'Go', disabled: null, variant: null }, children: [], on: { press: { action: 'wait', params: {} } } };
    const first = createUIState({ initialState: { draft: 'first', result: 1 }, catalog: actionCatalog });
    const second = createUIState({ initialState: { draft: 'second', result: 2 }, catalog: actionCatalog });
    const view = render(<IntelligentUI spec={spec} state={first} actions={actions} functions={functions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    view.rerender(<IntelligentUI spec={spec} state={second} actions={actions} functions={functions} />);
    act(() => { first.updateHost({ '/result': 100 }, { sessionId: first.sessionId, version: 1 }); });
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(first.store.get('/draft')).toBe('late action'));
    expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('second'); expect(screen.getByText('Result: 2')).toBeTruthy();
  });
});
