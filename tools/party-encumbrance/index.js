import { registerEncumbranceWrapper } from "./encumbrance-wrapper.js";
import { clearShares, registerRefreshHooks } from "./refresh.js";
import { registerGroupSheetControls } from "./group-sheet.js";
import { registerActorSheetTooltip } from "./actor-sheet.js";

/**
 * Makes the stash of a dnd5e Group actor weigh on its members. dnd5e gives a Group no encumbrance
 * of its own, so whatever the party puts in it weighs on nobody; here each Group chooses, from its
 * sheet, how its stash weight is split among the members that carry it. The share is derived data
 * added on the fly: nothing is moved and nothing is written to the PCs.
 */
export default {
  id: "party-encumbrance",
  titleKey: "DND5E_GM_TOOLKIT.tools.partyEncumbrance.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.partyEncumbrance.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The wrapper and the hooks below are attached once per page load, at "ready".
      requiresReload: true,
      onChange: value => {
        // Turning the tool off should bring every bar back to native without waiting for the
        // reload. The wrapper and hooks are still installed until then, but with an empty share
        // cache the wrapper applies nothing, so this is enough on its own.
        if (value || !game.users.activeGM?.isSelf) return;
        clearShares(moduleId);
      }
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    // Runs on every client, not only the GM's: encumbrance is derived data each client prepares.
    if (!globalThis.dnd5e?.dataModels?.actor?.AttributesFields?.prepareEncumbrance) {
      if (game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("DND5E_GM_TOOLKIT.tools.partyEncumbrance.unsupported"));
      }
      return;
    }

    registerEncumbranceWrapper(moduleId);
    registerRefreshHooks(moduleId);
    registerGroupSheetControls(moduleId);
    registerActorSheetTooltip();
  }
};
