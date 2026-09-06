import { normalizeName } from "./monster-database.js";

/**
 * Turns a monster's hard data into the beats of something a character would actually say.
 *
 * The message is what the PC *recalls*, not the sheet: "vede bene anche nel buio" instead of
 * "scurovisione 18 m", "attacca con morso e artigli" instead of "Multiattacco, Morso, Artiglio".
 * So nothing here carries a number, a skill name, or a rules term.
 *
 * Pure on purpose, like the rest of the tool's core: it returns *which* beats apply, as raw dnd5e
 * keys, and chat.js turns each into a localized sentence. That keeps the decisions testable
 * without Foundry, and keeps the wording where every other string of this module lives.
 *
 * @typedef {object} NarrativeBeat
 * @property {string} key            Phrase key under monsterRecognition.card.prose.
 * @property {string[]} [list]       Raw keys/names to be localized and joined into the sentence.
 * @property {string} [type]
 * @property {string} [size]
 */

/** Beyond this, darkvision stops being "sees in the dark" and becomes remarkable in itself. */
const FAR_DARKVISION = 120;

/**
 * Common trait names mapped to plain language, matched on the normalized name in either language
 * so a world running dnd5e in Italian resolves just as well as one in English.
 *
 * A trait that is not in here is simply left out, rather than dumping its rules text into a
 * message meant to sound like a memory. When that loses something important - a homebrew monster
 * built around its signature trait - the GM writes it into that monster's own description from
 * the Monster List panel, which overrides everything anyway.
 */
const TRAIT_PHRASES = {
  keenSmell: ["keen smell", "keen hearing and smell", "keen sight and smell", "olfatto acuto", "udito e olfatto acuti", "vista e olfatto acuti"],
  keenSenses: ["keen hearing", "keen sight", "keen senses", "udito acuto", "vista acuta", "sensi acuti"],
  packTactics: ["pack tactics", "tattiche di branco"],
  regeneration: ["regeneration", "rigenerazione"],
  magicResistance: ["magic resistance", "resistenza alla magia"],
  sunlightSensitivity: ["sunlight sensitivity", "sensibilita alla luce del sole"],
  lightSensitivity: ["light sensitivity", "sensibilita alla luce"],
  amphibious: ["amphibious", "anfibio"],
  holdBreath: ["hold breath", "trattenere il respiro"],
  spiderClimb: ["spider climb", "ragno rampicante", "arrampicarsi come un ragno"],
  webWalker: ["web walker", "web sense", "camminare sulle ragnatele", "percepire le ragnatele"],
  falseAppearance: ["false appearance", "aspetto ingannevole"],
  undeadFortitude: ["undead fortitude", "tempra dei non morti"],
  legendaryResistance: ["legendary resistance", "resistenza leggendaria"],
  incorporeal: ["incorporeal movement", "movimento incorporeo"],
  shapechanger: ["shapechanger", "mutaforma"],
  spellcasting: ["spellcasting", "innate spellcasting", "incantesimi", "incantesimi innati", "lancio di incantesimi"],
  multiattack: ["multiattack", "multiattacco"],
  charge: ["charge", "carica"],
  pounce: ["pounce", "balzo"],
  rampage: ["rampage", "furia"],
  nimbleEscape: ["nimble escape", "fuga agile"],
  aggressive: ["aggressive", "aggressivo"],
  brave: ["brave", "coraggioso"],
  relentless: ["relentless", "relentless endurance", "implacabile", "tenacia implacabile"],
  siegeMonster: ["siege monster", "mostro d'assedio", "mostro dassedio"],
  deathBurst: ["death burst", "esplosione mortale"],
  turnImmunity: ["turn immunity", "immunita a scacciare", "immunita al scacciare"],
  devilsSight: ["devil's sight", "devils sight", "vista del diavolo"],
  standingLeap: ["standing leap", "salto da fermo"],
  flyby: ["flyby", "sorvolo"],
  avoidance: ["avoidance", "evasion", "elusione", "schivare"],
  corrosiveForm: ["corrosive form", "forma corrosiva"],
  transparent: ["transparent", "trasparente"],
  illumination: ["illumination", "illuminazione"]
};

/** Reverse index built once: normalized trait name -> phrase key. */
const TRAIT_LOOKUP = Object.entries(TRAIT_PHRASES).reduce((lookup, [phrase, names]) => {
  for (const name of names) lookup[normalizeName(name)] = phrase;
  return lookup;
}, {});

/**
 * @param {import("./profile.js").MonsterProfile} profile
 * @returns {NarrativeBeat[]}
 */
export function narrativeBeats(profile) {
  const stats = profile?.statblock ?? {};
  const beats = [];

  if (profile?.type) {
    beats.push({ key: profile.size ? "nature" : "natureNoSize", type: profile.type, size: profile.size });
  }

  for (const sense of stats.senses ?? []) {
    if (sense.key === "darkvision") {
      beats.push({ key: sense.value >= FAR_DARKVISION ? "darkvisionFar" : "darkvision" });
      continue;
    }
    beats.push({ key: sense.key });
  }

  for (const speed of stats.movement ?? []) beats.push({ key: speed.key });
  if (stats.hover) beats.push({ key: "hover" });

  for (const phrase of traitPhrases(stats.traits)) beats.push({ key: phrase });

  if (stats.attacks?.length) beats.push({ key: "attacks", list: stats.attacks });

  if (stats.immunities?.length) beats.push({ key: "immunities", list: stats.immunities });
  if (stats.resistances?.length) beats.push({ key: "resistances", list: stats.resistances });
  if (stats.vulnerabilities?.length) beats.push({ key: "vulnerabilities", list: stats.vulnerabilities });
  if (stats.conditionImmunities?.length) {
    beats.push({ key: "conditionImmunities", list: stats.conditionImmunities });
  }

  if (stats.languages?.length) beats.push({ key: "languages", list: stats.languages });

  return beats;
}

/** Deduplicated: "Keen Hearing" and "Keen Smell" both map to keen senses, but say it once. */
function traitPhrases(traits) {
  const phrases = [];

  for (const name of traits ?? []) {
    const phrase = TRAIT_LOOKUP[normalizeName(name)];
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }

  // "It has keen senses" adds nothing next to "it has an extremely keen sense of smell".
  if (phrases.includes("keenSmell")) {
    return phrases.filter(phrase => phrase !== "keenSenses");
  }

  return phrases;
}

/**
 * "morso, artigli e coda" - an enumeration a person would speak, not a comma-separated field.
 * @param {string[]} items
 * @param {string} conjunction  Localized "e"/"and"/"o"/"or".
 * @returns {string}
 */
export function joinList(items, conjunction) {
  const values = (items ?? []).filter(Boolean);
  if (!values.length) return "";
  if (values.length === 1) return values[0];

  return `${values.slice(0, -1).join(", ")} ${conjunction} ${values[values.length - 1]}`;
}
