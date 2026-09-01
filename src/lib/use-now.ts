import { useEffect, useState } from "react";

/** JST has no DST — a fixed +9h offset from UTC always lands on its midnight. */
const JST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;

function msUntilNextTokyoMidnight(from: number): number {
  const jstNow = from + JST_OFFSET_MS;
  const msIntoJstDay = jstNow % DAY_MS;
  return DAY_MS - msIntoJstDay;
}

/**
 * The current instant as an ISO string, re-derived on `visibilitychange`,
 * window `focus`, and a timer to the next Asia/Tokyo midnight — not just
 * computed once at mount. Screens showing きょう/あした (session-stub,
 * departure ticket, parent report) must not go stale if left open across a
 * JST calendar-day boundary or backgrounded overnight (see PI-3).
 */
export function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function refresh() {
      setNow(new Date().toISOString());
    }

    function scheduleMidnight() {
      timer = setTimeout(
        () => {
          refresh();
          scheduleMidnight();
        },
        // +1s: land just after the boundary, never right before it.
        msUntilNextTokyoMidnight(Date.now()) + 1000,
      );
    }

    scheduleMidnight();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return now;
}
