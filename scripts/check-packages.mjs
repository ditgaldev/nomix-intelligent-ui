import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = path.join(root, '.artifacts', 'packages');
mkdirSync(artifacts, { recursive: true });
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
}
const tarballs = {};
for (const name of ['core', 'theme', 'react', 'vue']) {
  const output = run(process.execPath, [npm, 'pack', '--workspace', `@nomix/intelligent-ui-${name}`, '--pack-destination', artifacts, '--json'], root);
  tarballs[name] = path.join(artifacts, JSON.parse(output)[0].filename);
}

// Intentionally outside the workspace: parent node_modules and aliases must not
// make missing package dependencies/exports appear to work.
const consumers = mkdtempSync(path.join(tmpdir(), 'nomix-ui-consumers-'));
const results = [];
for (const framework of ['node', 'react', 'vue']) {
  const cwd = path.join(consumers, framework);
  mkdirSync(cwd);
  const dependencies = { '@nomix/intelligent-ui-core': `file:${tarballs.core}` };
  if (framework !== 'node') {
    dependencies[`@nomix/intelligent-ui-${framework}`] = `file:${tarballs[framework]}`;
    dependencies['@nomix/intelligent-ui-theme'] = `file:${tarballs.theme}`;
  }
  if (framework === 'react') Object.assign(dependencies, { react: '19.2.3', 'react-dom': '19.2.3', '@types/react': '19.2.14', '@types/react-dom': '19.2.3' });
  if (framework === 'vue') Object.assign(dependencies, { vue: '3.5.44', '@vue/server-renderer': '3.5.44' });
  if (framework === 'node') dependencies['@types/node'] = '22.19.11';
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: `nomix-${framework}-consumer`, private: true, type: 'module', dependencies }, null, 2));
  run(process.execPath, [npm, 'install', '--no-audit', '--no-fund'], cwd);
  const lock = JSON.parse(readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'));
  const has = name => Object.keys(lock.packages).some(key => key.endsWith(`node_modules/${name}`));
  if (framework !== 'react' && has('react')) throw new Error(`${framework} consumer unexpectedly installs React`);
  if (framework !== 'vue' && has('vue')) throw new Error(`${framework} consumer unexpectedly installs Vue`);
  if (framework === 'node' && has('chart.js')) throw new Error('Core-only consumer unexpectedly installs Chart.js');
  const spec = `{ root: 'title', elements: { title: { type: 'Heading', props: { text: 'Packed SDK works', level: 'h2' }, children: [] } } }`;
  // The exact same display fixture and externally owned state run in all three
  // real consumers, without a workspace alias or a framework dependency in Node.
  const common = `import { validateUI, catalog, createUICatalog, createUIState, displayComponents, createUIDocument, parseUIDocument, serializeUIDocument } from '@nomix/intelligent-ui-core';
const spec = validateUI(${spec});
const restored = parseUIDocument(serializeUIDocument(createUIDocument(spec)));
if (restored.spec.root !== 'title' || !catalog.prompt().includes('Heading')) throw new Error('Core package smoke failed');
const displayCatalog = createUICatalog({ components: displayComponents, allowedStatePaths: ['/ui'] });
const displaySpec = validateUI({ root: 'display', elements: {
  display: { type: 'Stack', props: { direction: 'vertical', gap: 'md', align: 'stretch', justify: null, className: null }, children: ['title', 'table', 'metrics'] },
  title: ${spec}.elements.title,
  table: { type: 'DataTable', props: { title: 'Packed display table', columns: [{ key: 'value', label: 'Value', align: 'right' }], rows: { $state: '/data/rows' } }, children: [] },
  metrics: { type: 'MetricGroup', props: { title: 'Packed metric group', items: { $state: '/data/metrics' } }, children: [] },
}}, { catalog: displayCatalog });
const displayState = createUIState({ catalog: displayCatalog, initialState: { ui: { note: 'initial' }, data: { rows: [], metrics: [] } } });
displayState.store.set('/ui/note', 'retained choice');
const accepted = displayState.updateHost({ '/data': {
  rows: [{ id: 'zero', cells: { value: 0 } }, { id: 'missing', cells: { value: null } }],
  metrics: [{ id: 'zero', label: 'Zero metric', value: 0 }, { id: 'missing', label: 'Missing metric', value: null }],
}}, { sessionId: displayState.sessionId, version: 1 });
if (!accepted || displayState.store.get('/ui/note') !== 'retained choice') throw new Error('Packed host state update lost local input');
if (displayState.updateHost({ '/data/rows': [] }, { sessionId: displayState.sessionId, version: 1 })) throw new Error('Packed state accepted an obsolete update');
if (displayState.updateHost({ '/data/rows': [] }, { sessionId: 'another-session', version: 2 })) throw new Error('Packed state accepted another session');
if (!displayCatalog.prompt().includes('DataTable') || !displayCatalog.prompt().includes('MetricGroup')) throw new Error('Packed display catalog is unavailable');
`;
  let smoke = common;
  let consumer = common;
  if (framework === 'react') {
    smoke += `import React from 'react'; import { renderToString } from 'react-dom/server'; import * as adapter from '@nomix/intelligent-ui-react'; import { displayRegistry } from '@nomix/intelligent-ui-react/display';
const { IntelligentUI } = adapter;
if ('displayRegistry' in adapter) throw new Error('Optional React display registry leaked into the base entry');
if (!renderToString(React.createElement(IntelligentUI, { spec })).includes('Packed SDK works')) throw new Error('React SSR smoke failed');
const displayHTML = renderToString(React.createElement(IntelligentUI, { spec: displaySpec, catalog: displayCatalog, state: displayState, registry: displayRegistry }));
if (!displayHTML.includes('data-display="DataTable"') || !displayHTML.includes('data-display="MetricGroup"') || !displayHTML.includes('>0<') || !displayHTML.includes('—')) throw new Error('React packed display/state SSR failed');
`;
    consumer += `import React from 'react'; import { createRoot } from 'react-dom/client'; import { IntelligentUI } from '@nomix/intelligent-ui-react'; import { displayRegistry } from '@nomix/intelligent-ui-react/display'; import '@nomix/intelligent-ui-theme/styles.css';
createRoot(document.getElementById('app')!).render(<IntelligentUI spec={displaySpec} catalog={displayCatalog} state={displayState} registry={displayRegistry} />);
`;
  }
  if (framework === 'vue') {
    smoke += `import { createSSRApp, h } from 'vue'; import { renderToString } from '@vue/server-renderer'; import * as adapter from '@nomix/intelligent-ui-vue'; import { displayRegistry } from '@nomix/intelligent-ui-vue/display';
const { IntelligentUI } = adapter;
if ('displayRegistry' in adapter) throw new Error('Optional Vue display registry leaked into the base entry');
if (!(await renderToString(createSSRApp({render:()=>h(IntelligentUI,{spec})}))).includes('Packed SDK works')) throw new Error('Vue SSR smoke failed');
const displayHTML = await renderToString(createSSRApp({render:()=>h(IntelligentUI,{spec: displaySpec, catalog: displayCatalog, state: displayState, registry: displayRegistry})}));
if (!displayHTML.includes('data-display="DataTable"') || !displayHTML.includes('data-display="MetricGroup"') || !displayHTML.includes('>0<') || !displayHTML.includes('—')) throw new Error('Vue packed display/state SSR failed');
`;
    consumer += `import { createApp, h } from 'vue'; import { IntelligentUI } from '@nomix/intelligent-ui-vue'; import { displayRegistry } from '@nomix/intelligent-ui-vue/display'; import '@nomix/intelligent-ui-theme/styles.css';
createApp({render:()=>h(IntelligentUI,{spec: displaySpec, catalog: displayCatalog, state: displayState, registry: displayRegistry})}).mount('#app');
`;
  }
  writeFileSync(path.join(cwd, 'smoke.mjs'), smoke);
  run(process.execPath, ['smoke.mjs'], cwd);
  const main = framework === 'react' ? 'main.tsx' : 'main.ts';
  writeFileSync(path.join(cwd, main), consumer);
  writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, jsx: 'react-jsx', skipLibCheck: false, lib: framework === 'node' ? ['ES2022'] : ['ES2022','DOM'], types: framework === 'node' ? ['node'] : [] }, include: [main] }, null, 2));
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'], cwd);
  let baseDependencyGraph;
  if (framework !== 'node') {
    writeFileSync(path.join(cwd, 'index.html'), `<div id="app"></div><script type="module" src="/${main}"></script>`);
    run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], cwd);
    const css = readFileSync(path.join(cwd, 'node_modules/@nomix/intelligent-ui-theme/dist/styles.css'), 'utf8');
    if (!css.includes('.nomix-ui') || !css.includes('--primary')) throw new Error('Compiled theme export missing');
    // Pin every base export in a second real consumer build. The emitted module
    // graph proves that the adapter's packed base dist does not pull in Chart.js.
    writeFileSync(path.join(cwd, 'base.ts'), `import * as adapter from '@nomix/intelligent-ui-${framework}';\n(globalThis as Record<string, unknown>).__nomixBaseAdapter = adapter;\n`);
    writeFileSync(path.join(cwd, 'base.html'), '<div id="base"></div><script type="module" src="/base.ts"></script>');
    writeFileSync(path.join(cwd, 'base-vite.config.mjs'), `export default { build: { outDir: 'dist-base', minify: false, rollupOptions: { input: ${JSON.stringify(path.join(cwd, 'base.html'))} } }, plugins: [{ name: 'verify-base-dependency-graph', generateBundle(_options, bundle) {
  const modules = [...new Set(Object.values(bundle).flatMap(item => item.type === 'chunk' ? Object.keys(item.modules) : []))].map(id => id.replaceAll('\\\\', '/'));
  if (modules.some(id => /\\/(?:chart\\.js|@kurkle\\/color)\\//.test(id))) throw new Error('Base adapter includes the optional chart engine');
  if (Object.values(bundle).some(item => item.type === 'chunk' && /Chart\\.js v\\d|class (?:Chart|LineController)\\b|function _detectPlatform\\b/.test(item.code))) throw new Error('Base adapter contains an inlined Chart.js engine');
  this.emitFile({ type: 'asset', fileName: 'base-dependency-graph.json', source: JSON.stringify({ modules }, null, 2) });
} }] };\n`);
    run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'base-vite.config.mjs'], cwd);
    baseDependencyGraph = path.join(cwd, 'dist-base', 'base-dependency-graph.json');
    const graph = JSON.parse(readFileSync(baseDependencyGraph, 'utf8'));
    if (!graph.modules.some(id => id.includes(`/@nomix/intelligent-ui-${framework}/dist/`))) throw new Error('Base dependency evidence does not contain the packed adapter');
  }
  results.push({ framework, passed: true, typecheck: true, runtimeSmoke: true, hostStateUpdate: true, displayCatalog: true, displaySSR: framework !== 'node', frontendBuild: framework !== 'node', baseAdapterChartFree: framework !== 'node' ? true : undefined, baseDependencyGraph, reactInstalled: has('react'), vueInstalled: has('vue'), chartInstalled: has('chart.js') });
  console.log(`${framework}: packed import, strict types, runtime and dependency isolation passed`);
}
const report = { consumers, tarballs, results };
writeFileSync(path.join(artifacts, 'consumer-report.json'), JSON.stringify(report, null, 2));
console.log(`Consumer evidence: ${path.join(artifacts, 'consumer-report.json')}`);
