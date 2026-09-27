/**
 * The share math of the party stash, free of Foundry globals so it can be unit-tested.
 *
 * @typedef {object} Carrier
 * @property {string} id     Actor id.
 * @property {number} own    Weight the actor carries on its own, without any stash share.
 * @property {number} max    The actor's maximum carrying capacity.
 *
 * @typedef {object} ShareEntry
 * @property {number} total  Sum of the actor's shares across every active Group.
 * @property {{groupId: string, groupName: string, share: number}[]} bySource
 */

const MODES = new Set(["equal", "available", "maximum"]);

/** dnd5e rounds carried weight to a tenth (toNearest(0.1)); toNearest does not exist outside Foundry. */
const round = value => Math.round(value * 10) / 10;

/** A capacity that is not a finite number would turn every share into NaN: count it as none. */
const capacity = carrier => (Number.isFinite(carrier.max) ? Math.max(0, carrier.max) : 0);

/**
 * How much of the stash each carrier takes.
 * @param {number} weight
 * @param {Carrier[]} carriers
 * @param {string} mode       "equal", "available" or "maximum"; anything else distributes nothing.
 * @returns {Map<string, number>}
 */
export function allocate(weight, carriers, mode) {
  const shares = new Map();
  if (!(weight > 0) || !carriers.length || !MODES.has(mode)) return shares;

  const weights = weightsFor(carriers, mode);
  const sum = weights.reduce((total, w) => total + w, 0);
  carriers.forEach((carrier, i) => shares.set(carrier.id, round((weight * weights[i]) / sum)));
  return shares;
}

/**
 * Relative weights for each carrier. Each mode falls back to the next when every weight is zero,
 * so the stash never divides by zero and never silently vanishes: a party where everybody is full
 * goes over capacity proportionally, which is what really happens to an overloaded party.
 */
function weightsFor(carriers, mode) {
  if (mode === "available") {
    // A non-finite own weight (odd data) would turn `capacity - own` into NaN for that carrier,
    // and NaN in one weight makes the whole sum NaN: count it as no weight of its own instead.
    const room = carriers.map(carrier =>
      Math.max(0, capacity(carrier) - (Number.isFinite(carrier.own) ? carrier.own : 0)));
    if (room.some(r => r > 0)) return room;
    mode = "maximum";
  }
  if (mode === "maximum") {
    const max = carriers.map(capacity);
    if (max.some(m => m > 0)) return max;
  }
  return carriers.map(() => 1);
}

/**
 * Sums each actor's shares across Groups, keeping where each one comes from for the tooltip.
 * @param {{groupId: string, groupName: string, shares: Map<string, number>}[]} sources
 * @returns {Map<string, ShareEntry>}
 */
export function mergeShares(sources) {
  const merged = new Map();
  for (const { groupId, groupName, shares } of sources) {
    for (const [actorId, share] of shares) {
      if (!(share > 0)) continue;
      const entry = merged.get(actorId) ?? { total: 0, bySource: [] };
      entry.total = round(entry.total + share);
      entry.bySource.push({ groupId, groupName, share });
      merged.set(actorId, entry);
    }
  }
  return merged;
}

/**
 * Actors whose share entry differs between two maps, including ones that gained or lost it.
 * @param {Map<string, ShareEntry>} before
 * @param {Map<string, ShareEntry>} after
 * @returns {Set<string>}
 */
export function changedIds(before, after) {
  const changed = new Set();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) changed.add(id);
  }
  return changed;
}

/**
 * Adds an actor's stash share to the encumbrance dnd5e just computed.
 *
 * The own weight is always recorded, share or not: refresh.js reads it back for "available
 * capacity" mode, which must measure room without the share already in it. `encumbered` is left
 * alone on purpose: dnd5e computes it against a property that does not exist, so it is always
 * false, and nothing reads it - statuses come from updateEncumbrance(), which reads `value`.
 *
 * @param {object} encumbrance         The actor's system.attributes.encumbrance, mutated in place.
 * @param {ShareEntry} [entry]
 * @returns {object} The same encumbrance object.
 */
export function applyShare(encumbrance, entry) {
  const own = encumbrance.value;
  encumbrance.stash = { own, share: 0, bySource: [] };
  if (!(entry?.total > 0)) return encumbrance;

  encumbrance.value = round(own + entry.total);
  const pct = (encumbrance.value * 100) / encumbrance.max;
  encumbrance.pct = Number.isNaN(pct) ? 0 : Math.min(Math.max(pct, 0), 100);
  encumbrance.stash.share = entry.total;
  encumbrance.stash.bySource = entry.bySource;
  return encumbrance;
}
