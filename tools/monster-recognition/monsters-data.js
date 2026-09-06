/**
 * Curated, non-exhaustive list of common monsters, used to auto-match NPC actors already placed
 * in the world by name. Each entry only carries identity data - no CR (the placed actor's own
 * system.details.cr always governs the DC) and no description text (those live in lang/*.json,
 * localized like the rest of the module: DND5E_GM_TOOLKIT.monsterRecognition.monsters.<key>.description).
 *
 * `type` is a dnd5e creature type key (CONFIG.DND5E.creatureTypes), used as a fallback only when
 * the placed actor itself has no type set - the actor's own type always wins otherwise.
 *
 * `aliases` are additional normalized names that should match this entry (English/Italian
 * spelling variants), on top of `name` itself.
 *
 * Adding a monster means adding an entry here plus its two translation keys: no code change.
 *
 * @typedef {object} MonsterEntry
 * @property {string} key
 * @property {string} name
 * @property {string} type
 * @property {string[]} aliases
 */

/** @type {MonsterEntry[]} */
export const MONSTER_DATA = [
  // Aberration
  { key: "aboleth", name: "Aboleth", type: "aberration", aliases: [] },
  { key: "beholder", name: "Beholder", type: "aberration", aliases: ["occhio tiranno"] },
  { key: "mind-flayer", name: "Mind Flayer", type: "aberration", aliases: ["illithid"] },

  // Beast
  { key: "wolf", name: "Wolf", type: "beast", aliases: ["lupo"] },
  { key: "dire-wolf", name: "Dire Wolf", type: "beast", aliases: ["lupo tremendo"] },
  { key: "giant-spider", name: "Giant Spider", type: "beast", aliases: ["ragno gigante"] },
  { key: "giant-rat", name: "Giant Rat", type: "beast", aliases: ["ratto gigante"] },
  { key: "brown-bear", name: "Brown Bear", type: "beast", aliases: ["orso bruno"] },

  // Celestial
  { key: "pegasus", name: "Pegasus", type: "celestial", aliases: ["pegaso"] },
  { key: "deva", name: "Deva", type: "celestial", aliases: [] },

  // Construct
  { key: "animated-armor", name: "Animated Armor", type: "construct", aliases: ["armatura animata"] },
  { key: "flesh-golem", name: "Flesh Golem", type: "construct", aliases: ["golem di carne"] },
  { key: "stone-golem", name: "Stone Golem", type: "construct", aliases: ["golem di pietra"] },

  // Dragon
  { key: "red-dragon", name: "Red Dragon", type: "dragon", aliases: ["drago rosso"] },
  { key: "black-dragon", name: "Black Dragon", type: "dragon", aliases: ["drago nero"] },
  { key: "blue-dragon", name: "Blue Dragon", type: "dragon", aliases: ["drago blu"] },
  { key: "green-dragon", name: "Green Dragon", type: "dragon", aliases: ["drago verde"] },
  { key: "white-dragon", name: "White Dragon", type: "dragon", aliases: ["drago bianco"] },

  // Elemental
  { key: "fire-elemental", name: "Fire Elemental", type: "elemental", aliases: ["elementale del fuoco"] },
  { key: "water-elemental", name: "Water Elemental", type: "elemental", aliases: ["elementale dell'acqua"] },
  { key: "air-elemental", name: "Air Elemental", type: "elemental", aliases: ["elementale dell'aria"] },
  { key: "earth-elemental", name: "Earth Elemental", type: "elemental", aliases: ["elementale della terra"] },

  // Fey
  { key: "pixie", name: "Pixie", type: "fey", aliases: [] },
  { key: "dryad", name: "Dryad", type: "fey", aliases: ["driade"] },
  { key: "satyr", name: "Satyr", type: "fey", aliases: ["satiro"] },

  // Fiend
  { key: "imp", name: "Imp", type: "fiend", aliases: ["diavoletto"] },
  { key: "quasit", name: "Quasit", type: "fiend", aliases: [] },
  { key: "vrock", name: "Vrock", type: "fiend", aliases: [] },
  { key: "hell-hound", name: "Hell Hound", type: "fiend", aliases: ["cane infernale"] },
  { key: "succubus-incubus", name: "Succubus/Incubus", type: "fiend", aliases: ["succubo", "incubo"] },

  // Giant
  { key: "ogre", name: "Ogre", type: "giant", aliases: ["ogre", "orco delle caverne"] },
  { key: "troll", name: "Troll", type: "giant", aliases: [] },
  { key: "hill-giant", name: "Hill Giant", type: "giant", aliases: ["gigante delle colline"] },
  { key: "frost-giant", name: "Frost Giant", type: "giant", aliases: ["gigante del ghiaccio"] },
  { key: "fire-giant", name: "Fire Giant", type: "giant", aliases: ["gigante del fuoco"] },

  // Humanoid
  { key: "goblin", name: "Goblin", type: "humanoid", aliases: [] },
  { key: "hobgoblin", name: "Hobgoblin", type: "humanoid", aliases: [] },
  { key: "bugbear", name: "Bugbear", type: "humanoid", aliases: [] },
  { key: "orc", name: "Orc", type: "humanoid", aliases: ["orco"] },
  { key: "kobold", name: "Kobold", type: "humanoid", aliases: [] },
  { key: "gnoll", name: "Gnoll", type: "humanoid", aliases: [] },
  { key: "bandit", name: "Bandit", type: "humanoid", aliases: ["bandito"] },
  { key: "drow", name: "Drow", type: "humanoid", aliases: ["elfo oscuro"] },

  // Monstrosity
  { key: "owlbear", name: "Owlbear", type: "monstrosity", aliases: ["gufo orso"] },
  { key: "manticore", name: "Manticore", type: "monstrosity", aliases: ["manticora"] },
  { key: "chimera", name: "Chimera", type: "monstrosity", aliases: ["chimera"] },
  { key: "medusa", name: "Medusa", type: "monstrosity", aliases: [] },
  { key: "minotaur", name: "Minotaur", type: "monstrosity", aliases: ["minotauro"] },
  { key: "mimic", name: "Mimic", type: "monstrosity", aliases: ["mimic", "mimetico"] },

  // Ooze
  { key: "gelatinous-cube", name: "Gelatinous Cube", type: "ooze", aliases: ["cubo gelatinoso"] },
  { key: "ochre-jelly", name: "Ochre Jelly", type: "ooze", aliases: ["melma ocra"] },
  { key: "black-pudding", name: "Black Pudding", type: "ooze", aliases: ["budino nero"] },

  // Plant
  { key: "shambling-mound", name: "Shambling Mound", type: "plant", aliases: ["cumulo brulicante"] },
  { key: "treant", name: "Treant", type: "plant", aliases: ["treant", "ent"] },

  // Undead
  { key: "skeleton", name: "Skeleton", type: "undead", aliases: ["scheletro"] },
  { key: "zombie", name: "Zombie", type: "undead", aliases: ["zombi"] },
  { key: "ghoul", name: "Ghoul", type: "undead", aliases: ["gul"] },
  { key: "wight", name: "Wight", type: "undead", aliases: [] },
  { key: "wraith", name: "Wraith", type: "undead", aliases: ["spettro"] },
  { key: "vampire", name: "Vampire", type: "undead", aliases: ["vampiro"] },
  { key: "lich", name: "Lich", type: "undead", aliases: ["lich"] }
];
