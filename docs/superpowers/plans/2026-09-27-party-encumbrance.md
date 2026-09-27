# Party Stash Encumbrance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the weight stored in a dnd5e Group actor count toward its members' encumbrance, split in one of three GM-chosen modes among the members ticked as carriers. First, take the Monster Recognition tool out of the package entirely (backed up outside the repo), since its bestiary content is Wizards of the Coast material that must not ship in a published module.

**Architecture:** A pure core (`allocate.js`, `stash.js`) computes each carrier's share from the Group's stash weight; `refresh.js` keeps a module-level cache of those shares and re-prepares the actors whose share changed; a libWrapper `WRAPPER` on dnd5e's static `AttributesFields.prepareEncumbrance` adds the cached share after the native calculation. UI is injected into the native Group sheet (mode menu, carrier checkboxes) and PC/NPC sheets (tooltip). Nothing is written to the PCs: the only stored data is one flag on the Group.

**Tech Stack:** Foundry VTT v14, dnd5e 5.3.x / 6.0.x, ES modules loaded directly (no bundler), libWrapper or the vendored shim in `lib/`, vitest for the pure code.

**Spec:** `docs/superpowers/specs/2026-09-27-party-encumbrance-design.md`

## Global Constraints

- Module id `trapfinder`; tool id `party-encumbrance`; i18n namespace `DND5E_GM_TOOLKIT`.
- English is the base language: every user-facing string goes into `lang/en.json` **and** a full Italian translation in `lang/it.json`. No hand-written text in the code.
- Everything written to the repo (code, comments, test names, commit messages) is in English.
- No bundler, no runtime dependency: every import has an explicit `.js` extension and a relative path.
- The tool is off by default and its toggle uses `requiresReload: true`, like every other tool.
- Unlike the detection tools, this tool's hooks run on **every client**, not GM-side only: encumbrance is derived data every client prepares for itself. Only the status-effect write (`updateEncumbrance`) is restricted to the active GM.
- The only persisted data is the Group flag `flags.trapfinder.partyEncumbrance = { mode: "none" | "equal" | "available" | "maximum", excluded: string[] }`. Nothing is written to PCs or NPCs.
- Carriers are members of type `character` or `npc`. Vehicles never carry and never get a share.
- "Available capacity" = `max(0, encumbrance.max − own weight)` (the world uses dnd5e's Standard encumbrance rule).
- Shares are rounded to 0.1 like dnd5e.
- The native calculation always runs first; an error in the tool leaves the native encumbrance untouched.
- New `lang` keys go under `tools.partyEncumbrance` and a new top-level `partyEncumbrance` block placed right after `surprise`.
- After Task 1 nothing of Monster Recognition may remain in the package: no code, no tests, no strings, no settings, no flags, no docs. The only copy lives in the backup folder outside the repo.

## Deviations from the spec

Decided while writing this plan; the spec's intent is unchanged.

1. `allocate.js` also holds `mergeShares`, `changedIds` and `applyShare`. They are pure math, and `applyShare` cannot live in `encumbrance-wrapper.js` and still be unit-tested: that file imports the libWrapper shim, which touches `Hooks` at import time.
2. `encumbrance.encumbered` is **not** recomputed. dnd5e computes it as `value > encumbrance.heavilyEncumbered`, a property that does not exist, so it is always `false`, and nothing in dnd5e reads it. Statuses come from `updateEncumbrance()`, which reads `value` against `thresholds`, and `value` is what we change.
3. Tests are split into `tests/party-encumbrance-allocate.test.js` and `tests/party-encumbrance-stash.test.js`, one per source file, instead of a single `party-encumbrance.test.js`.
4. `npm test` is scoped to `tests/` (`vitest run --dir tests`). Without it, vitest also picks up the test files inside `.claude/worktrees/*`, and the counts below would depend on whatever branch is checked out there.
5. A small stylesheet `tools/party-encumbrance/party-encumbrance.css`, registered in `module.json`, lays out the injected controls.

## Review Focus

1. A carrier whose `encumbrance.max` is not a finite number (Infinity or NaN from odd data): shares must stay numbers, never NaN. Pinned by the "non-finite capacity" test in Task 4.
2. A carrier with zero capacity receiving a share: its bar must read full (100%), not NaN. Pinned by the "zero capacity" test in Task 4.
3. Stale ids left in `excluded` by members who left the Group: they must be ignored silently. Pinned by the "no longer members" test in Task 5.
4. The Group sheet re-rendering (tab switch, item drop, flag change): the injected controls must never duplicate. Pinned by the re-render manual check in Task 7.
5. A player looking at the Group sheet: they must not see the share weight of a member they cannot observe (dnd5e already hides that member's stats), and must not be able to change mode or carriers. Pinned by the player manual check in Task 7.

## File structure

| File | Responsibility | Pure? |
|---|---|---|
| `tools/party-encumbrance/allocate.js` | shares from weight + carriers + mode; merge across groups; diff; apply a share to an encumbrance object | yes, tested |
| `tools/party-encumbrance/stash.js` | stash weight, flag sanitizing, carrier filtering (pure) + thin Foundry adapters | pure part tested |
| `tools/party-encumbrance/refresh.js` | share cache, recompute, re-prepare changed actors, event hooks | no |
| `tools/party-encumbrance/encumbrance-wrapper.js` | libWrapper on `prepareEncumbrance` | no |
| `tools/party-encumbrance/group-sheet.js` | mode menu, carrier checkboxes, share lines on the Group sheet | no |
| `tools/party-encumbrance/actor-sheet.js` | tooltip on PC/NPC encumbrance bars | no |
| `tools/party-encumbrance/party-encumbrance.css` | layout of the injected controls | — |
| `tools/party-encumbrance/index.js` | tool descriptor: toggle, wiring | no |
| `tests/lang.test.js` | en/it key parity for the whole module | yes |

---

### Task 1: Take Monster Recognition out of the package, backed up outside the repo

The Monster Recognition tool ships a bestiary database (creature names and lore descriptions drawn
from Wizards of the Coast books) that must not be in a module that may be published. It is not
being developed further for now: the whole tool leaves the package, and a complete copy goes to a
folder outside the repo so nothing is lost.

**Backup folder:** `C:\Users\cotta\Documents\Repo\trapfinder-monster-recognition-backup` (a sibling
of the repo, not inside it). If the user picked another location, use theirs everywhere below.

**Files:**
- Delete: `tools/monster-recognition/` (whole folder, including `monster-list.css`)
- Delete: `tests/monster-recognition.test.js`, `tests/narrate.test.js`, `tests/statblock.test.js`
- Delete: `docs/superpowers/specs/2026-09-06-monster-recognition-design.md`,
  `docs/superpowers/specs/2026-09-07-espansione-database-mostri-design.md`,
  `docs/superpowers/plans/2026-09-06-monster-recognition.md`,
  `docs/superpowers/plans/2026-09-07-espansione-database-mostri.md`
- Modify: `tools/index.js`, `scripts/constants.js`, `module.json`, `lang/en.json`, `lang/it.json`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a package with four tools (passive detection, hidden creatures, lockpicking, and later
  party encumbrance); `module.json` with an empty `styles` list, which Task 7 fills again; the
  backup folder described below.

- [ ] **Step 1: Make sure nothing is still writing to the monster branch**

The branch `worktree-espansione-database-mostri`, checked out in
`.claude/worktrees/espansione-database-mostri`, holds an import of the bestiary that another
session was running batch by batch. Ask the user to confirm that session is stopped before taking
the backup, so the backup is not missing a batch in flight. Do not continue without that
confirmation.

- [ ] **Step 2: Take the backup**

Run from the repo root (Git Bash):

```bash
BACKUP="/c/Users/cotta/Documents/Repo/trapfinder-monster-recognition-backup"
WT=".claude/worktrees/espansione-database-mostri"
BRANCH="worktree-espansione-database-mostri"
mkdir -p "$BACKUP"/{tool,tests,lang,docs,expanded,worktree-working-files}

# Every branch and commit, including the expanded database: the backup that can restore anything.
git bundle create "$BACKUP/trapfinder-all-branches.bundle" --all
git bundle verify "$BACKUP/trapfinder-all-branches.bundle"

# Plain copies of the tool as it is on main, readable without git.
cp -r tools/monster-recognition "$BACKUP/tool/"
cp tests/monster-recognition.test.js tests/narrate.test.js tests/statblock.test.js "$BACKUP/tests/"
cp docs/superpowers/specs/2026-09-06-monster-recognition-design.md \
   docs/superpowers/specs/2026-09-07-espansione-database-mostri-design.md \
   docs/superpowers/plans/2026-09-06-monster-recognition.md \
   docs/superpowers/plans/2026-09-07-espansione-database-mostri.md "$BACKUP/docs/"

# The expanded database as it stands on the import branch.
git show "$BRANCH:tools/monster-recognition/monsters-data.js" > "$BACKUP/expanded/monsters-data.js"
git show "$BRANCH:lang/en.json" > "$BACKUP/expanded/en.json"
git show "$BRANCH:lang/it.json" > "$BACKUP/expanded/it.json"
git show "$BRANCH:docs/superpowers/plans/monster-batches/needs-review.md" > "$BACKUP/expanded/needs-review.md"

# Untracked working files of the import (extracted pack cache, progress ledger), if present.
for dir in .monster-pack-cache .superpowers; do
  [ -d "$WT/$dir" ] && cp -r "$WT/$dir" "$BACKUP/worktree-working-files/"
done
```

Then extract the tool's strings from main's translation files into the backup:

```bash
node -e '
const fs = require("fs");
for (const lang of ["en", "it"]) {
  const root = JSON.parse(fs.readFileSync(`lang/${lang}.json`, "utf8")).DND5E_GM_TOOLKIT;
  const strings = { tools: { monsterRecognition: root.tools.monsterRecognition }, monsterRecognition: root.monsterRecognition };
  fs.writeFileSync(process.argv[1] + `/lang/${lang}.json`, JSON.stringify({ DND5E_GM_TOOLKIT: strings }, null, 2) + "\n");
}' "$BACKUP"
```

Finally write `$BACKUP/README.md`:

```markdown
# Monster Recognition — backup

Removed from the trapfinder (GM Toolkit) package on 2026-09-27: its bestiary database holds Wizards
of the Coast content that must not ship in a published module.

- `trapfinder-all-branches.bundle` — the whole trapfinder repository, every branch, including
  `worktree-espansione-database-mostri` with the expanded database. Restore with
  `git clone trapfinder-all-branches.bundle trapfinder-restored`.
- `tool/`, `tests/`, `docs/` — the tool, its tests and its design docs as they were on `main`.
- `lang/` — the tool's strings from `lang/en.json` and `lang/it.json` on `main`.
- `expanded/` — `monsters-data.js`, `en.json`, `it.json` and `needs-review.md` from the import branch.
- `worktree-working-files/` — untracked files of the import worktree (extracted pack cache, progress
  ledger), if they existed.

To bring the tool back: copy `tool/monster-recognition` to `tools/`, the tests to `tests/`, merge
the `lang/` blocks back into the module's translation files, and restore the removed constants
(`SETTINGS.monsterCatalogMenu`; `FLAGS.monsterKey`, `descriptionOverride`, `skillOverride`,
`recognizedMonsters`), the `tools/index.js` entry and the `monster-list.css` entry in `module.json`.
```

- [ ] **Step 3: Verify the backup**

Run:

```bash
git bundle list-heads "$BACKUP/trapfinder-all-branches.bundle"
ls -R "$BACKUP" | head -40
```

Expected: the heads include `refs/heads/main` and `refs/heads/worktree-espansione-database-mostri`;
the folders `tool/monster-recognition`, `tests`, `docs`, `lang`, `expanded` are populated. Do not go
on to deleting anything until this is true.

- [ ] **Step 4: Remove the tool's files**

```bash
git rm -r tools/monster-recognition tests/monster-recognition.test.js tests/narrate.test.js tests/statblock.test.js \
  docs/superpowers/specs/2026-09-06-monster-recognition-design.md \
  docs/superpowers/specs/2026-09-07-espansione-database-mostri-design.md \
  docs/superpowers/plans/2026-09-06-monster-recognition.md \
  docs/superpowers/plans/2026-09-07-espansione-database-mostri.md
```

- [ ] **Step 5: Unregister the tool**

In `tools/index.js`, delete the line `import monsterRecognition from "./monster-recognition/index.js";`
and the `monsterRecognition` entry, so the registry reads:

```js
export const TOOLS = [
  passiveDetection,
  hiddenCreatures,
  lockpicking
];
```

- [ ] **Step 6: Remove its constants**

In `scripts/constants.js`, `SETTINGS` and `FLAGS` become:

```js
/** World setting keys. */
export const SETTINGS = {
  secretDoorDefaultDC: "secretDoorDefaultDC",
  secretDoorDefaultRange: "secretDoorDefaultRange",
  creatureDetectionRange: "creatureDetectionRange",
  screenAlert: "screenAlert",
  migrationVersion: "migrationVersion"
};

/** Document flag keys, all under this module's scope. */
export const FLAGS = {
  // On a Region behavior and on a secret-door wall: actor ids that have already resolved it.
  notifiedActorIds: "notifiedActorIds",
  // On a hidden creature's token: actor ids of the PCs that have spotted it.
  detectedBy: "detectedBy",
  // On a secret-door wall: per-door overrides of the world defaults.
  dc: "dc",
  range: "range",
  message: "message"
};
```

Flags and the old toggle setting already saved in existing worlds (`monsterKey`,
`recognizedMonsters`, `trapfinder.monster-recognition`, …) stay behind as inert data: nothing reads
them any more, and they do no harm.

- [ ] **Step 7: Clean the manifest**

In `module.json`:
- `"styles"` becomes `"styles": [],` (Task 7 adds the party-encumbrance stylesheet).
- In `"description"`, replace `detection of hidden creatures with a surprise proposal, lockpicking, and monster recognition.` with `detection of hidden creatures with a surprise proposal, and lockpicking.`

- [ ] **Step 8: Remove its strings**

```bash
node -e '
const fs = require("fs");
for (const lang of ["en", "it"]) {
  const file = `lang/${lang}.json`;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  delete json.DND5E_GM_TOOLKIT.tools.monsterRecognition;
  delete json.DND5E_GM_TOOLKIT.monsterRecognition;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}'
git diff --stat lang/
```

Expected: both files show only deletions (the rest of each file already matches 2-space
`JSON.stringify` formatting; only the removed monsters block was written in a compact style). If
`git diff lang/` shows changed lines outside the two removed blocks, revert and delete the blocks by
hand instead.

- [ ] **Step 9: Remove it from the README**

In `README.md`, delete the whole "**Monster Recognition** (`monster-recognition`, …)" bullet, from
its first line down to and including the paragraph about the active check ("…the compact message
arrives right away."), so that the "Lockpicking" bullet is followed directly by
"### Where notifications go".

- [ ] **Step 10: Verify nothing is left**

Run:

```bash
grep -rniE "monster-recognition|monsterRecognition|monsterCatalogMenu|recognizedMonsters|monsterKey|descriptionOverride|skillOverride|narrate|statblock" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude . \
  | grep -v "docs/superpowers/plans/2026-09-27-party-encumbrance.md"
npm test
```

Expected: `grep` prints nothing; `npm test` passes with `Test Files  3 passed (3)`,
`Tests  29 passed (29)` (detection 10, geometry 11, recipients 8). `npm test` is still the plain
`vitest run` here, so if it also reports files under `.claude/worktrees/`, read only the counts for
`tests/`; Task 3 scopes the run.

- [ ] **Step 11: Manual check in Foundry**

Reload a world with the module on: no console errors, Configure Settings no longer shows the Monster
Recognition toggle nor the Monster List button, and passive detection, hidden creatures and
lockpicking still work.

- [ ] **Step 12: Commit**

```bash
git add -A tools/index.js scripts/constants.js module.json lang/en.json lang/it.json README.md
git commit -m "chore: remove Monster Recognition from the package

Its bestiary database holds Wizards of the Coast content that must not
ship in a module that may be published. A full backup (git bundle of every
branch plus plain copies) lives outside the repo, in
trapfinder-monster-recognition-backup."
```

- [ ] **Step 13: Ask before deleting the import worktree and branch**

The worktree `.claude/worktrees/espansione-database-mostri` and the local branch
`worktree-espansione-database-mostri` are now only in the way (vitest picks up their tests, and they
still hold the bestiary). They are in the bundle. **Ask the user** whether to delete them; only on an
explicit yes, run:

```bash
git worktree remove --force .claude/worktrees/espansione-database-mostri
git branch -D worktree-espansione-database-mostri
```

Do **not** touch anything on GitHub: `origin/main` history and the remote branch
`claude/monster-recognition-dm-system-itrykb` still contain the tool. Cleaning published history is a
separate decision for the user (it needs a history rewrite and a force-push), not part of this plan.

---

### Task 2: Remaining test names in English

With the monster-recognition tests gone, the reason for postponing this (merge conflicts with the
import branch) is gone too. Only the `it(...)` descriptions change; test bodies stay identical.

**Files:**
- Modify: `tests/detection.test.js`, `tests/geometry.test.js`, `tests/recipients.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: Replace the descriptions**

In `tests/detection.test.js`:

| Italian | English |
|---|---|
| `salta un rilevabile già visto senza notificare né segnare` | `skips an already-seen detectable without notifying or marking` |
| `salta un rilevabile fuori raggio senza segnarlo, così resta valutabile più avanti` | `skips an out-of-range detectable without marking it, so it stays checkable later` |
| `individua quando la passiva eguaglia la CD` | `spots when the passive equals the DC` |
| `segna come visto anche chi fallisce, per non ripetere la notifica al DM` | `marks as seen even whoever fails, so the GM notification is not repeated` |
| `salta se la visuale è bloccata e il rilevabile la richiede` | `skips if sight is blocked and the detectable requires it` |
| `valuta comunque se il rilevabile non richiede visuale` | `still evaluates if the detectable does not require sight` |
| `usa sightPoint per la visuale e point per la distanza` | `uses sightPoint for sight and point for distance` |
| `legge la skill indicata dal rilevabile` | `reads the skill named by the detectable` |
| `tratta una skill assente come passiva 0 invece di esplodere` | `treats a missing skill as passive 0 instead of blowing up` |
| `valuta più rilevabili nello stesso passaggio` | `evaluates several detectables in the same pass` |

In `tests/geometry.test.js`:

| Italian | English |
|---|---|
| `proietta un punto perpendicolare sul segmento` | `projects a point perpendicularly onto the segment` |
| `si ferma all'estremo A per un punto oltre A` | `stops at end A for a point beyond A` |
| `si ferma all'estremo B per un punto oltre B` | `stops at end B for a point beyond B` |
| `restituisce A per un segmento degenere, senza dividere per zero` | `returns A for a degenerate segment, without dividing by zero` |
| `restituisce il punto stesso se è dentro` | `returns the point itself if it is inside` |
| `blocca su un lato per un punto fuori su un solo asse` | `clamps to a side for a point outside on one axis only` |
| `blocca su uno spigolo per un punto fuori in diagonale` | `clamps to a corner for a point outside diagonally` |
| `arretra il punto verso l'osservatore della distanza chiesta` | `pulls the point back toward the observer by the requested distance` |
| `arretra correttamente anche in diagonale` | `pulls back correctly on a diagonal too` |
| `restituisce null se l'osservatore è più vicino della distanza di arretramento` | `returns null if the observer is closer than the pull-back distance` |
| `restituisce null se i due punti coincidono, senza dividere per zero` | `returns null if the two points coincide, without dividing by zero` |

In `tests/recipients.test.js`:

| Italian | English |
|---|---|
| `manda un fallimento solo al DM, mai al giocatore` | `sends a failure only to the GM, never to the player` |
| `manda una riuscita al proprietario e al DM` | `sends a success to the owner and to the GM` |
| `manda il toast solo ai proprietari connessi` | `sends the toast only to connected owners` |
| `non manda toast al DM, che il messaggio lo vede già in chat` | `sends no toast to the GM, who already sees the message in chat` |
| `non manda alcun toast se l'impostazione è spenta` | `sends no toast at all if the setting is off` |
| `con un PG senza proprietario avvisa solo il DM, senza rompersi` | `with an ownerless PC notifies only the GM, without breaking` |
| `non duplica un DM che è anche proprietario del PG` | `does not duplicate a GM who also owns the PC` |
| `avvisa tutti i DM presenti, non solo il primo` | `notifies every GM present, not only the first` |

- [ ] **Step 2: Verify no Italian is left in the tests**

Run: `grep -nE "[àèéìòù]|\b(il|della|che|per|non|una|salta|restituisce|manda)\b" tests/*.js`
Expected: no output.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS, `Tests  29 passed (29)` in `tests/` — same count, only names changed.

- [ ] **Step 4: Commit**

```bash
git add tests/detection.test.js tests/geometry.test.js tests/recipients.test.js
git commit -m "test: translate the remaining test names to English"
```

---

### Task 3: Groundwork — scoped test run, flag key, translation parity test

**Files:**
- Modify: `package.json`
- Modify: `scripts/constants.js`
- Create: `tests/lang.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `FLAGS.partyEncumbrance === "partyEncumbrance"` in `scripts/constants.js`; a test that fails whenever `lang/en.json` and `lang/it.json` stop having the same keys.

- [ ] **Step 1: Scope the test run to `tests/`**

In `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "test": "vitest run --dir tests",
    "test:watch": "vitest --dir tests"
  },
```

- [ ] **Step 2: Check the baseline**

Run: `npm test`
Expected: `Test Files  3 passed (3)` and `Tests  29 passed (29)` (after Task 1 removed the three monster-recognition test files). If the numbers differ, note the real baseline and add to it in every later "Expected" line.

- [ ] **Step 3: Add the flag key**

In `scripts/constants.js`, add as the last entry of `FLAGS` (after `message`, adding a comma after it):

```js
  // On a Group actor: how its stash weight is shared among members, and who is excluded.
  partyEncumbrance: "partyEncumbrance"
```

- [ ] **Step 4: Write the parity test**

Create `tests/lang.test.js`:

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const load = file => JSON.parse(readFileSync(new URL(`../lang/${file}`, import.meta.url), "utf8"));

/** Flattens a translation tree into dotted keys: { a: { b: "x" } } -> ["a.b"]. */
function keysOf(tree, prefix = "") {
  return Object.entries(tree).flatMap(([key, value]) => (value && typeof value === "object")
    ? keysOf(value, `${prefix}${key}.`)
    : [`${prefix}${key}`]);
}

describe("translations", () => {
  const enKeys = new Set(keysOf(load("en.json")));
  const itKeys = new Set(keysOf(load("it.json")));

  it("every English key has an Italian translation", () => {
    expect([...enKeys].filter(key => !itKeys.has(key))).toEqual([]);
  });

  it("every Italian key exists in English, the base language", () => {
    expect([...itKeys].filter(key => !enKeys.has(key))).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, `Tests  31 passed (31)`. The two files are already aligned (Task 1 removed the same blocks from both), so this test is a guard for the tasks that follow, not a red-green cycle. To see it bite, temporarily delete one key from `lang/it.json`, run `npm test`, see it FAIL naming that key, then restore the file.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/constants.js tests/lang.test.js
git commit -m "test: scope vitest to tests/ and guard en/it translation parity"
```

---

### Task 4: Share math — `allocate`, `mergeShares`, `changedIds`, `applyShare`

**Files:**
- Create: `tools/party-encumbrance/allocate.js`
- Test: `tests/party-encumbrance-allocate.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `allocate(weight: number, carriers: {id: string, own: number, max: number}[], mode: string) -> Map<string, number>` — one entry per carrier (zero allowed); empty map when `weight <= 0`, no carriers, or `mode` is not `equal`/`available`/`maximum`.
  - `mergeShares(sources: {groupId: string, groupName: string, shares: Map<string, number>}[]) -> Map<string, ShareEntry>` where `ShareEntry = { total: number, bySource: {groupId, groupName, share}[] }`; zero shares are left out.
  - `changedIds(before: Map<string, ShareEntry>, after: Map<string, ShareEntry>) -> Set<string>`.
  - `applyShare(encumbrance: object, entry: ShareEntry | undefined) -> object` — mutates and returns `encumbrance`, always setting `encumbrance.stash = { own, share, bySource }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/party-encumbrance-allocate.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/party-encumbrance-allocate.test.js`
Expected: FAIL, `Failed to resolve import "../tools/party-encumbrance/allocate.js"`

- [ ] **Step 3: Write the implementation**

Create `tools/party-encumbrance/allocate.js`:

```js
/**
 * The share math of the party stash, free of Foundry globals so it can be unit-tested.
 *
 * @typedef {object} Carrier
 * @property {string} id     Actor id.
 * @property {number} own    Weight the actor carries on its own, without any stash share.
 * @property {number} max    The actor's maximum carrying capacity.
 *
 * @typedef {object} ShareEntry
 * @property {number} total  Sum of the actor's shares across every active Group.
 * @property {{groupId: string, groupName: string, share: number}[]} bySource
 */

const MODES = new Set(["equal", "available", "maximum"]);

/** dnd5e rounds carried weight to a tenth (toNearest(0.1)); toNearest does not exist outside Foundry. */
const round = value => Math.round(value * 10) / 10;

/** A capacity that is not a finite number would turn every share into NaN: count it as none. */
const capacity = carrier => (Number.isFinite(carrier.max) ? Math.max(0, carrier.max) : 0);

/**
 * How much of the stash each carrier takes.
 * @param {number} weight
 * @param {Carrier[]} carriers
 * @param {string} mode       "equal", "available" or "maximum"; anything else distributes nothing.
 * @returns {Map<string, number>}
 */
export function allocate(weight, carriers, mode) {
  const shares = new Map();
  if (!(weight > 0) || !carriers.length || !MODES.has(mode)) return shares;

  const weights = weightsFor(carriers, mode);
  const sum = weights.reduce((total, w) => total + w, 0);
  carriers.forEach((carrier, i) => shares.set(carrier.id, round((weight * weights[i]) / sum)));
  return shares;
}

/**
 * Relative weights for each carrier. Each mode falls back to the next when every weight is zero,
 * so the stash never divides by zero and never silently vanishes: a party where everybody is full
 * goes over capacity proportionally, which is what really happens to an overloaded party.
 */
function weightsFor(carriers, mode) {
  if (mode === "available") {
    const room = carriers.map(carrier => Math.max(0, capacity(carrier) - carrier.own));
    if (room.some(r => r > 0)) return room;
    mode = "maximum";
  }
  if (mode === "maximum") {
    const max = carriers.map(capacity);
    if (max.some(m => m > 0)) return max;
  }
  return carriers.map(() => 1);
}

/**
 * Sums each actor's shares across Groups, keeping where each one comes from for the tooltip.
 * @param {{groupId: string, groupName: string, shares: Map<string, number>}[]} sources
 * @returns {Map<string, ShareEntry>}
 */
export function mergeShares(sources) {
  const merged = new Map();
  for (const { groupId, groupName, shares } of sources) {
    for (const [actorId, share] of shares) {
      if (!(share > 0)) continue;
      const entry = merged.get(actorId) ?? { total: 0, bySource: [] };
      entry.total = round(entry.total + share);
      entry.bySource.push({ groupId, groupName, share });
      merged.set(actorId, entry);
    }
  }
  return merged;
}

/**
 * Actors whose share entry differs between two maps, including ones that gained or lost it.
 * @param {Map<string, ShareEntry>} before
 * @param {Map<string, ShareEntry>} after
 * @returns {Set<string>}
 */
export function changedIds(before, after) {
  const changed = new Set();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) changed.add(id);
  }
  return changed;
}

