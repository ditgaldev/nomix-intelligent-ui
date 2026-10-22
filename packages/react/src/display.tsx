'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import type { ComponentRegistry, ComponentRenderProps } from '@json-render/react';
import { displayComponents, type DisplayProps } from '@nomix/intelligent-ui-core';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
type Context<K extends keyof typeof displayComponents> = ComponentRenderProps<DisplayProps<K>>;
const text = (value: string | number | boolean | null) => value === null ? '—' : String(value);
function Frame({ title, description, children, kind }: { title?: string | null; description?: string | null; children: ReactNode; kind: string }) {
  return <section className="nomix-display" data-display={kind} aria-label={title ?? kind}>
    {title && <h3 className="nomix-display-heading">{title}</h3>}
    {description && <p className="nomix-display-description">{description}</p>}{children}
  </section>;
}

function LineChart({ element }: Context<'LineChart'>) {
  const props = displayComponents.LineChart.props.parse(element.props);
  const canvas = useRef<HTMLCanvasElement>(null), current = useRef(props);
  const [available, setAvailable] = useState(false);
  current.current = props;
  const update = useRef(() => {});
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let instance: Chart<'line'>;
    try {
      const context = node.getContext('2d');
      if (!context) return;
      instance = new Chart(context, { type: 'line', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, animation: false } });
    } catch { return; } // The readable data table remains available without canvas support.
    update.current = () => {
      const p = current.current, style = getComputedStyle(node.closest('.nomix-ui') ?? node);
      const colors = ['--primary', '--destructive', '--ring', '--secondary-foreground', '--foreground'].map(token => style.getPropertyValue(token).trim());
      const foreground = style.getPropertyValue('--foreground').trim(), border = style.getPropertyValue('--border').trim();
      instance.data = { labels: [...p.labels], datasets: p.series.map((series, index) => ({
        label: series.label, data: [...series.values], borderColor: colors[index % colors.length], backgroundColor: colors[index % colors.length],
        borderDash: index >= colors.length ? [4 + index, 3] : [], borderWidth: 2, pointRadius: 2, spanGaps: false, tension: 0,
      })) };
      instance.options.scales = {
        x: { type: 'category', ticks: { color: foreground }, grid: { color: border }, title: { display: Boolean(p.xLabel), text: p.xLabel ?? '', color: foreground } },
        y: { type: 'linear', ticks: { color: foreground }, grid: { color: border }, title: { display: Boolean(p.yLabel), text: p.yLabel ?? '', color: foreground } },
      };
      instance.options.plugins = { legend: { labels: { color: foreground } } };
      try { instance.update('none'); setAvailable(true); } catch { setAvailable(false); }
    };
    update.current();
    const theme = node.closest('.nomix-ui');
    const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => update.current());
    if (theme) observer?.observe(theme, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => { observer?.disconnect(); update.current = () => {}; instance.destroy(); };
  }, []);
  useEffect(() => { update.current(); }, [props]);
  return <Frame {...props} kind="LineChart">
    <div className="nomix-display-chart" style={{ height: props.height ?? 240 }}><canvas ref={canvas} role="img" aria-label={props.title ?? '趋势图'} /></div>
    {!available && <p className="nomix-display-description">图表数据可展开查看。</p>}
    <details><summary>查看图表数据</summary><div className="nomix-display-scroll" tabIndex={0} role="region" aria-label={`${props.title ?? '趋势图'}数据`}>
      <table className="nomix-display-table"><caption>{props.title ?? '趋势图'}数据；横轴按标签顺序等距排列{props.yLabel ? `；纵轴：${props.yLabel}` : ''}</caption><thead><tr><th scope="col">{props.xLabel ?? '标签'}</th>{props.series.map(series => <th key={series.id} scope="col" data-align="right">{series.label}</th>)}</tr></thead>
        <tbody>{props.labels.map((label, index) => <tr key={index}><th scope="row">{label}</th>{props.series.map(series => <td key={series.id} data-align="right">{text(series.values[index]!)}</td>)}</tr>)}</tbody>
      </table>
    </div></details>
  </Frame>;
}
function DataTable({ element }: Context<'DataTable'>) {
  const props = displayComponents.DataTable.props.parse(element.props);
  return <Frame {...props} kind="DataTable"><div className="nomix-display-scroll" tabIndex={0} role="region" aria-label={props.title ?? props.caption ?? '数据表'}>
    <table className="nomix-display-table">{props.caption && <caption>{props.caption}</caption>}<thead><tr>{props.columns.map(column => <th key={column.key} scope="col" data-align={column.align ?? 'left'}>{column.label}</th>)}</tr></thead>
      <tbody>{props.rows.map(row => <tr key={row.id}>{props.columns.map(column => <td key={column.key} data-align={column.align ?? 'left'}>{text(row.cells[column.key]!)}</td>)}</tr>)}</tbody>
    </table>
  </div></Frame>;
}
function MetricGroup({ element }: Context<'MetricGroup'>) {
  const props = displayComponents.MetricGroup.props.parse(element.props);
  return <Frame {...props} kind="MetricGroup"><dl className="nomix-display-metrics">{props.items.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{text(item.value)}{item.unit && <span className="nomix-display-unit">{item.unit}</span>}</dd>{item.description && <dd className="nomix-display-description">{item.description}</dd>}</div>)}</dl></Frame>;
}
function Timeline({ element }: Context<'Timeline'>) {
  const props = displayComponents.Timeline.props.parse(element.props);
  return <Frame {...props} kind="Timeline"><ol className="nomix-display-list nomix-display-timeline">{props.items.map(item => <li key={item.id}><span className="nomix-display-time">{item.time}</span><p className="nomix-display-item-title">{item.title}</p>{item.description && <p className="nomix-display-description">{item.description}</p>}</li>)}</ol></Frame>;
}
function Steps({ element }: Context<'Steps'>) {
  const props = displayComponents.Steps.props.parse(element.props);
  return <Frame {...props} kind="Steps"><ol className="nomix-display-list">{props.items.map(item => <li key={item.id}><p className="nomix-display-item-title">{item.title}</p>{item.description && <p className="nomix-display-description">{item.description}</p>}</li>)}</ol></Frame>;
}

/** Opt in together with displayComponents in the host's catalog. */
export const displayRegistry = { LineChart, DataTable, MetricGroup, Timeline, Steps } satisfies ComponentRegistry;
