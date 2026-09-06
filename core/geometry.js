/**
 * Geometry helpers for detection. The exported pure functions work in pixel space and know
 * nothing about Foundry, so they are unit-tested; the two wrappers at the bottom do touch
 * canvas globals and are verified in game instead.
 */

/**
 * Closest point to `point` on the segment a-b, clamped to the segment's ends.
 * @returns {{x: number, y: number}}
 */
export function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = (dx * dx) + (dy * dy);

  // Degenerate segment: both ends are the same point, so there is nothing to project onto.
  if (lengthSquared === 0) return { x: a.x, y: a.y };

  const t = Math.clamp((((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / lengthSquared, 0, 1);
  return { x: a.x + (t * dx), y: a.y + (t * dy) };
}

/**
 * Closest point to `point` inside an axis-aligned box (the point itself if already inside).
 * @returns {{x: number, y: number}}
 */
export function closestPointInBounds(point, bounds) {
  return {
    x: Math.clamp(point.x, bounds.left, bounds.right),
    y: Math.clamp(point.y, bounds.top, bounds.bottom)
  };
}

/**
 * Moves `point` toward `towards` by `distance` pixels.
 *
 * Exists for one specific problem: a secret door's target point lies ON a wall, so a sight test
 * aimed at it always collides with that very wall and nothing would ever be detected. Aiming
 * slightly short of the wall avoids the self-collision.
 *
 * @returns {{x: number, y: number}|null} null when `towards` is closer than `distance`, in which
 *   case there is no room to pull back and the caller should skip the sight test entirely - at
 *   that range the observer is against the wall anyway.
 */
export function pullBack(point, towards, distance) {
  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy);

  if (length <= distance) return null;

  return { x: point.x + ((dx / length) * distance), y: point.y + ((dy / length) * distance) };
}

/* -------------------------------------------- */
/*  Foundry-dependent wrappers                  */
/* -------------------------------------------- */

/**
 * Distance between two pixel points, in scene units.
 * @returns {number}
 */
export function sceneDistance(from, to) {
  return canvas.grid.measurePath([from, to]).distance;
}

/**
 * Whether a wall blocks sight between two pixel points.
 * Signature verified against the v14.365 API: mode "any" returns a boolean.
 * @returns {boolean}
 */
export function isSightBlocked(from, to) {
  return foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(from, to, {
    type: "sight",
    mode: "any"
  });
}