/**
 * Adds an actor's stash share to the encumbrance dnd5e just computed.
 *
 * The own weight is always recorded, share or not: refresh.js reads it back for "available
 * capacity" mode, which must measure room without the share already in it. `encumbered` is left
 * alone on purpose: dnd5e computes it against a property that does not exist, so it is always
 * false, and nothing reads it - statuses come from updateEncumbrance(), which reads `value`.
 *
 * @param {object} encumbrance         The actor's system.attributes.encumbrance, mutated in place.
 * @param {ShareEntry} [entry]
 * @returns {object} The same encumbrance object.
 */
export function applyShare(encumbrance, entry) {
  const own = encumbrance.value;
  encumbrance.stash = { own, share: 0, bySource: [] };
  if (!(entry?.total > 0)) return encumbrance;

  encumbrance.value = round(own + entry.total);
  const pct = (encumbrance.value * 100) / encumbrance.max;
  encumbrance.pct = Number.isNaN(pct) ? 0 : Math.min(Math.max(pct, 0), 100);
  encumbrance.stash.share = entry.total;
  encumbrance.stash.bySource = entry.bySource;
  return encumbrance;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, `Tests  47 passed (47)` (31 + 16)

- [ ] **Step 5: Commit**

```bash
git add tools/party-encumbrance/allocate.js tests/party-encumbrance-allocate.test.js
git commit -m "feat(party-encumbrance): share math for the party stash, with tests"
```

---

### Task 5: Stash weight, flag sanitizing, carrier filtering

**Files:**
- Create: `tools/party-encumbrance/stash.js`
- Test: `tests/party-encumbrance-stash.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Pure: `CARRIER_TYPES: Set<string>` (`"character"`, `"npc"`); `readConfig(flag) -> { mode: "none"|"equal"|"available"|"maximum", excluded: string[] }`; `eligibleCarriers(actors: (Actor|null)[], excluded: string[]) -> Actor[]`; `stashWeight({ items, currency }, { units, currencyWeight, currencyPerWeight }) -> number`.
  - Foundry adapters (not unit-tested, globals read only when called): `groupStashWeight(group) -> number`, `unitsLabel() -> string`, `formatWeight(value: number) -> string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/party-encumbrance-stash.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/party-encumbrance-stash.test.js`
Expected: FAIL, `Failed to resolve import "../tools/party-encumbrance/stash.js"`

- [ ] **Step 3: Write the implementation**

Create `tools/party-encumbrance/stash.js`:

```js
/**
 * What a Group's stash weighs and who may carry it.
 *
 * The functions at the top are pure and unit-tested. The adapters at the bottom read Foundry and
 * dnd5e globals, but only when called, so importing this file in a test is safe.
 */

const MODES = ["none", "equal", "available", "maximum"];

/** Actor types that can take a share. Vehicles have their own cargo, driven by dnd5e natively. */
export const CARRIER_TYPES = new Set(["character", "npc"]);

/**
 * The Group's flag with defaults, tolerant of hand-edited or partial data.
 * @param {object} [flag]
 * @returns {{mode: string, excluded: string[]}}
 */
export function readConfig(flag) {
  const mode = MODES.includes(flag?.mode) ? flag.mode : "none";
  const excluded = Array.isArray(flag?.excluded) ? flag.excluded.filter(id => typeof id === "string") : [];
  return { mode, excluded };
}

/**
 * Members that carry: characters and NPCs not excluded by the GM. Excluded ids of actors that
 * already left the Group simply match nothing.
 * @param {Array<object|null>} actors
 * @param {string[]} excluded
 * @returns {object[]}
 */
export function eligibleCarriers(actors, excluded) {
  return actors.filter(actor => actor && CARRIER_TYPES.has(actor.type) && !excluded.includes(actor.id));
}

/**
 * Weight of a stash, the way dnd5e weighs an actor's own inventory: top-level items only (a
 * container's total already includes its contents, and a bag of holding stays light), plus coins
 * when the currency-weight rule is on.
 *
 * @param {{items: Iterable<object>, currency: object}} stash
 * @param {{units: string, currencyWeight: boolean, currencyPerWeight: number}} options
 * @returns {number} Rounded to a tenth.
 */
export function stashWeight({ items, currency }, { units, currencyWeight, currencyPerWeight }) {
  let weight = 0;
  for (const item of items) {
    if (item.container) continue;
    const itemWeight = item.system?.totalWeightIn?.(units);
    if (Number.isFinite(itemWeight)) weight += itemWeight;
  }
  if (currencyWeight && currency) {
    const coins = Object.values(currency).reduce((total, amount) => total + Math.max(Number(amount) || 0, 0), 0);
    weight += coins / currencyPerWeight;
  }
  return Math.round(weight * 10) / 10;
}

/* -------------------------------------------- */
/*  Foundry adapters                            */
/* -------------------------------------------- */

/** The world's weight unit system and its default unit ("lb" or "kg"), as dnd5e picks them. */
function worldUnits() {
  const system = game.settings.get("dnd5e", "metricWeightUnits") ? "metric" : "imperial";
  return { system, units: CONFIG.DND5E.encumbrance.baseUnits.default[system] };
}

/**
 * A Group's stash weight in the same units dnd5e uses for PCs and NPCs.
 * @param {Actor} group
 * @returns {number}
 */
export function groupStashWeight(group) {
  const { system, units } = worldUnits();
  return stashWeight({ items: group.items, currency: group.system.currency }, {
    units,
    currencyWeight: game.settings.get("dnd5e", "currencyWeight"),
    currencyPerWeight: CONFIG.DND5E.encumbrance.currencyPerWeight[system]
  });
}

/** Localized abbreviation of the world's weight unit (dnd5e pre-localizes it). */
export function unitsLabel() {
  const { units } = worldUnits();
  return CONFIG.DND5E.weightUnits[units]?.abbreviation ?? units;
}

/** A weight formatted for the current language, with at most one decimal. */
export function formatWeight(value) {
  return Number(value).toLocaleString(game.i18n.lang, { maximumFractionDigits: 1 });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, `Tests  57 passed (57)` (47 + 10)

- [ ] **Step 5: Commit**

```bash
git add tools/party-encumbrance/stash.js tests/party-encumbrance-stash.test.js
git commit -m "feat(party-encumbrance): stash weight, flag defaults and carrier filtering, with tests"
```

---

### Task 6: Wire it into dnd5e — wrapper, recompute, tool registration

After this task the feature works end to end without any UI: the mode is set from the console, and bars and statuses change.

**Files:**
- Create: `tools/party-encumbrance/refresh.js`
- Create: `tools/party-encumbrance/encumbrance-wrapper.js`
- Create: `tools/party-encumbrance/index.js`
- Modify: `tools/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `allocate`, `mergeShares`, `changedIds`, `applyShare` (Task 4); `readConfig`, `eligibleCarriers`, `groupStashWeight`, `CARRIER_TYPES` (Task 5); `FLAGS.partyEncumbrance` (Task 3).
- Produces: `getShare(actorId: string) -> ShareEntry | undefined` and `registerRefreshHooks(moduleId)` from `refresh.js`; `registerEncumbranceWrapper(moduleId)` from `encumbrance-wrapper.js`; the tool descriptor with id `party-encumbrance`. Tasks 7 and 8 read `getShare` and `actor.system.attributes.encumbrance.stash`.

- [ ] **Step 1: Write the share cache and the recompute**

Create `tools/party-encumbrance/refresh.js`:

```js
import { FLAGS } from "../../scripts/constants.js";
import { allocate, changedIds, mergeShares } from "./allocate.js";
import { eligibleCarriers, groupStashWeight, readConfig } from "./stash.js";

/**
 * Current share of every carrier, keyed by actor id. The encumbrance wrapper only ever reads this:
 * computing shares there would depend on the order in which Foundry prepares actors at startup.
 * @type {Map<string, import("./allocate.js").ShareEntry>}
 */
let shares = new Map();

/** Settings of dnd5e that change how much the stash or a carrier weighs. */
const DND5E_SETTINGS = new Set(["dnd5e.currencyWeight", "dnd5e.metricWeightUnits", "dnd5e.encumbrance"]);

/** Document events that can change a stash, a carrier's own weight or capacity, or a Group's flag. */
const DOCUMENT_HOOKS = [
  "createItem", "updateItem", "deleteItem",
  "updateActor", "deleteActor",
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"
];

/**
 * @param {string} actorId
 * @returns {import("./allocate.js").ShareEntry|undefined}
 */
export function getShare(actorId) {
  return shares.get(actorId);
}

/**
 * Recomputes every active Group's shares and re-prepares only the actors whose share changed.
 * @param {string} moduleId
 */
export function recompute(moduleId) {
  const groups = game.actors.filter(actor => actor.type === "group");
  const sources = [];

  for (const group of groups) {
    try {
      const config = readConfig(group.getFlag(moduleId, FLAGS.partyEncumbrance));
      if (config.mode === "none") continue;

      const carriers = eligibleCarriers(group.system.members.map(member => member.actor), config.excluded)
        .map(actor => {
          const encumbrance = actor.system.attributes?.encumbrance;
          if (!encumbrance) return null;
          // stash.own is the weight without any share; before the first wrapped preparation it does
          // not exist yet, and value is still the native, share-free number.
          return { id: actor.id, own: encumbrance.stash?.own ?? encumbrance.value, max: encumbrance.max };
        })
        .filter(Boolean);

      sources.push({
        groupId: group.id,
        groupName: group.name,
        shares: allocate(groupStashWeight(group), carriers, config.mode)
      });
    } catch (error) {
      console.error(`${moduleId} | Party Stash Encumbrance: skipped group "${group.name}"`, error);
    }
  }

  const next = mergeShares(sources);
  const changed = changedIds(shares, next);
  shares = next;
  if (!changed.size) return;

  for (const id of changed) {
    const actor = game.actors.get(id);
    if (!actor) continue;
    actor.reset();
    actor.render(false);
    // One writer only: every client computes the same shares, but the status effect is a document.
    if (game.users.activeGM?.isSelf) {
      Promise.resolve(actor.updateEncumbrance?.({})).catch(error =>
        console.error(`${moduleId} | Party Stash Encumbrance: status not updated for "${actor.name}"`, error));
    }
  }
  for (const group of groups) group.render(false);
}

/**
 * Recomputes once now, then on every event that can change a share. Debounced, because dropping a
 * stack of loot fires several events in a row. No loops: actor.reset() fires no hooks, and the
 * status effect written by updateEncumbrance() triggers a recompute that finds the same shares.
 * @param {string} moduleId
 */
export function registerRefreshHooks(moduleId) {
  const schedule = foundry.utils.debounce(() => recompute(moduleId), 100);
  for (const hook of DOCUMENT_HOOKS) Hooks.on(hook, schedule);
  Hooks.on("updateSetting", setting => {
    if (DND5E_SETTINGS.has(setting.key)) schedule();
  });
  recompute(moduleId);
}
```

- [ ] **Step 2: Write the wrapper**

Create `tools/party-encumbrance/encumbrance-wrapper.js`:

```js
import { libWrapper } from "../../lib/libwrapper-shim.js";
import { applyShare } from "./allocate.js";
import { getShare } from "./refresh.js";
import { CARRIER_TYPES } from "./stash.js";

/**
 * dnd5e computes encumbrance in this one static method, called as
 * `AttributesFields.prepareEncumbrance.call(this, rollData)` from CharacterData, NPCData and
 * VehicleData - so `this` is the actor's system data model, and replacing the static property
 * reaches every call. Verified identical in dnd5e 5.3.3 and 6.0.5.
 */
export const TARGET = "dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance";

/** @param {string} moduleId */
export function registerEncumbranceWrapper(moduleId) {
  libWrapper.register(moduleId, TARGET, function (wrapped, ...args) {
    // The native calculation always runs first and is never skipped.
    const result = wrapped(...args);
    try {
      const actor = this.parent;
      const encumbrance = this.attributes?.encumbrance;
      if (CARRIER_TYPES.has(actor?.type) && encumbrance) applyShare(encumbrance, getShare(actor.id));
    } catch (error) {
      console.error(`${moduleId} | Party Stash Encumbrance: share not applied`, error);
    }
    return result;
  }, "WRAPPER");
}
```

- [ ] **Step 3: Write the tool descriptor**

Create `tools/party-encumbrance/index.js`:

```js
import { registerEncumbranceWrapper } from "./encumbrance-wrapper.js";
import { registerRefreshHooks } from "./refresh.js";

/**
 * Makes the stash of a dnd5e Group actor weigh on its members. dnd5e gives a Group no encumbrance
 * of its own, so whatever the party puts in it weighs on nobody; here each Group chooses, from its
 * sheet, how its stash weight is split among the members that carry it. The share is derived data
 * added on the fly: nothing is moved and nothing is written to the PCs.
 */
export default {
  id: "party-encumbrance",
  titleKey: "DND5E_GM_TOOLKIT.tools.partyEncumbrance.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.partyEncumbrance.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The wrapper and the hooks below are attached once per page load, at "ready".
      requiresReload: true
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    // Runs on every client, not only the GM's: encumbrance is derived data each client prepares.
    if (!globalThis.dnd5e?.dataModels?.actor?.AttributesFields?.prepareEncumbrance) {
      if (game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("DND5E_GM_TOOLKIT.tools.partyEncumbrance.unsupported"));
      }
      return;
    }

    registerEncumbranceWrapper(moduleId);
    registerRefreshHooks(moduleId);
  }
};
```

- [ ] **Step 4: Register the tool**

In `tools/index.js`, add the import after the `lockpicking` one and append the tool to `TOOLS`:

```js
import partyEncumbrance from "./party-encumbrance/index.js";
```

```js
export const TOOLS = [
  passiveDetection,
  hiddenCreatures,
  lockpicking,
  partyEncumbrance
];
```

- [ ] **Step 5: Add the tool's strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT.tools`, after the `lockpicking` entry (add a comma after its closing brace):

