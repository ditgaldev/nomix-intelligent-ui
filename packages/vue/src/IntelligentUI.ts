import {
  computed, defineComponent, h, onBeforeUnmount, onErrorCaptured, provide,
  ref, shallowRef, watch, type PropType,
} from 'vue';
import { JSONUIProvider, Renderer, type ComponentRegistry, type EventHandle, type StateStore } from '@json-render/vue';
import {
  baseActions, catalog as defaultCatalog, cloneJSON, createUIStore, validateActionParams, validateUI,
  type Spec, type UICatalog, type UIActionHandlers, type ComputedFunction, type UIState,
} from '@nomix/intelligent-ui-core';
import { registry as defaultRegistry } from './components';

export interface IntelligentUIProps {
  spec: Spec;
  /** Internal session seed. Read on mounting/resetKey; cannot accompany state. */
  initialState?: Record<string, unknown>;
  /** Shared state session. Replace the handle to deliberately start a new session. */
  state?: UIState;
  actions?: UIActionHandlers;
  functions?: Record<string, ComputedFunction>;
  /** Native json-render Vue registry entries; supplied keys override defaults. */
  registry?: ComponentRegistry;
  catalog?: UICatalog;
  theme?: 'light' | 'dark';
  /** Reset internal state from initialState/spec.state. External sessions require a new handle. */
  resetKey?: string | number;
  onStateChange?: (snapshot: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const IntelligentUI = defineComponent({
  name: 'IntelligentUI',
  inheritAttrs: false,
  props: {
    spec: { type: Object as PropType<Spec>, required: true },
    initialState: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    state: { type: Object as PropType<UIState>, default: undefined },
    actions: { type: Object as PropType<UIActionHandlers>, default: undefined },
    functions: { type: Object as PropType<Record<string, ComputedFunction>>, default: undefined },
    registry: { type: Object as PropType<ComponentRegistry>, default: undefined },
    catalog: { type: Object as PropType<UICatalog>, default: undefined },
    theme: { type: String as PropType<'light' | 'dark'>, default: 'light' },
    resetKey: { type: [String, Number] as PropType<string | number>, default: undefined },
    onStateChange: { type: Function as PropType<IntelligentUIProps['onStateChange']>, default: undefined },
    onError: { type: Function as PropType<IntelligentUIProps['onError']>, default: undefined },
  },
  setup(props, { attrs, expose }) {
    const container = ref<HTMLElement>();
    provide('nomix-ui:portal-target', () => container.value);
    interface AcceptedUI {
      spec: Spec;
      catalog: UICatalog;
      registry: ComponentRegistry;
      actions: UIActionHandlers;
      functions: IntelligentUIProps['functions'];
      store: StateStore;
      state: UIState | undefined;
      resetKey: IntelligentUIProps['resetKey'];
    }
    const accepted = shallowRef<AcceptedUI>();
    const candidateError = shallowRef<Error>();
    const runtimeError = shallowRef<Error>();
    const actionError = shallowRef<Error>();
    const acceptedRevision = ref(0);
    const storeRevision = ref(0);
    const sessionRevision = ref(0);
    const error = computed(() => candidateError.value ?? runtimeError.value ?? actionError.value);
    const reportError = (caught: unknown) => { runtimeError.value = asError(caught); };
    const reportActionError = (caught: unknown) => { actionError.value = asError(caught); };
    watch(error, caught => { if (caught) props.onError?.(caught); }, { immediate: true });

    let unsubscribe: (() => void) | undefined;
    onBeforeUnmount(() => unsubscribe?.());
    function acceptCandidate() {
      try {
        const previous = accepted.value;
        const state = props.state;
        if (state && props.initialState !== undefined)
          throw new Error('state and initialState cannot be supplied together');
        if (state && props.catalog !== undefined && props.catalog !== state.catalog)
          throw new Error('catalog must match state.catalog');
        if (state && previous && previous.state === state && props.resetKey !== previous.resetKey)
          throw new Error('Replace state to start a new session; resetKey cannot reset the same state handle');
        const catalog = props.catalog ?? state?.catalog ?? defaultCatalog;
        const spec = validateUI(props.spec, { catalog });
        const available = { ...defaultRegistry, ...props.registry };
        for (const element of Object.values(spec.elements)) {
          if (!available[element.type]) throw new Error(`No Vue implementation registered for component: ${element.type}`);
          for (const binding of [...Object.values(element.on ?? {}), ...Object.values(element.watch ?? {})].flat()) {
            if (!Object.hasOwn(baseActions, binding.action) && typeof props.actions?.[binding.action] !== 'function')
              throw new Error(`No handler registered for action: ${binding.action}`);
          }
        }
        const newSession = !previous || previous.state !== state || (!state && (
          previous.resetKey !== props.resetKey || previous.catalog !== catalog
        ));
        // Only construct/subscribe a store after the entire candidate passes.
        // New documents seed a session once; subsequent spec.state is metadata.
        const store = state?.store ?? (newSession
          ? createUIStore(previous && previous.catalog !== catalog && previous.resetKey === props.resetKey && !previous.state
            ? previous.store.getSnapshot() : props.initialState ?? spec.state ?? {}, { catalog })
          : previous!.store);
        const next: AcceptedUI = {
          spec, catalog, registry: available, actions: { ...props.actions }, functions: props.functions,
          store, state, resetKey: props.resetKey,
        };
        if (newSession) {
          unsubscribe?.();
          sessionRevision.value++;
          unsubscribe = store.subscribe(() => {
            storeRevision.value++;
            props.onStateChange?.(cloneJSON(store.getSnapshot()));
          });
        }
        accepted.value = next;
        candidateError.value = undefined;
        runtimeError.value = undefined;
        actionError.value = undefined;
        acceptedRevision.value++;
      }
      catch (caught) { candidateError.value = asError(caught); }
    }
    // Vue batches a host's simultaneous prop changes before validating them.
    watch([
      () => props.spec, () => props.catalog, () => props.registry, () => props.actions,
      () => props.functions, () => props.state, () => props.initialState, () => props.resetKey,
    ], acceptCandidate, { immediate: true });
    expose({ getState: () => cloneJSON(accepted.value?.store.getSnapshot() ?? {}) });

    const handlers = computed(() => {
      // A native event can await one action before looking up its next handler.
      // Capture this provider's session when building the handler map, so later
      // actions from an old event cannot acquire a replacement store/catalog.
      const actionStore = accepted.value?.store;
      const actionCatalog = accepted.value?.catalog;
      const actionSession = sessionRevision.value;
      return Object.fromEntries(Object.entries(accepted.value?.actions ?? {}).map(([name, handler]) => [name,
        async (params: Record<string, unknown>) => {
          if (actionSession === sessionRevision.value) actionError.value = undefined;
          try {
            const parsed = validateActionParams(name, params ?? {}, { catalog: actionCatalog });
            await handler(parsed, {
              getState: () => cloneJSON(actionStore!.getSnapshot()),
              setState: (path, value) => actionStore!.set(path, value),
            });
          } catch (caught) { if (actionSession === sessionRevision.value) reportActionError(caught); throw caught; }
        },
      ]));
    });

    // Registry objects are commonly recreated by hosts. Cache by the actual
    // component so unchanged entries retain their Vue instance and local state.
    const guards = new Map<ComponentRegistry[string], ComponentRegistry[string]>();
    function guard(name: string, component: ComponentRegistry[string]) {
      const existing = guards.get(component);
      if (existing) return existing;
      const guarded = defineComponent({
        name: `NomixGuard_${name}`,
        inheritAttrs: false,
        setup(_, { attrs: entryAttrs, slots }) {
          const componentSession = sessionRevision.value;
          const localError = shallowRef<Error>();
          // Dynamic props can become valid through a store update without a
          // new Spec. Retry only failed subtrees, keeping healthy instances.
          watch([acceptedRevision, storeRevision], () => {
            if (componentSession !== sessionRevision.value) return;
            if (localError.value && runtimeError.value === localError.value) runtimeError.value = undefined;
            localError.value = undefined;
          });
          // Capture below upstream's non-resettable ElementErrorBoundary. Only
          // the failed component's subtree is replaced while siblings stay put.
          onErrorCaptured(caught => {
            localError.value = asError(caught);
            if (componentSession === sessionRevision.value) reportError(caught);
            return false;
          });
          return () => {
            if (localError.value) return h('div', { class: 'nomix-ui-component-error' }, localError.value.message);
            const emit = (event: string) => {
              if (componentSession === sessionRevision.value) actionError.value = undefined;
              const reject = (caught: unknown) => { if (componentSession === sessionRevision.value) reportActionError(caught); };
              try {
                const result = (entryAttrs.emit as (name: string) => unknown)(event);
                // Observe rejections and preserve the native result so custom
                // components can await the same action chain.
                void Promise.resolve(result).catch(reject);
                return result;
              } catch (caught) { reject(caught); throw caught; }
            };
            const on = (event: string): EventHandle => ({
              ...(entryAttrs.on as (name: string) => EventHandle)(event), emit: () => emit(event),
            });
            return h(component, { ...entryAttrs, emit, on }, slots);
          };
        },
      });
      guards.set(component, guarded);
      return guarded;
    }
    const guardedRegistry = computed<ComponentRegistry>(() => Object.fromEntries(
      Object.entries(accepted.value?.registry ?? {}).map(([name, component]) => [name, guard(name, component)]),
    ));

    return () => h('div', {
      ...attrs, ref: container, class: ['nomix-ui', attrs.class, props.theme === 'dark' && 'dark'], 'data-theme': props.theme,
    }, [
      error.value ? h('div', { role: 'alert', class: 'nomix-ui-error rounded-md border border-destructive/50 bg-background p-4 text-sm text-destructive' }, error.value.message) : null,
      accepted.value ? h(JSONUIProvider, {
          key: sessionRevision.value, store: accepted.value.store, registry: guardedRegistry.value, handlers: handlers.value,
          functions: accepted.value.functions,
        }, { default: () => h(Renderer, {
          spec: accepted.value!.spec, registry: guardedRegistry.value,
        }) }) : null,
    ]);
  },
});
