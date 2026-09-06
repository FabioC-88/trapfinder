import { FLAGS, SETTINGS } from "../../scripts/constants.js";

export const HIDING_STATUS = "hiding";

/**
 * Centre of a token in pixel space.
 * @returns {{x: number, y: number}}
 */
export function tokenCenter(tokenDocument) {
  const gridSize = tokenDocument.parent.grid.size;
  return {
    x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
    y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
  };
}

/**
 * Both markers are required. `hidden` alone would catch tokens a GM hides for staging reasons
 * (NPCs not yet in play, scenery); the `hiding` status alone would catch creatures the players
 * can already see. See tools/hidden-creatures/marker-guard.js for the safety net that stops a
 * forgotten marker from failing silently.
 * @returns {boolean}
 */
export function isHiddenCreature(tokenDocument) {
  return tokenDocument.hidden === true
    && tokenDocument.actor?.statuses?.has(HIDING_STATUS) === true;
}

/**
 * Turns hidden creatures into detectables for one observing PC.
 *
 * The DC is the creature's passive Stealth, read live: no stored roll, so nothing to keep in
 * sync and no dialog to interrupt anyone.
 *
 * @param {object} options
 * @param {object[]} options.targets   TokenDocuments already known to be hidden creatures.
 * @param {object} options.actor       Actor of the observing PC.
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectCreatureDetectables({ targets, actor, moduleId }) {
  const range = game.settings.get(moduleId, SETTINGS.creatureDetectionRange);

  return targets.map(token => {
    const point = tokenCenter(token);
    const seen = token.getFlag(moduleId, FLAGS.detectedBy) ?? [];

    return {
      key: token.uuid,
      skill: "prc",
      dc: token.actor.system.skills?.ste?.passive ?? 0,
      point,
      sightPoint: point,
      range,
      message: null,
      spottedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.spotted",
      missedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.notSpotted",
      requiresSight: true,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => token.setFlag(moduleId, FLAGS.detectedBy, [...seen, actor.id])
    };
  });
}
