import { z } from 'zod';
import { createUICatalog, validateUI, type Spec, type UIElement } from '@nomix/intelligent-ui-core';

export const modeSchema = z.enum(['free', 'fixed', 'slotted']);
export type DemoMode = z.infer<typeof modeSchema>;
export const months = ['2026-10', '2026-09', '2026-08'] as const;
export const monthSchema = z.enum(months);
export const uiRequestSchema = z.object({ mode: modeSchema }).strict();
export const salesRequestSchema = z.object({ month: monthSchema }).strict();
export const salesSchema = z.object({
  month: monthSchema, period: z.string(), amount: z.string(), change: z.string(),
  orders: z.string(), customers: z.string(), rows: z.array(z.array(z.string())),
  source: z.literal('demo'),
}).strict();
export type DemoSales = z.infer<typeof salesSchema>;

export const demoCatalog = createUICatalog({
  components: {
    SalesSummary: {
      props: z.object({ title: z.string(), amount: z.string(), change: z.string(), period: z.string() }).strict(),
      description: '固定销售摘要，由宿主实现展示与数据绑定。',
    },
    ReportPanel: {
      props: z.object({ title: z.string(), description: z.string() }).strict(),
      slots: ['header', 'default', 'footer'],
      description: '报告面板。header 为固定摘要，children 为分析正文，footer 为操作。',
    },
  },
  actions: { refreshSales: { params: salesRequestSchema, description: '请求宿主销售接口，更新当前实例。' } },
  constraints: {
    ReportPanel: { slots: {
      header: { required: true, max: 1, allowedComponents: ['SalesSummary'] },
      default: { required: true, max: 1, allowedComponents: ['Stack', 'Grid', 'Table', 'Card'] },
      footer: { required: true, max: 1, allowedComponents: ['Button'] },
    } },
  },
  allowedStatePaths: ['/month', '/sales', '/note', '/includeReturns', '/request'],
});

/** Deterministic simulated business data. No production data or model call. */
export function getDemoSales(input: unknown): DemoSales {
  const { month } = salesRequestSchema.parse(input);
  const index = months.indexOf(month);
  return salesSchema.parse({
    month, period: `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`,
    amount: ['¥ 128,600', '¥ 114,300', '¥ 108,900'][index],
    change: ['+12.5%', '+5.0%', '+8.2%'][index],
    orders: ['842', '768', '706'][index], customers: ['316', '292', '278'][index],
    rows: [
      ['线上商城', ['¥ 76,400', '¥ 68,600', '¥ 64,200'][index], '59%'],
      ['门店零售', ['¥ 38,900', '¥ 34,200', '¥ 33,800'][index], '30%'],
      ['合作渠道', ['¥ 13,300', '¥ 11,500', '¥ 10,900'][index], '11%'],
    ], source: 'demo',
  });
}

const state = (path: string) => ({ $state: path });
const bind = (path: string) => ({ $bindState: path });
const stack = (children: string[], props: Record<string, unknown> = {}): UIElement => ({ type: 'Stack', props: {
  direction: 'vertical', gap: 'lg', align: 'stretch', justify: 'start', className: null, ...props,
}, children });

/** Same fixtures are rendered by both adapters and can be used in host tests. */
export function createDemoSpec(input: DemoMode): Spec {
  const mode = modeSchema.parse(input);
  const elements: Record<string, UIElement> = {
    root: stack(['intro', 'filters', 'summary', 'metrics', 'separator', 'table', 'note', 'returns', 'status', 'refresh']),
    intro: { type: 'Badge', props: { text: '演示数据 · 销售月报', variant: 'secondary' }, children: [] },
    filters: stack(['month'], { gap: 'sm' }),
    month: { type: 'Select', props: {
      label: '统计月份', name: 'month', options: [...months], placeholder: '选择月份', value: bind('/month'), checks: null, validateOn: 'change',
    }, children: [], on: { change: { action: 'refreshSales', params: { month: state('/month') } } } },
    summary: mode === 'free' ? {
      type: 'Card', props: { title: '销售总额', description: state('/sales/period'), maxWidth: 'full', centered: false, className: 'demo-free-summary' }, children: ['amount', 'growth'],
    } : { type: 'SalesSummary', props: { title: '销售总额', amount: state('/sales/amount'), change: state('/sales/change'), period: state('/sales/period') }, children: [] },
    metrics: { type: 'Grid', props: { columns: 2, gap: 'md', className: 'demo-metrics' }, children: ['orders', 'customers'] },
    orders: { type: 'Card', props: { title: '成交订单', description: null, maxWidth: 'full', centered: false, className: null }, children: ['ordersValue'] },
    ordersValue: { type: 'Heading', props: { text: state('/sales/orders'), level: 'h3' }, children: [] },
    customers: { type: 'Card', props: { title: '新增客户', description: null, maxWidth: 'full', centered: false, className: null }, children: ['customersValue'] },
    customersValue: { type: 'Heading', props: { text: state('/sales/customers'), level: 'h3' }, children: [] },
    separator: { type: 'Separator', props: { orientation: 'horizontal' }, children: [] },
    table: { type: 'Table', props: { columns: ['销售渠道', '销售额', '占比'], rows: state('/sales/rows'), caption: '模拟销售数据，仅用于接入演示' }, children: [] },
    note: { type: 'Input', props: { label: '报告备注', name: 'note', type: 'text', placeholder: '记录本月观察…', value: bind('/note'), checks: null, validateOn: null }, children: [] },
    returns: { type: 'Checkbox', props: { label: '标记已核对退货数据', name: 'includeReturns', checked: bind('/includeReturns'), checks: null, validateOn: null }, children: [] },
    status: { type: 'Text', props: { text: state('/request/message'), variant: 'muted' }, children: [] },
    refresh: { type: 'Button', props: { label: { $cond: { $state: '/request/loading', eq: true }, $then: '刷新中…', $else: '刷新销售数据' }, variant: 'primary', disabled: state('/request/loading') }, children: [], on: { press: { action: 'refreshSales', params: { month: state('/month') } } } },
  };
  if (mode === 'free') {
    elements.amount = { type: 'Heading', props: { text: state('/sales/amount'), level: 'h2' }, children: [] };
    elements.growth = { type: 'Text', props: { text: state('/sales/change'), variant: 'body' }, children: [] };
  }
  if (mode === 'slotted') {
    elements.root = { type: 'ReportPanel', props: { title: '月度经营报告', description: '固定摘要与可组合正文' }, children: ['body'], slots: { header: ['summary'], footer: ['refresh'] } };
    elements.body = stack(['intro', 'filters', 'metrics', 'separator', 'table', 'note', 'returns', 'status']);
  }
  return validateUI({ root: 'root', elements, state: {
    month: months[0], sales: getDemoSales({ month: months[0] }), note: '', includeReturns: false,
    request: { loading: false, message: '数据已就绪 · 可切换月份' },
  } }, { catalog: demoCatalog });
}

/** Native SpecStream / RFC 6902 operations; no custom stream protocol. */
export function specToPatches(spec: Spec) {
  return [
    { op: 'add', path: '/root', value: spec.root },
    { op: 'add', path: '/state', value: spec.state ?? {} },
    { op: 'add', path: '/elements', value: {} },
    ...Object.entries(spec.elements).map(([key, value]) => ({ op: 'add', path: `/elements/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, value })),
  ];
}
