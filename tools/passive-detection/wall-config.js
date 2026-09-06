import { FLAGS, SETTINGS } from "../../scripts/constants.js";

/**
 * Adds per-door detection fields to the native Wall configuration sheet.
 *
 * Pattern verified against the real, v13-verified module "Wall Height" (theripper93/wall-height
 * v4.1.2, scripts/wall-height.js:108-135): in v13+ the hook's second argument is a native DOM
 * element, and an input named "flags.<moduleId>.<key>" is persisted by the sheet's own submit -
 * no listener and no setFlag call of our own.
 *
 * @param {string} moduleId
 */
export function registerWallConfigInjection(moduleId) {
  Hooks.on("renderWallConfig", (app, html) => {
    // ApplicationV2 can re-render partially without clearing what we injected, which would
    // duplicate the fieldset on every re-render. wall-height guards its light hook this way but
    // not its wall hook; the guard is cheap and the failure is visible, so we always guard.
    if (html.querySelector(`[name="flags.${moduleId}.${FLAGS.dc}"]`)) return;

    const doorField = html.querySelector('[name="door"]');
    if (!doorField) return;

    const document = app.document;
    const dc = document.getFlag(moduleId, FLAGS.dc) ?? "";
    const range = document.getFlag(moduleId, FLAGS.range) ?? "";
    const message = document.getFlag(moduleId, FLAGS.message) ?? "";

    const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
    const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);

    const t = (key) => game.i18n.localize(`DND5E_GM_TOOLKIT.secretDoor.wallConfig.${key}`);

    doorField.closest("fieldset").insertAdjacentHTML("afterend", `
      <fieldset>
        <legend>${t("legend")}</legend>
        <p class="hint">${t("hint")}</p>
        <div class="form-group">
          <label>${t("dc")}</label>
          <input name="flags.${moduleId}.${FLAGS.dc}" type="number" step="1" min="0"
                 value="${dc}" placeholder="${defaultDC}">
        </div>
        <div class="form-group">
          <label>${t("range")}</label>
          <input name="flags.${moduleId}.${FLAGS.range}" type="number" step="any" min="0"
                 value="${range}" placeholder="${defaultRange}">
        </div>
        <div class="form-group">
          <label>${t("message")}</label>
          <input name="flags.${moduleId}.${FLAGS.message}" type="text"
                 value="${foundry.utils.escapeHTML(message)}">
        </div>
      </fieldset>
    `);

    app.setPosition({ height: "auto" });
  });
}
