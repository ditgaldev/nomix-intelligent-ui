import { defineRegistry as defineReactRegistry, type BaseComponentProps } from '@json-render/react';
import { defineRegistry as defineVueRegistry } from '@json-render/vue';
import { h } from 'vue';
import { demoCatalog } from '../../shared/demo';

interface SummaryProps { title: string; amount: string; change: string; period: string }
interface PanelProps { title: string; description: string }

export const reactRegistry = defineReactRegistry(demoCatalog, {
  components: {
    SalesSummary: ({ props }: BaseComponentProps<unknown>) => {
      const value = props as SummaryProps;
      return <section className="demo-summary"><div className="demo-summary-top"><span>{value.title}</span><span>{value.period}</span></div><strong>{value.amount}</strong><div className="demo-growth"><span>↗ {value.change}</span><span>较上月 · 模拟</span></div></section>;
    },
    ReportPanel: ({ props, children, slots }: BaseComponentProps<unknown>) => {
      const value = props as PanelProps;
      return <section className="demo-report"><header><h3>{value.title}</h3><p>{value.description}</p></header>{slots?.header}<div className="demo-report-body">{children}</div><footer>{slots?.footer}</footer></section>;
    },
  }, actions: {},
}).registry;

export const vueRegistry = defineVueRegistry(demoCatalog, {
  components: {
    SalesSummary: ({ props }) => {
      const value = props as SummaryProps;
      return h('section', { class: 'demo-summary' }, [
        h('div', { class: 'demo-summary-top' }, [h('span', value.title), h('span', value.period)]),
        h('strong', value.amount),
        h('div', { class: 'demo-growth' }, [h('span', `↗ ${value.change}`), h('span', '较上月 · 模拟')]),
      ]);
    },
    ReportPanel: ({ props, slots }) => {
      const value = props as PanelProps;
      return h('section', { class: 'demo-report' }, [
        h('header', [h('h3', value.title), h('p', value.description)]), slots.header?.(),
        h('div', { class: 'demo-report-body' }, slots.default?.()), h('footer', slots.footer?.()),
      ]);
    },
  }, actions: {},
}).registry;
