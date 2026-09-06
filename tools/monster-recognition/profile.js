import { FLAGS } from "../../scripts/constants.js";
import { MONSTER_DATA } from "./monsters-data.js";
import { computeIdentificationDC, findMonsterByName, normalizeName, skillForType } from "./monster-database.js";

/**
 * @typedef {object} MonsterProfile
 * @property {string} key            Stable identity used for the per-PC "already recognized" memory.
 * @property {string} displayName    The placed actor's own name, shown in chat.
 * @property {string|null} skill     dnd5e skill key the PC is checked on, or null if unresolvable.
 * @property {string|null} description
 * @property {number} dc
 * @property {"custom"|"bundle"|"none"} source  Where the description came from.
 */

/**
 * Resolves how this specific NPC actor should be identified: manual link/override flags first,
 * then a by-name match against the bundled database, then the type-based default. The actor's
 * own system.details.type always wins over the database entry's type - a reskinned monster is
 * identified as whatever the GM actually set it up as.
 *
 * @param {object} actor    NPC Actor document.
 * @param {string} moduleId
 * @returns {MonsterProfile}
 */
export function resolveMonsterProfile(actor, moduleId) {
  const overrideKey = actor.getFlag(moduleId, FLAGS.monsterKey);
  const match = overrideKey
    ? MONSTER_DATA.find(entry => entry.key === overrideKey) ?? null
    : findMonsterByName(actor.name, MONSTER_DATA);

  const type = actor.system?.details?.type?.value || match?.type || null;

  const skillOverride = actor.getFlag(moduleId, FLAGS.skillOverride);
  const skill = skillOverride || skillForType(type);

  const descriptionOverride = actor.getFlag(moduleId, FLAGS.descriptionOverride)?.trim();
  const bundleDescription = match
    ? game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.monsters.${match.key}.description`)
    : null;

  const description = descriptionOverride || bundleDescription || null;
  const source = descriptionOverride ? "custom" : (match ? "bundle" : "none");

  const cr = actor.system?.details?.cr ?? 0;

  return {
    key: match?.key ?? normalizeName(actor.name),
    displayName: actor.name,
    skill: skill ?? null,
    description,
    dc: computeIdentificationDC(cr),
    source
  };
}

/**
 * @param {object} pcActor
 * @param {string} key
 * @param {string} moduleId
 * @returns {boolean}
 */
export function isRecognized(pcActor, key, moduleId) {
  const recognized = pcActor.getFlag(moduleId, FLAGS.recognizedMonsters) ?? [];
  return recognized.includes(key);
}

/**
 * @param {object} pcActor
 * @param {string} key
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
export async function markRecognized(pcActor, key, moduleId) {
  const recognized = pcActor.getFlag(moduleId, FLAGS.recognizedMonsters) ?? [];
  if (recognized.includes(key)) return;
  await pcActor.setFlag(moduleId, FLAGS.recognizedMonsters, [...recognized, key]);
}
