import { closestPointInBounds, closestPointOnSegment, pullBack } from "../../core/geometry.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

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

/**
 * Turns every secret door on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectSecretDoorDetectables({ scene, observerCenter, actor, moduleId }) {
  const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
  const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);
  const detectables = [];

  for (const wall of scene.walls) {
    if (wall.door !== CONST.WALL_DOOR_TYPES.SECRET) continue;

    const [x0, y0, x1, y1] = wall.c;
    const point = closestPointOnSegment(observerCenter, { x: x0, y: y0 }, { x: x1, y: y1 });

    // The target here IS a wall, so a sight ray aimed at it always collides with it and nothing
    // would ever be detected. Aim half a grid square short of the wall instead. When the observer
    // is closer than that there is no room to pull back - and at that range they are against the
    // wall anyway, so the sight test is simply skipped.
    const sightPoint = pullBack(point, observerCenter, canvas.grid.size / 2);
    const seen = wall.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

    detectables.push({
      key: wall.uuid,
      skill: "prc",
      dc: wall.getFlag(moduleId, FLAGS.dc) ?? defaultDC,
      point,
      sightPoint: sightPoint ?? point,
      range: wall.getFlag(moduleId, FLAGS.range) ?? defaultRange,
      message: wall.getFlag(moduleId, FLAGS.message) || null,
      spottedKey: "DND5E_GM_TOOLKIT.secretDoor.spotted",
      missedKey: "DND5E_GM_TOOLKIT.secretDoor.notSpotted",
      requiresSight: sightPoint !== null,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => wall.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
    });
  }

  return detectables;
}
