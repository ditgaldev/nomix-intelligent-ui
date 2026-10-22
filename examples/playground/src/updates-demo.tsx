import { useRef, useState } from 'react';
import { createUIState, type Spec } from '@nomix/intelligent-ui-core';
import { IntelligentUI } from '@nomix/intelligent-ui-react';
import { displayRegistry as reactDisplay } from '@nomix/intelligent-ui-react/display';
import { displayRegistry as vueDisplay } from '@nomix/intelligent-ui-vue/display';
import { createUpdatesSpec, sampleData, updatesCatalog } from '../../shared/updates';
import { VueBridge } from './VueBridge';
import './updates-demo.css';

const newState = () => createUIState({ catalog: updatesCatalog, initialState: { note: '', data: sampleData() } });
export function UpdatesDemo() {
  const [states, setStates] = useState(() => [newState(), newState()] as const);
  const [spec, setSpec] = useState<Spec>(() => createUpdatesSpec());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [status, setStatus] = useState('两个独立实例已就绪');
  const version = useRef(0);
  const previousSessions = useRef<readonly string[]>([]);
  function updateData() {
    version.current += 2;
    states.forEach(state => state.updateHost({ '/data': sampleData(version.current) }, { sessionId: state.sessionId, version: version.current }));
    setStatus(`数据版本 ${version.current} 已应用，备注继续保留`);
  }
  function lateData() {
    if (!version.current) { setStatus('先更新一次数据，再模拟旧版本'); return; }
    const ignored = states.every(state => !state.updateHost({ '/data': sampleData(-10) }, { sessionId: state.sessionId, version: version.current - 1 }));
    setStatus(ignored ? '旧版本已忽略，当前数据保持不变' : '旧版本未被忽略');
  }
  function reset() {
    previousSessions.current = states.map(state => state.sessionId);
    setStates([newState(), newState()]); version.current = 0; setSpec(createUpdatesSpec());
    setStatus('已开始新会话，输入与数据已重置');
  }
  function lateSession() {
    if (!previousSessions.current.length) { setStatus('先开始新会话，再模拟旧会话回包'); return; }
    const ignored = states.every((state, index) => !state.updateHost({ '/data': sampleData(-10) }, { sessionId: previousSessions.current[index]!, version: 999 }));
    setStatus(ignored ? '旧会话回包已忽略' : '旧会话回包未被忽略');
  }
  return <div className={`workbench updates-demo ${theme}`} data-theme={theme}>
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">n</span>nomix<span className="brand-divider" /><span className="brand-section">Intelligent UI</span></a><a className="updates-back" href="/">返回接入工作台 ↗</a></header>
    <main>
      <section className="page-heading"><div><p className="eyebrow">CONTINUOUS UPDATES</p><h1>内容在更新，操作不中断。</h1><p className="page-description">编辑备注、展开图表数据，再试试更新、追加和恢复。</p></div><div className="demo-indicator"><span />通用展示 · 模拟数据</div></section>
      <section className="controls updates-controls" aria-label="连续更新演示">
        <div className="updates-actions">
          <button onClick={updateData}>更新数据</button>
          <button onClick={() => { setSpec(createUpdatesSpec(true)); setStatus('已追加内容，原有组件保持挂载'); }}>追加内容</button>
          <button onClick={() => { const invalid = createUpdatesSpec(); invalid.elements.root.children!.push('missing'); setSpec(invalid); setStatus('无效更新已提交，保留上一份有效界面'); }}>无效更新</button>
          <button onClick={() => { setSpec(createUpdatesSpec(true)); setStatus('已恢复有效界面'); }}>恢复界面</button>
          <button onClick={lateData}>模拟旧版本</button>
          <button onClick={reset}>开始新会话</button>
          <button onClick={lateSession}>模拟旧会话回包</button>
          <button onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')} aria-label="切换主题">{theme === 'light' ? '☾ 深色' : '☀ 浅色'}</button>
        </div>
        <p className="updates-status" role="status"><span className="status-dot" />{status}</p>
      </section>
      <div className="comparison">{(['React', 'Vue'] as const).map((framework, index) => <article className="instance" data-framework={framework} key={framework}>
        <div className="instance-heading"><div><span className={`framework-dot ${framework.toLowerCase()}`} /><h2>{framework}</h2><span className="instance-caption">独立状态</span></div><span className="updates-tag">5 种展示组件</span></div>
        <div className="instance-canvas">{framework === 'React'
          ? <IntelligentUI spec={spec} state={states[index]} registry={reactDisplay} theme={theme} />
          : <VueBridge spec={spec} state={states[index]} registry={vueDisplay} theme={theme} />}</div>
      </article>)}</div>
      <footer className="page-footer"><span>图表、表格、指标、时间线与步骤仅展示宿主提供的数据。</span><span>Powered by json-render + Chart.js</span></footer>
    </main>
  </div>;
}
