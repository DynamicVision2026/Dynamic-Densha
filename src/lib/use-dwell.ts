import { useEffect, useState } from "react";

/** Visible teaching dwell. Does not emit progress events. Skip for look/tour. */
export function useDwell(ms: number, resetKey: string, skip = false) {
  const [remainMs, setRemainMs] = useState(() => (skip || ms <= 0 ? 0 : ms));

  useEffect(() => {
    if (skip || ms <= 0) {
      setRemainMs(0);
      return;
    }
    setRemainMs(ms);
    const start = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, ms - (Date.now() - start));
      setRemainMs(left);
      if (left <= 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [ms, resetKey, skip]);

  const ready = remainMs <= 0;
  return {
    ready,
    remainMs,
    remainSec: ready ? 0 : Math.max(1, Math.ceil(remainMs / 1000)),
  };
}
