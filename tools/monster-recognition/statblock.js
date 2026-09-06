/**
 * Reads the mechanically useful half of a monster's identity straight off the placed actor.
 *
 * Why off the actor and not out of the bundled database: the actor is the monster the GM actually
 * placed. A reskinned troll that lost its regeneration, a homebrew dragon with an extra immunity,
 * a monster that is not in our database at all - all of them describe themselves correctly here,
 * and none of them would if these numbers were hardcoded next to the lore text. The database
 * keeps only what a stat block genuinely lacks: the lore.
 *
 * Deliberately pure - it reads plain paths off a plain object and returns raw dnd5e keys
 * ("fire", "darkvision"), never localized strings. Localization happens in chat.js, which is what
 * keeps this function testable without Foundry, CONFIG.DND5E or game.i18n.
 *
 * @typedef {object} StatblockSummary
 * @property {{key: string, value: number}[]} senses      e.g. [{key: "darkvision", value: 60}]
 * @property {string[]} specialSenses                     free-text senses set on the actor
 * @property {number|null} passivePerception
 * @property {string} sensesUnits
 * @property {{key: string, value: number}[]} movement    e.g. [{key: "fly", value: 60}]
 * @property {boolean} hover
 * @property {string} movementUnits
 * @property {string[]} languages
 * @property {string[]} resistances
 * @property {string[]} immunities
 * @property {string[]} vulnerabilities
 * @property {string[]} conditionImmunities
 * @property {string[]} traits                            feature names
 * @property {string[]} attacks                           weapon names
 */

const SENSE_KEYS = ["darkvision", "blindsight", "tremorsense", "truesight"];
const MOVEMENT_KEYS = ["walk", "fly", "swim", "climb", "burrow"];

/** dnd5e stores sub-1 CRs as decimals; players know them as the fractions on the stat block. */
const CR_FRACTIONS = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };

/**
 * @param {number} cr
 * @returns {string}
 */
export function formatCR(cr) {
  const value = Number(cr) || 0;
  return CR_FRACTIONS[value] ?? String(value);
}

/**
 * @param {object} actor  dnd5e Actor document (or any object with the same shape).
 * @returns {StatblockSummary}
 */
export function summarizeStatblock(actor) {
  const system = actor?.system ?? {};
  const senses = system.attributes?.senses ?? {};
  const movement = system.attributes?.movement ?? {};
  const traits = system.traits ?? {};

  const items = toArray(actor?.items);

  return {
    senses: SENSE_KEYS
      .map(key => ({ key, value: Number(senses[key]) || 0 }))
      .filter(sense => sense.value > 0),
    specialSenses: splitCustom(senses.special),
    passivePerception: Number(system.skills?.prc?.passive) || null,
    sensesUnits: senses.units ?? "",

    // Walking speed is dropped: every creature has one, so printing it crowds out the speeds
    // that actually change a tactical decision (it flies, it burrows, it swims).
    movement: MOVEMENT_KEYS
      .filter(key => key !== "walk")
      .map(key => ({ key, value: Number(movement[key]) || 0 }))
      .filter(speed => speed.value > 0),
    hover: Boolean(movement.hover),
    movementUnits: movement.units ?? "",

    languages: [...toKeys(traits.languages?.value), ...splitCustom(traits.languages?.custom)],

    resistances: damageEntries(traits.dr),
    immunities: damageEntries(traits.di),
    vulnerabilities: damageEntries(traits.dv),
    conditionImmunities: damageEntries(traits.ci),

    // Names only, no rules text: narrate.js turns the ones it recognizes into plain-language
    // sentences, and a trait's raw text is exactly the stat-block voice this message avoids.
    traits: items.filter(item => item?.type === "feat").map(item => item.name),
    attacks: items.filter(item => item?.type === "weapon").map(item => item.name)
  };
}

/** dnd5e stores these as a Set in v3+, an array in older data, and may add free text in `custom`. */
function damageEntries(trait) {
  return [...toKeys(trait?.value), ...splitCustom(trait?.custom)];
}

function toKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === "function") return [...value];
  return [];
}

/** dnd5e's `custom` fields are semicolon-separated free text. */
function splitCustom(custom) {
  if (typeof custom !== "string") return [];
  return custom.split(";").map(entry => entry.trim()).filter(Boolean);
}

function toArray(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items[Symbol.iterator] === "function") return [...items];
  return [];
}
