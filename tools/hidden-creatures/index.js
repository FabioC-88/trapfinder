import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";
import { HIDING_STATUS, collectCreatureDetectables, isHiddenCreature, tokenCenter } from "./sources.js";
import { registerMarkerGuard } from "./marker-guard.js";
import { registerSurprisePrompt } from "./surprise.js";

/**
 * Passive Perception against a hidden creature's passive Stealth.
 *
 * The comparison is symmetric, so it runs on both sides of a movement: a creature crawling toward
 * the party exposes itself exactly as much as the party walking toward it, and only checking the
 * PC's movement would miss half the real cases.
 */
export default {
  id: "hidden-creatures",
  titleKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The hooks below are attached once per page load, at "ready".
      requiresReload: true
    });

    game.settings.register(moduleId, SETTINGS.creatureDetectionRange, {
      name: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.name",
      hint: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 30
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      if (tokenDocument.actor?.type === "character") {
        const targets = scene.tokens.filter(isHiddenCreature);
        await detect({ observerToken: tokenDocument, targets, moduleId });
        return;
      }

      if (!isHiddenCreature(tokenDocument)) return;

      // The creature moved: re-check every PC against this one creature.
      for (const pcToken of scene.tokens) {
        if (pcToken.actor?.type !== "character") continue;
        await detect({ observerToken: pcToken, targets: [tokenDocument], moduleId });
      }
    });

    // A creature that stops hiding and hides again deserves a fresh chance against everyone,
    // so the record of who spotted it is wiped when the status comes off.
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has(HIDING_STATUS)) return;

      const actor = effect.parent;
      if (!(actor instanceof Actor)) return;

      const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
      for (const token of tokens) {
        await token?.unsetFlag(moduleId, FLAGS.detectedBy);
      }
    });

    registerMarkerGuard();
    registerSurprisePrompt(moduleId);
  }
};

/**
 * @param {object} options
 * @param {object} options.observerToken  TokenDocument of the observing PC.
 * @param {object[]} options.targets      TokenDocuments of hidden creatures.
 * @param {string} options.moduleId
 * @returns {Promise<void>}
 */
async function detect({ observerToken, targets, moduleId }) {
  const actor = observerToken.actor;
  if (!actor) return;

  const detectables = collectCreatureDetectables({ targets, actor, moduleId });
  if (!detectables.length) return;

  const observerCenter = tokenCenter(observerToken);

  await runDetection({
    observer: actor,
    detectables,
    measure: (point) => sceneDistance(observerCenter, point),
    isSightBlocked: (point) => isSightBlocked(observerCenter, point),
    report: ({ observer, detectable, spotted }) => reportDetection({
      moduleId, observer, detectable, spotted,
      toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
    })
  });
}
