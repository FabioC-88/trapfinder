import { FLAGS, SETTINGS } from "../../scripts/constants.js";

const OLD_TYPE = "trapfinder.trapDetection";
const NEW_TYPE = "trapfinder.passiveDetection";
const CURRENT_VERSION = 1;

/**
 * Converts behaviors of the pre-generalisation type to the new one.
 *
 * A document's type cannot be changed by an update, so each behavior is recreated and the old one
 * deleted. That create+delete pair is not atomic, so it is isolated per region in its own
 * try/catch: a region that fails partway (e.g. create succeeds, delete fails) is logged and
 * skipped rather than aborting the whole pass. The version marker is written only if every
 * region succeeded - a partial run leaves it untouched, so the whole scan retries next load.
 * Regions that already succeeded simply no-op on that retry, since their old-type behaviors are
 * already gone and the `outdated` filter below finds nothing left to convert for them.
 *
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
export async function migrateTrapDetectionBehaviors(moduleId) {
  if (game.settings.get(moduleId, SETTINGS.migrationVersion) >= CURRENT_VERSION) return;
  if (game.user !== game.users.activeGM) return;

  let migrated = 0;
  let failed = 0;

  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      const outdated = region.behaviors.filter(b => b.type === OLD_TYPE);
      if (!outdated.length) continue;

      const replacements = outdated.map(behavior => ({
        name: behavior.name,
        type: NEW_TYPE,
        disabled: behavior.disabled,
        system: {
          skill: "prc",
          dc: behavior._source.system.dc,
          range: behavior._source.system.range,
          message: "",
          requiresSight: true
        },
        flags: {
          [moduleId]: {
            [FLAGS.notifiedActorIds]: behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? []
          }
        }
      }));

      try {
        await region.createEmbeddedDocuments("RegionBehavior", replacements);
        await region.deleteEmbeddedDocuments("RegionBehavior", outdated.map(b => b.id));
        migrated += outdated.length;
      } catch (err) {
        failed++;
        console.error(
          `${moduleId} | Passive Detection migration failed for region "${region.name}" ` +
          `(${region.id}) on scene "${scene.name}" (${scene.id})`,
          err
        );
      }
    }
  }

  if (migrated || failed) {
    const parts = [];
    if (migrated) {
      parts.push(game.i18n.format("DND5E_GM_TOOLKIT.passiveDetection.migrated", { count: migrated }));
    }
    if (failed) {
      parts.push(game.i18n.format("DND5E_GM_TOOLKIT.passiveDetection.migrationFailed", { count: failed }));
    }

    const message = parts.join(" ");
    if (failed) {
      ui.notifications.warn(message);
    } else {
      ui.notifications.info(message);
    }
  }

  // Written only when every region succeeded: see the isolation rationale above.
  if (!failed) {
    await game.settings.set(moduleId, SETTINGS.migrationVersion, CURRENT_VERSION);
  }
}
