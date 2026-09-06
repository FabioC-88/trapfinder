/**
 * Who hears about a detection.
 *
 * The asymmetry is deliberate: a success is news the character has, so it reaches the player;
 * a failure is news only the GM is allowed to have, because telling a player "you failed to
 * notice something" already tells them there was something to notice.
 *
 * Chat and toast are not alternatives. A whisper stays in the log and reaches a player who is
 * offline; a toast cannot. The whisper is the delivery, the toast is only the nudge.
 *
 * @param {object} options
 * @param {{testUserPermission: (user: object, level: string) => boolean}} options.actor
 * @param {boolean} options.spotted
 * @param {Array<{id: string, isGM: boolean, active: boolean}>} options.users
 * @param {boolean} options.toastEnabled
 * @returns {{chat: string[], toast: string[]}}
 */
export function detectionRecipients({ actor, spotted, users, toastEnabled }) {
  const gmIds = users.filter(u => u.isGM).map(u => u.id);

  if (!spotted) return { chat: gmIds, toast: [] };

  const owners = users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));

  return {
    chat: [...new Set([...gmIds, ...owners.map(u => u.id)])],
    toast: toastEnabled ? owners.filter(u => u.active).map(u => u.id) : []
  };
}
