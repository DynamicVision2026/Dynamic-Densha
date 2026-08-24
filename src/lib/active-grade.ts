import { useEffect } from "react";
import type { Grade } from "../data/kyoiku.ts";
import { parseGrade } from "./grade-nav.ts";

const GUEST_KEY = "densha.active-grade";

function childKey(childId: string) {
  return `densha.active-grade.child.${childId}`;
}

export function readStoredActiveGrade(childId?: string | null): Grade | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    if (childId) {
      const perChild = parseGrade(window.localStorage.getItem(childKey(childId)));
      if (perChild) return perChild;
    }
    return parseGrade(window.localStorage.getItem(GUEST_KEY));
  } catch {
    return undefined;
  }
}

export function writeStoredActiveGrade(grade: Grade, childId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, String(grade));
    if (childId) window.localStorage.setItem(childKey(childId), String(grade));
  } catch {
    /* ignore */
  }
}

/** Profile grade change: default becomes the new grade. */
export function resetActiveGradeToProfile(grade: Grade, childId: string) {
  writeStoredActiveGrade(grade, childId);
}

/**
 * 1. URL  2. last explicit switch (per-child, then guest)  3. profile  4. 1
 */
export function resolveActiveGrade(input: {
  urlGrade?: Grade;
  profileGrade?: Grade;
  childId?: string | null;
}): Grade {
  if (input.urlGrade) return input.urlGrade;
  const stored = readStoredActiveGrade(input.childId);
  if (stored) return stored;
  return input.profileGrade ?? 1;
}

export function usePersistActiveGrade(grade: Grade, childId?: string | null) {
  useEffect(() => {
    writeStoredActiveGrade(grade, childId);
  }, [grade, childId]);
}
