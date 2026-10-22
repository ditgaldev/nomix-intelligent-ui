// @vitest-environment node
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecStreamCompiler } from '@json-render/core';
import { parseUIDocument, validateUI, type Spec } from '@nomix/intelligent-ui-core';
import { IntelligentUI as ReactIntelligentUI } from '@nomix/intelligent-ui-react';
import { IntelligentUI as VueIntelligentUI } from '@nomix/intelligent-ui-vue';
import { createDemoService, type DemoServiceOptions } from '../../examples/agent/src/service';
import { createDemoSpec, demoCatalog, getDemoSales, type DemoMode } from '../../examples/shared/demo';
import { reactRegistry, vueRegistry } from '../../examples/playground/src/registries';

const modes: DemoMode[] = ['free', 'fixed', 'slotted'];
const servers: ReturnType<typeof createDemoService>[] = [];

async function startService(options: DemoServiceOptions = {}) {
  const server = createDemoService({ streamDelayMs: 0, ...options });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  return (path: string, input: unknown) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

describe('demo HTTP integration contract', () => {
  it.each(modes)('returns a validated document for %s mode', async mode => {
    const post = await startService();
    const response = await post('/api/ui', { mode });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.source).toBe('demo');
    const document = parseUIDocument(JSON.stringify(body.document), { catalog: demoCatalog });
    expect(validateUI(document.spec, { catalog: demoCatalog })).toEqual(createDemoSpec(mode));
    expect(document.state).toEqual(document.spec.state);
    expect((document.state.sales as { source: string }).source).toBe('demo');
  });

  it.each(modes)('compiles native JSONL patches into the same %s Spec', async mode => {
    const post = await startService();
    const response = await post('/api/ui/stream', { mode });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const stream = await response.text();
    const lines = stream.trim().split('\n');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(JSON.parse(line)).toEqual({
      op: 'add', path: expect.stringMatching(/^\//), value: expect.anything(),
    });

    const compiler = createSpecStreamCompiler<Spec>();
    // Transport chunks can split a patch and a text token arbitrarily.
    for (let offset = 0; offset < stream.length; offset += 17) compiler.push(stream.slice(offset, offset + 17));
    const compiled = validateUI(compiler.getResult(), { catalog: demoCatalog });
    expect(compiler.getPatches()).toHaveLength(lines.length);
    const regular = await (await post('/api/ui', { mode })).json();
    expect(compiled).toEqual(regular.document.spec);
  });

  it('validates the requested sales month and returns simulated data', async () => {
    const post = await startService();
    const valid = await post('/api/sales', { month: '2026-09' });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual(getDemoSales({ month: '2026-09' }));
    for (const input of [{ month: '2026-01' }, { month: 10 }, {}, { month: '2026-10', extra: true }]) {
      const invalid = await post('/api/sales', input);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: expect.any(String) });
    }
  });

  it('rejects an unsupported mode before calling the host generator', async () => {
    const generateCandidate = vi.fn(() => createDemoSpec('free'));
    const post = await startService({ generateCandidate });
    const response = await post('/api/ui', { mode: 'unknown' });
    expect(response.status).toBe(400);
    expect(generateCandidate).not.toHaveBeenCalled();
  });

  it.each([null, { root: 'missing', elements: {} }])('rejects an invalid host candidate (%j) with 422', async candidate => {
    const post = await startService({ generateCandidate: () => candidate });
    for (const path of ['/api/ui', '/api/ui/stream']) {
      const response = await post(path, { mode: 'fixed' });
      expect(response.status).toBe(422);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: expect.any(String) });
    }
  });

  it('reports a host failure as 500 without exposing provider error details', async () => {
    const post = await startService({ generateCandidate: async () => { throw new Error('private provider failure'); } });
    const response = await post('/api/ui', { mode: 'free' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: '生成服务暂时不可用，请稍后重试' });
  });

  it('accepts an injected asynchronous host generator and identifies its source', async () => {
    const candidate = createDemoSpec('fixed');
    candidate.state!.note = '宿主生成的候选界面';
    const generateCandidate = vi.fn(async () => candidate);
    const post = await startService({ generateCandidate });
    const response = await post('/api/ui', { mode: 'fixed' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe('host');
    expect(parseUIDocument(JSON.stringify(body.document), { catalog: demoCatalog }).spec).toEqual(candidate);
    expect(generateCandidate).toHaveBeenCalledExactlyOnceWith({ mode: 'fixed' });
  });
});

describe('shared demo fixtures across adapters', () => {
  it.each(modes)('renders the same %s Spec through React and Vue with demoCatalog', async mode => {
    const spec = createDemoSpec(mode);
    const onError = vi.fn();
    const actions = { refreshSales: vi.fn() };
    const reactMarkup = renderToStaticMarkup(createElement(ReactIntelligentUI, {
      spec, catalog: demoCatalog, registry: reactRegistry, actions, onError,
    }));
    const vueMarkup = await renderToString(createSSRApp({
      setup: () => () => h(VueIntelligentUI, { spec, catalog: demoCatalog, registry: vueRegistry, actions, onError }),
    }));
    for (const markup of [reactMarkup, vueMarkup]) {
      for (const text of ['销售总额', '128,600', '线上商城', '报告备注', '刷新销售数据']) expect(markup).toContain(text);
      expect(markup).not.toContain('role="alert"');
      if (mode === 'slotted') expect(markup).toContain('月度经营报告');
    }
    expect(onError).not.toHaveBeenCalled();
    expect(actions.refreshSales).not.toHaveBeenCalled();
  });
});
