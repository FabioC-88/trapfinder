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
  const key = checkMode === "active"
    ? "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByActive"
    : "DND5E_GM_TOOLKIT.monsterRecognition.recognizedByPassive";

  return `
    ${monsterCard(profile)}
    <p class="hint">${game.i18n.format(key, { name: pcActor.name, skill: skillLabel, dc: profile.dc })}</p>
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
 * What the character recalls: a header naming what kind of thing it is, the lore, then the facts
 * that change what a player does this round. The lore comes from the database (or the GM's own
 * text); everything below it is read live off the actor, so it is right even for a monster that
 * was reskinned, homebrewed, or never in the database at all.
 *
 * Rows with nothing in them are dropped rather than printed empty, the way a stat block does it.
 */
function monsterCard(profile) {
  const lore = profile.description
    ?? game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.noDescription");

  // No CR here on purpose: it is a designer's number, not something a character recalls, and
  // showing it would hand the table the monster's exact tier. The GM still sees it in the
  // Monster List panel.
  const header = game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.card.header", {
    type: configLabel(CONFIG.DND5E?.creatureTypes, profile.type)
      || game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.card.unknownType"),
    size: configLabel(CONFIG.DND5E?.actorSizes, profile.size)
  }).replace(/\s+/g, " ").trim();

  const stats = profile.statblock ?? {};
  const t = key => game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.card.${key}`);

  const rows = [
    [t("senses"), sensesLine(stats)],
    [t("movement"), movementLine(stats)],
    [t("vulnerabilities"), damageList(stats.vulnerabilities, CONFIG.DND5E?.damageTypes)],
    [t("resistances"), damageList(stats.resistances, CONFIG.DND5E?.damageTypes)],
    [t("immunities"), damageList(stats.immunities, CONFIG.DND5E?.damageTypes)],
    [t("conditionImmunities"), damageList(stats.conditionImmunities, CONFIG.DND5E?.conditionTypes)],
    [t("actions"), (stats.actions ?? []).join(", ")],
    [t("languages"), damageList(stats.languages, CONFIG.DND5E?.languages)]
  ].filter(([, value]) => value);

  const list = rows.length
    ? `<ul class="trapfinder-monster-card">${rows.map(([label, value]) =>
      `<li><strong>${label}</strong>: ${foundry.utils.escapeHTML(value)}</li>`).join("")}</ul>`
    : "";

  return `
    <p><strong>${foundry.utils.escapeHTML(profile.displayName)}</strong> — ${foundry.utils.escapeHTML(header)}</p>
    <p>${foundry.utils.escapeHTML(lore)}</p>
    ${list}
    ${traitsList(stats.traits, t("traits"))}
  `;
}

/** Each trait gets its own line with its text: the name alone is rarely the useful half. */
function traitsList(traits, label) {
  if (!traits?.length) return "";

  const items = traits.map(trait => {
    const name = `<strong>${foundry.utils.escapeHTML(trait.name)}</strong>`;
    const text = trait.description ? `: ${foundry.utils.escapeHTML(trait.description)}` : "";
    return `<li>${name}${text}</li>`;
  }).join("");

  return `<p><strong>${label}</strong></p><ul class="trapfinder-monster-card">${items}</ul>`;
}

function sensesLine({ senses = [], specialSenses = [], passivePerception, sensesUnits }) {
  const parts = senses.map(sense =>
    `${game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.card.sense.${sense.key}`)} ${sense.value}${unitSuffix(sensesUnits)}`
  );
  parts.push(...specialSenses);

  if (passivePerception) {
    parts.push(game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.card.passivePerception", {
      value: passivePerception
    }));
  }

  return parts.join(", ");
}

function movementLine({ movement = [], hover, movementUnits }) {
  const parts = movement.map(speed =>
    `${game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.card.speed.${speed.key}`)} ${speed.value}${unitSuffix(movementUnits)}`
  );
  if (hover) parts.push(game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.card.speed.hover"));
  return parts.join(", ");
}

function unitSuffix(units) {
  if (!units) return "";
  const label = configLabel(CONFIG.DND5E?.movementUnits, units, "abbreviation");
  return ` ${label || units}`;
}

/** @param {string[]} keys */
function damageList(keys, config) {
  return (keys ?? []).map(key => configLabel(config, key) || key).join(", ");
}

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
