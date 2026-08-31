/**
 * Pure data container for a trap's detection settings (DC + detection range in scene units),
 * attached to a Region drawn at the trap's true physical footprint.
 *
 * Deliberately does NOT implement _handleRegionEvent()/react to CONST.REGION_EVENTS: Foundry's
 * native region events (TOKEN_ENTER/EXIT/MOVE_WITHIN) only fire on entering/exiting the region's
 * *exact drawn shape*, which is too late for "a PC is approaching the trap" - no native
 * "within distance of a region" trigger exists. Detection is instead driven from the "moveToken"
 * hook in index.js, which reads dc/range directly off every region behavior of this type on the
 * scene and does its own distance math. This class only exists to give the GM a native config
 * form (via Foundry's auto-rendered RegionBehaviorConfig sheet) for setting those two values.
 */
export default class TrapDetectionRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["DND5E_GM_TOOLKIT.trapDetection.behavior"];

  static defineSchema() {
    const { NumberField } = foundry.data.fields;
    return {
      // Declared even though _handleRegionEvent is never implemented/used - the one real
      // reference implementation found for a custom dnd5e RegionBehaviorType always includes
      // this field, and omitting it is an unverified deviation from the only known-working example.
      events: this._createEventsField({ events: [] }),
      dc: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
      range: new NumberField({ required: true, min: 0, initial: 10 })
    };
  }
}
