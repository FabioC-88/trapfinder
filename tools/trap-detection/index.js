import TrapDetectionRegionBehaviorType from "./trap-detection-region-behavior.js";

const TYPE_ID = "trapfinder.trapDetection";

export default {
  id: "trap-detection",
  titleKey: "DND5E_GM_TOOLKIT.tools.trapDetection.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.trapDetection.hint",
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
    CONFIG.RegionBehavior.dataModels[TYPE_ID] = TrapDetectionRegionBehaviorType;
    CONFIG.RegionBehavior.typeIcons[TYPE_ID] = "fa-solid fa-triangle-exclamation";
    // Without an explicit typeLabels entry, the "Add Behavior" type dropdown has nothing to
    // display for this entry and silently omits it (no error) - verified against several real,
    // working modules (pf2e-visioner, warhammer-dbc, Deathmarch-Witcher-TRPG) that all set this
    // explicitly alongside dataModels/typeIcons, unlike the one reference this was first modeled on.
    CONFIG.RegionBehavior.typeLabels[TYPE_ID] = "DND5E_GM_TOOLKIT.trapDetection.behavior.label";
    Hooks.once("i18nInit", () => foundry.helpers.Localization.localizeDataModel(TrapDetectionRegionBehaviorType));
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const center = {
        x: tokenDocument.x + (tokenDocument.width * gridSize) / 2,
        y: tokenDocument.y + (tokenDocument.height * gridSize) / 2
      };

      for (const region of scene.regions) {
        const behavior = region.behaviors.find(b => (b.type === TYPE_ID) && !b.disabled);
        if (!behavior) continue;

        const notifiedActorIds = behavior.getFlag(moduleId, "notifiedActorIds") ?? [];
        if (notifiedActorIds.includes(actor.id)) continue;

        const distance = distanceToRegionBounds(center, region.bounds);
        if (distance > behavior.system.range) continue;

        const passive = actor.system.skills?.prc?.passive ?? 0;
        const spotted = passive >= behavior.system.dc;
        postTrapDetectionMessage(actor, spotted, behavior.system.dc);

        behavior.setFlag(moduleId, "notifiedActorIds", [...notifiedActorIds, actor.id]);
      }
    });
  }
};

/**
 * Distance (in scene units) from a pixel point to a Region's bounding box - clamps the point to
 * the box, then measures from the clamped point (0 if the point is already inside the box).
 * A bounding-box approximation, not exact-shape-boundary distance: no built-in or third-party
 * reference for exact point-to-arbitrary-region-shape distance was found, and the extra margin
 * this approximation adds near the corners of an ellipse/polygon is a few feet at most - fine for
 * a detection buffer.
 */
function distanceToRegionBounds(point, bounds) {
  const clamped = {
    x: Math.clamp(point.x, bounds.left, bounds.right),
    y: Math.clamp(point.y, bounds.top, bounds.bottom)
  };
  return canvas.grid.measurePath([point, clamped]).distance;
}

function postTrapDetectionMessage(actor, spotted, dc) {
  const key = spotted
    ? "DND5E_GM_TOOLKIT.tools.trapDetection.spotted"
    : "DND5E_GM_TOOLKIT.tools.trapDetection.notSpotted";
  ChatMessage.create({
    content: game.i18n.format(key, { name: actor.name, dc }),
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}
