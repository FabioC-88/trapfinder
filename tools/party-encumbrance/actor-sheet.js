import { formatWeight, unitsLabel } from "./stash.js";

/**
 * Explains on a PC's or NPC's own encumbrance bar how much of it comes from a Group's stash, so a
 * player whose bar suddenly fills up can see why.
 */
export function registerActorSheetTooltip() {
  for (const hook of ["renderCharacterActorSheet", "renderNPCActorSheet"]) {
    Hooks.on(hook, (app, element) => addTooltip(app.document, element));
  }
}

function addTooltip(actor, element) {
  const stash = actor.system.attributes?.encumbrance?.stash;
  if (!(stash?.share > 0)) return;
  const meter = element.querySelector('.encumbrance [role="meter"]');
  if (!meter) return;

  const units = unitsLabel();
  // Joined with <br>, so this needs dnd5e's HTML tooltip variant, not the plain-text one. dnd5e
  // itself never sets a tooltip on this element (its own attribution tooltips only target
  // [data-attribution]/[data-reference-tooltip], which encumbrance.hbs's meter has neither of), so
  // there is nothing here to conflict with.
  meter.dataset.tooltipHtml = stash.bySource.map(source => game.i18n.format("DND5E_GM_TOOLKIT.partyEncumbrance.tooltipLine", {
    weight: formatWeight(source.share),
    units,
    group: foundry.utils.escapeHTML(source.groupName)
  })).join("<br>");
}