```json
      "partyEncumbrance": {
        "title": "Party Stash Encumbrance",
        "hint": "Items and coins in a Group actor normally weigh on nobody. With this on, the Inventory tab of every Group's sheet gets a distribution menu: the stash weight is split among the members who carry it (equally, by available capacity, or by maximum capacity) and counts toward their encumbrance. Nothing is moved: the share is computed on the fly.",
        "unsupported": "Party Stash Encumbrance: this dnd5e version does not expose the encumbrance calculation the tool needs, so the tool stays off."
      }
```

In `lang/it.json`, in the same position:

```json
      "partyEncumbrance": {
        "title": "Ingombro della Cassa Comune",
        "hint": "Gli oggetti e le monete di un attore Gruppo di norma non pesano su nessuno. Con questo strumento attivo, la scheda Inventario di ogni Gruppo ha un menu di distribuzione: il peso della cassa viene diviso tra i membri che la portano (in parti uguali, per carico disponibile o per capacità massima) e conta nel loro ingombro. Non si sposta niente: la quota è calcolata al volo.",
        "unsupported": "Ingombro della Cassa Comune: questa versione di dnd5e non espone il calcolo dell'ingombro che serve allo strumento, che quindi resta spento."
      }
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, `Tests  57 passed (57)`. No new unit test: these files touch `game`, `Hooks` and dnd5e documents, so they are checked in Foundry. The parity test from Task 3 covers the new strings.

- [ ] **Step 7: Manual check in Foundry (GM, then a player)**

1. Enable "Party Stash Encumbrance" in Configure Settings and reload. No console errors at startup.
2. In the console, confirm the wrapper took: `dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance.toString()` must not be dnd5e's original body. If registration threw instead (with real libWrapper, `"... does not exist, could not be found, or has a non-configurable descriptor"`), replace the body of `registerEncumbranceWrapper` with a direct patch that keeps the original, and note it in the commit:

   ```js
   const fields = dnd5e.dataModels.actor.AttributesFields;
   const original = fields.prepareEncumbrance;
   fields.prepareEncumbrance = function (...args) {
     const result = original.apply(this, args);
     try {
       const actor = this.parent;
       const encumbrance = this.attributes?.encumbrance;
       if (CARRIER_TYPES.has(actor?.type) && encumbrance) applyShare(encumbrance, getShare(actor.id));
     } catch (error) {
       console.error(`${moduleId} | Party Stash Encumbrance: share not applied`, error);
     }
     return result;
   };
   ```

3. Put 100 lb of items in the party Group, then in the console:

   ```js
   const party = game.actors.find(a => a.type === "group");
   await party.setFlag("trapfinder", "partyEncumbrance", { mode: "equal", excluded: [] });
   party.system.members.map(({ actor }) => [actor.name, actor.system.attributes.encumbrance.value, actor.system.attributes.encumbrance.stash]);
   ```

   Each character or NPC member's `stash.share` must be 100 divided by their number, and `value` must equal `stash.own + stash.share`. Their character sheet's bar must show the new total.
4. Repeat with `mode: "available"` and `mode: "maximum"` and check the split against the formulas in the Global Constraints.
5. Exclude everyone but one member (`excluded: [<the other ids>]`): that member takes the whole 100 lb.
6. Add items to the Group until one member goes past their maximum: the "Exceeding carrying capacity" status appears on that member. Empty the Group: the status disappears.
7. Log in as a player owning one member: their sheet shows the same total as the GM sees.

- [ ] **Step 8: Commit**

```bash
git add tools/party-encumbrance/refresh.js tools/party-encumbrance/encumbrance-wrapper.js tools/party-encumbrance/index.js tools/index.js lang/en.json lang/it.json
git commit -m "feat(party-encumbrance): add the stash share to members' encumbrance"
```

---

### Task 7: Group sheet controls

**Files:**
- Create: `tools/party-encumbrance/group-sheet.js`
- Create: `tools/party-encumbrance/party-encumbrance.css`
- Modify: `tools/party-encumbrance/index.js`
- Modify: `module.json` (`styles`)
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `getShare` (Task 6); `readConfig`, `eligibleCarriers`, `groupStashWeight`, `unitsLabel`, `formatWeight`, `CARRIER_TYPES` (Task 5); `FLAGS.partyEncumbrance` (Task 3).
- Produces: `registerGroupSheetControls(moduleId)`; the `DND5E_GM_TOOLKIT.partyEncumbrance.*` strings that Task 8 also uses (`tooltipLine`).

dnd5e's Group sheet (ApplicationV2, class `GroupActorSheet`, hook `renderGroupActorSheet(app, element)`) renders its Inventory tab as `section.tab[data-tab="inventory"]` with a `.sidebar` of member cards `.encumbrance.card[data-uuid]` (each with a `.pane`) and a `.body` holding the inventory list.

- [ ] **Step 1: Write the injection**

Create `tools/party-encumbrance/group-sheet.js`:

```js
import { FLAGS } from "../../scripts/constants.js";
import { getShare } from "./refresh.js";
import { CARRIER_TYPES, eligibleCarriers, formatWeight, groupStashWeight, readConfig, unitsLabel } from "./stash.js";

