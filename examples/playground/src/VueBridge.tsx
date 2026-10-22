import { useEffect, useRef } from 'react';
import { createApp, h, shallowRef } from 'vue';
import { IntelligentUI, type IntelligentUIProps } from '@nomix/intelligent-ui-vue';

/** Mount and unmount the independent Vue runtime in the React shell. */
export function VueBridge(props: IntelligentUIProps) {
  const container = useRef<HTMLDivElement>(null);
  const update = useRef<((props: IntelligentUIProps) => void) | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const current = shallowRef(latest.current);
    update.current = value => { current.value = value; };
    const app = createApp({ setup: () => () => h(IntelligentUI, current.value) });
    app.mount(container.current!);
    return () => { update.current = undefined; app.unmount(); };
  }, []);
  useEffect(() => { update.current?.(props); }, [props]);
  return <div ref={container} />;
}
