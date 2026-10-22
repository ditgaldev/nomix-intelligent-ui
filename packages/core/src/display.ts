import { z } from 'zod';

const heading = { title: z.string().nullable().optional(), description: z.string().nullable().optional() };
const id = z.string().min(1);
const cell = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
function unique(values: string[], context: z.RefinementCtx, path: (string | number)[]) {
  if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', path, message: 'Identifiers must be unique' });
}

const lineChart = z.object({
  ...heading,
  labels: z.array(z.string()),
  series: z.array(z.object({ id, label: z.string(), values: z.array(z.number().finite().nullable()) }).strict()),
  xLabel: z.string().nullable().optional(), yLabel: z.string().nullable().optional(),
  height: z.number().finite().int().min(120).max(800).nullable().optional(),
}).strict().superRefine((value, context) => {
  unique(value.series.map(item => item.id), context, ['series']);
  value.series.forEach((series, index) => {
    if (series.values.length !== value.labels.length) context.addIssue({ code: 'custom', path: ['series', index, 'values'], message: 'Series length must match labels' });
  });
});
const dataTable = z.object({
  ...heading, caption: z.string().nullable().optional(),
  columns: z.array(z.object({ key: id, label: z.string(), align: z.enum(['left', 'right']).optional() }).strict()),
  rows: z.array(z.object({ id, cells: z.record(z.string(), cell) }).strict()),
}).strict().superRefine((value, context) => {
  unique(value.columns.map(column => column.key), context, ['columns']);
  unique(value.rows.map(row => row.id), context, ['rows']);
  const keys = value.columns.map(column => column.key);
  value.rows.forEach((row, index) => {
    if (Object.keys(row.cells).length !== keys.length || keys.some(key => !Object.hasOwn(row.cells, key))) {
      context.addIssue({ code: 'custom', path: ['rows', index, 'cells'], message: 'Cells must match the declared columns' });
    }
  });
});
const metricGroup = z.object({
  ...heading,
  items: z.array(z.object({ id, label: z.string(), value: z.union([z.string(), z.number().finite(), z.null()]), unit: z.string().nullable().optional(), description: z.string().nullable().optional() }).strict()),
}).strict().superRefine((value, context) => unique(value.items.map(item => item.id), context, ['items']));
const timeline = z.object({
  ...heading,
  items: z.array(z.object({ id, time: z.string(), title: z.string(), description: z.string().nullable().optional() }).strict()),
}).strict().superRefine((value, context) => unique(value.items.map(item => item.id), context, ['items']));
const steps = z.object({
  ...heading,
  items: z.array(z.object({ id, title: z.string(), description: z.string().nullable().optional() }).strict()),
}).strict().superRefine((value, context) => unique(value.items.map(item => item.id), context, ['items']));

/** Optional, presentation-only definitions. Values are supplied and owned by the host. */
export const displayComponents = {
  LineChart: { props: lineChart, description: 'Line chart with equally spaced category labels. Null values leave gaps; no aggregation or time conversion.' },
  DataTable: { props: dataTable, description: 'Read-only table with explicit columns and typed JSON cells. No calculation, sorting or pagination.' },
  MetricGroup: { props: metricGroup, description: 'Compact group of supplied metric values. Units are displayed without conversion.' },
  Timeline: { props: timeline, description: 'Ordered events with display-only time labels. Input order is preserved.' },
  Steps: { props: steps, description: 'Ordered explanatory steps. No execution or workflow state.' },
};
export type DisplayProps<K extends keyof typeof displayComponents> = z.infer<(typeof displayComponents)[K]['props']>;
