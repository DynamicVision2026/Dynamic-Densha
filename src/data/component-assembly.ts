import type { ComponentAssembly } from "@/lib/component-assembly";
import { COMPOUND_DICTIONARY } from "./compound-dictionary.ts";

function fromDict(char: string): ComponentAssembly {
  const entry = COMPOUND_DICTIONARY[char]!;
  return {
    char,
    layout: entry.layout,
    components: entry.labels.map((label, i) => ({
      id: `${char}-${i}`,
      label,
      path_or_asset: label,
      slot: i,
    })),
  };
}

const BY_CHAR = new Map(
  Object.keys(COMPOUND_DICTIONARY).map((char) => [char, fromDict(char)]),
);

export function getComponentAssembly(char: string): ComponentAssembly | undefined {
  return BY_CHAR.get(char);
}

export function componentAssemblyChars(): string[] {
  return Object.keys(COMPOUND_DICTIONARY);
}
