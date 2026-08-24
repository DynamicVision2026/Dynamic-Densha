import { playFixedAudioQueue, stopFixedAudio } from "./fixed-audio";

export function stopAnnouncementAudio() {
  stopFixedAudio();
}

/** Play the baked station clip(s). Same helper as reading speakers. Never live TTS. */
export function playAnnouncementAudio(
  src: string | string[] | null | undefined,
  opts?: { onEnded?: () => void; onError?: () => void; onBlocked?: () => void },
): () => void {
  const clips = Array.isArray(src) ? src : [src];
  return playFixedAudioQueue(clips, opts);
}
