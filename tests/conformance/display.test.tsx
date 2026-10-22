import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, cleanup } from '@testing-library/react';
import { createApp, createSSRApp, h, nextTick, shallowRef } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUICatalog, displayComponents, validateUI, type Spec } from '@nomix/intelligent-ui-core';
import { IntelligentUI as ReactUI } from '@nomix/intelligent-ui-react';
import { IntelligentUI as VueUI } from '@nomix/intelligent-ui-vue';
import { displayRegistry as reactRegistry } from '../../packages/react/src/display';
import { displayRegistry as vueRegistry } from '../../packages/vue/src/display';

// Exercise adapter lifecycle without pretending that a DOM shim draws real canvas pixels.
const drawing = vi.hoisted(() => ({ instances: [] as { data: any; options: any; update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] }));
vi.mock('chart.js', () => ({
  Chart: class {
    static register() {}
    data: any; options: any; update = vi.fn(); destroy = vi.fn();
    constructor(_context: unknown, config: any) { this.data = config.data; this.options = config.options; drawing.instances.push(this); }
  },
  LineController: {}, LineElement: {}, PointElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {}, Legend: {},
}));
afterEach(() => { cleanup(); drawing.instances.length = 0; });

const catalog = createUICatalog({ components: displayComponents });
function fixture(): Spec {
  return { root: 'root', state: { labels: ['第一期', '第二期', '第三期'] }, elements: {
    root: { type: 'Stack', props: { direction: 'vertical', gap: 'md', align: 'stretch', justify: null, className: null }, children: ['line', 'table', 'metrics', 'timeline', 'steps'] },
    line: { type: 'LineChart', props: { title: '访问趋势', labels: { $state: '/labels' }, series: [{ id: 'visits', label: '访问量', values: [0, null, 12.5] }], xLabel: '期间', yLabel: '次数' }, children: [] },
    table: { type: 'DataTable', props: { title: '统计对照', caption: '已提供数值', columns: [{ key: 'value', label: '数值', align: 'right' }, { key: 'enabled', label: '启用' }], rows: [{ id: 'a', cells: { value: 0, enabled: false } }, { id: 'b', cells: { value: null, enabled: true } }] }, children: [] },
    metrics: { type: 'MetricGroup', props: { items: [{ id: 'zero', label: '零值', value: 0, unit: '次' }, { id: 'missing', label: '缺失', value: null }] }, children: [] },
    timeline: { type: 'Timeline', props: { title: '里程碑', items: [{ id: 'later', time: '稍后', title: '先展示', description: '保留声明顺序' }, { id: 'earlier', time: '此前', title: '后展示' }] }, children: [] },
    steps: { type: 'Steps', props: { title: '操作说明', items: [{ id: 'prepare', title: '准备 <数据>' }, { id: 'review', title: '核对', description: '逐项查看' }] }, children: [] },
  } };
}
async function renderBoth(spec: Spec) {
  const checked = validateUI(spec, { catalog });
  return [renderToStaticMarkup(<ReactUI spec={checked} catalog={catalog} registry={reactRegistry} />),
    await renderToString(createSSRApp({ render: () => h(VueUI, { spec: checked, catalog, registry: vueRegistry }) }))];
}

