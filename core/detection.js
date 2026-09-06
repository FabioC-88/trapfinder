/**
 * The one decision this module makes, for every kind of subject: has this observer already
 * resolved this target, is it close enough, can it be seen, and does the observer's passive
 * skill meet the DC.
 *
 * Deliberately free of Foundry globals: distance, line of sight, persistence and messaging all
 * enter as callbacks. That is what makes it unit-testable, and what lets a new kind of subject
 * ship as a new source with no change here.
 *
 * @typedef {object} Detectable
 * @property {string} key            Stable identity of the target, for debugging.
 * @property {string} skill          dnd5e skill key read on the observer, e.g. "prc" or "inv".
 * @property {number} dc             Passive value the observer must meet or beat.
 * @property {{x: number, y: number}} point       Measured against for range.
 * @property {{x: number, y: number}} sightPoint  Measured against for line of sight.
 * @property {number} range          In scene units.
 * @property {string|null} message   Custom text, used on success only.
 * @property {string} spottedKey     i18n key used on success when there is no custom message.
 * @property {string} missedKey      i18n key used on failure, always.
 * @property {boolean} requiresSight
 * @property {() => boolean} hasSeen
 * @property {() => Promise<void>} markSeen
 *
 * @typedef {object} DetectionResult
 * @property {object} observer
 * @property {Detectable} detectable
 * @property {number} passive
 * @property {boolean} spotted
 */

/**
 * @param {object} options
 * @param {object} options.observer                                Actor of the observing PC.
 * @param {Detectable[]} options.detectables
 * @param {(point: {x: number, y: number}) => number} options.measure          Scene-unit distance.
 * @param {(point: {x: number, y: number}) => boolean} options.isSightBlocked
 * @param {(result: DetectionResult) => Promise<void>} options.report
 * @returns {Promise<DetectionResult[]>}
 */
export async function runDetection({ observer, detectables, measure, isSightBlocked, report }) {
  const results = [];

  for (const detectable of detectables) {
    if (detectable.hasSeen()) continue;
    if (measure(detectable.point) > detectable.range) continue;
    if (detectable.requiresSight && isSightBlocked(detectable.sightPoint)) continue;

    const passive = observer.system?.skills?.[detectable.skill]?.passive ?? 0;
    const result = { observer, detectable, passive, spotted: passive >= detectable.dc };

    await report(result);
    // Marked even on a failure: the PC has had their chance at this target and a second
    // notification would only tell the GM the same thing again.
    await detectable.markSeen();
    results.push(result);
  }

  return results;
}
