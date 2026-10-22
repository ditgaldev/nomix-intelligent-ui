import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType, type VNode } from 'vue';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import type { ComponentRegistry } from '@json-render/vue';
import { displayComponents, type DisplayProps } from '@nomix/intelligent-ui-core';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
const element = { type: Object as PropType<{ props: unknown }>, required: true as const };
const text = (value: string | number | boolean | null) => value === null ? '—' : String(value);
function frame(kind: string, props: { title?: string | null; description?: string | null }, children: VNode[]) {
  return h('section', { class: 'nomix-display', 'data-display': kind, 'aria-label': props.title ?? kind }, [
    props.title ? h('h3', { class: 'nomix-display-heading' }, props.title) : null,
    props.description ? h('p', { class: 'nomix-display-description' }, props.description) : null, ...children,
  ]);
}
function entry<K extends keyof typeof displayComponents>(name: K, render: (props: DisplayProps<K>) => VNode) {
  return defineComponent({ name: `Nomix${name}`, inheritAttrs: false, props: { element }, setup(props) {
    return () => render(displayComponents[name].props.parse(props.element.props) as DisplayProps<K>);
  } });
}

const LineChart = defineComponent({ name: 'NomixLineChart', inheritAttrs: false, props: { element }, setup(input) {
  const props = computed(() => displayComponents.LineChart.props.parse(input.element.props));
  const canvas = ref<HTMLCanvasElement>(), available = ref(false);
  let chart: Chart<'line'> | undefined, observer: MutationObserver | undefined;
  function update() {
    if (!chart || !canvas.value) return;
    const p = props.value, style = getComputedStyle(canvas.value.closest('.nomix-ui') ?? canvas.value);
    const colors = ['--primary', '--destructive', '--ring', '--secondary-foreground', '--foreground'].map(token => style.getPropertyValue(token).trim());
    const foreground = style.getPropertyValue('--foreground').trim(), border = style.getPropertyValue('--border').trim();
    chart.data = { labels: [...p.labels], datasets: p.series.map((series, index) => ({
      label: series.label, data: [...series.values], borderColor: colors[index % colors.length], backgroundColor: colors[index % colors.length],
      borderDash: index >= colors.length ? [4 + index, 3] : [], borderWidth: 2, pointRadius: 2, spanGaps: false, tension: 0,
    })) };
    chart.options.scales = {
      x: { type: 'category', ticks: { color: foreground }, grid: { color: border }, title: { display: Boolean(p.xLabel), text: p.xLabel ?? '', color: foreground } },
      y: { type: 'linear', ticks: { color: foreground }, grid: { color: border }, title: { display: Boolean(p.yLabel), text: p.yLabel ?? '', color: foreground } },
    };
    chart.options.plugins = { legend: { labels: { color: foreground } } };
    try { chart.update('none'); available.value = true; } catch { available.value = false; }
  }
  onMounted(() => {
    try {
      const context = canvas.value?.getContext('2d');
      if (!context) return;
      chart = new Chart(context, { type: 'line', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, animation: false } });
    } catch { return; } // The readable data table remains available without canvas support.
    update();
    observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(update);
    const theme = canvas.value?.closest('.nomix-ui');
    if (theme) observer?.observe(theme, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  });
  watch(props, update, { deep: true });
  onBeforeUnmount(() => { observer?.disconnect(); chart?.destroy(); chart = undefined; });
  return () => {
    const p = props.value;
    return frame('LineChart', p, [
      h('div', { class: 'nomix-display-chart', style: { height: `${p.height ?? 240}px` } }, [h('canvas', { ref: canvas, role: 'img', 'aria-label': p.title ?? '趋势图' })]),
      ...(!available.value ? [h('p', { class: 'nomix-display-description' }, '图表数据可展开查看。')] : []),
      h('details', null, [h('summary', null, '查看图表数据'), h('div', { class: 'nomix-display-scroll', tabindex: 0, role: 'region', 'aria-label': `${p.title ?? '趋势图'}数据` }, [
        h('table', { class: 'nomix-display-table' }, [h('caption', null, `${p.title ?? '趋势图'}数据；横轴按标签顺序等距排列${p.yLabel ? `；纵轴：${p.yLabel}` : ''}`),
          h('thead', null, [h('tr', null, [h('th', { scope: 'col' }, p.xLabel ?? '标签'), ...p.series.map(series => h('th', { key: series.id, scope: 'col', 'data-align': 'right' }, series.label))])]),
          h('tbody', null, p.labels.map((label, index) => h('tr', { key: index }, [h('th', { scope: 'row' }, label), ...p.series.map(series => h('td', { key: series.id, 'data-align': 'right' }, text(series.values[index]!)))]))),
        ]),
      ])]),
    ]);
  };
} });

const DataTable = entry('DataTable', p => frame('DataTable', p, [
  h('div', { class: 'nomix-display-scroll', tabindex: 0, role: 'region', 'aria-label': p.title ?? p.caption ?? '数据表' }, [
    h('table', { class: 'nomix-display-table' }, [p.caption ? h('caption', null, p.caption) : null,
      h('thead', null, [h('tr', null, p.columns.map(column => h('th', { key: column.key, scope: 'col', 'data-align': column.align ?? 'left' }, column.label)))]),
      h('tbody', null, p.rows.map(row => h('tr', { key: row.id }, p.columns.map(column => h('td', { key: column.key, 'data-align': column.align ?? 'left' }, text(row.cells[column.key]!)))))),
    ]),
  ]),
]));
const MetricGroup = entry('MetricGroup', p => frame('MetricGroup', p, [
  h('dl', { class: 'nomix-display-metrics' }, p.items.map(item => h('div', { key: item.id }, [
    h('dt', null, item.label), h('dd', null, [text(item.value), item.unit ? h('span', { class: 'nomix-display-unit' }, item.unit) : null]),
    item.description ? h('dd', { class: 'nomix-display-description' }, item.description) : null,
  ]))),
]));
const Timeline = entry('Timeline', p => frame('Timeline', p, [
  h('ol', { class: 'nomix-display-list nomix-display-timeline' }, p.items.map(item => h('li', { key: item.id }, [
    h('span', { class: 'nomix-display-time' }, item.time), h('p', { class: 'nomix-display-item-title' }, item.title),
    item.description ? h('p', { class: 'nomix-display-description' }, item.description) : null,
  ]))),
]));
const Steps = entry('Steps', p => frame('Steps', p, [
  h('ol', { class: 'nomix-display-list' }, p.items.map(item => h('li', { key: item.id }, [
    h('p', { class: 'nomix-display-item-title' }, item.title), item.description ? h('p', { class: 'nomix-display-description' }, item.description) : null,
  ]))),
]));

/** Opt in together with displayComponents in the host's catalog. */
export const displayRegistry = { LineChart, DataTable, MetricGroup, Timeline, Steps } satisfies ComponentRegistry;
