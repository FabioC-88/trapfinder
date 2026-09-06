import { describe, expect, it } from "vitest";
import {
  computeIdentificationDC,
  evaluateRecognition,
  findMonsterByName,
  normalizeName,
  skillForType
} from "../tools/monster-recognition/monster-database.js";

const database = [
  { key: "goblin", name: "Goblin", type: "humanoid", aliases: [] },
  { key: "red-dragon", name: "Red Dragon", type: "dragon", aliases: ["drago rosso"] }
];

describe("normalizeName", () => {
  it("ignora maiuscole, spazi doppi e accenti", () => {
    expect(normalizeName("  Drago   Rosso  ")).toBe("drago rosso");
    expect(normalizeName("Driade")).toBe("driade");
    expect(normalizeName("Ünicörn")).toBe("unicorn");
  });

  it("restituisce stringa vuota per input assente", () => {
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(null)).toBe("");
  });
});

describe("findMonsterByName", () => {
  it("trova una corrispondenza esatta sul nome", () => {
    expect(findMonsterByName("Goblin", database)?.key).toBe("goblin");
  });

  it("trova una corrispondenza su un alias, a prescindere da maiuscole/spazi", () => {
    expect(findMonsterByName("  drago ROSSO ", database)?.key).toBe("red-dragon");
  });

  it("non trova nulla per un nome che non combacia, niente corrispondenza fuzzy", () => {
    expect(findMonsterByName("Goblin Boss", database)).toBeNull();
    expect(findMonsterByName("Gobbo", database)).toBeNull();
  });
});

describe("skillForType", () => {
  const expected = {
    aberration: "arc", construct: "arc", dragon: "arc", elemental: "arc",
    beast: "nat", plant: "nat", fey: "nat",
    undead: "rel", celestial: "rel", fiend: "rel",
    giant: "his", humanoid: "his", monstrosity: "his"
  };

  it.each(Object.entries(expected))("mappa %s su %s", (type, skill) => {
    expect(skillForType(type)).toBe(skill);
  });

  it("restituisce null per un tipo sconosciuto", () => {
    expect(skillForType("ooze")).toBeNull();
    expect(skillForType(undefined)).toBeNull();
  });
});

describe("computeIdentificationDC", () => {
  it("CD 10 per GS 0", () => {
    expect(computeIdentificationDC(0)).toBe(10);
  });

  it("arrotonda per eccesso un GS frazionario", () => {
    expect(computeIdentificationDC(0.125)).toBe(11);
    expect(computeIdentificationDC(0.25)).toBe(11);
    expect(computeIdentificationDC(0.5)).toBe(11);
  });

  it("somma direttamente un GS intero", () => {
    expect(computeIdentificationDC(5)).toBe(15);
  });

  it("tratta un GS assente come 0", () => {
    expect(computeIdentificationDC(undefined)).toBe(10);
  });
});

describe("evaluateRecognition", () => {
  it("già noto vince su tutto il resto", () => {
    expect(evaluateRecognition({ alreadyKnown: true, passive: 0, dc: 20 })).toBe("known");
  });

  it("riconosciuto quando la passiva eguaglia o supera la CD", () => {
    expect(evaluateRecognition({ alreadyKnown: false, passive: 15, dc: 15 })).toBe("recognized");
    expect(evaluateRecognition({ alreadyKnown: false, passive: 16, dc: 15 })).toBe("recognized");
  });

  it("mancato quando la passiva è sotto la CD", () => {
    expect(evaluateRecognition({ alreadyKnown: false, passive: 14, dc: 15 })).toBe("missed");
  });
});
