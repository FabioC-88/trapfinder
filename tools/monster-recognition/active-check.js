import { SETTINGS } from "../../scripts/constants.js";
import { evaluateRecognition } from "./monster-database.js";
import { isRecognized, markRecognized, resolveMonsterProfile } from "./profile.js";
import { sendRecognitionResult, skillLabelFor } from "./chat.js";

const BUTTON_CLASS = "trapfinder-active-knowledge";

/**
 * Adds a Token HUD button on every NPC token that rolls an *active* knowledge check for the
 * currently controlled/selected PC - the counterpart to the passive, no-dice check the module
 * otherwise always runs. Deliberately not gated by hostile disposition like combat-hook.js: this
 * is a deliberate action a player asks for, not an automatic sweep, so any NPC token is fair game.
 *
 * Unverified against a live Foundry v14 instance, like the rest of this module's UI injections.
 * Foundry's TokenHUD has historically stayed on the legacy (jQuery) Application, not
 * ApplicationV2, unlike the sheets this module already injects into - `toElement` below copes
 * with either shape, and `.col.left` is a guess at the current template's class name that needs
 * a smoke test. If the icon never appears, that selector is the first thing to check.
 *
 * @param {string} moduleId
 */
export function registerActiveCheckButton(moduleId) {
  Hooks.on("renderTokenHUD", (hud, html) => {
    if (!game.user.isGM) return;

    const actor = hud.object?.actor;
    if (actor?.type !== "npc") return;

    const root = toElement(html);
    if (!root || root.querySelector(`.${BUTTON_CLASS}`)) return;

    const container = root.querySelector(".col.left") ?? root;
    const icon = document.createElement("div");
    icon.className = `control-icon ${BUTTON_CLASS}`;
    icon.title = game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.activeCheck.buttonTitle");
    icon.innerHTML = `<i class="fa-solid fa-book"></i>`;
    icon.addEventListener("click", (event) => {
      event.preventDefault();
      attemptActiveCheck(actor, moduleId);
    });

    container.appendChild(icon);
  });
}

function toElement(html) {
  if (html instanceof HTMLElement) return html;
  return html?.[0] ?? null;
}

async function attemptActiveCheck(monsterActor, moduleId) {
  const pcActor = canvas.tokens.controlled[0]?.actor;
  if (pcActor?.type !== "character") {
    ui.notifications.warn(game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.activeCheck.noActor"));
    return;
  }

  const profile = resolveMonsterProfile(monsterActor, moduleId);
  const toastEnabled = game.settings.get(moduleId, SETTINGS.screenAlert);

  // Already known: no need to spend a roll re-learning what the character already knows.
  if (isRecognized(pcActor, profile.key, moduleId)) {
    await sendRecognitionResult({ moduleId, pcActor, profile, outcome: "known", toastEnabled });
    return;
  }

  if (!profile.skill) {
    ui.notifications.warn(game.i18n.format(
      "DND5E_GM_TOOLKIT.monsterRecognition.unresolvedSkill", { name: profile.displayName }
    ));
    return;
  }

  // Same rollX(config, dialog, message) shape already verified for rollToolCheck in
  // tools/lockpicking/door-control-wrapper.js - dnd5e 4.x's roll methods share this signature.
  // The DC is never put in the flavor text: it would spoil the check before it is rolled.
  const flavor = game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.activeCheck.flavor", {
    skill: skillLabelFor(profile.skill)
  });
  const rolls = await pcActor.rollSkill({ skill: profile.skill }, {}, { data: { flavor } });
  if (!rolls?.length) return; // roll dialog was cancelled

  const outcome = evaluateRecognition({ alreadyKnown: false, passive: rolls[0].total, dc: profile.dc });

  await sendRecognitionResult({ moduleId, pcActor, profile, outcome, toastEnabled, checkMode: "active" });
  if (outcome === "recognized") await markRecognized(pcActor, profile.key, moduleId);
}
