import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSocket } from "../core/notify.js";
import { TOOLS } from "../tools/index.js";

Hooks.once("init", () => {
  // Shared by every tool that notifies, so it is registered here rather than inside one of them.
  // No requiresReload: it is read at notification time, so a change takes effect immediately.
  game.settings.register(MODULE_ID, SETTINGS.screenAlert, {
    name: "DND5E_GM_TOOLKIT.settings.screenAlert.name",
    hint: "DND5E_GM_TOOLKIT.settings.screenAlert.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  for (const tool of TOOLS) {
    tool.register(MODULE_ID);
  }
});

Hooks.once("ready", () => {
  // Unconditional, not gated behind any tool's toggle: a client with no listener would silently
  // drop toasts emitted by a GM whose tools are on, and the listener costs nothing when idle.
  registerSocket(MODULE_ID);

  for (const tool of TOOLS) {
    tool.onReady?.(MODULE_ID);
  }
});
