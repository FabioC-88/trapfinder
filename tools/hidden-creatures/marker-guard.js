import { HIDING_STATUS } from "./sources.js";

/**
 * Requiring both markers means forgetting one produces no detection at all, silently - the worst
 * way for this to fail, because nothing looks broken. These two hooks turn that silence into a
 * one-line notice for the GM.
 *
 * It only ever tells: no marker is applied or removed automatically. Hiding a token and declaring
 * a creature hidden are two different intentions, and guessing which one was meant would be worse
 * than saying nothing.
 */
export function registerMarkerGuard() {
  Hooks.on("createActiveEffect", (effect) => {
    if (!game.user.isGM) return;
    if (!effect.statuses?.has(HIDING_STATUS)) return;

    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    if (actor.type === "character") return;

    const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
    const visible = tokens.filter(token => token && !token.hidden);
    if (!visible.length) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsHidden", {
        name: actor.name
      })
    );
  });

  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (!game.user.isGM) return;
    if (changes.hidden !== true) return;
    if (tokenDocument.actor?.type === "character") return;
    if (tokenDocument.actor?.statuses?.has(HIDING_STATUS)) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsStatus", {
        name: tokenDocument.name
      })
    );
  });
}
