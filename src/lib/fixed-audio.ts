/**
 * Shared fixed-clip player. One text → one file. Stops the previous clip.
 * Never synthesizes at tap time. Missing/error → silence.
 * Autoplay-block is not a broken file — do not blacklist it.
 */

type Handle = { stop: () => void; url: string };

let active: Handle | null = null;
const failed = new Set<string>();

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) return String((err as { name: string }).name);
  return "";
}

export function stopFixedAudio() {
  active?.stop();
  active = null;
}

export function playFixedAudio(
  url: string | null | undefined,
  opts?: { onEnded?: () => void; onError?: () => void; onBlocked?: () => void },
): () => void {
  stopFixedAudio();
  if (typeof window === "undefined" || !url || failed.has(url)) {
    opts?.onError?.();
    return () => {};
  }

  let stopped = false;
  const el = new Audio(url);
  el.preload = "auto";
  el.volume = 0.8;
  el.loop = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
    if (active?.stop === stop) active = null;
  };

  el.addEventListener("error", () => {
    if (stopped) return;
    failed.add(url);
    opts?.onError?.();
    stop();
  });
  el.addEventListener("ended", () => {
    if (stopped) return;
    opts?.onEnded?.();
    stop();
  });
  void el.play().catch((err: unknown) => {
    if (stopped) return;
    if (errorName(err) === "NotAllowedError") {
      opts?.onBlocked?.();
      stop();
      return;
    }
    failed.add(url);
    opts?.onError?.();
    stop();
  });

  active = { stop, url };
  return stop;
}

/** Play baked clips in order. Autoplay-block stops the queue (caller can replay). */
export function playFixedAudioQueue(
  urls: Array<string | null | undefined>,
  opts?: { onEnded?: () => void; onError?: () => void; onBlocked?: () => void },
): () => void {
  const clips = urls.filter((u): u is string => Boolean(u));
  if (clips.length === 0) {
    opts?.onError?.();
    return () => {};
  }
  if (clips.length === 1) return playFixedAudio(clips[0], opts);

  let index = 0;
  let stopped = false;
  let stopCurrent: () => void = () => {};

  const run = () => {
    if (stopped) return;
    const url = clips[index];
    if (!url) {
      opts?.onEnded?.();
      return;
    }
    stopCurrent = playFixedAudio(url, {
      onEnded: () => {
        if (stopped) return;
        index += 1;
        run();
      },
      onError: () => {
        if (stopped) return;
        index += 1;
        run();
      },
      onBlocked: () => {
        if (stopped) return;
        opts?.onBlocked?.();
      },
    });
  };
  run();
  return () => {
    stopped = true;
    stopCurrent();
  };
}

export function playingAudioUrl(): string | null {
  return active?.url ?? null;
}

export function hasAudioFailed(url: string): boolean {
  return failed.has(url);
}

export function markAudioFailed(url: string) {
  failed.add(url);
}

export function resetAudioFailures() {
  failed.clear();
}
