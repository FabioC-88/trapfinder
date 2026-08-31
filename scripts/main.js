import { MODULE_ID } from "./constants.js";
import { TOOLS } from "../tools/index.js";

Hooks.once("init", () => {
  for (const tool of TOOLS) {
    tool.register(MODULE_ID);
  }
});

Hooks.once("ready", () => {
  for (const tool of TOOLS) {
    tool.onReady?.(MODULE_ID);
  }
});
