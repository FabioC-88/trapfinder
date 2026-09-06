import { detectionRecipients } from "../../core/recipients.js";

const TOAST_ACTION = "toast";

/**
 * Sends the outcome of a recognition check to chat, following the same asymmetry as the rest of
 * the module: a success (first time or already known) reaches the PC's owners and the GM, a miss
 * reaches only the GM. Reuses core/recipients.js and the toast socket channel already registered
 * unconditionally by core/notify.js - nothing new to wire up.
 *
 * @param {object} options
 * @param {string} options.moduleId
 * @param {object} options.pcActor
 * @param {import("./profile.js").MonsterProfile} options.profile
 * @param {import("./monster-database.js").RecognitionOutcome} options.outcome
 * @param {boolean} options.toastEnabled
 * @param {"passive"|"active"} [options.checkMode]  Which wording to use - a passive check never
 *   mentions a roll, an active one is the result of a check the player asked to make.
 * @returns {Promise<void>}
 */
export async function sendRecognitionResult({ moduleId, pcActor, profile, outcome, toastEnabled, checkMode = "passive" }) {
  const spotted = outcome !== "missed";
  const { chat, toast } = detectionRecipients({
    actor: pcActor, spotted, users: game.users.contents, toastEnabled
  });

  const content = outcome === "missed"
    ? missedText({ pcActor, profile, checkMode })
    : outcome === "known"
      ? knownText({ profile })
      : recognizedText({ pcActor, profile, checkMode });

  await ChatMessage.create({ content, whisper: chat });

  if (toast.length) {
    const text = game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.toast", { name: profile.displayName });
    game.socket.emit(`module.${moduleId}`, { action: TOAST_ACTION, userIds: toast, text });
  }
}

function recognizedText({ pcActor, profile, checkMode }) {
  const skillLabel = skillLabelFor(profile.skill);
  const body = profile.description
    ?? game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.noDescription");
  const key = checkMode === "active"
    ? "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByActive"
    : "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByPassive";

  return `
    <p><strong>${foundry.utils.escapeHTML(profile.displayName)}</strong></p>
    <p>${foundry.utils.escapeHTML(body)}</p>
    <p class="hint">${game.i18n.format(key, { name: pcActor.name, skill: skillLabel, dc: profile.dc })}</p>
  `;
}

function knownText({ profile }) {
  const body = profile.description
    ?? game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.noDescription");
  const summary = game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.alreadyKnown", {
    name: profile.displayName
  });

  return `
    <details>
      <summary>${foundry.utils.escapeHTML(summary)}</summary>
      <p>${foundry.utils.escapeHTML(body)}</p>
    </details>
  `;
}

function missedText({ pcActor, profile, checkMode }) {
  const skillLabel = skillLabelFor(profile.skill);
  const key = checkMode === "active"
    ? "DND5E_GM_TOOLKIT.monsterRecognition.missedActive"
    : "DND5E_GM_TOOLKIT.monsterRecognition.missedPassive";

  return `<p>${game.i18n.format(key, {
    name: pcActor.name, monster: profile.displayName, skill: skillLabel, dc: profile.dc
  })}</p>`;
}

/**
 * Own translation strings rather than reaching into dnd5e's skill labels, same convention as
 * passive-detection's skill choices: keeps this module decoupled from the host system's i18n keys.
 * Exported: active-check.js also needs it, for the roll's flavor text.
 * @param {string|null} skill
 * @returns {string}
 */
export function skillLabelFor(skill) {
  if (!skill) return "";
  return game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.skills.${skill}`);
}
