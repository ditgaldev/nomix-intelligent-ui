import { createStateStore, type StateStore } from '@json-render/core';
import { cloneJSON, UIValidationError, validateStatePath, type ValidationOptions } from './validation';
import { catalog as defaultCatalog, type UICatalog } from './catalog';

/** The official store with validation at its two mutation entry points. */
export function createUIStore(initialState: Record<string, unknown> = {}, options: ValidationOptions = {}): StateStore {
  return createStores(initialState, options).store;
}

function createStores(initialState: Record<string, unknown>, options: ValidationOptions) {
  if (!initialState || Array.isArray(initialState) || typeof initialState !== 'object')
    throw new UIValidationError([{ code: 'state_shape', path: '', message: 'State must be a JSON object' }]);
  const store = createStateStore(cloneJSON(initialState));
  function prepare(updates: Record<string, unknown>, validation = options) {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates))
        throw new UIValidationError([{ code: 'state_updates', path: '', message: 'Updates must be a JSON object keyed by JSON Pointers' }]);
      // Validate the whole batch before the official store commits any writes.
      Object.keys(updates).forEach(path => validateStatePath(path, validation));
      const checked = cloneJSON(updates);
      const preview = createStateStore(store.getSnapshot());
      for (const [path, value] of Object.entries(checked)) {
        const parts = path.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
        let current: unknown = preview.getSnapshot();
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (Array.isArray(current) && !(part === '-' && i === parts.length - 1) &&
            (!/^(0|[1-9][0-9]*)$/.test(part) || Number(part) > current.length))
            throw new UIValidationError([{ code: 'array_path', path, message: 'Array writes require a contiguous nonnegative index or final -' }]);
          current = current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
        }
        preview.set(path, value);
        cloneJSON(preview.getSnapshot());
      }
      return checked;
  }
  function update(updates: Record<string, unknown>) { store.update(prepare(updates)); }
  return { store: { ...store, update, set: (path: string, value: unknown) => update({ [path]: value }) }, prepare, commit: store.update };
}

export interface UIHostUpdate { sessionId: string; version: number }
export interface UIState {
  readonly store: StateStore;
  readonly catalog: UICatalog;
  readonly sessionId: string;
  updateHost(updates: Record<string, unknown>, identity: UIHostUpdate): boolean;
}
export interface CreateUIStateOptions { initialState?: Record<string, unknown>; catalog?: UICatalog }

// Correlation identity, not an authorization token. No provider or platform API required.
const sessionPrefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let sessionSequence = 0;

/** One immutable session handle over the official store. Create another handle to reset. */
export function createUIState(options: CreateUIStateOptions = {}): UIState {
  const catalog = options.catalog ?? defaultCatalog;
  const { store, prepare, commit } = createStores(options.initialState ?? {}, { catalog });
  // Preserve native catalog getters; spreading a catalog reads type-only getters that throw.
  const hostCatalog: UICatalog = Object.create(catalog, {
    policy: { value: { ...catalog.policy, allowedStatePaths: undefined } },
  });
  const sessionId = `${sessionPrefix}-${++sessionSequence}`;
  let hostVersion = -1;
  return Object.freeze({ store, catalog, sessionId,
    updateHost(updates: Record<string, unknown>, identity: UIHostUpdate): boolean {
      if (identity.sessionId !== sessionId) return false;
      if (!Number.isSafeInteger(identity.version) || identity.version < 0)
        throw new UIValidationError([{ code: 'host_version', path: 'version', message: 'Host version must be a nonnegative safe integer' }]);
      if (identity.version <= hostVersion) return false;
      const checked = prepare(updates, { catalog: hostCatalog });
      // Commit the version before notifying subscribers, which can issue another update.
      hostVersion = identity.version;
      commit(checked);
      return true;
    },
  });
}
