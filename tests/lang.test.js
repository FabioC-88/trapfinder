import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const load = file => JSON.parse(readFileSync(new URL(`../lang/${file}`, import.meta.url), "utf8"));

/** Flattens a translation tree into dotted keys: { a: { b: "x" } } -> ["a.b"]. */
function keysOf(tree, prefix = "") {
  return Object.entries(tree).flatMap(([key, value]) => (value && typeof value === "object")
    ? keysOf(value, `${prefix}${key}.`)
    : [`${prefix}${key}`]);
}

describe("translations", () => {
  const enKeys = new Set(keysOf(load("en.json")));
  const itKeys = new Set(keysOf(load("it.json")));

  it("every English key has an Italian translation", () => {
    expect([...enKeys].filter(key => !itKeys.has(key))).toEqual([]);
  });

  it("every Italian key exists in English, the base language", () => {
    expect([...itKeys].filter(key => !enKeys.has(key))).toEqual([]);
  });
});
