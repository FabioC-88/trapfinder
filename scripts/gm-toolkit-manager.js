import { MODULE_ID } from "./constants.js";
import { TOOLS } from "../tools/index.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Settings menu app listing every registered tool with its toggle. */
export class GmToolkitManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dnd5e-gm-toolkit-manager",
    tag: "form",
    window: {
      title: "DND5E_GM_TOOLKIT.manager.appTitle",
      icon: "fa-solid fa-toolbox"
    },
    position: {
      width: 520,
      height: "auto"
    },
    form: {
      handler: GmToolkitManager.onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/gm-toolkit-manager.hbs`
    }
  };

  async _prepareContext(_options) {
    const tools = TOOLS.map(tool => ({
      id: tool.id,
      title: game.i18n.localize(tool.titleKey),
      hint: game.i18n.localize(tool.hintKey),
      enabled: game.settings.get(MODULE_ID, tool.id)
    }));
    return { tools };
  }

  static async onSubmit(_event, _form, formData) {
    const data = formData.object;
    let changed = false;

    for (const tool of TOOLS) {
      const enabled = Boolean(data[tool.id]);
      const current = game.settings.get(MODULE_ID, tool.id);
      if (enabled !== current) {
        await game.settings.set(MODULE_ID, tool.id, enabled);
        changed = true;
      }
    }

    if (changed) {
      ui.notifications.info(game.i18n.localize("DND5E_GM_TOOLKIT.manager.reloadNotice"));
    }
  }
}
