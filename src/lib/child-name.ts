/**
 * One normalisation for "is this the same name as that one".
 *
 * Used only to decide whether to ASK the parent 「同じなまえのおこさまがいます」
 * -- never to refuse. There is deliberately no unique index behind it (see
 * createChild): siblings share names, and a constraint that rejects a real
 * second child is a worse failure than a duplicate the parent can rename.
 *
 * Alias-free so the plain node test runner can exercise it.
 *
 * NFKC folds the width variants Japanese input methods produce -- ﾀﾛｳ and
 * タロウ are the same child, and a parent who typed one then the other is
 * asking the same question either way. Case folding matters for romaji
 * nicknames; whitespace is collapsed because a trailing space is not a
 * different name.
 */
export function normalizeChildName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