const MODES = ["none", "equal", "available", "maximum"];
const PREFIX = "DND5E_GM_TOOLKIT.partyEncumbrance";

/**
 * Adds the distribution menu, the stash weight, and a "carries" control plus the share on each
 * member card of the Group sheet's Inventory tab. Only the GM can change anything: players see the
 * same information read-only.
 * @param {string} moduleId
 */
export function registerGroupSheetControls(moduleId) {
  Hooks.on("renderGroupActorSheet", (app, element) => injectControls(app.document, element, moduleId));
}

function injectControls(group, element, moduleId) {
  const tab = element.querySelector('.tab[data-tab="inventory"]');
  const body = tab?.querySelector(":scope > .body");
  if (!body) return;

  // ApplicationV2 can re-render one part without clearing what we injected: start clean every time.
  tab.querySelectorAll(".trapfinder-stash").forEach(node => node.remove());

  const config = readConfig(group.getFlag(moduleId, FLAGS.partyEncumbrance));
  const units = unitsLabel();
  const isGM = game.user.isGM;
  const t = key => game.i18n.localize(`${PREFIX}.${key}`);
  const save = changes => group.setFlag(moduleId, FLAGS.partyEncumbrance, { ...config, ...changes });

  body.prepend(buildHeader(group, config, { isGM, units, t, save }));

  for (const card of tab.querySelectorAll(".sidebar .encumbrance.card[data-uuid]")) {
    const actor = fromUuidSync(card.dataset.uuid);
    if (!actor || !CARRIER_TYPES.has(actor.type)) continue;
    (card.querySelector(".pane") ?? card).append(buildMemberRow(group, actor, config, { isGM, units, t, save }));
  }
}

