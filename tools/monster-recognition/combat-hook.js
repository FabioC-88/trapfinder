import { SETTINGS } from "../../scripts/constants.js";
import { evaluateRecognition } from "./monster-database.js";
import { isRecognized, markRecognized, resolveMonsterProfile } from "./profile.js";
import { sendRecognitionResult } from "./chat.js";

/**
 * Checks every PC's knowledge against every hostile monster in the encounter, the moment combat
 * actually starts. Unlike the surprise proposal (which must land before initiative is rolled),
 * timing has no such constraint here, so this waits for the point the table has actually
 * committed to the fight rather than the earlier encounter-creation moment.
 *
 * Monsters are grouped by resolved identity first: five goblins in one encounter produce one
 * check per PC, not five identical messages.
 *
 * @param {string} moduleId
 */
export function registerCombatStartHook(moduleId) {
  Hooks.on("combatStart", async (combat) => {
    if (!game.user.isGM) return;

    const combatants = combat.combatants?.contents ?? [];

    const pcActors = uniqueActors(
      combatants.filter(c => c.actor?.type === "character").map(c => c.actor)
    );
    if (!pcActors.length) return;

    const monsterActors = combatants
      .filter(c => c.actor?.type === "npc" && c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE)
      .map(c => c.actor);
    if (!monsterActors.length) return;

    const profilesByKey = new Map();
    for (const actor of monsterActors) {
      const profile = resolveMonsterProfile(actor, moduleId);
      if (!profilesByKey.has(profile.key)) profilesByKey.set(profile.key, profile);
    }

    const toastEnabled = game.settings.get(moduleId, SETTINGS.screenAlert);

    for (const profile of profilesByKey.values()) {
      if (!profile.skill) {
        ui.notifications.warn(game.i18n.format(
          "DND5E_GM_TOOLKIT.monsterRecognition.unresolvedSkill", { name: profile.displayName }
        ));
        continue;
      }

      for (const pcActor of pcActors) {
        const alreadyKnown = isRecognized(pcActor, profile.key, moduleId);
        const passive = pcActor.system?.skills?.[profile.skill]?.passive ?? 0;
        const outcome = evaluateRecognition({ alreadyKnown, passive, dc: profile.dc });

        await sendRecognitionResult({ moduleId, pcActor, profile, outcome, toastEnabled });

        if (outcome === "recognized") await markRecognized(pcActor, profile.key, moduleId);
      }
    }
  });
}

/** @param {object[]} actors */
function uniqueActors(actors) {
  return [...new Map(actors.map(actor => [actor.id, actor])).values()];
}
