'use client';

import React, { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { JSONUIProvider, Renderer, defineRegistry, type ComponentRegistry, type ComponentRenderProps } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import {
  baseActions, baseComponents, catalog as defaultCatalog, cloneJSON, createUIDocument, createUIStore,
  validateActionParams, type UICatalog, type UIActionHandlers, type UIState, type Spec, type ComputedFunction,
} from '@nomix/intelligent-ui-core';
import { InputField, SelectField, CheckboxField, PortalContainer } from './fields';

const selectedComponents = Object.fromEntries(
  Object.keys(baseComponents).map(name => [name, shadcnComponents[name as keyof typeof shadcnComponents]]),
);
Object.assign(selectedComponents, { Input: InputField, Select: SelectField, Checkbox: CheckboxField });
export const registry = defineRegistry(defaultCatalog, {
  components: selectedComponents as NonNullable<Parameters<typeof defineRegistry>[1]['components']>,
  actions: {},
}).registry;
const EMPTY_ACTIONS: UIActionHandlers = {};

export interface IntelligentUIProps {
  spec: Spec | unknown;
  initialState?: Record<string, unknown>;
  /** Optional external state owner. Replace the handle to begin a new session. */
  state?: UIState;
  catalog?: UICatalog;
  registry?: ComponentRegistry;
  actions?: UIActionHandlers;
  functions?: Record<string, ComputedFunction>;
  theme?: 'light' | 'dark';
  resetKey?: string | number;
  className?: string;
  onStateChange?: (state: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

class RenderBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void; onRecover: (error: Error) => void; resetToken: unknown }, { error: Error | null; resetToken: unknown }> {
  state: { error: Error | null; resetToken: unknown } = { error: null, resetToken: undefined };
  static getDerivedStateFromProps(props: { resetToken: unknown }, state: { resetToken: unknown }) {
    return props.resetToken === state.resetToken ? null : { error: null, resetToken: props.resetToken };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  componentDidUpdate(_previousProps: Readonly<RenderBoundary['props']>, previous: Readonly<RenderBoundary['state']>) {
    if (previous.error && !this.state.error) this.props.onRecover(previous.error);
  }
  render() {
    return this.state.error
      ? <div className="nomix-ui-error" role="alert">组件暂时无法显示：{this.state.error.message}</div>
      : this.props.children;
  }
}

interface Accepted extends IntelligentUIProps { spec: Spec; catalog: UICatalog; seed: Record<string, unknown> }
interface Candidate { value: Accepted | null; error: Error | null }
interface Selection { candidate: Candidate; accepted: Accepted | null; error: Error | null; session: number }

function selectCandidate(previous: Selection | undefined, candidate: Candidate): Selection {
  let error = candidate.error;
  const value = candidate.value;
  const before = previous?.accepted;
  if (!error && value?.state && before?.state === value.state && before.resetKey !== value.resetKey)
    error = new Error('外部 state 模式需要新的 state handle 才能重置会话');
  return {
    candidate, error, accepted: error ? before ?? null : value,
    session: (previous?.session ?? 0) + (!error && value && before &&
      (value.state !== before.state || value.resetKey !== before.resetKey) ? 1 : 0),
  };
}

/** Reject incomplete updates before replacing the currently accepted view. */
export function IntelligentUI(props: IntelligentUIProps) {
  const candidate = useMemo<Candidate>(() => {
    try {
      const catalog = props.catalog ?? props.state?.catalog ?? defaultCatalog;
      if (props.state && props.initialState !== undefined) throw new Error('state 与 initialState 不能同时提供');
      if (props.state && props.state.catalog !== catalog) throw new Error('外部 state 的 catalog 不能独立更换，请创建新的 state handle');
      const document = createUIDocument(props.spec, { catalog, state: props.state?.store.getSnapshot() ?? props.initialState });
      for (const element of Object.values(document.spec.elements)) {
        if (!props.registry?.[element.type] && !registry[element.type]) throw new Error(`组件缺少渲染实现：${element.type}`);
        for (const binding of Object.values({ ...element.on, ...element.watch }).flat()) {
          if (!Object.hasOwn(baseActions, binding.action) && typeof props.actions?.[binding.action] !== 'function') throw new Error(`动作缺少宿主处理函数：${binding.action}`);
        }
      }
      return { value: { ...props, spec: document.spec, catalog, seed: document.state }, error: null };
    }
    catch (error) { return { value: null, error: asError(error) }; }
  }, [props.spec, props.catalog, props.state, props.initialState, props.registry, props.actions, props.functions, props.resetKey]);
  let [selection, setSelection] = useState(() => selectCandidate(undefined, candidate));
  if (selection.candidate !== candidate) {
    selection = selectCandidate(selection, candidate);
    setSelection(selection);
  }
  const errorCallback = useRef(props.onError);
  errorCallback.current = props.onError;
  useEffect(() => { if (selection.error) errorCallback.current?.(selection.error); }, [selection.error]);
  if (!selection.accepted) return <div className={`nomix-ui ${props.className ?? ''}`} data-theme={props.theme ?? 'light'}>
    {selection.error && <div className="nomix-ui-error" role="alert">界面数据未通过校验：{selection.error.message}</div>}
  </div>;
  return <UISession key={selection.session} {...selection.accepted} theme={props.theme} className={props.className}
    onError={props.onError} onStateChange={props.onStateChange} validationError={selection.error} />;
}

const GuardContext = createContext({ reportError: (_error: Error) => {}, recoverError: (_error: Error) => {}, clearActionError: () => {} });

function UISession({ spec, seed, state: externalState, catalog, registry: customRegistry,
  actions = EMPTY_ACTIONS, functions, theme = 'light', className = '', onStateChange, onError,
  validationError }: Accepted & { validationError: Error | null }) {
  const callbacks = useRef({ onStateChange, onError });
  callbacks.current = { onStateChange, onError };
  const [actionError, setActionError] = useState<Error | null>(null);
  const reportedError = useRef<Error | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const session = useRef<{ catalog: UICatalog; store: ReturnType<typeof createUIStore>; revision: number } | null>(null);
  if (!session.current || session.current.catalog !== catalog) {
    session.current = {
      catalog,
      store: externalState?.store ?? createUIStore(session.current?.store.getSnapshot() ?? seed, { catalog }),
      revision: (session.current?.revision ?? 0) + 1,
    };
  }
  const store = session.current?.store;
  const reportError = useCallback((error: Error) => {
    if (!active.current || session.current?.store !== store || reportedError.current === error) return;
    reportedError.current = error;
    setActionError(error);
    callbacks.current.onError?.(error);
  }, [store]);
  const clearActionError = useCallback(() => {
    if (!active.current || session.current?.store !== store) return;
    reportedError.current = null;
    setActionError(null);
  }, [store]);
  const recoverError = useCallback((error: Error) => {
    if (!active.current || session.current?.store !== store) return;
    if (reportedError.current === error) reportedError.current = null;
    setActionError(current => current === error ? null : current);
  }, [store]);
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => callbacks.current.onStateChange?.(cloneJSON(store.getSnapshot())));
  }, [store]);
  useEffect(() => {
    reportedError.current = null;
    setActionError(null);
  }, [spec, catalog]);

  const handlers = useMemo(() => Object.fromEntries(
    Object.entries(actions).map(([name, handler]) => [name, async (params: Record<string, unknown>) => {
      if (!store) return;
      clearActionError();
      try {
        const validated = validateActionParams(name, params, { catalog });
        await handler(validated, {
          getState: () => cloneJSON(store.getSnapshot()),
          setState: (path, value) => store.set(path, value),
        });
      } catch (error) { reportError(asError(error)); throw error; }
    }]),
  ), [actions, store, catalog, reportError, clearActionError]);

  const guardCache = useRef(new Map<ComponentRegistry[string], ComponentRegistry[string]>());
  const wrappedRegistry = useMemo(() => Object.fromEntries(Object.entries({ ...registry, ...customRegistry }).map(([name, Entry]) => {
    let GuardedEntry = guardCache.current.get(Entry);
    if (!GuardedEntry) {
      GuardedEntry = function GuardedEntry(props: ComponentRenderProps) {
        const { reportError, recoverError, clearActionError } = useContext(GuardContext);
        const emit = (event: string) => {
          clearActionError();
          try { return Promise.resolve(props.emit(event)).catch(error => reportError(asError(error))); }
          catch (error) { reportError(asError(error)); return Promise.resolve(); }
        };
        const on = (event: string) => ({ ...props.on(event), emit: () => emit(event) });
        return <RenderBoundary onError={reportError} onRecover={recoverError} resetToken={props.element}><Entry {...props} emit={emit} on={on} /></RenderBoundary>;
      };
      guardCache.current.set(Entry, GuardedEntry);
    }
    return [name, GuardedEntry];
  })) as ComponentRegistry, [customRegistry]);
  const guardContext = useMemo(() => ({ reportError, recoverError, clearActionError }), [reportError, recoverError, clearActionError]);

  return <div ref={setContainer} className={`nomix-ui ${className}`} data-theme={theme}>
    {validationError && <div className="nomix-ui-error" role="alert">界面数据未通过校验：{validationError.message}</div>}
      {store && <>
        {actionError && <div className="nomix-ui-error" role="alert">操作未完成：{actionError.message}</div>}
        <PortalContainer.Provider value={container ?? undefined}>
          {/* Remount the native provider so an old event chain keeps its old store. */}
          <GuardContext.Provider value={guardContext}>
            <JSONUIProvider key={session.current?.revision} registry={wrappedRegistry} store={store} handlers={handlers} functions={functions}>
              <Renderer spec={spec} registry={wrappedRegistry} />
            </JSONUIProvider>
          </GuardContext.Provider>
        </PortalContainer.Provider>
      </>}
  </div>;
}

export { defineRegistry, useBoundProp, useStateValue, useStateStore } from '@json-render/react';
export type { ComponentRegistry, ComponentRenderProps, BaseComponentProps } from '@json-render/react';
