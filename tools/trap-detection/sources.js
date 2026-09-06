import { closestPointInBounds } from "../../core/geometry.js";
import { FLAGS } from "../../scripts/constants.js";

/**
 * Turns every enabled detection behavior on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor      Actor of the observing PC.
 * @param {string} options.moduleId
 * @param {string} options.typeId     RegionBehavior type to collect.
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectRegionDetectables({ scene, observerCenter, actor, moduleId, typeId }) {
  const detectables = [];

  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== typeId) continue;
      if (behavior.disabled) continue;

      // Bounding-box approximation, not exact-shape distance: no built-in or third-party
      // reference for exact point-to-arbitrary-region-shape distance was found, and the extra
      // margin near the corners of an ellipse or polygon is a few feet at most - fine for a
      // detection buffer.
      const point = closestPointInBounds(observerCenter, region.bounds);
      const seen = behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

      detectables.push({
        key: behavior.uuid,
        skill: behavior.system.skill,
        dc: behavior.system.dc,
        point,
        sightPoint: point,
        range: behavior.system.range,
        message: behavior.system.message || null,
        spottedKey: "DND5E_GM_TOOLKIT.passiveDetection.spotted",
        missedKey: "DND5E_GM_TOOLKIT.passiveDetection.notSpotted",
        requiresSight: behavior.system.requiresSight,
        hasSeen: () => seen.includes(actor.id),
        markSeen: () => behavior.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
      });
    }
  }

  return detectables;
}
