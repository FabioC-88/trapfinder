import { describe, expect, it, vi } from "vitest";
import { runDetection } from "../core/detection.js";

function observer({ prc = 12, inv = 10 } = {}) {
  return { id: "pc1", name: "Elandra", system: { skills: { prc: { passive: prc }, inv: { passive: inv } } } };
}

function detectable(overrides = {}) {
  return {
    key: "t1",
    skill: "prc",
    dc: 10,
    point: { x: 0, y: 0 },
    sightPoint: { x: 0, y: 0 },
    range: 10,
    message: null,
    spottedKey: "spotted",
    missedKey: "missed",
    requiresSight: true,
    hasSeen: () => false,
    markSeen: vi.fn(async () => {}),
    ...overrides
  };
}

const near = () => 5;
const far = () => 50;
const clear = () => false;
const blocked = () => true;

describe("runDetection", () => {
  it("skips an already-seen detectable without notifying or marking", async () => {
    const report = vi.fn();
    const d = detectable({ hasSeen: () => true });

    const results = await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(results).toEqual([]);
    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("skips an out-of-range detectable without marking it, so it stays checkable later", async () => {
    const report = vi.fn();
    const d = detectable();

    await runDetection({
      observer: observer(), detectables: [d], measure: far, isSightBlocked: clear, report
    });

    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("spots when the passive equals the DC", async () => {
    const report = vi.fn();
    const d = detectable({ dc: 12 });

    const [result] = await runDetection({
      observer: observer({ prc: 12 }), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(result.spotted).toBe(true);
    expect(result.passive).toBe(12);
    expect(report).toHaveBeenCalledWith(result);
  });

  it("marks as seen even whoever fails, so the GM notification is not repeated", async () => {
    const report = vi.fn();
    const d = detectable({ dc: 20 });

    const [result] = await runDetection({
      observer: observer({ prc: 12 }), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(result.spotted).toBe(false);
    expect(d.markSeen).toHaveBeenCalledOnce();
  });

  it("skips if sight is blocked and the detectable requires it", async () => {
    const report = vi.fn();
    const d = detectable({ requiresSight: true });

    await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: blocked, report
    });

    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("still evaluates if the detectable does not require sight", async () => {
    const report = vi.fn();
    const d = detectable({ requiresSight: false });

    await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: blocked, report
    });

    expect(report).toHaveBeenCalledOnce();
  });

  it("uses sightPoint for sight and point for distance", async () => {
    const measure = vi.fn(() => 5);
    const isSightBlocked = vi.fn(() => false);
    const d = detectable({ point: { x: 1, y: 1 }, sightPoint: { x: 2, y: 2 } });

    await runDetection({
      observer: observer(), detectables: [d], measure, isSightBlocked, report: vi.fn()
    });

    expect(measure).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(isSightBlocked).toHaveBeenCalledWith({ x: 2, y: 2 });
  });

  it("reads the skill named by the detectable", async () => {
    const d = detectable({ skill: "inv", dc: 11 });

    const [result] = await runDetection({
      observer: observer({ prc: 20, inv: 11 }), detectables: [d], measure: near, isSightBlocked: clear, report: vi.fn()
    });

    expect(result.passive).toBe(11);
    expect(result.spotted).toBe(true);
  });

  it("treats a missing skill as passive 0 instead of blowing up", async () => {
    const d = detectable({ skill: "prc", dc: 1 });

    const [result] = await runDetection({
      observer: { id: "pc1", name: "Elandra", system: {} },
      detectables: [d], measure: near, isSightBlocked: clear, report: vi.fn()
    });

    expect(result.passive).toBe(0);
    expect(result.spotted).toBe(false);
  });

  it("evaluates several detectables in the same pass", async () => {
    const report = vi.fn();

    const results = await runDetection({
      observer: observer({ prc: 15 }),
      detectables: [detectable({ key: "a", dc: 10 }), detectable({ key: "b", dc: 20 })],
      measure: near, isSightBlocked: clear, report
    });

    expect(results.map(r => r.spotted)).toEqual([true, false]);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
