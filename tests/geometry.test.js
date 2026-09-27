import { describe, expect, it } from "vitest";

// Foundry extends the Math global; vitest does not have it.
Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);

import { closestPointInBounds, closestPointOnSegment, pullBack } from "../core/geometry.js";

describe("closestPointOnSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("projects a point perpendicularly onto the segment", () => {
    expect(closestPointOnSegment({ x: 40, y: 30 }, a, b)).toEqual({ x: 40, y: 0 });
  });

  it("stops at end A for a point beyond A", () => {
    expect(closestPointOnSegment({ x: -50, y: 20 }, a, b)).toEqual({ x: 0, y: 0 });
  });

  it("stops at end B for a point beyond B", () => {
    expect(closestPointOnSegment({ x: 250, y: 20 }, a, b)).toEqual({ x: 100, y: 0 });
  });

  it("returns A for a degenerate segment, without dividing by zero", () => {
    expect(closestPointOnSegment({ x: 10, y: 10 }, a, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("closestPointInBounds", () => {
  const bounds = { left: 100, right: 200, top: 100, bottom: 200 };

  it("returns the point itself if it is inside", () => {
    expect(closestPointInBounds({ x: 150, y: 150 }, bounds)).toEqual({ x: 150, y: 150 });
  });

  it("clamps to a side for a point outside on one axis only", () => {
    expect(closestPointInBounds({ x: 50, y: 150 }, bounds)).toEqual({ x: 100, y: 150 });
  });

  it("clamps to a corner for a point outside diagonally", () => {
    expect(closestPointInBounds({ x: 50, y: 500 }, bounds)).toEqual({ x: 100, y: 200 });
  });
});

describe("pullBack", () => {
  it("pulls the point back toward the observer by the requested distance", () => {
    expect(pullBack({ x: 100, y: 0 }, { x: 0, y: 0 }, 25)).toEqual({ x: 75, y: 0 });
  });

  it("pulls back correctly on a diagonal too", () => {
    const result = pullBack({ x: 30, y: 40 }, { x: 0, y: 0 }, 10);
    expect(result.x).toBeCloseTo(24);
    expect(result.y).toBeCloseTo(32);
  });

  it("returns null if the observer is closer than the pull-back distance", () => {
    expect(pullBack({ x: 10, y: 0 }, { x: 0, y: 0 }, 25)).toBeNull();
  });

  it("returns null if the two points coincide, without dividing by zero", () => {
    expect(pullBack({ x: 10, y: 10 }, { x: 10, y: 10 }, 25)).toBeNull();
  });
});
