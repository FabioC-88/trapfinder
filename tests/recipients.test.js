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
  it("manda un fallimento solo al DM, mai al giocatore", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, player], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("manda una riuscita al proprietario e al DM", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player, stranger], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("manda il toast solo ai proprietari connessi", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player, offline), spotted: true, users: [gm, player, offline], toastEnabled: true
    });

    expect(result.toast).toEqual(["u1"]);
    expect(result.chat.sort()).toEqual(["gm1", "u1", "u2"]);
  });

  it("non manda toast al DM, che il messaggio lo vede già in chat", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: true
    });

    expect(result.toast).not.toContain("gm1");
  });

  it("non manda alcun toast se l'impostazione è spenta", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: false
    });

    expect(result.toast).toEqual([]);
    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("con un PG senza proprietario avvisa solo il DM, senza rompersi", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(), spotted: true, users: [gm, stranger], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("non duplica un DM che è anche proprietario del PG", () => {
    const gmOwner = { id: "gm1", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(gmOwner), spotted: true, users: [gmOwner], toastEnabled: true
    });

    expect(result.chat).toEqual(["gm1"]);
  });

  it("avvisa tutti i DM presenti, non solo il primo", () => {
    const gm2 = { id: "gm2", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, gm2, player], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "gm2"]);
  });
});
