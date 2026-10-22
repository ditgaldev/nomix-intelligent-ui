// Adapted from vercel-labs/json-render v0.21.1 packages/shadcn (Apache-2.0).
// Changes: instance-local IDs/portal, literal initial values and explicit labels.
import { createContext, useContext, useId, useState } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useBoundProp, useFieldValidation, type BaseComponentProps } from '@json-render/react';
import { shadcnComponents, type ShadcnProps } from '@json-render/shadcn';

export const PortalContainer = createContext<HTMLElement | undefined>(undefined);

export function InputField({ props, bindings, emit }: BaseComponentProps<ShadcnProps<'Input'>>) {
  const id = useId();
  const [bound, write] = useBoundProp<string>(props.value ?? undefined, bindings?.value);
  const [local, setLocal] = useState(props.value ?? '');
  const value = bindings?.value ? bound ?? '' : local;
  const update = bindings?.value ? write : setLocal;
  const mode = props.validateOn ?? 'blur';
  const hasValidation = !!(bindings?.value && props.checks?.length);
  const { errors, validate } = useFieldValidation(bindings?.value ?? '', hasValidation ? { checks: props.checks ?? [], validateOn: mode } : undefined);
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={id}>{props.label}</label>
    <input id={id} name={props.name} type={props.type ?? 'text'} value={value}
      placeholder={props.placeholder ?? ''} aria-invalid={errors.length > 0 || undefined}
      aria-describedby={errors.length ? `${id}-error` : undefined}
      className="border-input placeholder:text-muted-foreground h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      onChange={e => { update(e.target.value); if (hasValidation && mode === 'change') validate(); }}
      onKeyDown={e => { if (e.key === 'Enter') emit('submit'); }}
      onFocus={() => emit('focus')}
      onBlur={() => { if (hasValidation && mode === 'blur') validate(); emit('blur'); }} />
    {errors.length > 0 && <p id={`${id}-error`} className="text-sm text-destructive">{errors[0]}</p>}
  </div>;
}

export function SelectField({ props, bindings, emit }: BaseComponentProps<ShadcnProps<'Select'>>) {
  const id = useId();
  const container = useContext(PortalContainer);
  const [bound, write] = useBoundProp<string>(props.value ?? undefined, bindings?.value);
  const [local, setLocal] = useState(props.value ?? '');
  const value = bindings?.value ? bound ?? '' : local;
  const update = bindings?.value ? write : setLocal;
  const mode = props.validateOn ?? 'change';
  const hasValidation = !!(bindings?.value && props.checks?.length);
  const { errors, validate } = useFieldValidation(bindings?.value ?? '', hasValidation ? { checks: props.checks ?? [], validateOn: mode } : undefined);
  return <div className="space-y-2">
    <label id={`${id}-label`} className="text-sm font-medium" htmlFor={id}>{props.label}</label>
    <SelectPrimitive.Root name={props.name} value={value} onValueChange={next => {
      update(next); if (hasValidation && mode === 'change') validate(); emit('change');
    }}>
      <SelectPrimitive.Trigger id={id} aria-labelledby={`${id}-label`} aria-invalid={errors.length > 0 || undefined}
        className="border-input flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
        <SelectPrimitive.Value placeholder={props.placeholder ?? '请选择'} />
        <SelectPrimitive.Icon aria-hidden="true">⌄</SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="bg-popover text-popover-foreground z-50 max-h-72 min-w-40 overflow-hidden rounded-md border shadow-md">
          <SelectPrimitive.Viewport className="p-1">
            {props.options.map((option, index) => <SelectPrimitive.Item key={`${index}-${option}`} value={option || `option-${index}`}
              className="focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none">
              <SelectPrimitive.ItemText>{option}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="absolute right-2">✓</SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
    {errors.length > 0 && <p className="text-sm text-destructive">{errors[0]}</p>}
  </div>;
}

export function CheckboxField(ctx: BaseComponentProps<ShadcnProps<'Checkbox'>>) {
  const id = useId();
  const Checkbox = shadcnComponents.Checkbox;
  return <Checkbox {...ctx} props={{ ...ctx.props, name: `${ctx.props.name}-${id}` }} />;
}
