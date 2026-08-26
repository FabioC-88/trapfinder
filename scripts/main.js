import { MODULE_ID } from "./constants.js";
import { TOOLS } from "../tools/index.js";
import { GmToolkitManager } from "./gm-toolkit-manager.js";

Hooks.once("init", () => {
  for (const tool of TOOLS) {
    tool.register(MODULE_ID);
  }

  game.settings.registerMenu(MODULE_ID, "gmToolkitManager", {
    name: "DND5E_GM_TOOLKIT.manager.menuName",
    label: "DND5E_GM_TOOLKIT.manager.menuLabel",
    hint: "DND5E_GM_TOOLKIT.manager.menuHint",
    icon: "fa-solid fa-toolbox",
    type: GmToolkitManager,
    restricted: true
  });
});

Hooks.once("ready", () => {
  for (const tool of TOOLS) {
    tool.onReady?.(MODULE_ID);
  }
});
