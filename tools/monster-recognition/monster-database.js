import { MONSTER_DATA } from "./monsters-data.js";

/**
 * Pure matching/decision logic for monster recognition. Deliberately free of Foundry globals -
 * same reasoning as core/detection.js: this is the part that fails silently at the table if it
 * has a bug (wrong skill, wrong DC, a monster recognized twice), so it is the part worth testing
 * without a running Foundry instance.
 */

/** Xanathar's Guide to Everything "Monster Knowledge Checks" table, extended with Fey under
 *  Nature (not covered by that table, but consistent with the rest of the entry). */
export const TYPE_TO_SKILL = {
  aberration: "arc",
  construct: "arc",
  dragon: "arc",
  elemental: "arc",
  beast: "nat",
  plant: "nat",
  fey: "nat",
  undead: "rel",
  celestial: "rel",
  fiend: "rel",
  giant: "his",
  humanoid: "his",
  monstrosity: "his"
};

/**
 * Lowercases, trims and strips accents/punctuation so name matching is not derailed by
 * capitalization, extra whitespace or accented characters.
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Exact match only (name or alias, normalized) - a fuzzy score would produce unpredictable,
 * silent mismatches. A name that does not match proposes nothing rather than something wrong;
 * the GM corrects it once from the monster list panel and it stays corrected.
 * @param {string} name
 * @param {import("./monsters-data.js").MonsterEntry[]} [database]
 * @returns {import("./monsters-data.js").MonsterEntry|null}
 */
export function findMonsterByName(name, database = MONSTER_DATA) {
  const target = normalizeName(name);
  if (!target) return null;

  return database.find(entry => {
    if (normalizeName(entry.name) === target) return true;
    return entry.aliases.some(alias => normalizeName(alias) === target);
  }) ?? null;
}

/**
 * @param {string} type  dnd5e creature type key, e.g. "humanoid".
 * @returns {string|null}
 */
export function skillForType(type) {
  return TYPE_TO_SKILL[type] ?? null;
}

/**
 * DC = 10 + CR, rounded up: dnd5e CR is often fractional (1/8, 1/4, 1/2), and summing it into 10
 * directly would produce a non-integer DC. Rounding up keeps every sub-1 CR at DC 11 (CR 0 stays
 * at DC 10) instead of introducing a fine-grained threshold nobody would track at the table.
 * @param {number} cr
 * @returns {number}
 */
export function computeIdentificationDC(cr) {
  return 10 + Math.ceil(cr ?? 0);
}

/**
 * @typedef {"known"|"recognized"|"missed"} RecognitionOutcome
 *
 * @param {object} options
 * @param {boolean} options.alreadyKnown  This PC has already recognized this monster before.
 * @param {number} options.passive        The PC's passive score for the resolved skill.
 * @param {number} options.dc
 * @returns {RecognitionOutcome}
 */
export function evaluateRecognition({ alreadyKnown, passive, dc }) {
  if (alreadyKnown) return "known";
  return passive >= dc ? "recognized" : "missed";
}
