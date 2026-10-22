import { describe, expect, it, vi } from 'vitest';
import { createUICatalog } from '../../packages/core/src/catalog';
import { createUIState } from '../../packages/core/src/store';
import { UIValidationError } from '../../packages/core/src/validation';

const setup = () => createUIState({ catalog: createUICatalog({ allowedStatePaths: ['/form'] }),
  initialState: { form: { name: 'A' }, rows: ['a'], total: 1 } });

describe('host-owned external state', () => {
  it('keeps UI writes scoped while host batches notify once and preserve user state', () => {
    const state = setup(), changed = vi.fn();
    state.store.subscribe(changed);
    state.store.set('/form/name', 'edited');
    expect(() => state.store.set('/total', 2)).toThrow(UIValidationError);
    changed.mockClear();
    expect(state.updateHost({ '/total': 2, '/rows/-': 'b' }, { sessionId: state.sessionId, version: 0 })).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(state.store.getSnapshot()).toEqual({ form: { name: 'edited' }, rows: ['a', 'b'], total: 2 });
  });
  it('rejects stale and foreign updates without advancing the host version on validation failure', () => {
    const state = setup(), meta = { sessionId: state.sessionId, version: 3 };
    expect(state.updateHost({ '/total': 3 }, meta)).toBe(true);
    for (const version of [0, 2, 3]) expect(state.updateHost({ '/total': 9 }, { ...meta, version })).toBe(false);
    expect(state.updateHost({ '/total': 9 }, { sessionId: 'foreign', version: 99 })).toBe(false);
    expect(() => state.updateHost({ '/total': 4, '/rows/3': 'bad' }, { ...meta, version: 4 })).toThrow(UIValidationError);
    expect(state.store.get('/total')).toBe(3);
    expect(state.updateHost({ '/total': 4 }, { ...meta, version: 4 })).toBe(true);
  });
  it('applies all JSON and pointer guards to host writes atomically', () => {
    const state = setup(), changed = vi.fn(); state.store.subscribe(changed);
    for (const updates of [
      { '/total': 8, '/constructor/x': true }, { '/total': 8, '/rows/01': 'bad' },
      { '/total': 8, '/rows/-/x': 'bad' }, { '/total': undefined }, { '/bad~2': 1 },
      { '/total': 8, '/rows': new Array(2) }, { '/total': () => 1 },
    ]) expect(() => state.updateHost(updates, { sessionId: state.sessionId, version: 0 })).toThrow(UIValidationError);
    expect(state.store.get('/total')).toBe(1); expect(changed).not.toHaveBeenCalled();
    expect(state.updateHost({ '/total': 2 }, { sessionId: state.sessionId, version: 0 })).toBe(true);
  });
  it('requires nonnegative safe host versions independent from UI changes', () => {
    const state = setup();
    for (const version of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => state.updateHost({ '/total': 9 }, { sessionId: state.sessionId, version })).toThrow(UIValidationError);
    for (let i = 0; i < 5; i++) state.store.set('/form/name', String(i));
    expect(state.updateHost({ '/total': 2 }, { sessionId: state.sessionId, version: 0 })).toBe(true);
  });
  it('isolates new handles from old async closures and retains catalog identity', async () => {
    const old = setup(), next = setup(); const updateOld = old.updateHost;
    expect(old.sessionId).not.toBe(next.sessionId); expect(Object.isFrozen(old)).toBe(true);
    await Promise.resolve();
    old.store.set('/form/name', 'late'); updateOld({ '/total': 8 }, { sessionId: old.sessionId, version: 1 });
    expect(next.store.get('/form/name')).toBe('A'); expect(next.store.get('/total')).toBe(1);
    const catalog = createUICatalog(); expect(createUIState({ catalog }).catalog).toBe(catalog);
  });
  it('retains the newest host version when subscribers synchronously update again', () => {
    const state = setup();
    state.store.subscribe(() => {
      if (state.store.get('/total') === 2)
        state.updateHost({ '/total': 3 }, { sessionId: state.sessionId, version: 2 });
    });
    state.updateHost({ '/total': 2 }, { sessionId: state.sessionId, version: 1 });
    expect(state.store.get('/total')).toBe(3);
    expect(state.updateHost({ '/total': 4 }, { sessionId: state.sessionId, version: 2 })).toBe(false);
  });
});
