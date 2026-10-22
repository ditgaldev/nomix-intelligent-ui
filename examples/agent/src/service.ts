import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createUIDocument, validateUI, UIValidationError } from '@nomix/intelligent-ui-core';
import { ZodError } from 'zod';
import { createDemoSpec, demoCatalog, getDemoSales, specToPatches, uiRequestSchema, type DemoMode } from '../../shared/demo';

export interface DemoServiceOptions {
  /** Inject the host's Agent/tool/model call. Return a candidate Spec, not HTML.
   * Agent tools may propose a candidate; validateUI below is the trust boundary.
   * The host still owns authorization, real data, persistence and action handlers.
   */
  generateCandidate?: (request: { mode: DemoMode }) => Promise<unknown> | unknown;
  streamDelayMs?: number;
}

async function readJSON(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new RangeError('请求正文不能超过 64 KB');
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SyntaxError('请求正文必须是 JSON'); }
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(data));
}

/** A plain Node HTTP service. Default generation uses deterministic demo fixtures. */
export function createDemoService(options: DemoServiceOptions = {}) {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (request.method === 'GET' && path === '/api/health') {
        json(response, 200, { status: 'ok', source: options.generateCandidate ? 'host' : 'demo', modelVerified: false });
        return;
      }
      if (request.method === 'POST' && path === '/api/sales') {
        json(response, 200, getDemoSales(await readJSON(request)));
        return;
      }
      if (request.method === 'POST' && (path === '/api/ui' || path === '/api/ui/stream')) {
        const input = uiRequestSchema.parse(await readJSON(request));
        const candidate = options.generateCandidate ? await options.generateCandidate(input) : createDemoSpec(input.mode);
        const spec = validateUI(candidate, { catalog: demoCatalog });
        if (path === '/api/ui') {
          json(response, 200, { source: options.generateCandidate ? 'host' : 'demo', document: createUIDocument(spec, { catalog: demoCatalog }) });
          return;
        }
        response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        response.flushHeaders();
        for (const patch of specToPatches(spec)) {
          if (response.destroyed) break;
          response.write(`${JSON.stringify(patch)}\n`);
          await delay(options.streamDelayMs ?? 35);
        }
        response.end();
        return;
      }
      json(response, 404, { error: '接口不存在' });
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const invalid = error instanceof ZodError || error instanceof SyntaxError || error instanceof RangeError;
      const status = invalid ? 400 : error instanceof UIValidationError ? 422 : 500;
      json(response, status, { error: status === 500 ? '生成服务暂时不可用，请稍后重试' : error instanceof Error ? error.message : '请求失败' });
    }
  });
}
