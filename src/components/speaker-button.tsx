import { useEffect, useState } from "react";
import { lookupReadingAudio } from "@/data/reading-audio";
import { hasAudioFailed, playFixedAudio, playingAudioUrl } from "@/lib/fixed-audio";
import { cn } from "@/lib/utils";

export function SpeakerButton({
  text,
  label,
  className,
  onHeard,
}: {
  text: string;
  label?: string;
  className?: string;
  onHeard?: () => void;
}) {
  const entry = lookupReadingAudio(text);
  const [failed, setFailed] = useState(() => (entry ? hasAudioFailed(entry.url) : true));
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFailed(entry ? hasAudioFailed(entry.url) : true);
    setPlaying(playingAudioUrl() === entry?.url);
  }, [entry?.url, text]);

  if (!entry || !text.trim() || failed) return null;

  return (
    <button
      type="button"
      data-tour="speaker"
      aria-label={label ?? `${text} を聞く`}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-fg shadow-soft",
        "hover:bg-bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        playing && "border-engine bg-bg-warm",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        playFixedAudio(entry.url, {
          onEnded: () => setPlaying(false),
          onError: () => {
            setFailed(true);
            setPlaying(false);
          },
        });
        setPlaying(true);
        onHeard?.();
      }}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 8H5v8h3l5 4V4L8 8z" />
        <path d="M16.2 9.2a3.4 3.4 0 0 1 0 5.6" />
      </svg>
    </button>
  );
}

export function ReadingLine({ text, onHeard }: { text: string; onHeard?: () => void }) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      <p className="min-w-0 flex-1 font-display text-xl tracking-wide">{text}</p>
      <SpeakerButton text={text} onHeard={onHeard} />
    </div>
  );
}
