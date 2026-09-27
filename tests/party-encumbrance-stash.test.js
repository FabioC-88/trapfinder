import { describe, expect, it, vi } from "vitest";
import { eligibleCarriers, readConfig, stashWeight } from "../tools/party-encumbrance/stash.js";

function item(weight, { container = null } = {}) {
  return { container, system: { totalWeightIn: vi.fn(() => weight) } };
}

const options = (overrides = {}) => ({ units: "lb", currencyWeight: false, currencyPerWeight: 50, ...overrides });

describe("stashWeight", () => {
  it("sums the top-level items, in the requested units", () => {
    const items = [item(10), item(5.5)];
    expect(stashWeight({ items, currency: {} }, options())).toBe(15.5);
    expect(items[0].system.totalWeightIn).toHaveBeenCalledWith("lb");
  });

  it("does not count items inside a container twice", () => {
    // The backpack's own total already includes what is inside it, as in dnd5e.
    const items = [item(12), item(4, { container: { id: "backpack" } })];
    expect(stashWeight({ items, currency: {} }, options())).toBe(12);
  });

  it("ignores items with no weight, such as features and spells", () => {
    const items = [{ container: null, system: {} }, item(3)];
    expect(stashWeight({ items, currency: {} }, options())).toBe(3);
  });

  it("adds coins when currency weight is on", () => {
    const currency = { pp: 0, gp: 100, ep: 0, sp: 50, cp: 0 };
    expect(stashWeight({ items: [], currency }, options({ currencyWeight: true }))).toBe(3);
  });

  it("ignores coins when currency weight is off", () => {
    const currency = { gp: 100, sp: 50 };
    expect(stashWeight({ items: [], currency }, options())).toBe(0);
  });

  it("never counts a negative coin amount", () => {
    const currency = { gp: -100, sp: 50 };
    expect(stashWeight({ items: [], currency }, options({ currencyWeight: true }))).toBe(1);
  });
});

describe("readConfig", () => {
  it("defaults to no distribution when the flag is missing", () => {
    expect(readConfig(undefined)).toEqual({ mode: "none", excluded: [] });
  });

  it("sanitizes an unknown mode and a malformed excluded list", () => {
    expect(readConfig({ mode: "bogus", excluded: "x" })).toEqual({ mode: "none", excluded: [] });
    expect(readConfig({ mode: "equal", excluded: ["a", 3] })).toEqual({ mode: "equal", excluded: ["a"] });
  });
});

describe("eligibleCarriers", () => {
  const actor = (id, type) => ({ id, type });

  it("keeps characters and NPCs, drops vehicles, missing actors and excluded members", () => {
    const members = [actor("pc", "character"), actor("mule", "npc"), actor("cart", "vehicle"), null, actor("rogue", "character")];
    expect(eligibleCarriers(members, ["rogue"]).map(a => a.id)).toEqual(["pc", "mule"]);
  });

  it("ignores excluded ids of actors that are no longer members", () => {
    expect(eligibleCarriers([actor("pc", "character")], ["left-the-party"]).map(a => a.id)).toEqual(["pc"]);
  });
});