describe('optional presentation components', () => {
  it('requires an explicit catalog extension and leaves the default twelve unchanged', () => {
    expect(() => validateUI(fixture())).toThrow();
    expect(Object.keys(createUICatalog().data.components)).toHaveLength(12);
    expect(Object.keys(catalog.data.components)).toHaveLength(17);
  });
  it('renders the same supported Spec in React and Vue SSR, including readable chart data', async () => {
    for (const html of await renderBoth(fixture())) {
      for (const name of Object.keys(displayComponents)) expect(html).toContain(`data-display="${name}"`);
      expect(html).toContain('<canvas');
      expect(html).toContain('查看图表数据');
      expect(html).toContain('横轴按标签顺序等距排列');
      expect(html).toContain('12.5');
      expect(html).toMatch(/>0</);
      expect(html).toMatch(/>false</);
      expect(html).toContain('—');
      expect(html).toContain('准备 &lt;数据&gt;');
      expect(html.indexOf('先展示')).toBeLessThan(html.indexOf('后展示'));
      expect(html.match(/<ol\b/g)).toHaveLength(2);
      expect(html).toContain('<dl');
      expect(html).not.toContain('界面数据未通过校验');
    }
  });
  it('keeps empty collections readable in both adapters', async () => {
    const spec = fixture();
    spec.elements.line!.props = { labels: [], series: [] };
    spec.elements.table!.props = { columns: [], rows: [] };
    for (const name of ['metrics', 'timeline', 'steps']) spec.elements[name]!.props = { items: [] };
    for (const html of await renderBoth(spec)) expect(html).toContain('查看图表数据');
  });
  it('rejects duplicate IDs, mismatched series, non-finite values and undeclared cells', () => {
    const cases: [string, unknown][] = [
      ['line', { labels: ['a'], series: [{ id: 's', label: 'S', values: [] }] }],
      ['line', { labels: [], series: [{ id: 's', label: 'S', values: [] }, { id: 's', label: 'S2', values: [] }] }],
      ['line', { labels: ['a'], series: [{ id: 's', label: 'S', values: [Infinity] }] }],
      ['line', { labels: [], series: [], options: {} }],
      ['table', { columns: [{ key: 'a', label: 'A' }], rows: [{ id: 'r', cells: { other: 1 } }] }],
      ['table', { columns: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }], rows: [] }],
      ['table', { columns: [], rows: [{ id: 'r', cells: {} }, { id: 'r', cells: {} }] }],
      ['metrics', { items: [{ id: 'a', label: 'A', value: NaN }] }],
      ['timeline', { items: [{ id: 'a', time: 'now', title: 'A' }, { id: 'a', time: 'then', title: 'B' }] }],
      ['steps', { items: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] }],
    ];
    for (const [name, props] of cases) {
      const spec = fixture(); spec.elements[name]!.props = props as Record<string, unknown>;
      expect(() => validateUI(spec, { catalog })).toThrow();
    }
  });
  it.each(['React', 'Vue'])('%s updates supplied chart data and theme, and destroys its instance', async framework => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const container = document.createElement('div'); container.className = 'nomix-ui'; container.style.setProperty('--primary', '#176b52'); document.body.append(container);
    const chartElement = (values: (number | null)[]) => ({ type: 'LineChart', props: { labels: ['A', 'B', 'C'], series: [{ id: 'v', label: '值', values }] } });
    let unmount = () => {};
    try {
      let update: (values: (number | null)[]) => Promise<void>;
      if (framework === 'React') {
        const Entry = reactRegistry.LineChart;
        const view = render(<Entry element={chartElement([0, null, 3])} emit={() => {}} on={() => ({ bound: false, shouldPreventDefault: false, emit() {} })} />, { container });
        unmount = view.unmount;
        update = async values => { view.rerender(<Entry element={chartElement(values)} emit={() => {}} on={() => ({ bound: false, shouldPreventDefault: false, emit() {} })} />); };
      } else {
        const element = shallowRef(chartElement([0, null, 3]));
        const app = createApp({ render: () => h(vueRegistry.LineChart, { element: element.value }) }); app.mount(container); unmount = () => app.unmount();
        update = async values => { element.value = chartElement(values); await nextTick(); };
      }
      expect(drawing.instances).toHaveLength(1);
      const instance = drawing.instances[0]!;
      expect(instance.data.datasets[0]).toMatchObject({ data: [0, null, 3], spanGaps: false, tension: 0, borderColor: '#176b52' });
      await update([4, null, 6]);
      expect(drawing.instances).toHaveLength(1);
      expect(instance.data.datasets[0].data).toEqual([4, null, 6]);
      container.style.setProperty('--primary', '#83cfaa'); container.dataset.theme = 'dark';
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(instance.data.datasets[0].borderColor).toBe('#83cfaa');
      expect(instance.update).toHaveBeenCalledWith('none');
      unmount(); unmount = () => {};
      expect(instance.destroy).toHaveBeenCalledOnce();
    } finally { unmount(); container.remove(); }
  });
  it.each(['React', 'Vue'])('%s keeps the readable table when canvas is unavailable', async framework => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const element = { type: 'LineChart', props: { labels: ['A'], series: [{ id: 'v', label: '值', values: [0] }] } };
    const container = document.createElement('div'); document.body.append(container);
    let unmount = () => {};
    try {
      if (framework === 'React') {
        const Entry = reactRegistry.LineChart;
        unmount = render(<Entry element={element} emit={() => {}} on={() => ({ bound: false, shouldPreventDefault: false, emit() {} })} />, { container }).unmount;
      } else {
        const app = createApp({ render: () => h(vueRegistry.LineChart, { element }) }); app.mount(container); unmount = () => app.unmount(); await nextTick();
      }
      expect(container.querySelector('td')?.textContent).toBe('0');
      expect(container.textContent).toContain('查看图表数据');
      expect(drawing.instances).toHaveLength(0);
    } finally { unmount(); container.remove(); }
  });
});
