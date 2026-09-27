import { libWrapper } from "../../lib/libwrapper-shim.js";
import { applyShare } from "./allocate.js";
import { getShare } from "./refresh.js";
import { CARRIER_TYPES } from "./stash.js";

/**
 * dnd5e computes encumbrance in this one static method, called as
 * `AttributesFields.prepareEncumbrance.call(this, rollData)` from CharacterData, NPCData and
 * VehicleData - so `this` is the actor's system data model, and replacing the static property
 * reaches every call. Verified identical in dnd5e 5.3.3 and 6.0.5.
 */
export const TARGET = "dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance";

/** @param {string} moduleId */
export function registerEncumbranceWrapper(moduleId) {
  libWrapper.register(moduleId, TARGET, function (wrapped, ...args) {
    // The native calculation always runs first and is never skipped.
    const result = wrapped(...args);
    try {
      const actor = this.parent;
      const encumbrance = this.attributes?.encumbrance;
      // A compendium copy is not a member of any Group and never becomes one until dropped into the
      // world, so it must stay exactly what dnd5e computed for it.
      if (CARRIER_TYPES.has(actor?.type) && encumbrance && !actor.pack) applyShare(encumbrance, getShare(actor.id));
    } catch (error) {
      console.error(`${moduleId} | Party Stash Encumbrance: share not applied`, error);
    }
    return result;
  }, "WRAPPER");
}
