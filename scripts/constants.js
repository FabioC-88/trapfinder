export const MODULE_ID = "trapfinder";

/** World setting keys. */
export const SETTINGS = {
  secretDoorDefaultDC: "secretDoorDefaultDC",
  secretDoorDefaultRange: "secretDoorDefaultRange",
  creatureDetectionRange: "creatureDetectionRange",
  screenAlert: "screenAlert",
  migrationVersion: "migrationVersion"
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
  message: "message"
};
