'use client';

import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { JSONUIProvider, Renderer, defineRegistry, type ComponentRegistry, type ComponentRenderProps } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import {
  baseActions, baseComponents, catalog as defaultCatalog, cloneJSON, createUIDocument, createUIStore,
  validateActionParams, type UICatalog, type UIActionHandlers, type Spec, type ComputedFunction,
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

class RenderBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() {
    return this.state.error
      ? <div className="nomix-ui-error" role="alert">组件暂时无法显示：{this.state.error.message}</div>
      : this.props.children;
  }
}

/** Each resetKey owns one isolated official json-render store. */
export function IntelligentUI(props: IntelligentUIProps) {
  return <UISession key={props.resetKey ?? 'default'} {...props} />;
}

function UISession({ spec, initialState, catalog = defaultCatalog, registry: customRegistry,
  actions = EMPTY_ACTIONS, functions, theme = 'light', className = '', onStateChange, onError }: IntelligentUIProps) {
  const checked = useMemo(() => {
    try {
      const document = createUIDocument(spec, { catalog, state: initialState });
      for (const element of Object.values(document.spec.elements)) {
        if (!customRegistry?.[element.type] && !registry[element.type]) throw new Error(`组件缺少渲染实现：${element.type}`);
        for (const binding of Object.values({ ...element.on, ...element.watch }).flat()) {
          if (!Object.hasOwn(baseActions, binding.action) && !actions[binding.action]) throw new Error(`动作缺少宿主处理函数：${binding.action}`);
        }
      }
      return { document, error: null };
    }
    catch (error) { return { document: null, error: asError(error) }; }
  }, [spec, catalog, initialState, customRegistry, actions]);
  const callbacks = useRef({ onStateChange, onError });
  callbacks.current = { onStateChange, onError };
  const [actionError, setActionError] = useState<Error | null>(null);
  const reportedError = useRef<Error | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const session = useRef<{ catalog: UICatalog; store: ReturnType<typeof createUIStore>; revision: number } | null>(null);
  if (checked.document && (!session.current || session.current.catalog !== catalog)) {
    session.current = {
      catalog,
      store: createUIStore(session.current?.store.getSnapshot() ?? checked.document.state, { catalog }),
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
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => callbacks.current.onStateChange?.(cloneJSON(store.getSnapshot())));
  }, [store]);
  useEffect(() => {
    reportedError.current = null;
    setActionError(null);
    if (checked.error) callbacks.current.onError?.(checked.error);
  }, [spec, catalog, checked.error]);

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

  const wrappedRegistry = useMemo(() => Object.fromEntries(
    Object.entries({ ...registry, ...customRegistry }).map(([name, Entry]) => [name, function GuardedEntry(props: ComponentRenderProps) {
      const emit = (event: string) => {
        clearActionError();
        Promise.resolve(props.emit(event)).catch(error => reportError(asError(error)));
      };
      const on = (event: string) => ({ ...props.on(event), emit: () => emit(event) });
      return <RenderBoundary onError={reportError}><Entry {...props} emit={emit} on={on} /></RenderBoundary>;
    }]),
  ) as ComponentRegistry, [customRegistry, reportError, clearActionError]);
  // Native renderer errors recover when a new Spec arrives; the shared store survives.
  const revision = useRef({ spec, value: 0 });
  if (revision.current.spec !== spec) revision.current = { spec, value: revision.current.value + 1 };

  return <div ref={setContainer} className={`nomix-ui ${className}`} data-theme={theme}>
    {checked.error ? <div className="nomix-ui-error" role="alert">界面数据未通过校验：{checked.error.message}</div> :
      checked.document && store && <>
        {actionError && <div className="nomix-ui-error" role="alert">操作未完成：{actionError.message}</div>}
        <PortalContainer.Provider value={container ?? undefined}>
          {/* Remount the native provider so an old event chain keeps its old store. */}
          <JSONUIProvider key={session.current?.revision} registry={wrappedRegistry} store={store} handlers={handlers} functions={functions}>
            <Renderer key={revision.current.value} spec={checked.document.spec} registry={wrappedRegistry} />
          </JSONUIProvider>
        </PortalContainer.Provider>
      </>}
  </div>;
}

export { defineRegistry, useBoundProp, useStateValue, useStateStore } from '@json-render/react';
export type { ComponentRegistry, ComponentRenderProps, BaseComponentProps } from '@json-render/react';
