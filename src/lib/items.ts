import { buildQuiz, shuffle, type Quiz } from "./quiz.ts";
import type { PracticeKind } from "./mastery.ts";
import { isElementaryReading, primaryElementaryReading, foldReading } from "./readings.ts";
import { isShapeSkeletonCorrect, type ShapeStrokeVariant } from "./shape.ts";
import { STROKE_COMPLETE_ID, STROKE_SKIP_ID } from "./stroke-assembly.ts";
import { COMPONENT_COMPLETE_ID, COMPONENT_SKIP_ID } from "./component-assembly.ts";
import { echoSurfacesFor, extraMeaningSurface, isWordSurface, preferredMeaningSurface, selectEchoSurface, soloSurface, type EchoSurface } from "./echo-surfaces.ts";
import { buildFamilyQuiz, gradeFamilyChoice, PHONETIC_FAMILY_VARIANT } from "./phonetic-family.ts";
import { buildConfusableQuiz, CONFUSABLE_VARIANT } from "./confusable.ts";
import { buildClozeQuiz, CLOZE_VARIANT } from "./cloze.ts";

export type ItemStatus = "draft" | "published" | "rejected";

export type BankItem = {
  id: string;
  kanji: string;
  kind: PracticeKind;
  status: ItemStatus;
  version: number;
  payload: Quiz;
  surfaceId?: string;
};

/** Sentinel never served on the child path. Used by tests and admin previews. */
export const DRAFT_ITEM_ID = "DRAFT:__test__:reading:0";

export function bankItemId(kanji: string, kind: PracticeKind, variant: number): string {
  return `${kanji}:${kind}:${variant}`;
}

