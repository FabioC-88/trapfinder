import { describe, expect, it } from "vitest";
import { allocate, applyShare, changedIds, mergeShares } from "../tools/party-encumbrance/allocate.js";

const carrier = (id, own, max) => ({ id, own, max });
const asObject = map => Object.fromEntries(map);

describe("allocate", () => {
  it("splits the weight equally in equal mode", () => {
    const carriers = [carrier("a", 0, 150), carrier("b", 100, 150), carrier("c", 0, 60)];
    expect(asObject(allocate(30, carriers, "equal"))).toEqual({ a: 10, b: 10, c: 10 });
  });

  it("weights by the room each carrier has left in available mode", () => {
    // a has 140 lb of room, b has 60: 100 lb split 70/30.
    const carriers = [carrier("a", 10, 150), carrier("b", 90, 150)];
    expect(asObject(allocate(100, carriers, "available"))).toEqual({ a: 70, b: 30 });
  });

  it("gives nothing to a carrier already over capacity while others have room", () => {
    const carriers = [carrier("a", 200, 150), carrier("b", 0, 100)];
    expect(asObject(allocate(30, carriers, "available"))).toEqual({ a: 0, b: 30 });
  });

  it("falls back to maximum capacity when everybody is full in available mode", () => {
    const carriers = [carrier("a", 150, 150), carrier("b", 200, 100)];
    expect(asObject(allocate(50, carriers, "available"))).toEqual({ a: 30, b: 20 });
  });

  it("weights by maximum capacity in maximum mode", () => {
    const carriers = [carrier("a", 0, 150), carrier("b", 0, 50)];
    expect(asObject(allocate(40, carriers, "maximum"))).toEqual({ a: 30, b: 10 });
  });

  it("falls back to equal shares when no carrier has any capacity", () => {
    const carriers = [carrier("a", 0, 0), carrier("b", 0, 0)];
    expect(asObject(allocate(10, carriers, "maximum"))).toEqual({ a: 5, b: 5 });
  });

  it("treats a non-finite capacity as zero instead of spreading NaN", () => {
    const carriers = [carrier("a", 0, Infinity), carrier("b", 0, 100), carrier("c", 0, NaN)];
    expect(asObject(allocate(20, carriers, "maximum"))).toEqual({ a: 0, b: 20, c: 0 });
    expect(asObject(allocate(20, carriers, "available"))).toEqual({ a: 0, b: 20, c: 0 });
  });

  it("treats a non-finite own weight as zero instead of spreading NaN", () => {
    const carriers = [carrier("a", NaN, 100), carrier("b", 0, 100)];
    expect(asObject(allocate(20, carriers, "available"))).toEqual({ a: 10, b: 10 });
  });

  it("gives everything to a single carrier, like a pack mule", () => {
    expect(asObject(allocate(123.4, [carrier("mule", 20, 420)], "available"))).toEqual({ mule: 123.4 });
  });

  it("rounds each share to a tenth, like dnd5e", () => {
    const carriers = [carrier("a", 0, 150), carrier("b", 0, 150), carrier("c", 0, 150)];
    expect(asObject(allocate(10, carriers, "equal"))).toEqual({ a: 3.3, b: 3.3, c: 3.3 });
  });

  it("returns no shares with no carriers, no weight or an unknown mode", () => {
    expect(allocate(50, [], "equal").size).toBe(0);
    expect(allocate(0, [carrier("a", 0, 150)], "equal").size).toBe(0);
    expect(allocate(-5, [carrier("a", 0, 150)], "equal").size).toBe(0);
    expect(allocate(50, [carrier("a", 0, 150)], "none").size).toBe(0);
  });
});

describe("mergeShares", () => {
  it("sums an actor's shares across groups and keeps where each one comes from", () => {
    const merged = mergeShares([
      { groupId: "g1", groupName: "The Company", shares: new Map([["a", 10], ["b", 5]]) },
      { groupId: "g2", groupName: "Night Watch", shares: new Map([["a", 2.5]]) }
    ]);

    expect(merged.get("a")).toEqual({
      total: 12.5,
      bySource: [
        { groupId: "g1", groupName: "The Company", share: 10 },
        { groupId: "g2", groupName: "Night Watch", share: 2.5 }
      ]
    });
    expect(merged.get("b").total).toBe(5);
  });

  it("leaves out zero shares, so a full carrier gets no tooltip line", () => {
    const merged = mergeShares([
      { groupId: "g1", groupName: "The Company", shares: new Map([["a", 0], ["b", 4]]) }
    ]);

    expect(merged.has("a")).toBe(false);
    expect(merged.get("b").total).toBe(4);
  });
});

describe("changedIds", () => {
  it("reports actors whose share appeared, disappeared or changed, and nothing else", () => {
    const entry = total => ({ total, bySource: [{ groupId: "g1", groupName: "G", share: total }] });
    const before = new Map([["same", entry(5)], ["changed", entry(5)], ["gone", entry(5)]]);
    const after = new Map([["same", entry(5)], ["changed", entry(7)], ["new", entry(1)]]);

    expect([...changedIds(before, after)].sort()).toEqual(["changed", "gone", "new"]);
  });
});

describe("applyShare", () => {
  const encumbrance = (value, max) => ({ value, max, pct: Math.min((value * 100) / max, 100) });

  it("records the own weight and changes nothing else without a share", () => {
    const result = applyShare(encumbrance(30, 150), undefined);
    expect(result).toMatchObject({ value: 30, pct: 20, stash: { own: 30, share: 0, bySource: [] } });
  });

  it("adds the share to the carried weight and recomputes the bar", () => {
    const bySource = [{ groupId: "g1", groupName: "The Company", share: 45 }];
    const result = applyShare(encumbrance(30, 150), { total: 45, bySource });

    expect(result.value).toBe(75);
    expect(result.pct).toBe(50);
    expect(result.stash).toEqual({ own: 30, share: 45, bySource });
  });

  it("caps the bar at 100% and survives a zero capacity", () => {
    expect(applyShare(encumbrance(140, 150), { total: 45, bySource: [] }).pct).toBe(100);
    expect(applyShare({ value: 0, max: 0, pct: 0 }, { total: 5, bySource: [] }).pct).toBe(100);
  });
});
