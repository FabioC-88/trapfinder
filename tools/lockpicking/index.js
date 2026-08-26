import { registerDoorControlWrapper } from "./door-control-wrapper.js";

/**
 * A left-click on a locked door plays a client-local "locked" sound and never attempts a wall
 * document update, for GM and player alike - verified against the real, v13/14-verified module
 * "Smart Doors" (farling42/foundryvtt-smart-doors). That means a hook like preUpdateWall can never
 * fire for this interaction: there is nothing to intercept at the document level, only at the
 * DoorControl click handler itself. See door-control-wrapper.js for the libWrapper-based fix.
 */
export default {
  id: "lockpicking",
  titleKey: "DND5E_GM_TOOLKIT.tools.lockpicking.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.lockpicking.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: false,
      type: Boolean,
      default: this.default
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;
    registerDoorControlWrapper(moduleId);
  }
};