function buildHeader(group, config, { isGM, units, t, save }) {
  const header = document.createElement("div");
  header.className = "trapfinder-stash stash-header";

  const weight = game.i18n.format(`${PREFIX}.stashWeight`, { weight: formatWeight(groupStashWeight(group)), units });
  const mode = isGM
    ? `<select>${MODES.map(m => `<option value="${m}" ${m === config.mode ? "selected" : ""}>${t(`modes.${m}`)}</option>`).join("")}</select>`
    : `<span class="mode">${t(`modes.${config.mode}`)}</span>`;
  header.innerHTML = `<span class="weight">${weight}</span><label>${t("distribution")} ${mode}</label>`;

  const members = group.system.members.map(member => member.actor);
  if ((config.mode !== "none") && !eligibleCarriers(members, config.excluded).length) {
    header.insertAdjacentHTML("beforeend", `<p class="notification warning">${t("noCarriers")}</p>`);
  }

  header.querySelector("select")?.addEventListener("change", event => save({ mode: event.target.value }));
  return header;
}

function buildMemberRow(group, actor, config, { isGM, units, t, save }) {
  const carries = !config.excluded.includes(actor.id);
  const row = document.createElement("div");
  row.className = "trapfinder-stash stash-member";

  row.innerHTML = isGM
    ? `<label><input type="checkbox" ${carries ? "checked" : ""}> ${t("carries")}</label>`
    : `<span><i class="fa-solid ${carries ? "fa-check" : "fa-xmark"}" inert></i> ${t(carries ? "carries" : "notCarrying")}</span>`;

  // Same rule dnd5e uses to hide a member's stats on this sheet: no share weight for members the
  // viewer cannot observe.
  const share = getShare(actor.id)?.bySource.find(source => source.groupId === group.id)?.share ?? 0;
  if ((share > 0) && actor.testUserPermission(game.user, "OBSERVER")) {
    const text = game.i18n.format(`${PREFIX}.share`, { weight: formatWeight(share), units });
    row.insertAdjacentHTML("beforeend", `<span class="share">${text}</span>`);
  }

  row.querySelector("input")?.addEventListener("change", event => {
    const excluded = new Set(config.excluded);
    if (event.target.checked) excluded.delete(actor.id);
    else excluded.add(actor.id);
    save({ excluded: [...excluded] });
  });
  return row;
}
```

- [ ] **Step 2: Add the stylesheet**

Create `tools/party-encumbrance/party-encumbrance.css`:

```css
.trapfinder-stash.stash-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 0.5rem;
}

