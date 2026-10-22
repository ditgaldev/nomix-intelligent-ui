import { defineComponent, h, ref, useId, type PropType } from 'vue';
import { defineRegistry, useBoundProp, useFieldValidation, type BaseComponentProps, type Components } from '@json-render/vue';
import { catalog } from '@nomix/intelligent-ui-core';
import type { ValidationConfig } from '@json-render/core';
import { cn } from './lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import Input from './ui/input/Input.vue';
import Label from './ui/label/Label.vue';
import Checkbox from './ui/checkbox/Checkbox.vue';
import Separator from './ui/separator/Separator.vue';
import Card from './ui/card/Card.vue';
import CardHeader from './ui/card/CardHeader.vue';
import CardTitle from './ui/card/CardTitle.vue';
import CardDescription from './ui/card/CardDescription.vue';
import CardContent from './ui/card/CardContent.vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import Table from './ui/table/Table.vue';
import TableHeader from './ui/table/TableHeader.vue';
import TableBody from './ui/table/TableBody.vue';
import TableRow from './ui/table/TableRow.vue';
import TableHead from './ui/table/TableHead.vue';
import TableCell from './ui/table/TableCell.vue';
import TableCaption from './ui/table/TableCaption.vue';

// The core exposes an extensible catalog, so recover each built-in's exact props
// from its definition rather than widening every render function to unknown.
import { baseComponents } from '@nomix/intelligent-ui-core';
import type { z } from 'zod';
type UIProps<K extends keyof typeof baseComponents> = z.infer<(typeof baseComponents)[K]['props']>;
type Context<K extends keyof typeof baseComponents> = BaseComponentProps<UIProps<K>>;

function validationConfig(context: Context<'Input' | 'Select' | 'Checkbox'>, key: 'value' | 'checked', fallback: 'blur' | 'change'): ValidationConfig | undefined {
  const checks = context.props.checks;
  return context.bindings?.[key] && checks?.length
    ? { checks, validateOn: context.props.validateOn ?? fallback }
    : undefined;
}

const InputField = defineComponent({
  name: 'NomixInputField',
  props: { context: { type: Object as PropType<Context<'Input'>>, required: true } },
  setup(field) {
    const id = `nomix-input-${useId()}`;
    const local = ref(field.context.props.value ?? '');
    const config = validationConfig(field.context, 'value', 'blur');
    const { errors, validate } = useFieldValidation(field.context.bindings?.value ?? '', config);
    return () => {
      const { props, bindings, emit } = field.context;
      const [bound, setBound] = useBoundProp(props.value, bindings?.value);
      return h('div', { class: 'space-y-2' }, [
        h(Label, { for: id }, () => props.label),
        h(Input, {
          id, name: props.name, type: props.type ?? 'text', placeholder: props.placeholder ?? '',
          modelValue: bindings?.value ? bound ?? '' : local.value,
          'aria-invalid': errors.value.length ? true : undefined,
          'aria-describedby': errors.value.length ? `${id}-error` : undefined,
          'onUpdate:modelValue': (value: string | number) => {
            const next = String(value);
            if (bindings?.value) setBound(next); else local.value = next;
            if (config?.validateOn === 'change') validate();
          },
          onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter') emit('submit'); },
          onFocus: () => emit('focus'),
          onBlur: () => { if (config?.validateOn === 'blur') validate(); emit('blur'); },
        }),
        errors.value.length ? h('p', { id: `${id}-error`, class: 'text-sm text-destructive' }, errors.value[0]) : null,
      ]);
    };
  },
});

const SelectField = defineComponent({
  name: 'NomixSelectField',
  props: { context: { type: Object as PropType<Context<'Select'>>, required: true } },
  setup(field) {
    const id = `nomix-select-${useId()}`;
    const local = ref(field.context.props.value ?? '');
    const config = validationConfig(field.context, 'value', 'change');
    const { errors, validate } = useFieldValidation(field.context.bindings?.value ?? '', config);
    return () => {
      const { props, bindings, emit } = field.context;
      const [bound, setBound] = useBoundProp(props.value, bindings?.value);
      return h('div', { class: 'space-y-2' }, [
        h(Label, { for: id }, () => props.label),
        h(Select, {
          name: props.name,
          modelValue: bindings?.value ? bound ?? '' : local.value,
          'onUpdate:modelValue': (value: unknown) => {
            const next = String(value ?? '');
            if (bindings?.value) setBound(next); else local.value = next;
            if (config?.validateOn === 'change') validate();
            emit('change');
          },
        }, { default: () => [
          h(SelectTrigger, {
            id, class: 'w-full',
            'aria-invalid': errors.value.length ? true : undefined,
            'aria-describedby': errors.value.length ? `${id}-error` : undefined,
          }, () => h(SelectValue, { placeholder: props.placeholder ?? 'Select...' })),
          h(SelectContent, null, () => props.options.map((option, index) =>
            h(SelectItem, { key: `${index}-${option}`, value: option || `option-${index}` }, () => option))),
        ] }),
        errors.value.length ? h('p', { id: `${id}-error`, class: 'text-sm text-destructive' }, errors.value[0]) : null,
      ]);
    };
  },
});

