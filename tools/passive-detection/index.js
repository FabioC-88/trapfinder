import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { SETTINGS } from "../../scripts/constants.js";
import PassiveDetectionBehaviorType from "./passive-detection-behavior.js";
import { migrateTrapDetectionBehaviors } from "./migration.js";
import { collectRegionDetectables } from "./sources.js";

const TYPE_ID = "trapfinder.passiveDetection";

export default {
  id: "passive-detection",
  titleKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // CONFIG.RegionBehavior below is only (re)populated once per page load, at "init" - toggling
      // this mid-session without a reload would leave the behavior type missing from the Region
      // config sheet until the next refresh, so Foundry needs to prompt for one.
      requiresReload: true
    });

    // Bookkeeping, not a knob: never shown in Configure Settings.
    game.settings.register(moduleId, SETTINGS.migrationVersion, {
      scope: "world",
      config: false,
      type: Number,
      default: 0
    });

    // Unconditional (not gated behind the setting toggle): module.json declares this type under
    // documentTypes.RegionBehavior so Foundry's own type list (which is what actually drives the
    // "Add Behavior" dropdown - CONFIG.RegionBehavior.dataModels alone does not, verified by
    // comparing it against the dropdown's real rendered <select> options) always includes it,
    // regardless of the setting. Since the type is always selectable either way, registering the
    // class conditionally would let a GM add the behavior while the tool is off and hit a broken
    // data model with no class behind it - so this stays unconditional, and only the actual
    // detection hook in onReady() below is gated by the setting.
    //
    // CONFIG.RegionBehavior must be populated before the "i18nInit" hook runs (Foundry uses it to
    // pre-localize/prepare behavior type sheets), so this happens here in register() (init), not
    // in onReady() - same timing constraint already hit for the leader status in dnd5e-house-rules.
    CONFIG.RegionBehavior.dataModels[TYPE_ID] = PassiveDetectionBehaviorType;
    CONFIG.RegionBehavior.typeIcons[TYPE_ID] = "fa-solid fa-triangle-exclamation";
    // Without an explicit typeLabels entry, the "Add Behavior" type dropdown has nothing to
    // display for this entry and silently omits it (no error) - verified against several real,
    // working modules (pf2e-visioner, warhammer-dbc, Deathmarch-Witcher-TRPG) that all set this
    // explicitly alongside dataModels/typeIcons, unlike the one reference this was first modeled on.
    CONFIG.RegionBehavior.typeLabels[TYPE_ID] = "DND5E_GM_TOOLKIT.passiveDetection.behavior.label";
    Hooks.once("i18nInit", () => foundry.helpers.Localization.localizeDataModel(PassiveDetectionBehaviorType));
  },

  async onReady(moduleId) {
    // Before the toggle check on purpose: Regions saved under the old type must be converted even
    // in a world where the tool is currently off, or they would be left behind for good once the
    // old type declaration is dropped from module.json.
    await migrateTrapDetectionBehaviors(moduleId);

    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const observerCenter = {
        x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
        y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
      };

      const detectables = collectRegionDetectables({
        scene, observerCenter, actor, moduleId, typeId: TYPE_ID
      });
      if (!detectables.length) return;

      await runDetection({
        observer: actor,
        detectables,
        measure: (point) => sceneDistance(observerCenter, point),
        isSightBlocked: (point) => isSightBlocked(observerCenter, point),
        report: ({ observer, detectable, spotted }) => reportDetection({
          moduleId, observer, detectable, spotted,
          toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
        })
      });
    });
  }
};
