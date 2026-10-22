import { createUICatalog, displayComponents, validateUI, type Spec } from '@nomix/intelligent-ui-core';

/** Presentation-only fixtures shared by the two framework demos. */
export const updatesCatalog = createUICatalog({ components: displayComponents, allowedStatePaths: ['/note'] });
export function sampleData(revision = 0) {
  return {
    labels: ['A', 'B', 'C', 'D', 'E', 'F'],
    series: [
      { id: 'primary', label: '序列一', values: [12, 18, null, 25, 20, 30 + revision] },
      { id: 'secondary', label: '序列二', values: [8, 11, 16, 14, 19, 22 + revision] },
    ],
    rows: [
      { id: 'sample-a', cells: { name: '样本 A', value: 30 + revision, present: true } },
      { id: 'sample-b', cells: { name: '样本 B', value: 0, present: false } },
      { id: 'sample-c', cells: { name: '样本 C', value: null, present: false } },
    ],
    metrics: [
      { id: 'current', label: '当前数值', value: 30 + revision, unit: '点' },
      { id: 'zero', label: '零值', value: 0, unit: '点' },
      { id: 'missing', label: '缺失值', value: null, description: '空值显示为破折号' },
    ],
  };
}
export function createUpdatesSpec(appended = false): Spec {
  return validateUI({ root: 'root', elements: {
    root: { type: 'Stack', props: { direction: 'vertical', gap: 'lg', align: 'stretch', justify: 'start', className: null },
      children: ['metrics', 'chart', 'note', 'table', 'timeline', 'steps', ...(appended ? ['appended'] : [])] },
    metrics: { type: 'MetricGroup', props: { title: '同一份数据，持续更新', items: { $state: '/data/metrics' } }, children: [] },
    chart: { type: 'LineChart', props: { title: '样本趋势', description: '分类轴按标签等距排列；缺失值保留断点。',
      labels: { $state: '/data/labels' }, series: { $state: '/data/series' }, height: 220, xLabel: '样本标签', yLabel: '数值' }, children: [] },
    note: { type: 'Input', props: { label: '本地备注', name: 'note', type: 'text', placeholder: '更新数据时，已输入的文字会保留…', value: { $bindState: '/note' }, checks: null, validateOn: null }, children: [] },
    table: { type: 'DataTable', props: { title: '原始数值', caption: '零值、布尔值与缺失值按原样展示',
      columns: [{ key: 'name', label: '样本' }, { key: 'value', label: '数值', align: 'right' }, { key: 'present', label: '已提供' }], rows: { $state: '/data/rows' } }, children: [] },
    timeline: { type: 'Timeline', props: { title: '时间线', items: [
      { id: 'first', time: '09:00', title: '第一条记录', description: '时间是宿主提供的文字标签。' },
      { id: 'second', time: '09:15', title: '第二条记录', description: '保持传入顺序，不做排序或推断。' },
    ] }, children: [] },
    steps: { type: 'Steps', props: { title: '操作说明', items: [
      { id: 'one', title: '输入一段备注', description: 'React 与 Vue 的输入互不影响。' },
      { id: 'two', title: '更新数据或追加内容', description: '观察输入值与图表数据展开状态是否保留。' },
      { id: 'three', title: '尝试无效更新，再恢复', description: '上一份有效界面继续可用。' },
    ] }, children: [] },
    ...(appended ? { appended: { type: 'Text', props: { text: '这段内容是后续追加的，之前的组件仍保留。', variant: 'muted' }, children: [] } } : {}),
  } }, { catalog: updatesCatalog });
}