const CheckboxField = defineComponent({
  name: 'NomixCheckboxField',
  props: { context: { type: Object as PropType<Context<'Checkbox'>>, required: true } },
  setup(field) {
    const id = `nomix-checkbox-${useId()}`;
    const local = ref(field.context.props.checked ?? false);
    const config = validationConfig(field.context, 'checked', 'change');
    const { errors, validate } = useFieldValidation(field.context.bindings?.checked ?? '', config);
    return () => {
      const { props, bindings, emit } = field.context;
      const [bound, setBound] = useBoundProp(props.checked, bindings?.checked);
      return h('div', { class: 'space-y-1' }, [
        h('div', { class: 'flex items-center space-x-2' }, [
          h(Checkbox, {
            id, name: props.name, modelValue: bindings?.checked ? bound ?? false : local.value,
            'aria-invalid': errors.value.length ? true : undefined,
            'aria-describedby': errors.value.length ? `${id}-error` : undefined,
            'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
              const next = value === true;
              if (bindings?.checked) setBound(next); else local.value = next;
              if (config?.validateOn === 'change') validate();
              emit('change');
            },
          }),
          h(Label, { for: id, class: 'cursor-pointer' }, () => props.label),
        ]),
        errors.value.length ? h('p', { id: `${id}-error`, class: 'text-sm text-destructive' }, errors.value[0]) : null,
      ]);
    };
  },
});

const gapClasses = { none: 'gap-0', sm: 'gap-2', md: 'gap-3', lg: 'gap-4', xl: 'gap-6' };
const columnClasses = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' };

/** Implementations of the shared twelve-component catalog. */
export const components = {
  Stack: ({ props, children }: Context<'Stack'>) => h('div', { class: cn(
    'flex', props.direction === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col', gapClasses[props.gap ?? 'md'],
    { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }[props.align ?? 'start'],
    { start: '', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around' }[props.justify ?? 'start'],
    props.className,
  ) }, children),
  Grid: ({ props, children }: Context<'Grid'>) => h('div', { class: cn('grid', columnClasses[Math.max(1, Math.min(6, Math.round(props.columns ?? 1))) as keyof typeof columnClasses],
    { sm: 'gap-2', md: 'gap-3', lg: 'gap-4', xl: 'gap-6' }[props.gap ?? 'md'], props.className) }, children),
  Card: ({ props, children }: Context<'Card'>) => h(Card, { class: cn(
    props.maxWidth === 'sm' ? 'max-w-xs sm:min-w-[280px]' : props.maxWidth === 'md' ? 'max-w-sm sm:min-w-[320px]' : props.maxWidth === 'lg' ? 'max-w-md sm:min-w-[360px]' : 'w-full',
    props.centered && 'mx-auto', props.className,
  ) }, () => [
    props.title || props.description ? h(CardHeader, null, () => [
      props.title ? h(CardTitle, null, () => props.title) : null,
      props.description ? h(CardDescription, null, () => props.description) : null,
    ]) : null,
    h(CardContent, { class: 'flex flex-col gap-3' }, () => children),
  ]),
  Heading: ({ props }: Context<'Heading'>) => h(props.level ?? 'h2', { class: cn('text-left', { h1: 'text-2xl font-bold', h2: 'text-lg font-semibold', h3: 'text-base font-semibold', h4: 'text-sm font-semibold' }[props.level ?? 'h2']) }, props.text),
  Text: ({ props }: Context<'Text'>) => h(props.variant === 'code' ? 'code' : 'p', { class: cn('text-left', { body: 'text-sm', caption: 'text-xs', muted: 'text-sm text-muted-foreground', lead: 'text-xl text-muted-foreground', code: 'font-mono text-sm bg-muted px-1.5 py-0.5 rounded' }[props.variant ?? 'body']) }, props.text),
  Badge: ({ props }: Context<'Badge'>) => h(Badge, { variant: props.variant ?? 'default' }, () => props.text),
  Separator: ({ props }: Context<'Separator'>) => h(Separator, { orientation: props.orientation ?? 'horizontal', class: props.orientation === 'vertical' ? 'h-full mx-2' : 'my-3' }),
  Button: ({ props, on }: Context<'Button'>) => h(Button, {
    type: 'button', disabled: props.disabled ?? false,
    variant: props.variant === 'danger' ? 'destructive' : props.variant === 'secondary' ? 'secondary' : 'default',
    onClick: (event: MouseEvent) => { const handle = on('press'); if (handle.shouldPreventDefault) event.preventDefault(); handle.emit(); },
  }, () => props.label),
  Input: (context: Context<'Input'>) => h(InputField, { context }),
  Select: (context: Context<'Select'>) => h(SelectField, { context }),
  Checkbox: (context: Context<'Checkbox'>) => h(CheckboxField, { context }),
  Table: ({ props }: Context<'Table'>) => h('div', { class: 'rounded-md border border-border overflow-hidden' }, [
    h(Table, null, () => [
      props.caption ? h(TableCaption, null, () => props.caption) : null,
      h(TableHeader, null, () => h(TableRow, null, () => props.columns.map((column, index) => h(TableHead, { key: index }, () => column)))),
      h(TableBody, null, () => props.rows.map((row, index) => h(TableRow, { key: index }, () => row.map((value, cell) => h(TableCell, { key: cell }, () => String(value)))))),
    ]),
  ]),
};

export const { registry } = defineRegistry(catalog, { components: components as Components<typeof catalog>, actions: {} });
