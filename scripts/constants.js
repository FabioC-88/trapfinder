export const MODULE_ID = "trapfinder";

/** World setting keys. */
export const SETTINGS = {
  secretDoorDefaultDC: "secretDoorDefaultDC",
  secretDoorDefaultRange: "secretDoorDefaultRange",
  creatureDetectionRange: "creatureDetectionRange",
  screenAlert: "screenAlert",
  migrationVersion: "migrationVersion",
  // Menu button (Configure Settings) that opens the monster-recognition list app.
  monsterCatalogMenu: "monsterCatalogMenu"
};

/** Document flag keys, all under this module's scope. */
export const FLAGS = {
  // On a Region behavior and on a secret-door wall: actor ids that have already resolved it.
  notifiedActorIds: "notifiedActorIds",
  // On a hidden creature's token: actor ids of the PCs that have spotted it.
  detectedBy: "detectedBy",
  // On a secret-door wall: per-door overrides of the world defaults.
  dc: "dc",
  range: "range",
  message: "message",
  // On an NPC actor: manual link to a monster-database entry, overriding the by-name match.
  monsterKey: "monsterKey",
  // On an NPC actor: custom description overriding the linked database entry's.
  descriptionOverride: "descriptionOverride",
  // On an NPC actor: knowledge skill override, overriding the by-type default.
  skillOverride: "skillOverride",
  // On a PC actor: monster-database keys (or normalized names) already recognized by that PC.
  recognizedMonsters: "recognizedMonsters"
};
