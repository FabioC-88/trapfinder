import { FLAGS, SETTINGS } from "../../scripts/constants.js";

const OLD_TYPE = "trapfinder.trapDetection";
const NEW_TYPE = "trapfinder.passiveDetection";
const CURRENT_VERSION = 1;

/**
 * Converts behaviors of the pre-generalisation type to the new one.
 *
 * A document's type cannot be changed by an update, so each behavior is recreated and the old one
 * deleted. The version marker is written only after the whole pass succeeds: a partial run leaves
 * the marker untouched and simply retries next load, which is safer than recording a half-done
 * migration.
 *
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
export async function migrateTrapDetectionBehaviors(moduleId) {
  if (game.settings.get(moduleId, SETTINGS.migrationVersion) >= CURRENT_VERSION) return;
  if (game.user !== game.users.activeGM) return;

  let migrated = 0;

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

      await region.createEmbeddedDocuments("RegionBehavior", replacements);
      await region.deleteEmbeddedDocuments("RegionBehavior", outdated.map(b => b.id));
      migrated += outdated.length;
    }
  }

  await game.settings.set(moduleId, SETTINGS.migrationVersion, CURRENT_VERSION);

  if (migrated) {
    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.passiveDetection.migrated", { count: migrated })
    );
  }
}
