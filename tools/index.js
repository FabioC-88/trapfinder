import passiveDetection from "./passive-detection/index.js";
import hiddenCreatures from "./hidden-creatures/index.js";
import lockpicking from "./lockpicking/index.js";
import partyEncumbrance from "./party-encumbrance/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  passiveDetection,
  hiddenCreatures,
  lockpicking,
  partyEncumbrance
];
