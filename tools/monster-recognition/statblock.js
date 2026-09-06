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
 * @property {{name: string, description: string}[]} traits  passive features, with their text
 * @property {string[]} actions                           attack/action names
 */

/**
 * Long enough for any SRD trait, short enough that one pathological homebrew feature cannot turn
 * the message into a page. Cut on a word boundary so it never ends mid-word.
 */
const TRAIT_TEXT_LIMIT = 300;

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

    // Traits carry their text, actions do not: "Regeneration" without "unless it takes fire or
    // acid damage" is the one detail a player actually needed, while spelling out every attack's
    // to-hit and damage would just reprint the sheet the GM already has open.
    traits: items.filter(isPassiveTrait).map(item => ({
      name: item.name,
      description: plainText(item.system?.description?.value)
    })),
    actions: items.filter(isAction).map(item => item.name)
  };
}

/**
 * dnd5e stores descriptions as HTML. Chat would render those tags, and enriched references
 * (@UUID, @Damage) would show as raw markup, so both are reduced to their plain text.
 * @param {string} html
 * @returns {string}
 */
export function plainText(html) {
  if (typeof html !== "string" || !html) return "";

  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    // Foundry enrichers: [[/damage 10]]{label} and @UUID[...]{label} - keep the label if there is
    // one, otherwise the inner reference, which still reads better than the raw markup.
    .replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[([^\]]*)\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= TRAIT_TEXT_LIMIT) return text;

  const cut = text.slice(0, TRAIT_TEXT_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * A feature with no activation cost is something the creature simply has (Regeneration, Pack
 * Tactics, Magic Resistance); one with an activation cost is something it does on its turn.
 * Both matter to a player, but they answer different questions, so they are listed apart.
 */
function isPassiveTrait(item) {
  if (item?.type !== "feat") return false;
  return !item.system?.activation?.type;
}

function isAction(item) {
  if (item?.type === "weapon") return true;
  if (item?.type !== "feat") return false;
  return Boolean(item.system?.activation?.type);
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
