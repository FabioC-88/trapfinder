import { FLAGS } from "../../scripts/constants.js";
import { isHiddenCreature } from "./sources.js";

const SURPRISED_STATUS = "surprised";

/**
 * Offers to mark as surprised every PC that failed to notice an ambusher.
 *
 * Timed on encounter creation, not on combat start: dnd5e reads statuses when initiative is
 * rolled (CONFIG.DND5E.conditionEffects.initiativeDisadvantage), and Foundry's usual flow rolls
 * initiative before "Begin Combat" is pressed. Applying the status at combatStart would therefore
 * be too late to grant the disadvantage, which is the whole point of applying it.
 *
 * At encounter creation the combatant list may still be empty, so the proposal is built from
 * scene state - which is the same record the detection already keeps.
 *
 * Nothing is applied without confirmation: the module cannot know whether the fight actually
 * started from the ambush or whether the party was alerted some other way.
 *
 * @param {string} moduleId
 */
export function registerSurprisePrompt(moduleId) {
  Hooks.on("createCombat", async (combat, options, userId) => {
    if (!game.user.isGM) return;
    if (game.user.id !== userId) return;

    const scene = combat.scene ?? canvas.scene;
    if (!scene) return;

    const ambushers = scene.tokens.filter(isHiddenCreature);
    if (!ambushers.length) return;

    const candidates = scene.tokens.filter(token => {
      if (token.actor?.type !== "character") return false;
      return ambushers.some(ambusher => {
        const detectedBy = ambusher.getFlag(moduleId, FLAGS.detectedBy) ?? [];
        return !detectedBy.includes(token.actor.id);
      });
    });
    if (!candidates.length) return;

    const chosen = await promptForSurprised(candidates);
    if (!chosen?.length) return;

    for (const token of candidates) {
      if (!chosen.includes(token.id)) continue;
      await token.actor.toggleStatusEffect(SURPRISED_STATUS, { active: true });
    }
  });
}

/**
 * @param {object[]} candidates  TokenDocuments of PCs that missed at least one ambusher.
 * @returns {Promise<string[]|null>} chosen token ids, or null if dismissed
 */
async function promptForSurprised(candidates) {
  const rows = candidates.map(token => `
    <div class="form-group">
      <label>
        <input type="checkbox" name="${token.id}" checked>
        ${foundry.utils.escapeHTML(token.name)}
      </label>
    </div>
  `).join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.title") },
    content: `<p>${game.i18n.localize("DND5E_GM_TOOLKIT.surprise.hint")}</p>${rows}`,
    ok: {
      label: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.confirm"),
      callback: (_event, button) => candidates
        .filter(token => button.form.elements[token.id]?.checked)
        .map(token => token.id)
    },
    rejectClose: false
  });
}