.trapfinder-stash.stash-header label,
.trapfinder-stash.stash-member label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.trapfinder-stash.stash-header .notification {
  flex-basis: 100%;
  margin: 0;
}

.trapfinder-stash.stash-member {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 0.5rem;
  font-size: var(--font-size-12, 0.75rem);
}
```

In `module.json`, fill the `styles` list that Task 1 left empty:

```json
  "styles": [
    "tools/party-encumbrance/party-encumbrance.css"
  ],
```

- [ ] **Step 3: Hook it up**

In `tools/party-encumbrance/index.js`, add the import:

```js
import { registerGroupSheetControls } from "./group-sheet.js";
```

and at the end of `onReady(moduleId)`, after `registerRefreshHooks(moduleId);`:

```js
    registerGroupSheetControls(moduleId);
```

- [ ] **Step 4: Add the strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT`, add a block right after `surprise` (comma after `surprise`'s closing brace):

```json
    "partyEncumbrance": {
      "stashWeight": "Stash weight: {weight} {units}",
      "distribution": "Distribution",
      "modes": {
        "none": "None",
        "equal": "Equal shares",
        "available": "By available capacity",
        "maximum": "By maximum capacity"
      },
      "carries": "Carries",
      "notCarrying": "Does not carry",
      "share": "Stash share: {weight} {units}",
      "noCarriers": "No carriers: the stash weighs on no one.",
      "tooltipLine": "Of which {weight} {units} from the stash of {group}"
    },
```

In `lang/it.json`, in the same position:

```json
    "partyEncumbrance": {
      "stashWeight": "Peso della cassa: {weight} {units}",
      "distribution": "Distribuzione",
      "modes": {
        "none": "Nessuna",
        "equal": "Parti uguali",
        "available": "Per carico disponibile",
        "maximum": "Per capacità massima"
      },
      "carries": "Porta",
      "notCarrying": "Non porta",
      "share": "Quota cassa: {weight} {units}",
      "noCarriers": "Nessun portatore: la cassa non pesa su nessuno.",
      "tooltipLine": "Di cui {weight} {units} dalla cassa di {group}"
    },
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, `Tests  57 passed (57)` (the parity test covers the new keys)

- [ ] **Step 6: Manual check in Foundry**

1. As GM, open the party Group sheet, Inventory tab: the header shows "Stash weight: … lb" and the Distribution menu on "None"; each PC/NPC card has a checked "Carries" box; a Vehicle member's card has none.
2. Choose "Equal shares": the member bars in the sidebar update and each card shows "Stash share: …". Switch tabs back and forth and drop an item into the Group: the header and the rows are **never duplicated**.
3. Untick everyone but the mule: all of the share goes to the mule. Untick the mule too: the warning "No carriers: the stash weighs on no one." appears and every bar goes back to native.
4. Log in as a player: the menu is plain text, the checkboxes are ✓/✗ icons that cannot be clicked, and the share line appears only on cards of members that player can observe.

- [ ] **Step 7: Commit**

```bash
git add tools/party-encumbrance/group-sheet.js tools/party-encumbrance/party-encumbrance.css tools/party-encumbrance/index.js module.json lang/en.json lang/it.json
git commit -m "feat(party-encumbrance): distribution menu and carriers on the Group sheet"
```

---

### Task 8: Tooltip on PC and NPC sheets

**Files:**
- Create: `tools/party-encumbrance/actor-sheet.js`
- Modify: `tools/party-encumbrance/index.js`

**Interfaces:**
- Consumes: `actor.system.attributes.encumbrance.stash` (Task 4 via Task 6); `unitsLabel`, `formatWeight` (Task 5); the `tooltipLine` string (Task 7).
- Produces: `registerActorSheetTooltip()`.

On dnd5e's character sheet (`renderCharacterActorSheet`) the bar sits in `.encumbrance.card` of the Inventory tab; on the NPC sheet (`renderNPCActorSheet`) in `.bottom .encumbrance`. Both are rendered by the shared partial as `[role="meter"]`.

- [ ] **Step 1: Write the tooltip**

Create `tools/party-encumbrance/actor-sheet.js`:

```js
import { formatWeight, unitsLabel } from "./stash.js";

/**
 * Explains on a PC's or NPC's own encumbrance bar how much of it comes from a Group's stash, so a
 * player whose bar suddenly fills up can see why.
 */
export function registerActorSheetTooltip() {
  for (const hook of ["renderCharacterActorSheet", "renderNPCActorSheet"]) {
    Hooks.on(hook, (app, element) => addTooltip(app.document, element));
  }
}

function addTooltip(actor, element) {
  const stash = actor.system.attributes?.encumbrance?.stash;
  if (!(stash?.share > 0)) return;
  const meter = element.querySelector('.encumbrance [role="meter"]');
  if (!meter) return;

  const units = unitsLabel();
  meter.dataset.tooltip = stash.bySource.map(source => game.i18n.format("DND5E_GM_TOOLKIT.partyEncumbrance.tooltipLine", {
    weight: formatWeight(source.share),
    units,
    group: foundry.utils.escapeHTML(source.groupName)
  })).join("<br>");
}
```

- [ ] **Step 2: Hook it up**

In `tools/party-encumbrance/index.js`, add the import:

```js
import { registerActorSheetTooltip } from "./actor-sheet.js";
```

and at the end of `onReady(moduleId)`:

```js
    registerActorSheetTooltip();
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS, `Tests  57 passed (57)`

- [ ] **Step 4: Manual check in Foundry**

1. With a mode active, open a carrier PC's sheet, Inventory tab, and hover the encumbrance bar: "Of which 46 lb from the stash of The Company" (with the real numbers and Group name).
2. Put the same PC in a second Group with an active mode: the tooltip has two lines, one per Group.
3. Hover the mule's NPC sheet bar: same tooltip.
4. Set the Group back to "None": the bar has no tooltip after the sheet refreshes.
5. Switch Foundry to Italian: "Di cui 46 lb dalla cassa di …".

- [ ] **Step 5: Commit**

```bash
git add tools/party-encumbrance/actor-sheet.js tools/party-encumbrance/index.js
git commit -m "feat(party-encumbrance): tooltip explaining the stash share on PC and NPC bars"
```

---

### Task 9: Documentation and final check

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Add the tool to the README**

In `README.md`, section "Available tools", add after the Lockpicking entry (before "### Where notifications go"):

```markdown
- **Party Stash Encumbrance** (`party-encumbrance`, off by default) — dnd5e gives a **Group** actor
  no encumbrance of its own, so the coins and loot the party keeps in it weigh on nobody. With this
  tool on, the Inventory tab of every Group's sheet gets a **Distribution** menu: *Equal shares*,
  *By available capacity* (whoever has more room left takes more), or *By maximum capacity*. Each
  member card gets a **Carries** checkbox: untick everyone but the pack mule and the mule takes it
  all. The share counts toward each carrier's encumbrance bar and statuses, and hovering a PC's bar
  shows how much of it comes from the stash. Nothing is moved and nothing is written to the PCs:
  switch the tool off and every bar is native again. Only the GM can change the distribution;
  players see it read-only. Vehicles never carry: for a cart, use dnd5e's own primary vehicle with
  draft animals.
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS, `Test Files  6 passed (6)`, `Tests  57 passed (57)`

- [ ] **Step 3: Full manual check in Foundry (spec checklist)**

1. Enable the tool, put items in the Group, choose each mode: the members' bars in the Group sheet and on the PC sheets change accordingly.
2. Untick everyone except the mule: all the weight goes to the mule.
3. Untick everyone: the warning appears, the bars go back to native.
4. As a player: menu and checkboxes not editable, tooltip visible on your own sheet.
5. Go over capacity with the share alone: the encumbrance status appears; empty the stash: it goes away.
6. Switch the tool off and reload: native bars, no tooltip, no controls on the Group sheet.
7. Repeat steps 1 and 5 on dnd5e 5.3.x and on 6.0.x.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document Party Stash Encumbrance in the README"
```
