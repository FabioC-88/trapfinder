import trapDetection from "./trap-detection/index.js";
import lockpicking from "./lockpicking/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  trapDetection,
  lockpicking
];
