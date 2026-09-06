import { FLAGS, MODULE_ID } from "../../scripts/constants.js";
import { MONSTER_DATA } from "./monsters-data.js";
import { resolveMonsterProfile } from "./profile.js";
import { formatCR } from "./statblock.js";

/**
 * The four knowledge skills used by the type->skill mapping (see monster-database.js). The
 * override select is limited to these, not the full 18 dnd5e skills, to keep the panel and its
 * translation strings matched 1:1 to the documented mapping table.
 */
const OVERRIDE_SKILLS = ["arc", "nat", "rel", "his"];

/**
 * "Elenco Mostri": lists every NPC actor in the world, shows which monster-database entry (if
 * any) it auto-matched to and which knowledge skill would be checked, and lets the GM correct
 * either plus write a custom description. No Handlebars template, same manual-HTML convention as
 * wall-config.js and surprise.js elsewhere in this module - there is no bundler, and this keeps
 * the whole panel in one file that is easy to read top to bottom.
 *
 * Unverified against a live Foundry v14 instance - see the design doc's risk list. If
 * `_renderHTML`/`_replaceHTML` do not behave as documented for a Handlebars-free ApplicationV2,
 * the fallback is a DialogV2 per actor instead of a single table.
 */
export class MonsterListApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "trapfinder-monster-list",
    tag: "div",
    window: {
      title: "DND5E_GM_TOOLKIT.monsterRecognition.list.title",
      resizable: true
    },
    position: { width: 760, height: 640 }
  };

  async _renderHTML() {
    const actors = game.actors.filter(a => a.type === "npc").sort((a, b) => a.name.localeCompare(b.name));
    const t = key => game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.list.${key}`);

    const rows = actors.map(actor => this.#row(actor)).join("");

    return `
      <div class="trapfinder-monster-list">
        <p class="hint">${t("hint")}</p>
        <input type="text" class="monster-filter" placeholder="${t("filterPlaceholder")}">
        <table>
          <thead>
            <tr>
              <th>${t("name")}</th>
              <th>${t("cr")}</th>
              <th>${t("type")}</th>
              <th>${t("skill")}</th>
              <th>${t("description")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">${t("empty")}</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#attachListeners(content);
  }

  #row(actor) {
    const profile = resolveMonsterProfile(actor, MODULE_ID);
    const skillOverride = actor.getFlag(MODULE_ID, FLAGS.skillOverride) ?? "";
    const type = actor.system?.details?.type?.value ?? "";
    const typeLabel = CONFIG.DND5E?.creatureTypes?.[type]?.label
      ? game.i18n.localize(CONFIG.DND5E.creatureTypes[type].label)
      : type;

    const skillOptions = OVERRIDE_SKILLS.map(skill => {
      const selected = (skillOverride || profile.skill) === skill ? "selected" : "";
      const label = game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.skills.${skill}`);
      return `<option value="${skill}" ${selected}>${label}</option>`;
    }).join("");
    const placeholder = profile.skill
      ? ""
      : `<option value="" selected>${game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.list.noSkill")}</option>`;

    const statusKey = profile.source === "custom" ? "statusCustom"
      : profile.source === "bundle" ? "statusBundle" : "statusNone";
    const status = profile.source === "bundle"
      ? game.i18n.format(`DND5E_GM_TOOLKIT.monsterRecognition.list.${statusKey}`, {
        name: MONSTER_DATA.find(entry => entry.key === profile.key)?.name ?? profile.key
      })
      : game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.list.${statusKey}`);

    return `
      <tr data-actor-id="${actor.id}">
        <td>${foundry.utils.escapeHTML(actor.name)}</td>
        <td>${actor.system?.details?.cr === undefined ? "-" : formatCR(actor.system.details.cr)}</td>
        <td>${foundry.utils.escapeHTML(typeLabel || "-")}</td>
        <td><select class="skill-select" data-actor-id="${actor.id}">${placeholder}${skillOptions}</select></td>
        <td>${foundry.utils.escapeHTML(status)}</td>
        <td><button type="button" class="edit-description" data-actor-id="${actor.id}">
          ${game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.list.edit")}
        </button></td>
      </tr>
    `;
  }

  #attachListeners(content) {
    content.querySelector(".monster-filter")?.addEventListener("input", (event) => {
      const term = event.target.value.trim().toLowerCase();
      for (const row of content.querySelectorAll("tbody tr[data-actor-id]")) {
        const name = row.firstElementChild?.textContent?.toLowerCase() ?? "";
        row.style.display = name.includes(term) ? "" : "none";
      }
    });

    content.querySelectorAll(".skill-select").forEach(select => {
      select.addEventListener("change", async (event) => {
        const actor = game.actors.get(event.target.dataset.actorId);
        await actor?.setFlag(MODULE_ID, FLAGS.skillOverride, event.target.value);
      });
    });

    content.querySelectorAll(".edit-description").forEach(button => {
      button.addEventListener("click", async (event) => {
        const actor = game.actors.get(event.target.dataset.actorId);
        if (!actor) return;
        await this.#openDescriptionDialog(actor);
        this.render();
      });
    });
  }

  async #openDescriptionDialog(actor) {
    const t = key => game.i18n.localize(`DND5E_GM_TOOLKIT.monsterRecognition.editDialog.${key}`);

    const currentKey = actor.getFlag(MODULE_ID, FLAGS.monsterKey) ?? "";
    const currentDescription = actor.getFlag(MODULE_ID, FLAGS.descriptionOverride) ?? "";

    const options = [`<option value="">${t("noLink")}</option>`, ...[...MONSTER_DATA]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => `<option value="${entry.key}" ${entry.key === currentKey ? "selected" : ""}>${foundry.utils.escapeHTML(entry.name)}</option>`)
    ].join("");

    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("DND5E_GM_TOOLKIT.monsterRecognition.editDialog.title", { name: actor.name }) },
      content: `
        <div class="form-group">
          <label>${t("linkLabel")}</label>
          <select name="monsterKey">${options}</select>
        </div>
        <div class="form-group">
          <label>${t("descriptionLabel")}</label>
          <p class="hint">${t("descriptionHint")}</p>
          <textarea name="description" rows="4">${foundry.utils.escapeHTML(currentDescription)}</textarea>
        </div>
      `,
      ok: {
        label: game.i18n.localize("DND5E_GM_TOOLKIT.monsterRecognition.editDialog.confirm"),
        callback: async (_event, button) => {
          const monsterKey = button.form.elements.monsterKey.value;
          const description = button.form.elements.description.value.trim();

          if (monsterKey) await actor.setFlag(MODULE_ID, FLAGS.monsterKey, monsterKey);
          else await actor.unsetFlag(MODULE_ID, FLAGS.monsterKey);

          if (description) await actor.setFlag(MODULE_ID, FLAGS.descriptionOverride, description);
          else await actor.unsetFlag(MODULE_ID, FLAGS.descriptionOverride);
        }
      },
      rejectClose: false
    });
  }
}
