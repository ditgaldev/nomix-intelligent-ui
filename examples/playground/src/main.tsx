import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntelligentUI } from '@nomix/intelligent-ui-react';
import {
  cloneJSON, createSpecStreamCompiler, createUIDocument, parseUIDocument, serializeUIDocument, validateUI,
  type UIDocument, type UIActionHandlers,
} from '@nomix/intelligent-ui-core';
import '@nomix/intelligent-ui-theme/styles.css';
import { createDemoSpec, demoCatalog, salesSchema, type DemoMode } from '../../shared/demo';
import { reactRegistry, vueRegistry } from './registries';
import { VueBridge } from './VueBridge';
import { UpdatesDemo } from './updates-demo';
import './styles.css';

const modes: { id: DemoMode; title: string; description: string; number: string }[] = [
  { id: 'free', title: '自由组合', description: '基础组件组合完整月报', number: '01' },
  { id: 'fixed', title: '固定组件', description: '宿主定义销售摘要', number: '02' },
  { id: 'slotted', title: '插槽组合', description: '受约束布局嵌套固定组件', number: '03' },
];
const initial = createUIDocument(createDemoSpec('slotted'), { catalog: demoCatalog });
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: '服务返回异常' }));
    throw new Error(failure.error ?? `请求失败 (${response.status})`);
  }
  return response;
}