function parseItemId(
  id: string,
): { kanji: string; kind: PracticeKind; variant: number } | null {
  if (id === DRAFT_ITEM_ID) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const variant = Number(parts[parts.length - 1]);
  const kind = parts[parts.length - 2] as PracticeKind;
  const kanji = parts.slice(0, parts.length - 2).join(":");
  if (kind !== "reading" && kind !== "meaning" && kind !== "shape") return null;
  if (!Number.isInteger(variant) || variant < 0) return null;
  if (!kanji) return null;
  return { kanji, kind, variant };
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeItem(
  kanji: string,
  kind: PracticeKind,
  variant: number,
  surface?: EchoSurface | null,
): BankItem | null {
  const payload = buildQuiz(kanji, kind, `${kanji}|${kind}|${variant}|${surface?.id ?? ""}`, {
    surface,
    echo: Boolean(surface && surface.id !== `${kanji}:solo`),
  });
  if (!payload) return null;
  return {
    id: bankItemId(kanji, kind, variant),
    kanji,
    kind,
    status: "published",
    version: 1,
    payload,
    surfaceId: payload.surface?.id ?? `${kanji}:solo`,
  };
}

export function listBankItems(kanji: string, kind: PracticeKind): BankItem[] {
  if (kind === "meaning") {
    const primary = preferredMeaningSurface(kanji);
    const extra = extraMeaningSurface(kanji);
    const out: BankItem[] = [];
    const a = makeItem(kanji, kind, 0, primary);
    if (a) out.push(a);
    if (extra) {
      const b = makeItem(kanji, kind, 1, extra);
      if (b) out.push(b);
    }
    return out;
  }
  const variants = kind === "shape" ? [0] : [0, 1];
  const out: BankItem[] = [];
  for (const v of variants) {
    const item = makeItem(kanji, kind, v, v === 0 ? soloSurface(kanji) : undefined);
    if (item) out.push(item);
  }
  return out;
}

export function getItem(id: string, publishedOnly = true): BankItem | null {
  if (id === DRAFT_ITEM_ID) {
    if (publishedOnly) return null;
    const payload = buildQuiz("一", "reading", "draft");
    if (!payload) return null;
    return {
      id,
      kanji: "一",
      kind: "reading",
      status: "draft",
      version: 1,
      payload,
    };
  }
  const parsed = parseItemId(id);
  if (!parsed) return null;
  if (parsed.variant === CONFUSABLE_VARIANT && parsed.kind === "shape") {
    const payload = buildConfusableQuiz(parsed.kanji);
    if (!payload) return null;
    return {
      id,
      kanji: parsed.kanji,
      kind: "shape",
      status: "published",
      version: 1,
      payload,
      surfaceId: `${parsed.kanji}:confusable`,
    };
  }
  if (parsed.variant === CLOZE_VARIANT && parsed.kind === "shape") {
    const payload = buildClozeQuiz(parsed.kanji);
    if (!payload) return null;
    return {
      id,
      kanji: parsed.kanji,
      kind: "shape",
      status: "published",
      version: 1,
      payload,
      surfaceId: `${parsed.kanji}:cloze`,
    };
  }
  if (parsed.variant === PHONETIC_FAMILY_VARIANT && parsed.kind === "reading") {
    const payload = buildFamilyQuiz(parsed.kanji);
    if (!payload) return null;
    return {
      id,
      kanji: parsed.kanji,
      kind: "reading",
      status: "published",
      version: 1,
      payload,
      surfaceId: `${parsed.kanji}:family`,
    };
  }
  if (parsed.variant >= 100) {
    const surfaces = echoSurfacesFor(parsed.kanji);
    const surface = surfaces[parsed.variant - 100] ?? null;
    return makeItem(parsed.kanji, parsed.kind, parsed.variant, surface);
  }
  return makeItem(
    parsed.kanji,
    parsed.kind,
    parsed.variant,
    parsed.kind === "meaning"
      ? parsed.variant === 0
        ? preferredMeaningSurface(parsed.kanji)
        : extraMeaningSurface(parsed.kanji)
      : parsed.variant === 0
        ? soloSurface(parsed.kanji)
        : undefined,
  );
}

export function getConfusableItem(kanji: string): BankItem | null {
  return getItem(bankItemId(kanji, "shape", CONFUSABLE_VARIANT), true);
}

export function getClozeItem(kanji: string): BankItem | null {
  return getItem(bankItemId(kanji, "shape", CLOZE_VARIANT), true);
}

export function getPhoneticFamilyItem(kanji: string): BankItem | null {
  return getItem(bankItemId(kanji, "reading", PHONETIC_FAMILY_VARIANT), true);
}

export function meaningItemIsSurfaceLinked(item: BankItem): boolean {
  return item.kind === "meaning" && Boolean(item.payload.surface && isWordSurface(item.payload.surface));
}

export function isGentleItem(item: BankItem): boolean {
  return Boolean(item.payload.confusable || item.payload.phoneticFamily || item.payload.cloze);
}

export function shapeSurfaceAvailable(kanji: string): boolean {
  return listBankItems(kanji, "shape").some((i) => i.status === "published");
}

/** One lamp-earning item per kind. Assembly/MCQ wins over cloze/confusable extras. */
export function buildPracticeQueue(input: {
  kanji: string;
  kinds: PracticeKind[];
  seed: string;
  maxPerKind: number;
  maxTotal: number;
  echo?: {
    lastSuccessByKind?: Partial<Record<PracticeKind, string>>;
    seenIds?: string[];
  };
  extras?: boolean;
  phoneticFamily?: boolean;
  excludeIds?: string[];
}): BankItem[] {
  const drawn = drawPublishedItems({
    kanji: input.kanji,
    kinds: input.kinds,
    seed: input.seed,
    maxPerKind: input.maxPerKind,
    maxTotal: input.maxTotal,
    echo: input.echo,
    excludeIds: input.excludeIds,
  });
  if (input.echo || input.extras === false) return drawn;
  const extras: BankItem[] = [];
  if (input.phoneticFamily) {
    const family = getPhoneticFamilyItem(input.kanji);
    if (family) extras.push(family);
  }
  const confuse = getConfusableItem(input.kanji);
  if (confuse) extras.push(confuse);
  const cloze = getClozeItem(input.kanji);
  if (cloze) extras.push(cloze);
  const seenKinds = new Set(drawn.map((i) => i.kind));
  const seenIds = new Set(drawn.map((i) => i.id));
  const added = extras.filter((i) => !seenIds.has(i.id) && !seenKinds.has(i.kind));
  return [...drawn, ...added];
}

export function presentBankItem(item: BankItem, seed: string): BankItem {
  if (item.status !== "published") return item;
  if (item.payload.strokeAssembly || item.payload.componentAssembly) return item;
  if (item.payload.choices.length < 2) return item;
  return {
    ...item,
    payload: {
      ...item.payload,
      choices: shuffle(item.payload.choices, `${seed}|${item.id}|order`),
    },
  };
}

export function drawPublishedItems(input: {
  kanji: string;
  kinds: PracticeKind[];
  seed: string;
  maxPerKind: number;
  maxTotal: number;
  echo?: {
    lastSuccessByKind?: Partial<Record<PracticeKind, string>>;
    seenIds?: string[];
  };
  excludeIds?: string[];
}): BankItem[] {
  const out: BankItem[] = [];
  const banned = new Set((input.excludeIds ?? []).filter(Boolean));
  for (const kind of input.kinds) {
    if (input.echo && kind !== "shape") {
      const surface = selectEchoSurface({
        char: input.kanji,
        kind,
        lastSurfaceId: input.echo.lastSuccessByKind?.[kind],
        seenIds: input.echo.seenIds,
      });
      const surfaces = echoSurfacesFor(input.kanji);
      const idx = Math.max(0, surfaces.findIndex((s) => s.id === surface?.id));
      const item = makeItem(input.kanji, kind, 100 + idx, surface);
      if (item && item.status === "published" && !out.some((x) => x.id === item.id)) {
        out.push(presentBankItem(item, `${input.seed}|${kind}`));
        if (out.length >= input.maxTotal) return out;
      }
      continue;
    }
    const published = listBankItems(input.kanji, kind).filter((i) => i.status === "published");
    if (published.length === 0) continue;
    const rotated =
      published.length <= 1 ? published : published.filter((i) => !banned.has(i.id));
    const pool = rotated.length > 0 ? rotated : published;
    const n = Math.min(input.maxPerKind, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = (hash(`${input.seed}|${kind}|${i}`) + i) % pool.length;
      const item = pool[idx]!;
      if (item.status !== "published") continue;
      if (out.some((x) => x.id === item.id)) continue;
      out.push(presentBankItem(item, `${input.seed}|${kind}|${i}`));
      if (out.length >= input.maxTotal) return out;
    }
  }
  return out;
}

export function gradeChoice(
  item: BankItem,
  choiceId: string,
  opts?: { shapeVariant?: ShapeStrokeVariant | null },
): { correct: boolean; label: string } {
  const picked = item.payload.choices.find((c) => c.id === choiceId);
  const fallback = item.payload.choices.find((c) => c.correct);
  let correct = false;
  let label = fallback?.label ?? "";

  if (item.kind === "reading") {
    if (item.payload.phoneticFamily) {
      const picked = item.payload.choices.find((c) => c.id === choiceId);
      const fam = gradeFamilyChoice(
        item.payload.phoneticFamily,
        choiceId,
        picked?.label,
      );
      return { correct: fam.correct, label: fam.label };
    }
    const chosen = picked?.label ?? "";
    const elem = Boolean(picked) && isElementaryReading(item.kanji, chosen);
    if (item.payload.surface) {
      correct = elem && foldReading(chosen) === foldReading(item.payload.surface.reading);
    } else {
      correct = elem;
    }
    label = item.payload.surface?.reading ?? primaryElementaryReading(item.kanji) ?? label;
  } else if (item.kind === "shape") {
    if (
      choiceId === STROKE_COMPLETE_ID ||
      choiceId === COMPONENT_COMPLETE_ID
    ) {
      correct = Boolean(item.payload.strokeAssembly || item.payload.componentAssembly);
      label = item.kanji;
    } else if (choiceId === STROKE_SKIP_ID || choiceId === COMPONENT_SKIP_ID) {
      correct = false;
      label = item.kanji;
    } else {
      const chosen = picked?.label ?? "";
      const variant = opts?.shapeVariant ?? picked?.shapeVariant ?? "canonical";
      correct = Boolean(picked) && isShapeSkeletonCorrect({
        expected: item.kanji,
        chosen,
        variant,
      });
      label = item.kanji;
    }
  } else {
    correct = Boolean(picked?.correct);
    if (fallback?.label) label = fallback.label;
  }

  return {
    correct,
    label,
  };
}
