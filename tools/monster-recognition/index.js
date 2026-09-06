import { SETTINGS } from "../../scripts/constants.js";
import { registerCombatStartHook } from "./combat-hook.js";
import { MonsterListApp } from "./monster-list-app.js";

/**
 * Checks every PC's correct knowledge skill against a DC of 10+CR when combat starts, and posts
 * the monster's info to chat for whoever meets it. A PC who has already recognized that kind of
 * monster before skips the check entirely and gets the same info again, compacted.
 */
export default {
  id: "monster-recognition",
  titleKey: "DND5E_GM_TOOLKIT.tools.monsterRecognition.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.monsterRecognition.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The hook below is attached once per page load, at "ready".
      requiresReload: true
    });

    // Registered unconditionally, not behind the toggle above: the GM should be able to prepare
    // monster descriptions and skill overrides even while the automation itself is off.
    game.settings.registerMenu(moduleId, SETTINGS.monsterCatalogMenu, {
      name: "DND5E_GM_TOOLKIT.monsterRecognition.list.title",
      hint: "DND5E_GM_TOOLKIT.monsterRecognition.list.menuHint",
      label: "DND5E_GM_TOOLKIT.monsterRecognition.list.menuLabel",
      icon: "fa-solid fa-list",
      type: MonsterListApp,
      restricted: true
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;
    registerCombatStartHook(moduleId);
  }
};
