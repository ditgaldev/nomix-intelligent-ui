import { createStateStore, type StateStore } from '@json-render/core';
import { cloneJSON, UIValidationError, validateStatePath, type ValidationOptions } from './validation';

/** The official store with validation at its two mutation entry points. */
export function createUIStore(initialState: Record<string, unknown> = {}, options: ValidationOptions = {}): StateStore {
  if (!initialState || Array.isArray(initialState) || typeof initialState !== 'object')
    throw new UIValidationError([{ code: 'state_shape', path: '', message: 'State must be a JSON object' }]);
  const store = createStateStore(cloneJSON(initialState));
  function update(updates: Record<string, unknown>) {
      // Validate the whole batch before the official store commits any writes.
      Object.keys(updates).forEach(path => validateStatePath(path, options));
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
      store.update(checked);
  }
  return { ...store, update, set: (path, value) => update({ [path]: value }) };
}
