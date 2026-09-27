import { describe, expect, it } from "vitest";
import { detectionRecipients } from "../core/recipients.js";

const gm = { id: "gm1", isGM: true, active: true };
const player = { id: "u1", isGM: false, active: true };
const offline = { id: "u2", isGM: false, active: false };
const stranger = { id: "u3", isGM: false, active: true };

/** An actor owned by everyone in `owners`. */
function actorOwnedBy(...owners) {
  const ids = owners.map(u => u.id);
  return { testUserPermission: (user, level) => level === "OWNER" && ids.includes(user.id) };
}

describe("detectionRecipients", () => {
  it("sends a failure only to the GM, never to the player", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, player], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("sends a success to the owner and to the GM", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player, stranger], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("sends the toast only to connected owners", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player, offline), spotted: true, users: [gm, player, offline], toastEnabled: true
    });

    expect(result.toast).toEqual(["u1"]);
    expect(result.chat.sort()).toEqual(["gm1", "u1", "u2"]);
  });

  it("sends no toast to the GM, who already sees the message in chat", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: true
    });

    expect(result.toast).not.toContain("gm1");
  });

  it("sends no toast at all if the setting is off", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: false
    });

    expect(result.toast).toEqual([]);
    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("with an ownerless PC notifies only the GM, without breaking", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(), spotted: true, users: [gm, stranger], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("does not duplicate a GM who also owns the PC", () => {
    const gmOwner = { id: "gm1", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(gmOwner), spotted: true, users: [gmOwner], toastEnabled: true
    });

    expect(result.chat).toEqual(["gm1"]);
  });

  it("notifies every GM present, not only the first", () => {
    const gm2 = { id: "gm2", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, gm2, player], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "gm2"]);
  });
});
