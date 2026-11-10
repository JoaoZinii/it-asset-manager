import { useEffect, useState } from 'react';

/** Anima um número de 0 até `target` (respeita "reduzir movimento" do sistema). */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return undefined; }
    let raf;
    let start;
    const tick = (t) => {
      start ??= t;
      const p = Math.min(1, (t - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
