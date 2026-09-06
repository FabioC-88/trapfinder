import { detectionRecipients } from "../../core/recipients.js";
import { joinList, narrativeBeats } from "./narrate.js";

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

/**
 * The closing line says why the character knows this, not which skill was compared against which
 * DC. The numbers are the GM's business, and they only appear in the miss, which only the GM sees.
 */
function recognizedText({ pcActor, profile, checkMode }) {
  const key = checkMode === "active"
    ? "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByActive"
    : "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByPassive";

  const reason = profile.skill
    ? game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.card.prose.reason.${profile.skill}`)
    : "";

  return `
    ${monsterCard(profile)}
    <p class="hint">${game.i18n.format(key, { name: pcActor.name, reason }).replace(/\s+/g, " ").trim()}</p>
  `;
}

function knownText({ profile }) {
  const summary = game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.alreadyKnown", {
    name: profile.displayName
  });

  return `
    <details>
      <summary>${foundry.utils.escapeHTML(summary)}</summary>
      ${monsterCard(profile)}
    </details>
  `;
}

/**
 * What the character recalls, written the way they would say it: the lore, then everything the
 * actor itself knows about the creature turned into plain sentences. No numbers, no skill names,
 * no rules terms - a stat block is what the GM has open, not what a memory sounds like.
 *
 * The lore comes from the database (or the GM's own text); every other sentence is derived live
 * from the actor, so it stays true for a monster that was reskinned, homebrewed, or never in the
 * database at all.
 */
function monsterCard(profile) {
  const lore = profile.description
    ?? game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.noDescription");

  const sentences = narrativeBeats(profile).map(beat => sentenceFor(beat)).filter(Boolean);

  return `
    <p><strong>${foundry.utils.escapeHTML(profile.displayName)}</strong></p>
    <p>${foundry.utils.escapeHTML(lore)}</p>
    ${sentences.length ? `<p>${foundry.utils.escapeHTML(sentences.join(" "))}</p>` : ""}
  `;
}

/** @param {import("./narrate.js").NarrativeBeat} beat */
function sentenceFor(beat) {
  const key = `DND5E_GM_TOOLKIT.monsterRecognition.card.prose.${beat.key}`;

  if (beat.type) {
    return game.i18n.format(key, {
      type: proseLabel("type", beat.type),
      size: proseLabel("size", beat.size)
    });
  }

  if (beat.list) return game.i18n.format(key, { list: localizedList(beat) });

  return game.i18n.localize(key);
}

/**
 * Creature types and sizes are written out in this module's own translations rather than taken
 * from CONFIG.DND5E: a sentence needs "un gigante"/"una bestia" with the right article, which a
 * bare label cannot give.
 */
function proseLabel(group, key) {
  if (!key) return "";
  return game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.card.prose.${group}.${key}`);
}

function localizedList(beat) {
  const config = LIST_CONFIG[beat.key]?.() ?? null;
  const values = beat.list.map(entry => (config ? configLabel(config, entry) || entry : entry));

  const conjunction = game.i18n.localize(
    `DND5E_GM_TOOLKIT.monsterRecognition.card.prose.${beat.key === "conditionImmunities" ? "or" : "and"}`
  );

  return joinList(beat.key === "attacks" ? values.map(value => value.toLowerCase()) : values, conjunction);
}

/** Read lazily: CONFIG.DND5E is not populated at import time. */
const LIST_CONFIG = {
  immunities: () => CONFIG.DND5E?.damageTypes,
  resistances: () => CONFIG.DND5E?.damageTypes,
  vulnerabilities: () => CONFIG.DND5E?.damageTypes,
  conditionImmunities: () => CONFIG.DND5E?.conditionTypes,
  languages: () => CONFIG.DND5E?.languages
};

/**
 * dnd5e has shipped these config entries as plain strings, as `{label}` objects, and (for
 * languages in v4) as a tree of `{children}`. Reading all three shapes is cheaper than pinning
 * one and having the row silently print raw keys after a system update.
 */
function configLabel(config, key, field = "label") {
  if (!config || !key) return "";

  const entry = config[key];
  if (typeof entry === "string") return entry;
  if (entry?.[field]) return game.i18n.localize(entry[field]);
  if (entry?.label) return game.i18n.localize(entry.label);

  for (const candidate of Object.values(config)) {
    if (!candidate?.children) continue;
    const nested = configLabel(candidate.children, key, field);
    if (nested) return nested;
  }

  return "";
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
