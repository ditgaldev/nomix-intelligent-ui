import {
  computed, defineComponent, h, onBeforeUnmount, onErrorCaptured, provide,
  ref, shallowRef, watch, type PropType,
} from 'vue';
import { JSONUIProvider, Renderer, type ComponentRegistry, type EventHandle, type StateStore } from '@json-render/vue';
import {
  baseActions, catalog as defaultCatalog, cloneJSON, createUIStore, validateActionParams, validateUI,
  type Spec, type UICatalog, type UIActionHandlers, type ComputedFunction,
} from '@nomix/intelligent-ui-core';
import { registry as defaultRegistry } from './components';

export interface IntelligentUIProps {
  spec: Spec;
  /** Read only when mounting or when resetKey changes. Overrides spec.state. */
  initialState?: Record<string, unknown>;
  actions?: UIActionHandlers;
  functions?: Record<string, ComputedFunction>;
  /** Native json-render Vue registry entries; supplied keys override defaults. */
  registry?: ComponentRegistry;
  catalog?: UICatalog;
  theme?: 'light' | 'dark';
  /** Change deliberately to start a new state session from initialState/spec.state. */
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
    const selectedCatalog = computed(() => props.catalog ?? defaultCatalog);
    const runtimeError = shallowRef<Error>();
    const actionError = shallowRef<Error>();
    const renderRevision = ref(0);
    const sessionRevision = ref(0);
    const validation = computed(() => {
      try {
        const spec = validateUI(props.spec, { catalog: selectedCatalog.value });
        const available = { ...defaultRegistry, ...props.registry };
        for (const element of Object.values(spec.elements)) {
          if (!available[element.type]) throw new Error(`No Vue implementation registered for component: ${element.type}`);
          for (const binding of [...Object.values(element.on ?? {}), ...Object.values(element.watch ?? {})].flat()) {
            if (!Object.hasOwn(baseActions, binding.action) && typeof props.actions?.[binding.action] !== 'function')
              throw new Error(`No handler registered for action: ${binding.action}`);
          }
        }
        return { spec, error: undefined };
      }
      catch (error) { return { spec: undefined, error: asError(error) }; }
    });
    const fatalError = computed(() => validation.value.error ?? runtimeError.value);
    const error = computed(() => fatalError.value ?? actionError.value);
    const reportError = (caught: unknown) => { runtimeError.value = asError(caught); };
    const reportActionError = (caught: unknown) => { actionError.value = asError(caught); };
    watch(error, caught => { if (caught) props.onError?.(caught); }, { immediate: true });

    // This is the official store with the core's JSON/path guards. The adapter
    // subscribes only to translate the native store event into a full snapshot.
    function newStore(seed: Record<string, unknown>): StateStore {
      try { return createUIStore(seed, { catalog: selectedCatalog.value }); }
      catch (caught) { reportError(caught); return createUIStore({}, { catalog: selectedCatalog.value }); }
    }
    function seed() { return props.initialState ?? validation.value.spec?.state ?? {}; }
    const store = shallowRef<StateStore>(newStore(seed()));
    let unsubscribe = store.value.subscribe(() => props.onStateChange?.(cloneJSON(store.value.getSnapshot())));
    function replaceStore(next: Record<string, unknown>) {
      unsubscribe();
      store.value = newStore(next);
      unsubscribe = store.value.subscribe(() => props.onStateChange?.(cloneJSON(store.value.getSnapshot())));
      sessionRevision.value++;
    }
    onBeforeUnmount(() => unsubscribe());
    watch(() => props.resetKey, () => { runtimeError.value = undefined; actionError.value = undefined; replaceStore(seed()); }, { flush: 'sync' });
    watch(() => props.catalog, () => replaceStore(store.value.getSnapshot()), { flush: 'sync' });
    watch([() => props.spec, () => props.catalog, () => props.registry], () => {
      runtimeError.value = undefined;
      actionError.value = undefined;
      // Upstream ElementErrorBoundary latches its error. Remount only the
      // renderer on a new document, preserving the independently owned store.
      renderRevision.value++;
    }, { flush: 'sync' });
    expose({ getState: () => cloneJSON(store.value.getSnapshot()) });

    const handlers = computed(() => {
      // A native event can await one action before looking up its next handler.
      // Capture this provider's session when building the handler map, so later
      // actions from an old event cannot acquire a replacement store/catalog.
      const actionStore = store.value;
      const actionCatalog = selectedCatalog.value;
      return Object.fromEntries(Object.entries(props.actions ?? {}).map(([name, handler]) => [name,
        async (params: Record<string, unknown>) => {
          if (actionStore === store.value) actionError.value = undefined;
          try {
            const parsed = validateActionParams(name, params ?? {}, { catalog: actionCatalog });
            await handler(parsed, {
              getState: () => cloneJSON(actionStore.getSnapshot()),
              setState: (path, value) => actionStore.set(path, value),
            });
          } catch (caught) { if (actionStore === store.value) reportActionError(caught); throw caught; }
        },
      ]));
    });

    const guardedRegistry = computed<ComponentRegistry>(() => Object.fromEntries(
      Object.entries({ ...defaultRegistry, ...props.registry }).map(([name, component]) => [name,
        defineComponent({
          name: `NomixGuard_${name}`,
          inheritAttrs: false,
          setup(_, { attrs: entryAttrs, slots }) {
            const componentSession = sessionRevision.value;
            // Capture below upstream's silent ElementErrorBoundary so render
            // failures can also reach the consuming application's error UI.
            onErrorCaptured(caught => { if (componentSession === sessionRevision.value) reportError(caught); return false; });
            return () => {
              // The native renderer's emitEvent returns a promise, while its
              // on().emit discards it. Catch at this adapter seam so rejected
              // host/built-in actions report an error without an unhandled
              // rejection; execution still belongs to the native runtime.
              const emit = (event: string) => {
                const eventSession = componentSession;
                if (eventSession === sessionRevision.value) actionError.value = undefined;
                const reject = (caught: unknown) => { if (eventSession === sessionRevision.value) reportActionError(caught); };
                try {
                  const result = (entryAttrs.emit as (name: string) => unknown)(event);
                  void Promise.resolve(result).catch(reject);
                } catch (caught) { reject(caught); }
              };
              const on = (event: string): EventHandle => ({
                ...(entryAttrs.on as (name: string) => EventHandle)(event), emit: () => emit(event),
              });
              return h(component, { ...entryAttrs, emit, on }, slots);
            };
          },
        }),
      ]),
    ));

    return () => h('div', {
      ...attrs, ref: container, class: ['nomix-ui', attrs.class, props.theme === 'dark' && 'dark'], 'data-theme': props.theme,
    }, [
      error.value ? h('div', { role: 'alert', class: 'nomix-ui-error rounded-md border border-destructive/50 bg-background p-4 text-sm text-destructive' }, error.value.message) : null,
      !fatalError.value && validation.value.spec ? h(JSONUIProvider, {
          key: sessionRevision.value, store: store.value, registry: guardedRegistry.value, handlers: handlers.value,
          functions: props.functions,
        }, { default: () => h(Renderer, {
          key: renderRevision.value, spec: validation.value.spec!, registry: guardedRegistry.value,
        }) }) : null,
    ]);
  },
});
