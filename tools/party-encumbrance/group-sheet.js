import { FLAGS } from "../../scripts/constants.js";
import { getShare } from "./refresh.js";
import { CARRIER_TYPES, eligibleCarriers, formatWeight, groupStashWeight, readConfig, unitsLabel } from "./stash.js";

const MODES = ["none", "equal", "available", "maximum"];
const PREFIX = "DND5E_GM_TOOLKIT.partyEncumbrance";

/**
 * Adds the distribution menu, the stash weight, and a "carries" control plus the share on each
 * member card of the Group sheet's Inventory tab. Only the GM can change anything: players see the
 * same information read-only.
 * @param {string} moduleId
 */
export function registerGroupSheetControls(moduleId) {
  Hooks.on("renderGroupActorSheet", (app, element) => injectControls(app.document, element, moduleId));
}

function injectControls(group, element, moduleId) {
  const tab = element.querySelector('.tab[data-tab="inventory"]');
  const body = tab?.querySelector(":scope > .body");
  if (!body) return;

  // ApplicationV2 can re-render one part without clearing what we injected: start clean every time.
  tab.querySelectorAll(".trapfinder-stash").forEach(node => node.remove());

  const config = readConfig(group.getFlag(moduleId, FLAGS.partyEncumbrance));
  const units = unitsLabel();
  const isGM = game.user.isGM;
  const t = key => game.i18n.localize(`${PREFIX}.${key}`);
  // Read the live DOM instead of spreading the config captured at render time: two quick toggles
  // (or a mode change during a toggle) would otherwise race and overwrite each other.
  const save = () => group.setFlag(moduleId, FLAGS.partyEncumbrance, collectState(tab, config));

  body.prepend(buildHeader(group, config, { isGM, units, t, save }));

  for (const card of tab.querySelectorAll(".sidebar .encumbrance.card[data-uuid]")) {
    const actor = fromUuidSync(card.dataset.uuid);
    if (!actor || !CARRIER_TYPES.has(actor.type)) continue;
    (card.querySelector(".pane") ?? card).append(buildMemberRow(group, actor, config, { isGM, units, t, save }));
  }
}

function buildHeader(group, config, { isGM, units, t, save }) {
  const header = document.createElement("div");
  header.className = "trapfinder-stash stash-header";

  const weight = game.i18n.format(`${PREFIX}.stashWeight`, { weight: formatWeight(groupStashWeight(group)), units });
  const mode = isGM
    ? `<select>${MODES.map(m => `<option value="${m}" ${m === config.mode ? "selected" : ""}>${t(`modes.${m}`)}</option>`).join("")}</select>`
    : `<span class="mode">${t(`modes.${config.mode}`)}</span>`;
  header.innerHTML = `<span class="weight">${weight}</span><label>${t("distribution")} ${mode}</label>`;

  const members = group.system.members.map(member => member.actor);
  if ((config.mode !== "none") && !eligibleCarriers(members, config.excluded).length) {
    header.insertAdjacentHTML("beforeend", `<p class="notification warning">${t("noCarriers")}</p>`);
  }

  header.querySelector("select")?.addEventListener("change", event => {
    // Injected controls sit inside dnd5e's sheet form: without this, the change bubbles up and
    // triggers the form's own submitOnChange.
    event.stopPropagation();
    save();
  });
  return header;
}

function buildMemberRow(group, actor, config, { isGM, units, t, save }) {
  const carries = !config.excluded.includes(actor.id);
  const row = document.createElement("div");
  row.className = "trapfinder-stash stash-member";
  row.dataset.actorId = actor.id;

  row.innerHTML = isGM
    ? `<label><input type="checkbox" ${carries ? "checked" : ""}> ${t("carries")}</label>`
    : `<span><i class="fa-solid ${carries ? "fa-check" : "fa-xmark"}" inert></i> ${t(carries ? "carries" : "notCarrying")}</span>`;

  // Same rule dnd5e uses to hide a member's stats on this sheet: no share weight for members the
  // viewer cannot observe.
  const share = getShare(actor.id)?.bySource.find(source => source.groupId === group.id)?.share ?? 0;
  if ((share > 0) && actor.testUserPermission(game.user, "OBSERVER")) {
    const text = game.i18n.format(`${PREFIX}.share`, { weight: formatWeight(share), units });
    row.insertAdjacentHTML("beforeend", `<span class="share">${text}</span>`);
  }

  row.querySelector("input")?.addEventListener("change", event => {
    // See the header select's handler above: stop this from also submitting dnd5e's sheet form.
    event.stopPropagation();
    save();
  });
  return row;
}

/**
 * The full flag state as of right now: the header select's current value, and the ids of every
 * rendered member row whose checkbox is unchecked. A member without a rendered row (a vehicle, or
 * an actor no longer shown) keeps whatever excluded state the stored config already had for it, so
 * it is never dropped just because it isn't on screen this render.
 * @param {HTMLElement} tab
 * @param {{mode: string, excluded: string[]}} config
 * @returns {{mode: string, excluded: string[]}}
 */
function collectState(tab, config) {
  const mode = tab.querySelector(".stash-header select")?.value ?? config.mode;

  const rows = tab.querySelectorAll(".stash-member[data-actor-id]");
  const rendered = new Set();
  const excluded = new Set();
  for (const row of rows) {
    const actorId = row.dataset.actorId;
    rendered.add(actorId);
    if (!row.querySelector("input")?.checked) excluded.add(actorId);
  }
  for (const actorId of config.excluded) {
    if (!rendered.has(actorId)) excluded.add(actorId);
  }

  return { mode, excluded: [...excluded] };
}
