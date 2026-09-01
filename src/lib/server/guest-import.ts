import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getKanji } from "@/data/kyoiku";
import type { Grade } from "@/data/kyoiku";
import {
  isImportableGuestRow,
  rebuildImportedProgress,
  type GuestProgressPayload,
} from "@/lib/guest-import";
import { seedInspectionDue } from "@/lib/server/grade-route";
import { loadProgress, saveProgress } from "@/lib/server/progress";

function asPayload(row: GuestProgressPayload): GuestProgressPayload {
  return {
    kanji: String(row.kanji ?? "").slice(0, 8),
    status: row.status,
    lights: row.lights,
    encounterCompleted: Boolean(row.encounterCompleted),
    understandCompleted: Boolean(row.understandCompleted),
    surfacesSeenSuccess: Array.isArray(row.surfacesSeenSuccess)
      ? row.surfacesSeenSuccess.map(String).slice(0, 64)
      : [],
    repairRequiredKinds: Array.isArray(row.repairRequiredKinds)
      ? (row.repairRequiredKinds as GuestProgressPayload["repairRequiredKinds"])
      : [],
    wrongCountByKind: row.wrongCountByKind,
    consecutiveWrongByKind: row.consecutiveWrongByKind,
    correctStreakByKind: row.correctStreakByKind,
    echoSuccessCount: Number(row.echoSuccessCount) || 0,
    lastSuccessByKind: row.lastSuccessByKind ?? {},
    attempts: Number(row.attempts) || 0,
  };
}

export const importGuestProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; rows: GuestProgressPayload[] }) => ({
    childId: String(input.childId ?? ""),
    rows: Array.isArray(input.rows) ? input.rows.map(asPayload).filter((r) => r.kanji) : [],
  }))
  .handler(async ({ context, data }) => {
    const serverNow = new Date().toISOString();
    const { child, map } = await loadProgress(context.userId, data.childId);
    const imported: string[] = [];
    for (const row of data.rows) {
      if (!isImportableGuestRow(row)) continue;
      if (map.has(row.kanji)) continue;
      const { progress, inspection } = rebuildImportedProgress(
        row,
        serverNow,
        (getKanji(row.kanji)?.grade ?? child.grade) as Grade,
      );
      await saveProgress(context.userId, data.childId, progress);
      if (inspection) {
        await seedInspectionDue(context.userId, data.childId, progress.kanji, serverNow);
      }
      map.set(row.kanji, progress);
      imported.push(row.kanji);
    }
    return { imported, at: serverNow };
  });