function Instance({ framework, document, theme, revision }: { framework: 'React' | 'Vue'; document: UIDocument; theme: 'light' | 'dark'; revision: number }) {
  const [session, setSession] = useState<{ document: UIDocument; reset: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const snapshot = useRef<Record<string, unknown>>(cloneJSON(document.state));
  const identity = `${revision}:${session?.reset ?? 0}`;
  const active = session?.document ?? document;
  const previous = useRef(identity);
  if (previous.current !== identity) {
    previous.current = identity;
    snapshot.current = cloneJSON(active.state);
  }
  const runtime = useMemo(() => {
    let requestId = 0;
    let disposed = false;
    // This closure belongs to this mounted/reset session; stores stay independent.
    const actions: UIActionHandlers = {
      refreshSales: async (params, context) => {
        const id = ++requestId;
        context.setState('/request/loading', true);
        context.setState('/request/message', '正在获取模拟销售数据…');
        setError('');
        try {
          const response = await post('/api/sales', params);
          const sales = salesSchema.parse(await response.json());
          if (id !== requestId || disposed) return;
          context.setState('/sales', sales);
          context.setState('/request/message', `${sales.period} · 演示数据已刷新`);
        } catch (caught) {
          if (id !== requestId || disposed) return;
          const message = `刷新失败：${messageOf(caught)}`;
          context.setState('/request/message', message);
          setError(message);
        } finally { if (id === requestId && !disposed) context.setState('/request/loading', false); }
      },
    };
    return { actions, dispose: () => { disposed = true; } };
  }, [identity]);
  useEffect(() => () => runtime.dispose(), [runtime]);
  const onStateChange = useCallback((value: Record<string, unknown>) => {
    snapshot.current = cloneJSON(value);
    setRequestBusy(Boolean((value.request as { loading?: boolean } | undefined)?.loading));
  }, []);
  const onError = useCallback((value: Error) => { setError(value.message); }, []);
  function save() {
    try {
      localStorage.setItem(`nomix-demo:${framework}`, serializeUIDocument(createUIDocument(active.spec, { catalog: demoCatalog, state: snapshot.current })));
      setNotice('已保存当前界面与状态');
    } catch (caught) { setNotice(`保存失败：${messageOf(caught)}`); }
  }
  function restore() {
    try {
      const saved = localStorage.getItem(`nomix-demo:${framework}`);
      if (!saved) { setNotice('还没有保存的界面'); return; }
      const restored = parseUIDocument(saved, { catalog: demoCatalog });
      // Requests are transient host work and cannot resume from localStorage.
      restored.state.request = { loading: false, message: '已恢复保存的数据，可手动刷新' };
      setSession({ document: restored, reset: (session?.reset ?? 0) + 1 });
      setNotice('已恢复保存的界面与状态'); setError('');
    } catch (caught) { setNotice(`恢复失败：${messageOf(caught)}`); }
  }
  const props = { spec: active.spec, initialState: active.state, catalog: demoCatalog, actions: runtime.actions, theme, resetKey: identity, onStateChange, onError };
  return <article className="instance" data-framework={framework}>
    <div className="instance-heading"><div><span className={`framework-dot ${framework.toLowerCase()}`} /><h2>{framework}</h2><span className="instance-caption">独立实例</span></div><div className="instance-tools"><button disabled={requestBusy} onClick={save} aria-label={`保存 ${framework}`}>保存</button><button disabled={requestBusy} onClick={restore} aria-label={`恢复 ${framework}`}>恢复</button></div></div>
    {notice && <p className="instance-notice" role="status">{notice}</p>}
    {error && <p className="instance-error" role="alert">{error}</p>}
    <div className="instance-canvas">{framework === 'React' ? <IntelligentUI {...props} registry={reactRegistry} /> : <VueBridge {...props} registry={vueRegistry} />}</div>
  </article>;
}

function App() {
  const [mode, setMode] = useState<DemoMode>('slotted');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [document, setDocument] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('演示界面已就绪');
  const [error, setError] = useState('');
  const [patches, setPatches] = useState(0);
  const [showSpec, setShowSpec] = useState(false);
  async function generate(nextMode: DemoMode, streaming = false) {
    setBusy(true); setError(''); setPatches(0);
    setStatus(streaming ? '正在接收界面…' : '正在加载演示界面…');
    try {
      let next: UIDocument;
      if (streaming) {
        const response = await post('/api/ui/stream', { mode: nextMode });
        if (!response.body) throw new Error('当前浏览器不支持流式响应');
        const compiler = createSpecStreamCompiler();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            compiler.push(decoder.decode(chunk.value, { stream: true }));
            setPatches(compiler.getPatches().length);
          }
          compiler.push(decoder.decode());
        } finally { reader.releaseLock(); }
        // Partial candidates never mount; host actions activate only after validation.
        next = createUIDocument(validateUI(compiler.getResult(), { catalog: demoCatalog }), { catalog: demoCatalog });
        setPatches(compiler.getPatches().length);
      } else {
        const result = await (await post('/api/ui', { mode: nextMode })).json();
        next = parseUIDocument(JSON.stringify(result.document), { catalog: demoCatalog });
      }
      setDocument(next); setMode(nextMode); setRevision(value => value + 1);
      setStatus(streaming ? '流式接收完成 · 校验通过' : '界面已更新 · 校验通过');
    } catch (caught) { setError(messageOf(caught)); setStatus('加载失败，可重试'); }
    finally { setBusy(false); }
  }
  function validateInvalid() {
    try { validateUI({ root: 'missing', elements: {} }, { catalog: demoCatalog }); }
    catch { setError('非法 Spec 已拦截：根节点不存在。当前界面继续可用。'); }
  }
  return <div className={`workbench ${theme}`} data-theme={theme}>
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">n</span>nomix<span className="brand-divider" /> <span className="brand-section">Intelligent UI</span></a><span className="version">SDK 0.1 <span>·</span> 接入工作台</span></header>
    <main>
      <section className="page-heading"><div><p className="eyebrow">BUILD ONCE. RENDER TOGETHER.</p><h1>一个界面定义，两种框架。</h1><p className="page-description">组合组件、连接数据，在 React 与 Vue 中运行同一份 Spec。</p></div><div className="demo-indicator"><span />演示数据 · 未调用模型</div></section>
      <section className="controls" aria-label="演示控制">
        <div className="mode-picker" role="group" aria-label="组合模式">{modes.map(item => <button key={item.id} disabled={busy} onClick={() => void generate(item.id)} aria-pressed={mode === item.id}><span className="mode-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}</div>
        <div className="toolbar"><div className="toolbar-status" role="status"><span className={busy ? 'status-dot loading' : 'status-dot'} />{status}{patches > 0 && <span className="patch-count">{patches} patches</span>}</div><div className="toolbar-actions"><button disabled={busy} onClick={() => void generate(mode, true)}>{busy ? '接收中…' : '流式演示'} <span aria-hidden>↗</span></button><button onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')} aria-label="切换主题">{theme === 'light' ? '☾ 深色' : '☀ 浅色'}</button><button onClick={() => setShowSpec(value => !value)} aria-expanded={showSpec}>{showSpec ? '收起 Spec' : '查看 Spec'}</button></div></div>
      </section>
      {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭错误">×</button></div>}
      <div className="comparison" aria-busy={busy}><Instance key={`react:${revision}`} framework="React" document={document} revision={revision} theme={theme} /><Instance key={`vue:${revision}`} framework="Vue" document={document} revision={revision} theme={theme} /></div>
      {showSpec && <section className="spec-panel"><div><h2>当前 Spec</h2><button onClick={validateInvalid}>测试非法 Spec 拦截</button></div><pre>{JSON.stringify(document, null, 2)}</pre></section>}
      <footer className="page-footer"><span>每个实例拥有独立状态，可分别切换月份、编辑备注、保存和恢复。</span><a href="/updates">连续更新与通用组件演示 ↗</a><span>Powered by json-render</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(location.pathname === '/updates' ? <UpdatesDemo /> : <App />);
