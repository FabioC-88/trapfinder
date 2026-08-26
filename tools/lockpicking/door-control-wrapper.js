import { libWrapper } from "../../lib/libwrapper-shim.js";

// Namespaced v13+ location, not the bare global DoorControl - confirmed against the real,
// v13/14-verified module "Smart Doors" (farling42/foundryvtt-smart-doors), which wraps exactly
// this path for exactly this reason (intercepting a locked-door click, which core Foundry itself
// never turns into a document update - see index.js's header comment for why).
const TARGET = "foundry.canvas.containers.DoorControl.prototype._onMouseDown";

export function registerDoorControlWrapper(moduleId) {
  libWrapper.register(moduleId, TARGET, function (wrapped, event) {
    const wall = this.wall;
    const locked = wall?.document?.ds === CONST.WALL_DOOR_STATES.LOCKED;

    if (locked && game.user.isGM && game.user.can("WALL_DOORS")) {
      attemptLockpick(wall, moduleId);
      return; // do not call the original handler - it would do nothing for a locked door anyway
    }

    return wrapped(event);
  }, "MIXED");
}

async function attemptLockpick(wall, moduleId) {
  const actor = canvas.tokens.controlled[0]?.actor;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("DND5E_GM_TOOLKIT.tools.lockpicking.noActor"));
    return;
  }

  let dc = wall.document.getFlag(moduleId, "lockDC");
  if (dc === undefined) {
    dc = await promptForLockDC();
    if (dc === null || Number.isNaN(dc)) return;
    await wall.document.setFlag(moduleId, "lockDC", dc);
  }

  const rolls = await actor.rollToolCheck(
    { tool: "thief" },
    { configure: false },
    { data: { flavor: game.i18n.format("DND5E_GM_TOOLKIT.tools.lockpicking.rollFlavor", { dc }) } }
  );
  if (!rolls?.length) return; // roll dialog was cancelled

  const success = rolls[0].total >= dc;
  if (success) await wall.document.update({ ds: CONST.WALL_DOOR_STATES.OPEN });

  ChatMessage.create({
    content: game.i18n.format(
      success ? "DND5E_GM_TOOLKIT.tools.lockpicking.success" : "DND5E_GM_TOOLKIT.tools.lockpicking.failure",
      { name: actor.name }
    ),
    speaker: ChatMessage.getSpeaker({ actor })
  });
}

async function promptForLockDC() {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("DND5E_GM_TOOLKIT.tools.lockpicking.setDcTitle") },
    content: `<p>${game.i18n.localize("DND5E_GM_TOOLKIT.tools.lockpicking.setDcHint")}</p>
      <input type="number" name="dc" value="15" min="1" autofocus>`,
    ok: {
      label: game.i18n.localize("DND5E_GM_TOOLKIT.tools.lockpicking.confirm"),
      callback: (_event, button) => Number(button.form.elements.dc.value)
    },
    rejectClose: false
  });
}
