import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/data/announcements";
import { playAnnouncementAudio, stopAnnouncementAudio } from "@/lib/announce-audio";
import { announcementAudioClips, spokenLineFor } from "@/lib/announcements";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function TrainAnnounce({
  announcement,
  onPass,
}: {
  announcement: Announcement;
  onPass: () => void;
}) {
  const { t } = useI18n();
  const line = spokenLineFor(announcement);
  const clips = announcementAudioClips(announcement);
  const [playing, setPlaying] = useState(true);

  const play = () => {
    if (!clips.length) {
      setPlaying(false);
      return () => {};
    }
    setPlaying(true);
    return playAnnouncementAudio(clips, {
      onEnded: () => setPlaying(false),
      onError: () => setPlaying(false),
      onBlocked: () => setPlaying(false),
    });
  };

  useEffect(() => {
    if (!clips.length) {
      setPlaying(false);
      return;
    }
    const stop = play();
    return () => stop();
    // replay is explicit via the きく button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.id]);

  const pass = () => {
    stopAnnouncementAudio();
    onPass();
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-fg/40 p-5 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announce-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface px-5 py-6 shadow-soft">
        <p className="flex items-center gap-2 text-xs tracking-[0.28em] text-fg-subtle">
          <span className="inline-flex h-3 items-end gap-px" aria-hidden>
            <span className="announce-bar h-1.5 w-0.5 bg-fg/70" />
            <span className="announce-bar announce-bar-mid h-2.5 w-0.5 bg-fg/70" />
            <span className="announce-bar h-2 w-0.5 bg-fg/70" />
          </span>
          {t("announceKicker")}
        </p>
        <p id="announce-title" className="mt-4 font-display text-2xl leading-relaxed text-fg">
          {line}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{announcement.reading}</p>
        <div className="mt-6 flex gap-2">
          {clips.length > 0 ? (
            <button
              type="button"
              data-tour="announce-hear"
              aria-label={t("announceHear")}
              className={cn(
                "inline-grid size-11 shrink-0 place-items-center rounded-full border border-border bg-bg text-fg",
                "hover:bg-bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                playing && "border-engine bg-bg-warm",
              )}
              onClick={(e) => {
                e.preventDefault();
                play();
              }}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 8H5v8h3l5 4V4L8 8z" />
                <path d="M16.2 9.2a3.4 3.4 0 0 1 0 5.6" />
              </svg>
            </button>
          ) : null}
          <Button type="button" className="min-h-11 flex-1" data-tour="announce-dismiss" onClick={pass}>
            {t("announcePass")}
          </Button>
        </div>
      </div>
    </div>
  );
}
