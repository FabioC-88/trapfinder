/**
 * What a Group's stash weighs and who may carry it.
 *
 * The functions at the top are pure and unit-tested. The adapters at the bottom read Foundry and
 * dnd5e globals, but only when called, so importing this file in a test is safe.
 */

const MODES = ["none", "equal", "available", "maximum"];

/** Actor types that can take a share. Vehicles have their own cargo, driven by dnd5e natively. */
export const CARRIER_TYPES = new Set(["character", "npc"]);

/**
 * The Group's flag with defaults, tolerant of hand-edited or partial data.
 * @param {object} [flag]
 * @returns {{mode: string, excluded: string[]}}
 */
export function readConfig(flag) {
  const mode = MODES.includes(flag?.mode) ? flag.mode : "none";
  const excluded = Array.isArray(flag?.excluded) ? flag.excluded.filter(id => typeof id === "string") : [];
  return { mode, excluded };
}

/**
 * Members that carry: characters and NPCs not excluded by the GM. Excluded ids of actors that
 * already left the Group simply match nothing.
 * @param {Array<object|null>} actors
 * @param {string[]} excluded
 * @returns {object[]}
 */
export function eligibleCarriers(actors, excluded) {
  return actors.filter(actor => actor && CARRIER_TYPES.has(actor.type) && !excluded.includes(actor.id));
}

/**
 * Weight of a stash, the way dnd5e weighs an actor's own inventory: top-level items only (a
 * container's total already includes its contents, and a bag of holding stays light), plus coins
 * when the currency-weight rule is on.
 *
 * @param {{items: Iterable<object>, currency: object}} stash
 * @param {{units: string, currencyWeight: boolean, currencyPerWeight: number}} options
 * @returns {number} Rounded to a tenth.
 */
export function stashWeight({ items, currency }, { units, currencyWeight, currencyPerWeight }) {
  let weight = 0;
  for (const item of items) {
    if (item.container) continue;
    const itemWeight = item.system?.totalWeightIn?.(units);
    if (Number.isFinite(itemWeight)) weight += itemWeight;
  }
  if (currencyWeight && currency) {
    const coins = Object.values(currency).reduce((total, amount) => total + Math.max(Number(amount) || 0, 0), 0);
    weight += coins / currencyPerWeight;
  }
  return Math.round(weight * 10) / 10;
}

/* -------------------------------------------- */
/*  Foundry adapters                            */
/* -------------------------------------------- */

/** The world's weight unit system and its default unit ("lb" or "kg"), as dnd5e picks them. */
function worldUnits() {
  const system = game.settings.get("dnd5e", "metricWeightUnits") ? "metric" : "imperial";
  return { system, units: CONFIG.DND5E.encumbrance.baseUnits.default[system] };
}

/**
 * A Group's stash weight in the same units dnd5e uses for PCs and NPCs.
 * @param {Actor} group
 * @returns {number}
 */
export function groupStashWeight(group) {
  const { system, units } = worldUnits();
  return stashWeight({ items: group.items, currency: group.system.currency }, {
    units,
    currencyWeight: game.settings.get("dnd5e", "currencyWeight"),
    currencyPerWeight: CONFIG.DND5E.encumbrance.currencyPerWeight[system]
  });
}

/** Localized abbreviation of the world's weight unit (dnd5e pre-localizes it). */
export function unitsLabel() {
  const { units } = worldUnits();
  return CONFIG.DND5E.weightUnits[units]?.abbreviation ?? units;
}

/** A weight formatted for the current language, with at most one decimal. */
export function formatWeight(value) {
  return Number(value).toLocaleString(game.i18n.lang, { maximumFractionDigits: 1 });
}
