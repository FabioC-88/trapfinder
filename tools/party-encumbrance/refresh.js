import { FLAGS } from "../../scripts/constants.js";
import { allocate, changedIds, mergeShares } from "./allocate.js";
import { CARRIER_TYPES, eligibleCarriers, groupStashWeight, readConfig } from "./stash.js";

/**
 * Current share of every carrier, keyed by actor id. The encumbrance wrapper only ever reads this:
 * computing shares there would depend on the order in which Foundry prepares actors at startup.
 * @type {Map<string, import("./allocate.js").ShareEntry>}
 */
let shares = new Map();

/** Settings of dnd5e that change how much the stash or a carrier weighs. */
const DND5E_SETTINGS = new Set(["dnd5e.currencyWeight", "dnd5e.metricWeightUnits", "dnd5e.encumbrance"]);

/** Document events that can change a stash, a carrier's own weight or capacity, or a Group's flag. */
const DOCUMENT_HOOKS = [
  "createItem", "updateItem", "deleteItem",
  "updateActor", "deleteActor",
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"
];

/**
 * @param {string} actorId
 * @returns {import("./allocate.js").ShareEntry|undefined}
 */
export function getShare(actorId) {
  return shares.get(actorId);
}

/**
 * Recomputes every active Group's shares and re-prepares only the actors whose share changed.
 * @param {string} moduleId
 */
export function recompute(moduleId) {
  const groups = game.actors.filter(actor => actor.type === "group");
  const sources = [];

  for (const group of groups) {
    try {
      const config = readConfig(group.getFlag(moduleId, FLAGS.partyEncumbrance));
      if (config.mode === "none") continue;

      const carriers = eligibleCarriers(group.system.members.map(member => member.actor), config.excluded)
        .map(actor => {
          const encumbrance = actor.system.attributes?.encumbrance;
          if (!encumbrance) return null;
          // stash.own is the weight without any share; before the first wrapped preparation it does
          // not exist yet, and value is still the native, share-free number.
          return { id: actor.id, own: encumbrance.stash?.own ?? encumbrance.value, max: encumbrance.max };
        })
        .filter(Boolean);

      sources.push({
        groupId: group.id,
        groupName: group.name,
        shares: allocate(groupStashWeight(group), carriers, config.mode)
      });
    } catch (error) {
      console.error(`${moduleId} | Party Stash Encumbrance: skipped group "${group.name}"`, error);
    }
  }

  const next = mergeShares(sources);
  const changed = changedIds(shares, next);
  shares = next;

  if (changed.size) {
    // dnd5e also registers the Group sheet as an app of each of its members, so collecting the
    // distinct apps here (instead of actor.render()/group.render(), which would each re-render
    // every open Group sheet on their own) renders every open sheet exactly once.
    const apps = new Set();
    for (const id of changed) {
      const actor = game.actors.get(id);
      if (!actor) continue;
      actor.reset();
      for (const app of Object.values(actor.apps)) apps.add(app);
    }
    for (const group of groups) {
      for (const app of Object.values(group.apps)) apps.add(app);
    }
    for (const app of apps) app.render(false);
  }

  // One writer only: every client computes the same shares, but the status effect is a document.
  if (game.users.activeGM?.isSelf) reconcileStatuses(reconcileIds(changed), moduleId);
}

/**
 * Ids to check the status effect for: every actor whose share just appeared, disappeared or
 * changed; every actor with a share right now; and every carrier still holding dnd5e's encumbrance
 * effect regardless of its share, so a status left over from a stash change nobody was the active
 * GM for (or from a race with another client's native updateEncumbrance call) gets reconciled too.
 * @param {Set<string>} changed
 * @returns {Set<string>}
 */
function reconcileIds(changed) {
  const ids = new Set(changed);
  for (const id of shares.keys()) ids.add(id);

  const effectId = CONFIG.ActiveEffect?.documentClass?.ID?.ENCUMBERED;
  if (effectId) {
    for (const actor of game.actors) {
      if (CARRIER_TYPES.has(actor.type) && actor.effects.get(effectId)) ids.add(actor.id);
    }
  }
  return ids;
}

/**
 * Makes each actor's status effect match what this client just computed for it. Safe to call for
 * an actor whose share did not change: updateEncumbrance() is idempotent (an identical update is
 * diffed away, a delete only runs when the effect exists, a create only when it is missing), so
 * this can never loop back into another recompute.
 * @param {Iterable<string>} actorIds
 * @param {string} moduleId
 */
function reconcileStatuses(actorIds, moduleId) {
  for (const id of actorIds) {
    const actor = game.actors.get(id);
    if (!actor || !CARRIER_TYPES.has(actor.type)) continue;
    Promise.resolve(actor.updateEncumbrance?.({})).catch(error => {
      // Another client created the same effect id first; the loser's create is expected to fail.
      if (/duplicate|already exists/i.test(error?.message ?? "")) {
        console.debug(`${moduleId} | Party Stash Encumbrance: status already created for "${actor.name}"`, error);
      } else {
        console.error(`${moduleId} | Party Stash Encumbrance: status not updated for "${actor.name}"`, error);
      }
    });
  }
}

/**
 * Empties the share cache and puts every actor that had a share back to native. Called when the
 * tool's setting is switched off: the wrapper and hooks stay installed until the reload, but an
 * empty cache makes the wrapper apply no share, so this alone is enough to go back to native.
 * @param {string} moduleId
 */
export function clearShares(moduleId) {
  const hadShare = [...shares.keys()];
  shares = new Map();

  const apps = new Set();
  for (const id of hadShare) {
    const actor = game.actors.get(id);
    if (!actor) continue;
    actor.reset();
    for (const app of Object.values(actor.apps)) apps.add(app);
  }
  for (const app of apps) app.render(false);

  if (game.users.activeGM?.isSelf) reconcileStatuses(hadShare, moduleId);
}

/**
 * Recomputes once now, then on every event that can change a share. Debounced, because dropping a
 * stack of loot fires several events in a row. No loops: actor.reset() fires no hooks, and the
 * status effect written by updateEncumbrance() triggers a recompute that finds the same shares.
 * @param {string} moduleId
 */
export function registerRefreshHooks(moduleId) {
  const schedule = foundry.utils.debounce(() => recompute(moduleId), 100);
  for (const hook of DOCUMENT_HOOKS) Hooks.on(hook, schedule);
  Hooks.on("updateSetting", setting => {
    if (DND5E_SETTINGS.has(setting.key)) schedule();
  });
  recompute(moduleId);
}
