import { describe, expect, it } from "vitest";

// Foundry extends the Math global; vitest does not have it.
Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);

import { closestPointInBounds, closestPointOnSegment, pullBack } from "../core/geometry.js";

describe("closestPointOnSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("proietta un punto perpendicolare sul segmento", () => {
    expect(closestPointOnSegment({ x: 40, y: 30 }, a, b)).toEqual({ x: 40, y: 0 });
  });

  it("si ferma all'estremo A per un punto oltre A", () => {
    expect(closestPointOnSegment({ x: -50, y: 20 }, a, b)).toEqual({ x: 0, y: 0 });
  });

  it("si ferma all'estremo B per un punto oltre B", () => {
    expect(closestPointOnSegment({ x: 250, y: 20 }, a, b)).toEqual({ x: 100, y: 0 });
  });

  it("restituisce A per un segmento degenere, senza dividere per zero", () => {
    expect(closestPointOnSegment({ x: 10, y: 10 }, a, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("closestPointInBounds", () => {
  const bounds = { left: 100, right: 200, top: 100, bottom: 200 };

  it("restituisce il punto stesso se è dentro", () => {
    expect(closestPointInBounds({ x: 150, y: 150 }, bounds)).toEqual({ x: 150, y: 150 });
  });

  it("blocca su un lato per un punto fuori su un solo asse", () => {
    expect(closestPointInBounds({ x: 50, y: 150 }, bounds)).toEqual({ x: 100, y: 150 });
  });

  it("blocca su uno spigolo per un punto fuori in diagonale", () => {
    expect(closestPointInBounds({ x: 50, y: 500 }, bounds)).toEqual({ x: 100, y: 200 });
  });
});

describe("pullBack", () => {
  it("arretra il punto verso l'osservatore della distanza chiesta", () => {
    expect(pullBack({ x: 100, y: 0 }, { x: 0, y: 0 }, 25)).toEqual({ x: 75, y: 0 });
  });

  it("arretra correttamente anche in diagonale", () => {
    const result = pullBack({ x: 30, y: 40 }, { x: 0, y: 0 }, 10);
    expect(result.x).toBeCloseTo(24);
    expect(result.y).toBeCloseTo(32);
  });

  it("restituisce null se l'osservatore è più vicino della distanza di arretramento", () => {
    expect(pullBack({ x: 10, y: 0 }, { x: 0, y: 0 }, 25)).toBeNull();
  });

  it("restituisce null se i due punti coincidono, senza dividere per zero", () => {
    expect(pullBack({ x: 10, y: 10 }, { x: 10, y: 10 }, 25)).toBeNull();
  });
});
