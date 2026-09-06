import { describe, expect, it } from "vitest";
import { formatCR, plainText, summarizeStatblock } from "../tools/monster-recognition/statblock.js";

/** Shaped like a dnd5e NPC actor, with only the paths this module reads. */
function actor({ senses = {}, movement = {}, traits = {}, skills = {}, items = [] } = {}) {
  return {
    system: {
      attributes: { senses, movement },
      traits,
      skills
    },
    items
  };
}

describe("summarizeStatblock - sensi", () => {
  it("tiene solo i sensi presenti, con il loro valore", () => {
    const result = summarizeStatblock(actor({
      senses: { darkvision: 60, blindsight: 0, tremorsense: null, truesight: 120, units: "ft" }
    }));

    expect(result.senses).toEqual([
      { key: "darkvision", value: 60 },
      { key: "truesight", value: 120 }
    ]);
    expect(result.sensesUnits).toBe("ft");
  });

  it("legge la percezione passiva e i sensi in testo libero", () => {
    const result = summarizeStatblock(actor({
      senses: { special: "percepisce le vibrazioni; fiuto acuto" },
      skills: { prc: { passive: 14 } }
    }));

    expect(result.passivePerception).toBe(14);
    expect(result.specialSenses).toEqual(["percepisce le vibrazioni", "fiuto acuto"]);
  });

  it("non inventa una percezione passiva che non c'è", () => {
    expect(summarizeStatblock(actor()).passivePerception).toBeNull();
  });
});

describe("summarizeStatblock - velocità", () => {
  it("elenca solo le velocità che cambiano una decisione, mai quella base a piedi", () => {
    const result = summarizeStatblock(actor({
      movement: { walk: 30, fly: 60, swim: 0, burrow: 20, hover: true, units: "ft" }
    }));

    expect(result.movement).toEqual([
      { key: "fly", value: 60 },
      { key: "burrow", value: 20 }
    ]);
    expect(result.hover).toBe(true);
  });
});

describe("summarizeStatblock - difese", () => {
  it("legge un Set (dnd5e v3+) tanto quanto un array", () => {
    const result = summarizeStatblock(actor({
      traits: {
        di: { value: new Set(["poison", "fire"]) },
        dr: { value: ["cold"] }
      }
    }));

    expect(result.immunities).toEqual(["poison", "fire"]);
    expect(result.resistances).toEqual(["cold"]);
  });

  it("aggiunge le voci personalizzate accanto a quelle standard", () => {
    const result = summarizeStatblock(actor({
      traits: {
        dr: { value: new Set(["bludgeoning"]), custom: "da armi non magiche; da fonti naturali" }
      }
    }));

    expect(result.resistances).toEqual([
      "bludgeoning", "da armi non magiche", "da fonti naturali"
    ]);
  });

  it("restituisce liste vuote, non undefined, per un mostro senza difese speciali", () => {
    const result = summarizeStatblock(actor());

    expect(result.resistances).toEqual([]);
    expect(result.immunities).toEqual([]);
    expect(result.vulnerabilities).toEqual([]);
    expect(result.conditionImmunities).toEqual([]);
  });
});

describe("summarizeStatblock - tratti e azioni", () => {
  const items = [
    {
      name: "Rigenerazione",
      type: "feat",
      system: { activation: {}, description: { value: "<p>Recupera 10 pf all'inizio del suo turno.</p>" } }
    },
    { name: "Olfatto Acuto", type: "feat", system: {} },
    { name: "Multiattacco", type: "feat", system: { activation: { type: "action" } } },
    { name: "Morso", type: "weapon", system: {} },
    { name: "Pozione di Guarigione", type: "consumable", system: {} }
  ];

  it("separa ciò che la creatura ha da ciò che la creatura fa", () => {
    const result = summarizeStatblock(actor({ items }));

    expect(result.traits.map(trait => trait.name)).toEqual(["Rigenerazione", "Olfatto Acuto"]);
    expect(result.actions).toEqual(["Multiattacco", "Morso"]);
  });

  it("porta con sé il testo del tratto, che è la metà utile", () => {
    const result = summarizeStatblock(actor({ items }));

    expect(result.traits[0].description).toBe("Recupera 10 pf all'inizio del suo turno.");
    expect(result.traits[1].description).toBe("");
  });

  it("ignora gli oggetti che non sono né tratti né attacchi", () => {
    const result = summarizeStatblock(actor({ items }));

    expect(result.traits.map(trait => trait.name)).not.toContain("Pozione di Guarigione");
    expect(result.actions).not.toContain("Pozione di Guarigione");
  });
});

describe("plainText", () => {
  it("toglie i tag HTML e normalizza gli spazi", () => {
    expect(plainText("<p>Prima riga.</p>\n<p>Seconda   riga.</p>")).toBe("Prima riga. Seconda riga.");
    expect(plainText("Colpisce<br>e morde")).toBe("Colpisce e morde");
  });

  it("riduce gli enricher di Foundry al loro testo leggibile", () => {
    expect(plainText("Subisce [[/damage 10 fire]]{10 danni da fuoco}")).toBe("Subisce 10 danni da fuoco");
    expect(plainText("Vedi @UUID[Compendium.x.y]{Rigenerazione}")).toBe("Vedi Rigenerazione");
  });

  it("decodifica le entità HTML", () => {
    expect(plainText("<p>fuoco &amp; acido</p>")).toBe("fuoco & acido");
  });

  it("tronca su un confine di parola, senza spezzarla", () => {
    const long = `${"parola ".repeat(80)}fine`;
    const result = plainText(long);

    expect(result.length).toBeLessThanOrEqual(301);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("parol…");
  });

  it("non si rompe su input vuoto o non testuale", () => {
    expect(plainText(undefined)).toBe("");
    expect(plainText("")).toBe("");
    expect(plainText(42)).toBe("");
  });
});

describe("summarizeStatblock - robustezza", () => {
  it("non esplode su un attore vuoto o malformato", () => {
    expect(() => summarizeStatblock(undefined)).not.toThrow();
    expect(() => summarizeStatblock({})).not.toThrow();
    expect(summarizeStatblock({}).senses).toEqual([]);
  });
});

describe("formatCR", () => {
  it("mostra i GS frazionari come li conosce il tavolo", () => {
    expect(formatCR(0.125)).toBe("1/8");
    expect(formatCR(0.25)).toBe("1/4");
    expect(formatCR(0.5)).toBe("1/2");
  });

  it("lascia intatti i GS interi", () => {
    expect(formatCR(5)).toBe("5");
    expect(formatCR(0)).toBe("0");
  });
});
