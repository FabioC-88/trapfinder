import { describe, expect, it } from "vitest";
import { joinList, narrativeBeats } from "../tools/monster-recognition/narrate.js";

function profile(statblock = {}, extra = {}) {
  return {
    statblock: {
      senses: [], movement: [], traits: [], attacks: [],
      resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [],
      languages: [], ...statblock
    },
    ...extra
  };
}

const keysOf = beats => beats.map(beat => beat.key);

describe("narrativeBeats - natura", () => {
  it("dice tipo e taglia insieme quando li conosce entrambi", () => {
    const beats = narrativeBeats(profile({}, { type: "giant", size: "lg" }));

    expect(beats[0]).toEqual({ key: "nature", type: "giant", size: "lg" });
  });

  it("ripiega sulla sola natura se manca la taglia", () => {
    const beats = narrativeBeats(profile({}, { type: "giant" }));

    expect(beats[0].key).toBe("natureNoSize");
  });

  it("non dice niente sulla natura se il mostro non ha un tipo", () => {
    expect(keysOf(narrativeBeats(profile()))).not.toContain("nature");
  });
});

describe("narrativeBeats - sensi", () => {
  it("distingue il vedere al buio dal vederci benissimo molto lontano", () => {
    const vicino = narrativeBeats(profile({ senses: [{ key: "darkvision", value: 60 }] }));
    const lontano = narrativeBeats(profile({ senses: [{ key: "darkvision", value: 120 }] }));

    expect(keysOf(vicino)).toContain("darkvision");
    expect(keysOf(lontano)).toContain("darkvisionFar");
  });

  it("porta gli altri sensi con la loro frase", () => {
    const beats = narrativeBeats(profile({
      senses: [{ key: "blindsight", value: 30 }, { key: "tremorsense", value: 60 }]
    }));

    expect(keysOf(beats)).toEqual(["blindsight", "tremorsense"]);
  });

  it("non porta mai con sé un numero", () => {
    const beats = narrativeBeats(profile({ senses: [{ key: "darkvision", value: 60 }] }));

    expect(JSON.stringify(beats)).not.toContain("60");
  });
});

describe("narrativeBeats - tratti", () => {
  it("riconosce i tratti sia in inglese sia in italiano", () => {
    const inglese = narrativeBeats(profile({ traits: ["Keen Smell", "Pack Tactics"] }));
    const italiano = narrativeBeats(profile({ traits: ["Olfatto Acuto", "Tattiche di Branco"] }));

    expect(keysOf(inglese)).toEqual(["keenSmell", "packTactics"]);
    expect(keysOf(italiano)).toEqual(["keenSmell", "packTactics"]);
  });

  it("ignora un tratto che non sa raccontare, invece di vomitarne le regole", () => {
    const beats = narrativeBeats(profile({ traits: ["Bizzarria Homebrew di Fabio"] }));

    expect(beats).toEqual([]);
  });

  it("non ripete due volte la stessa frase", () => {
    const beats = narrativeBeats(profile({ traits: ["Keen Smell", "Olfatto Acuto"] }));

    expect(keysOf(beats)).toEqual(["keenSmell"]);
  });

  it("non dice 'sensi acuti' a chi ha già un olfatto acutissimo", () => {
    const beats = narrativeBeats(profile({ traits: ["Keen Hearing", "Keen Smell"] }));

    expect(keysOf(beats)).toEqual(["keenSmell"]);
  });
});

describe("narrativeBeats - attacchi e difese", () => {
  it("porta gli attacchi con i loro nomi", () => {
    const beats = narrativeBeats(profile({ attacks: ["Morso", "Artiglio"] }));

    expect(beats).toEqual([{ key: "attacks", list: ["Morso", "Artiglio"] }]);
  });

  it("porta le difese come chiavi grezze, da tradurre a valle", () => {
    const beats = narrativeBeats(profile({
      immunities: ["poison"], vulnerabilities: ["fire"], conditionImmunities: ["charmed"]
    }));

    expect(beats).toEqual([
      { key: "immunities", list: ["poison"] },
      { key: "vulnerabilities", list: ["fire"] },
      { key: "conditionImmunities", list: ["charmed"] }
    ]);
  });

  it("tace su ciò che il mostro non ha", () => {
    expect(narrativeBeats(profile())).toEqual([]);
  });
});

describe("narrativeBeats - robustezza", () => {
  it("non esplode su un profilo vuoto", () => {
    expect(() => narrativeBeats(undefined)).not.toThrow();
    expect(narrativeBeats({})).toEqual([]);
  });
});

describe("joinList", () => {
  it("elenca come parlerebbe una persona", () => {
    expect(joinList(["morso"], "e")).toBe("morso");
    expect(joinList(["morso", "artigli"], "e")).toBe("morso e artigli");
    expect(joinList(["morso", "artigli", "coda"], "e")).toBe("morso, artigli e coda");
  });

  it("regge una lista vuota o con buchi", () => {
    expect(joinList([], "e")).toBe("");
    expect(joinList(undefined, "e")).toBe("");
    expect(joinList(["morso", "", null], "e")).toBe("morso");
  });
});
