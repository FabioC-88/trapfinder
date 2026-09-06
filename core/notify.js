import { detectionRecipients } from "./recipients.js";

/**
 * Delivery of a detection result: a whisper that persists in the log, plus an optional toast
 * that only draws the eye. See core/recipients.js for who gets which.
 */

const TOAST_ACTION = "toast";

/**
 * Listens for toasts addressed to this client. Every client runs this; the GM's own detections
 * are delivered to players through it.
 * @param {string} moduleId
 */
export function registerSocket(moduleId) {
  game.socket.on(`module.${moduleId}`, ({ action, userIds, text } = {}) => {
    if (action !== TOAST_ACTION) return;
    if (!userIds?.includes(game.user.id)) return;
    ui.notifications.info(text);
  });
}

/**
 * @param {object} options
 * @param {string} options.moduleId
 * @param {object} options.observer      Actor of the observing PC.
 * @param {object} options.detectable    See core/detection.js.
 * @param {boolean} options.spotted
 * @param {boolean} options.toastEnabled
 * @returns {Promise<void>}
 */
export async function reportDetection({ moduleId, observer, detectable, spotted, toastEnabled }) {
  const { chat, toast } = detectionRecipients({
    actor: observer,
    spotted,
    users: game.users.contents,
    toastEnabled
  });

  const text = detectionText({ observer, detectable, spotted });

  await ChatMessage.create({ content: text, whisper: chat });

  if (toast.length) {
    game.socket.emit(`module.${moduleId}`, { action: TOAST_ACTION, userIds: toast, text });
  }
}

/**
 * The custom message describes what the character notices, so it is only ever used on a success.
 * A failure always gets the generic line: the custom text would give away what was there.
 * @returns {string}
 */
function detectionText({ observer, detectable, spotted }) {
  const data = { name: observer.name, dc: detectable.dc };

  if (!spotted) return game.i18n.format(detectable.missedKey, data);

  const custom = detectable.message?.trim();
  return custom || game.i18n.format(detectable.spottedKey, data);
}
