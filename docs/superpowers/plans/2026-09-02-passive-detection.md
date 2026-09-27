# Passive detection — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the module's trap detection into a passive detection system covering traps, clues, secret doors and hidden creatures, with a targeted notification to the player and a surprise proposal at the start of combat.

**Architecture:** A pure core in `core/` decides (dedup → range → sight → passive against DC) and notifies; the sources in `tools/` translate Regions, walls and tokens into a normalized shape called a *detectable*. The core never touches a Foundry document: persistence comes in through callbacks, which makes it testable with vitest without Foundry.

**Tech Stack:** Foundry VTT v13+ (verified 14), dnd5e system 4.0+, ES modules loaded directly with no bundler, vitest only for `core/`.

**Spec:** `docs/superpowers/specs/2026-09-02-passive-detection-design.md`

## Global Constraints

- Module id: `trapfinder`. It never changes: it is inside the manifest/download URLs and inside the type of the RegionBehaviors saved in worlds.
- i18n namespace: `DND5E_GM_TOOLKIT`. Every string shown to the user goes through `lang/en.json` **and** `lang/it.json`.
- No bundler, no runtime dependency. Foundry loads ES modules directly: every import must have an explicit `.js` extension and a relative path.
- `core/` imports **nothing** from `scripts/` or `tools/`. It receives `moduleId` as a parameter, following the pattern already in use (`register(moduleId)`, `onReady(moduleId)`).
- All hooks run **GM-side only** (`if (!game.user.isGM) return;`), as today.
- Every new `game.settings.register` that affects registrations made once per page load uses `requiresReload: true`, like the two existing ones.
- The module **never rolls dice**: it only compares passive values.
- `.github/workflows/release.yml` zips an **explicit list** of folders. Every new folder must be added there or the release ships broken while working in development.

## Deviations from the spec

Three refinements to the shape of the *detectable*, decided while writing the plan and already carried back into the spec:

1. `fallbackKey` splits into **`spottedKey`** and **`missedKey`**: two different texts are needed and the spec provided for only one.
2. New field **`sightPoint`**: the point used for the sight test, distinct from `point` used for distance. Secret doors need it, where the target is the wall itself.
3. The custom `message` applies **only on success**. On failure the generic text is always used: the custom text describes what is noticed, and whoever fails notices nothing.

## File structure

| File | Responsibility | Pure? |
|---|---|---|
| `core/detection.js` | the decision sequence, nothing else | yes, tested |
| `core/recipients.js` | who gets chat and who gets the toast | yes, tested |
| `core/geometry.js` | closest point on segment/bbox, pull-back | pure part tested, Foundry wrapper not |
| `core/notify.js` | ChatMessage, socket, `ui.notifications` | no |
| `tools/passive-detection/index.js` | toggle, behavior registration, hooks | no |
| `tools/passive-detection/passive-detection-behavior.js` | Region behavior schema | no |
| `tools/passive-detection/sources.js` | Regions and walls → detectables | no |
| `tools/passive-detection/wall-config.js` | fields injected into the wall sheet | no |
| `tools/passive-detection/migration.js` | recreation of the old-type behaviors | no |
| `tools/hidden-creatures/index.js` | toggle, symmetric hooks, reset | no |
| `tools/hidden-creatures/sources.js` | hidden tokens → detectables | no |
| `tools/hidden-creatures/marker-guard.js` | warning on inconsistent markers | no |
| `tools/hidden-creatures/surprise.js` | surprise proposal | no |
| `scripts/constants.js` | setting and flag keys | — |

## Order and working state

Tasks 1-4 build the core **without touching** `trap-detection`, which keeps working. Tasks 5-7 convert it in three steps, each of which leaves the module working. From task 9 on, new subjects are added.

The two risky parts declared in the spec are **task 8** (injection into the wall sheet) and **task 9** (pulling back the sight point). Whoever executes can bring forward a manual test of task 8 in Foundry before writing the rest: if the hook does not hold, the fallback is already written in the task.

---

### Task 1: Decision core and test tooling

**Files:**
- Create: `package.json`
- Create: `core/detection.js`
- Test: `tests/detection.test.js`
- Modify: `.github/workflows/release.yml:41` (add `core` to the zipped list)

**Interfaces:**
- Consumes: nothing.
- Produces: `runDetection({observer, detectables, measure, isSightBlocked, report}) -> Promise<DetectionResult[]>` where `DetectionResult = {observer, detectable, passive, spotted}`. Defines the `Detectable` shape used by every later task.

- [ ] **Step 1: Install vitest**

```bash
npm init -y
npm install --save-dev vitest
```

Then replace the generated `package.json` with this one (it removes the useless `npm init` fields and adds the scripts; keep the vitest version npm just wrote):

```json
{
  "name": "trapfinder",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

No vitest config file: the default pattern already finds `tests/*.test.js`.
`node_modules/` is already in `.gitignore`, and the release zip's explicit list excludes `package.json`, `tests/` and `docs/` by itself.

- [ ] **Step 2: Add `core` to the release zip**

In `.github/workflows/release.yml`, in the "Create Zip Archive" step:

```yaml
          zip -r "$ZIP_NAME" module.json scripts core tools lib lang templates styles README.md LICENSE
```

Without this line the release ships without the core: in development everything works, once installed from the manifest the module errors on every import.

- [ ] **Step 3: Write the failing tests**

Create `tests/detection.test.js`:

```js
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
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/detection.js"`

- [ ] **Step 5: Write the minimal implementation**

Create `core/detection.js`:

```js
/**
 * The one decision this module makes, for every kind of subject: has this observer already
 * resolved this target, is it close enough, can it be seen, and does the observer's passive
 * skill meet the DC.
 *
 * Deliberately free of Foundry globals: distance, line of sight, persistence and messaging all
 * enter as callbacks. That is what makes it unit-testable, and what lets a new kind of subject
 * ship as a new source with no change here.
 *
 * @typedef {object} Detectable
 * @property {string} key            Stable identity of the target, for debugging.
 * @property {string} skill          dnd5e skill key read on the observer, e.g. "prc" or "inv".
 * @property {number} dc             Passive value the observer must meet or beat.
 * @property {{x: number, y: number}} point       Measured against for range.
 * @property {{x: number, y: number}} sightPoint  Measured against for line of sight.
 * @property {number} range          In scene units.
 * @property {string|null} message   Custom text, used on success only.
 * @property {string} spottedKey     i18n key used on success when there is no custom message.
 * @property {string} missedKey      i18n key used on failure, always.
 * @property {boolean} requiresSight
 * @property {() => boolean} hasSeen
 * @property {() => Promise<void>} markSeen
 *
 * @typedef {object} DetectionResult
 * @property {object} observer
 * @property {Detectable} detectable
 * @property {number} passive
 * @property {boolean} spotted
 */

/**
 * @param {object} options
 * @param {object} options.observer                                Actor of the observing PC.
 * @param {Detectable[]} options.detectables
 * @param {(point: {x: number, y: number}) => number} options.measure          Scene-unit distance.
 * @param {(point: {x: number, y: number}) => boolean} options.isSightBlocked
 * @param {(result: DetectionResult) => Promise<void>} options.report
 * @returns {Promise<DetectionResult[]>}
 */
export async function runDetection({ observer, detectables, measure, isSightBlocked, report }) {
  const results = [];

  for (const detectable of detectables) {
    if (detectable.hasSeen()) continue;
    if (measure(detectable.point) > detectable.range) continue;
    if (detectable.requiresSight && isSightBlocked(detectable.sightPoint)) continue;

    const passive = observer.system?.skills?.[detectable.skill]?.passive ?? 0;
    const result = { observer, detectable, passive, spotted: passive >= detectable.dc };

    await report(result);
    // Marked even on a failure: the PC has had their chance at this target and a second
    // notification would only tell the GM the same thing again.
    await detectable.markSeen();
    results.push(result);
  }

  return results;
}
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, 10 tests

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json core/detection.js tests/detection.test.js .github/workflows/release.yml
git commit -m "feat(core): passive detection decision core, with tests"
```

---

### Task 2: Choice of recipients

**Files:**
- Create: `core/recipients.js`
- Test: `tests/recipients.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `detectionRecipients({actor, spotted, users, toastEnabled}) -> {chat: string[], toast: string[]}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/recipients.test.js`:

```js
import { describe, expect, it } from "vitest";
import { detectionRecipients } from "../core/recipients.js";

const gm = { id: "gm1", isGM: true, active: true };
const player = { id: "u1", isGM: false, active: true };
const offline = { id: "u2", isGM: false, active: false };
const stranger = { id: "u3", isGM: false, active: true };

/** An actor owned by everyone in `owners`. */
function actorOwnedBy(...owners) {
  const ids = owners.map(u => u.id);
  return { testUserPermission: (user, level) => level === "OWNER" && ids.includes(user.id) };
}

describe("detectionRecipients", () => {
  it("sends a failure only to the GM, never to the player", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, player], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("sends a success to the owner and to the GM", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player, stranger], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("sends the toast only to connected owners", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player, offline), spotted: true, users: [gm, player, offline], toastEnabled: true
    });

    expect(result.toast).toEqual(["u1"]);
    expect(result.chat.sort()).toEqual(["gm1", "u1", "u2"]);
  });

  it("sends no toast to the GM, who already sees the message in chat", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: true
    });

    expect(result.toast).not.toContain("gm1");
  });

  it("sends no toast at all if the setting is off", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: false
    });

    expect(result.toast).toEqual([]);
    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("with an ownerless PC notifies only the GM, without breaking", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(), spotted: true, users: [gm, stranger], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("does not duplicate a GM who also owns the PC", () => {
    const gmOwner = { id: "gm1", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(gmOwner), spotted: true, users: [gmOwner], toastEnabled: true
    });

    expect(result.chat).toEqual(["gm1"]);
  });

  it("notifies every GM present, not only the first", () => {
    const gm2 = { id: "gm2", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, gm2, player], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "gm2"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/recipients.js"`

- [ ] **Step 3: Write the minimal implementation**

Create `core/recipients.js`:

```js
/**
 * Who hears about a detection.
 *
 * The asymmetry is deliberate: a success is news the character has, so it reaches the player;
 * a failure is news only the GM is allowed to have, because telling a player "you failed to
 * notice something" already tells them there was something to notice.
 *
 * Chat and toast are not alternatives. A whisper stays in the log and reaches a player who is
 * offline; a toast cannot. The whisper is the delivery, the toast is only the nudge.
 *
 * @param {object} options
 * @param {{testUserPermission: (user: object, level: string) => boolean}} options.actor
 * @param {boolean} options.spotted
 * @param {Array<{id: string, isGM: boolean, active: boolean}>} options.users
 * @param {boolean} options.toastEnabled
 * @returns {{chat: string[], toast: string[]}}
 */
export function detectionRecipients({ actor, spotted, users, toastEnabled }) {
  const gmIds = users.filter(u => u.isGM).map(u => u.id);

  if (!spotted) return { chat: gmIds, toast: [] };

  const owners = users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));

  return {
    chat: [...new Set([...gmIds, ...owners.map(u => u.id)])],
    toast: toastEnabled ? owners.filter(u => u.active).map(u => u.id) : []
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, 18 tests in total

- [ ] **Step 5: Commit**

```bash
git add core/recipients.js tests/recipients.test.js
git commit -m "feat(core): choice of chat and toast recipients, with tests"
```

---

### Task 3: Geometry and sight

**Files:**
- Create: `core/geometry.js`
- Test: `tests/geometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: pure — `closestPointOnSegment(point, a, b) -> {x, y}`, `closestPointInBounds(point, bounds) -> {x, y}`, `pullBack(point, towards, distance) -> {x, y}|null`. Foundry-dependent — `sceneDistance(from, to) -> number`, `isSightBlocked(from, to) -> boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/geometry.test.js`. Note the polyfill at the top: `Math.clamp` is a Foundry
extension, not standard JavaScript, and it does not exist in vitest. Defining it here makes the
tests exercise exactly the same code that runs in Foundry, instead of a variant written for them.

```js
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/geometry.js"`

- [ ] **Step 3: Write the implementation**

Create `core/geometry.js`:

```js
/**
 * Geometry helpers for detection. The exported pure functions work in pixel space and know
 * nothing about Foundry, so they are unit-tested; the two wrappers at the bottom do touch
 * canvas globals and are verified in game instead.
 */

/**
 * Closest point to `point` on the segment a-b, clamped to the segment's ends.
 * @returns {{x: number, y: number}}
 */
export function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = (dx * dx) + (dy * dy);

  // Degenerate segment: both ends are the same point, so there is nothing to project onto.
  if (lengthSquared === 0) return { x: a.x, y: a.y };

  const t = Math.clamp((((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / lengthSquared, 0, 1);
  return { x: a.x + (t * dx), y: a.y + (t * dy) };
}

/**
 * Closest point to `point` inside an axis-aligned box (the point itself if already inside).
 * @returns {{x: number, y: number}}
 */
export function closestPointInBounds(point, bounds) {
  return {
    x: Math.clamp(point.x, bounds.left, bounds.right),
    y: Math.clamp(point.y, bounds.top, bounds.bottom)
  };
}

/**
 * Moves `point` toward `towards` by `distance` pixels.
 *
 * Exists for one specific problem: a secret door's target point lies ON a wall, so a sight test
 * aimed at it always collides with that very wall and nothing would ever be detected. Aiming
 * slightly short of the wall avoids the self-collision.
 *
 * @returns {{x: number, y: number}|null} null when `towards` is closer than `distance`, in which
 *   case there is no room to pull back and the caller should skip the sight test entirely - at
 *   that range the observer is against the wall anyway.
 */
export function pullBack(point, towards, distance) {
  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy);

  if (length <= distance) return null;

  return { x: point.x + ((dx / length) * distance), y: point.y + ((dy / length) * distance) };
}

/* -------------------------------------------- */
/*  Foundry-dependent wrappers                  */
/* -------------------------------------------- */

/**
 * Distance between two pixel points, in scene units.
 * @returns {number}
 */
export function sceneDistance(from, to) {
  return canvas.grid.measurePath([from, to]).distance;
}

/**
 * Whether a wall blocks sight between two pixel points.
 * Signature verified against the v14.365 API: mode "any" returns a boolean.
 * @returns {boolean}
 */
export function isSightBlocked(from, to) {
  return foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(from, to, {
    type: "sight",
    mode: "any"
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, 29 tests in total

- [ ] **Step 5: Commit**

```bash
git add core/geometry.js tests/geometry.test.js
git commit -m "feat(core): detection geometry and sight test"
```

---

### Task 4: Notifications and socket

**Files:**
- Create: `core/notify.js`
- Modify: `scripts/constants.js`
- Modify: `scripts/main.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `detectionRecipients` from task 2.
- Produces: `registerSocket(moduleId)`, `reportDetection({moduleId, observer, detectable, spotted, toastEnabled}) -> Promise<void>`, and from `scripts/constants.js` the `SETTINGS` and `FLAGS` objects.

- [ ] **Step 1: Extend the constants**

Replace the entire content of `scripts/constants.js`:

```js
export const MODULE_ID = "trapfinder";

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

- [ ] **Step 2: Register the on-screen alert setting**

In `scripts/main.js`, replace the entire content:

```js
import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSocket } from "../core/notify.js";
import { TOOLS } from "../tools/index.js";

Hooks.once("init", () => {
  // Shared by every tool that notifies, so it is registered here rather than inside one of them.
  // No requiresReload: it is read at notification time, so a change takes effect immediately.
  game.settings.register(MODULE_ID, SETTINGS.screenAlert, {
    name: "DND5E_GM_TOOLKIT.settings.screenAlert.name",
    hint: "DND5E_GM_TOOLKIT.settings.screenAlert.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  for (const tool of TOOLS) {
    tool.register(MODULE_ID);
  }
});

Hooks.once("ready", () => {
  // Unconditional, not gated behind any tool's toggle: a client with no listener would silently
  // drop toasts emitted by a GM whose tools are on, and the listener costs nothing when idle.
  registerSocket(MODULE_ID);

  for (const tool of TOOLS) {
    tool.onReady?.(MODULE_ID);
  }
});
```

- [ ] **Step 3: Write the notification module**

Create `core/notify.js`:

```js
import { detectionRecipients } from "./recipients.js";

/**
 * Delivery of a detection result: a whisper that persists in the log, plus an optional toast
 * that only draws the eye. See core/recipients.js for who gets which.
 */

const TOAST_ACTION = "toast";

/**
 * Listens for toasts addressed to this client. Every client runs this; the GM's own detections
 * are delivered to players through it.
 * @param {string} moduleId
 */
export function registerSocket(moduleId) {
  game.socket.on(`module.${moduleId}`, ({ action, userIds, text } = {}) => {
    if (action !== TOAST_ACTION) return;
    if (!userIds?.includes(game.user.id)) return;
    ui.notifications.info(text);
  });
}

/**
 * @param {object} options
 * @param {string} options.moduleId
 * @param {object} options.observer      Actor of the observing PC.
 * @param {object} options.detectable    See core/detection.js.
 * @param {boolean} options.spotted
 * @param {boolean} options.toastEnabled
 * @returns {Promise<void>}
 */
export async function reportDetection({ moduleId, observer, detectable, spotted, toastEnabled }) {
  const { chat, toast } = detectionRecipients({
    actor: observer,
    spotted,
    users: game.users.contents,
    toastEnabled
  });

  const text = detectionText({ observer, detectable, spotted });

  await ChatMessage.create({ content: text, whisper: chat });

  if (toast.length) {
    game.socket.emit(`module.${moduleId}`, { action: TOAST_ACTION, userIds: toast, text });
  }
}

/**
 * The custom message describes what the character notices, so it is only ever used on a success.
 * A failure always gets the generic line: the custom text would give away what was there.
 * @returns {string}
 */
function detectionText({ observer, detectable, spotted }) {
  const data = { name: observer.name, dc: detectable.dc };

  if (!spotted) return game.i18n.format(detectable.missedKey, data);

  const custom = detectable.message?.trim();
  return custom || game.i18n.format(detectable.spottedKey, data);
}
```

- [ ] **Step 4: Add the strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT`, add a `settings` key at the same level as `tools`:

```json
    "settings": {
      "screenAlert": {
        "name": "On-screen alert as well as chat",
        "hint": "When a PC notices something, also pop a brief notification on the owning player's screen. The whisper in chat is sent either way - this only adds a nudge, since a chat line is easy to miss mid-scene."
      }
    }
```

In `lang/it.json`, in the same position:

```json
    "settings": {
      "screenAlert": {
        "name": "Avviso a schermo oltre alla chat",
        "hint": "Quando un PG nota qualcosa, mostra anche una breve notifica sullo schermo del giocatore che lo controlla. Il messaggio privato in chat parte comunque: questo aggiunge solo un richiamo, perché una riga di chat in mezzo alla scena sfugge facilmente."
      }
    }
```

- [ ] **Step 5: Verify the existing tests still pass**

Run: `npm test`
Expected: PASS, 29 tests. No new test: `core/notify.js` touches `game`, `ChatMessage` and `ui`, so it is verified in game.

- [ ] **Step 6: Manual check in Foundry**

Launch the world. In Configure Settings "On-screen alert as well as chat" must appear, enabled. No console error at startup. The module keeps working as before: trap detection has not been touched yet.

- [ ] **Step 7: Commit**

```bash
git add core/notify.js scripts/constants.js scripts/main.js lang/en.json lang/it.json
git commit -m "feat(core): targeted notification via whisper and toast over socket"
```

---

### Task 5: New fields on the existing behavior

The type stays `trapfinder.trapDetection`: here only fields are added, so the module keeps working and existing Regions stay valid. The rename comes in task 7.

**Files:**
- Modify: `tools/trap-detection/trap-detection-region-behavior.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `behavior.system.skill` (`"prc"|"inv"`), `behavior.system.message` (string), `behavior.system.requiresSight` (boolean), consumed by task 6.

- [ ] **Step 1: Add the three fields to the schema**

In `tools/trap-detection/trap-detection-region-behavior.js`, replace the body of `defineSchema()`:

```js
  static defineSchema() {
    const { BooleanField, NumberField, StringField } = foundry.data.fields;
    return {
      // Declared even though _handleRegionEvent is never implemented/used - the one real
      // reference implementation found for a custom dnd5e RegionBehaviorType always includes
      // this field, and omitting it is an unverified deviation from the only known-working example.
      events: this._createEventsField({ events: [] }),
      // Which passive the observer is checked on. A field rather than a separate behavior type:
      // a trap and a hidden clue are the same mechanism, only the skill read differs.
      // choices is a function, not a literal object, so the labels are resolved after i18nInit -
      // Function is a documented choices type as of the v14.365 API.
      skill: new StringField({
        required: true,
        blank: false,
        initial: "prc",
        choices: () => ({
          prc: game.i18n.localize("DND5E_GM_TOOLKIT.passiveDetection.skills.prc"),
          inv: game.i18n.localize("DND5E_GM_TOOLKIT.passiveDetection.skills.inv")
        })
      }),
      dc: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
      range: new NumberField({ required: true, min: 0, initial: 10 }),
      // Shown to the player instead of the generic line, on a success only.
      message: new StringField({ required: false, blank: true, initial: "" }),
      requiresSight: new BooleanField({ initial: true })
    };
  }
```

- [ ] **Step 2: Add the strings for the new fields**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT`, add a `passiveDetection` block at the same level as `trapDetection` (which stays where it is for now):

```json
    "passiveDetection": {
      "skills": {
        "prc": "Passive Perception",
        "inv": "Passive Investigation"
      }
    }
```

And inside `DND5E_GM_TOOLKIT.trapDetection.behavior.FIELDS`, next to `dc` and `range`:

```json
          "skill": {
            "label": "Passive Skill",
            "hint": "Which passive the PC is checked on. Perception for something noticed in passing, Investigation for something that has to be pieced together."
          },
          "message": {
            "label": "Message on Success",
            "hint": "What the player is told when their PC notices this, e.g. 'One flagstone sits a finger lower than the others'. Leave empty for the generic line. Never shown on a failure."
          },
          "requiresSight": {
            "label": "Requires Line of Sight",
            "hint": "If set, a wall between the PC and this spot prevents detection. Turn off for something noticed by sound or smell around a corner."
          }
```

In `lang/it.json`, `passiveDetection` at the same level as `trapDetection`:

```json
    "passiveDetection": {
      "skills": {
        "prc": "Percezione passiva",
        "inv": "Indagare passivo"
      }
    }
```

And inside `DND5E_GM_TOOLKIT.trapDetection.behavior.FIELDS`:

```json
          "skill": {
            "label": "Abilità passiva",
            "hint": "Su quale passiva viene controllato il PG. Percezione per ciò che si nota di sfuggita, Indagare per ciò che va messo insieme."
          },
          "message": {
            "label": "Messaggio alla riuscita",
            "hint": "Cosa viene detto al giocatore quando il PG se ne accorge, ad esempio 'Una lastra del pavimento è più bassa delle altre di un dito'. Lascia vuoto per il testo generico. Non viene mai mostrato in caso di fallimento."
          },
          "requiresSight": {
            "label": "Richiede linea di vista",
            "hint": "Se attivo, un muro tra il PG e questo punto impedisce il rilevamento. Disattivalo per qualcosa che si nota dall'odore o dal rumore dietro l'angolo."
          }
```

- [ ] **Step 3: Manual check in Foundry**

Reload. Open a Region with the Trap Detection behavior: the three new fields must appear, with the Passive skill menu populated with two **translated** entries (if the raw `DND5E_GM_TOOLKIT…` keys appear, `choices` as a function is not being re-evaluated after `i18nInit`: in that case build the choices inside the `i18nInit` hook already present in `tools/trap-detection/index.js`, assigning them to the field's schema). An existing Region must open without errors, with `skill` set to Perception.

- [ ] **Step 4: Commit**

```bash
git add tools/trap-detection/trap-detection-region-behavior.js lang/en.json lang/it.json
git commit -m "feat(trap-detection): skill, message and line-of-sight fields on the behavior"
```

---

### Task 6: Rewire trap detection onto the core

Refactoring with unchanged observable behavior, except for the three new fields that now take effect. The type and the file names do not change yet.

**Files:**
- Create: `tools/trap-detection/sources.js`
- Modify: `tools/trap-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `runDetection` (task 1), `reportDetection` (task 4), `closestPointInBounds`/`sceneDistance`/`isSightBlocked` (task 3), `SETTINGS`/`FLAGS` (task 4), the schema fields (task 5).
- Produces: `collectRegionDetectables({scene, observerCenter, actor, moduleId, typeId}) -> Detectable[]`, reused by task 7 after the rename.

- [ ] **Step 1: Write the Region source**

Create `tools/trap-detection/sources.js`:

```js
import { closestPointInBounds } from "../../core/geometry.js";
import { FLAGS } from "../../scripts/constants.js";

/**
 * Turns every enabled detection behavior on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor      Actor of the observing PC.
 * @param {string} options.moduleId
 * @param {string} options.typeId     RegionBehavior type to collect.
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectRegionDetectables({ scene, observerCenter, actor, moduleId, typeId }) {
  const detectables = [];

  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== typeId) continue;
      if (behavior.disabled) continue;

      // Bounding-box approximation, not exact-shape distance: no built-in or third-party
      // reference for exact point-to-arbitrary-region-shape distance was found, and the extra
      // margin near the corners of an ellipse or polygon is a few feet at most - fine for a
      // detection buffer.
      const point = closestPointInBounds(observerCenter, region.bounds);
      const seen = behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

      detectables.push({
        key: behavior.uuid,
        skill: behavior.system.skill,
        dc: behavior.system.dc,
        point,
        sightPoint: point,
        range: behavior.system.range,
        message: behavior.system.message || null,
        spottedKey: "DND5E_GM_TOOLKIT.passiveDetection.spotted",
        missedKey: "DND5E_GM_TOOLKIT.passiveDetection.notSpotted",
        requiresSight: behavior.system.requiresSight,
        hasSeen: () => seen.includes(actor.id),
        markSeen: () => behavior.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
      });
    }
  }

  return detectables;
}
```

- [ ] **Step 2: Replace the hook with the call to the core**

In `tools/trap-detection/index.js`, replace the `onReady` method and **remove** the two functions at the bottom of the file (`distanceToRegionBounds` and `postTrapDetectionMessage`), now covered by `core/geometry.js` and `core/notify.js`. Add at the top of the file:

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { SETTINGS } from "../../scripts/constants.js";
import { collectRegionDetectables } from "./sources.js";
```

And replace `onReady`:

```js
  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const observerCenter = {
        x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
        y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
      };

      const detectables = collectRegionDetectables({
        scene, observerCenter, actor, moduleId, typeId: TYPE_ID
      });
      if (!detectables.length) return;

      await runDetection({
        observer: actor,
        detectables,
        measure: (point) => sceneDistance(observerCenter, point),
        isSightBlocked: (point) => isSightBlocked(observerCenter, point),
        report: ({ observer, detectable, spotted }) => reportDetection({
          moduleId, observer, detectable, spotted,
          toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
        })
      });
    });
  }
```

- [ ] **Step 3: Move the message strings**

The `spotted` and `notSpotted` keys were under `tools.trapDetection`; now the source points at `passiveDetection`. In `lang/en.json` **move** the two keys from `DND5E_GM_TOOLKIT.tools.trapDetection` to `DND5E_GM_TOOLKIT.passiveDetection`, which becomes:

```json
    "passiveDetection": {
      "spotted": "{name} notices something suspicious nearby (passive check meets/beats DC {dc}).",
      "notSpotted": "{name} passes close to something hidden without noticing it (DC {dc}).",
      "skills": {
        "prc": "Passive Perception",
        "inv": "Passive Investigation"
      }
    }
```

In `lang/it.json`, the same way:

```json
    "passiveDetection": {
      "spotted": "{name} nota qualcosa di sospetto nei paraggi (prova passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa vicino a qualcosa di nascosto senza accorgersene (CD {dc}).",
      "skills": {
        "prc": "Percezione passiva",
        "inv": "Indagare passivo"
      }
    }
```

The text no longer names traps: the same line now also serves clues.

- [ ] **Step 4: Verify the tests still pass**

Run: `npm test`
Expected: PASS, 29 tests

- [ ] **Step 5: Manual check in Foundry**

With an already existing trap Region (DC 15, range 10), move a PC token within range: a private message must arrive **to the GM as before**, and in addition to the owning player, with the toast. Move it again: no repeat. Set a custom message and try it with a second PC. Set the skill to Investigation and verify it compares the right passive. Put a wall between PC and Region and verify it does not trigger.

- [ ] **Step 6: Commit**

```bash
git add tools/trap-detection/sources.js tools/trap-detection/index.js lang/en.json lang/it.json
git commit -m "refactor(trap-detection): use the shared core for decision and notification"
```

---

### Task 7: Rename of the type, the folder, and migration

**Files:**
- Rename: `tools/trap-detection/` → `tools/passive-detection/`
- Rename: `tools/passive-detection/trap-detection-region-behavior.js` → `passive-detection-behavior.js`
- Create: `tools/passive-detection/migration.js`
- Modify: `tools/passive-detection/index.js`, `tools/index.js`, `module.json`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: everything above.
- Produces: `migrateTrapDetectionBehaviors(moduleId) -> Promise<void>`; the `trapfinder.passiveDetection` type.

- [ ] **Step 1: Rename folder and file keeping the git history**

```bash
git mv tools/trap-detection tools/passive-detection
git mv tools/passive-detection/trap-detection-region-behavior.js tools/passive-detection/passive-detection-behavior.js
```

Also rename the class inside the file, from `TrapDetectionRegionBehaviorType` to `PassiveDetectionBehaviorType`, and update `static LOCALIZATION_PREFIXES` to `["DND5E_GM_TOOLKIT.passiveDetection.behavior"]`.

- [ ] **Step 2: Declare both types in `module.json`**

```json
  "documentTypes": {
    "RegionBehavior": {
      "trapDetection": {},
      "passiveDetection": {}
    }
  },
```

The old type **must stay declared** for this release: if it disappeared, the behaviors already saved would become an unknown type before the migration manages to read them. It is removed in a later release, when the migration has certainly run everywhere.

- [ ] **Step 3: Write the migration**

Create `tools/passive-detection/migration.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

const OLD_TYPE = "trapfinder.trapDetection";
const NEW_TYPE = "trapfinder.passiveDetection";
const CURRENT_VERSION = 1;

/**
 * Converts behaviors of the pre-generalisation type to the new one.
 *
 * A document's type cannot be changed by an update, so each behavior is recreated and the old one
 * deleted. The version marker is written only after the whole pass succeeds: a partial run leaves
 * the marker untouched and simply retries next load, which is safer than recording a half-done
 * migration.
 *
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
export async function migrateTrapDetectionBehaviors(moduleId) {
  if (game.settings.get(moduleId, SETTINGS.migrationVersion) >= CURRENT_VERSION) return;
  if (game.user !== game.users.activeGM) return;

  let migrated = 0;

  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      const outdated = region.behaviors.filter(b => b.type === OLD_TYPE);
      if (!outdated.length) continue;

      const replacements = outdated.map(behavior => ({
        name: behavior.name,
        type: NEW_TYPE,
        disabled: behavior.disabled,
        system: {
          skill: "prc",
          dc: behavior._source.system.dc,
          range: behavior._source.system.range,
          message: "",
          requiresSight: true
        },
        flags: {
          [moduleId]: {
            [FLAGS.notifiedActorIds]: behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? []
          }
        }
      }));

      await region.createEmbeddedDocuments("RegionBehavior", replacements);
      await region.deleteEmbeddedDocuments("RegionBehavior", outdated.map(b => b.id));
      migrated += outdated.length;
    }
  }

  await game.settings.set(moduleId, SETTINGS.migrationVersion, CURRENT_VERSION);

  if (migrated) {
    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.passiveDetection.migrated", { count: migrated })
    );
  }
}
```

`skill: "prc"` and `requiresSight: true` are the values that reproduce the previous behavior: before only Perception existed, and there was no sight test but the range was small, so enabling it is the sensible default and it stays switchable off per Region.

- [ ] **Step 4: Rewrite `tools/passive-detection/index.js`**

The changes to this file are too many to apply as fragments. Replace the entire content,
keeping the two existing long comments **unchanged**: they explain why the type registration
is not behind the toggle and why it lives in `register()` and not in `onReady()`, and both
reasons still hold.

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { SETTINGS } from "../../scripts/constants.js";
import PassiveDetectionBehaviorType from "./passive-detection-behavior.js";
import { migrateTrapDetectionBehaviors } from "./migration.js";
import { collectRegionDetectables } from "./sources.js";

const TYPE_ID = "trapfinder.passiveDetection";

export default {
  id: "passive-detection",
  titleKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // CONFIG.RegionBehavior below is only (re)populated once per page load, at "init" - toggling
      // this mid-session without a reload would leave the behavior type missing from the Region
      // config sheet until the next refresh, so Foundry needs to prompt for one.
      requiresReload: true
    });

    // Bookkeeping, not a knob: never shown in Configure Settings.
    game.settings.register(moduleId, SETTINGS.migrationVersion, {
      scope: "world",
      config: false,
      type: Number,
      default: 0
    });

    // Unconditional (not gated behind the setting toggle): module.json declares this type under
    // documentTypes.RegionBehavior so Foundry's own type list (which is what actually drives the
    // "Add Behavior" dropdown - CONFIG.RegionBehavior.dataModels alone does not, verified by
    // comparing it against the dropdown's real rendered <select> options) always includes it,
    // regardless of the setting. Since the type is always selectable either way, registering the
    // class conditionally would let a GM add the behavior while the tool is off and hit a broken
    // data model with no class behind it - so this stays unconditional, and only the actual
    // detection hook in onReady() below is gated by the setting.
    //
    // CONFIG.RegionBehavior must be populated before the "i18nInit" hook runs (Foundry uses it to
    // pre-localize/prepare behavior type sheets), so this happens here in register() (init), not
    // in onReady() - same timing constraint already hit for the leader status in dnd5e-house-rules.
    CONFIG.RegionBehavior.dataModels[TYPE_ID] = PassiveDetectionBehaviorType;
    CONFIG.RegionBehavior.typeIcons[TYPE_ID] = "fa-solid fa-triangle-exclamation";
    // Without an explicit typeLabels entry, the "Add Behavior" type dropdown has nothing to
    // display for this entry and silently omits it (no error) - verified against several real,
    // working modules (pf2e-visioner, warhammer-dbc, Deathmarch-Witcher-TRPG) that all set this
    // explicitly alongside dataModels/typeIcons, unlike the one reference this was first modeled on.
    CONFIG.RegionBehavior.typeLabels[TYPE_ID] = "DND5E_GM_TOOLKIT.passiveDetection.behavior.label";
    Hooks.once("i18nInit", () => foundry.helpers.Localization.localizeDataModel(PassiveDetectionBehaviorType));
  },

  async onReady(moduleId) {
    // Before the toggle check on purpose: Regions saved under the old type must be converted even
    // in a world where the tool is currently off, or they would be left behind for good once the
    // old type declaration is dropped from module.json.
    await migrateTrapDetectionBehaviors(moduleId);

    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const observerCenter = {
        x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
        y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
      };

      const detectables = collectRegionDetectables({
        scene, observerCenter, actor, moduleId, typeId: TYPE_ID
      });
      if (!detectables.length) return;

      await runDetection({
        observer: actor,
        detectables,
        measure: (point) => sceneDistance(observerCenter, point),
        isSightBlocked: (point) => isSightBlocked(observerCenter, point),
        report: ({ observer, detectable, spotted }) => reportDetection({
          moduleId, observer, detectable, spotted,
          toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
        })
      });
    });
  }
};
```

Watch out: changing `id` from `trap-detection` to `passive-detection` **resets the toggle**,
because it is the setting's key. It must go into the release notes: the tool has to be switched
back on once after the update.

- [ ] **Step 5: Update the tool registry**

In `tools/index.js`:

```js
import passiveDetection from "./passive-detection/index.js";
import lockpicking from "./lockpicking/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  passiveDetection,
  lockpicking
];
```

- [ ] **Step 6: Rename the i18n keys**

Two moves in the tree, identical in `lang/en.json` and `lang/it.json`:

| From | To |
|---|---|
| `DND5E_GM_TOOLKIT.tools.trapDetection` | `DND5E_GM_TOOLKIT.tools.passiveDetection` |
| `DND5E_GM_TOOLKIT.trapDetection.behavior` | `DND5E_GM_TOOLKIT.passiveDetection.behavior` |

After the move the `DND5E_GM_TOOLKIT.trapDetection` key **no longer exists**: search for it in the
two files and verify no trace of it is left. The `spotted`/`notSpotted` keys had already moved
under `passiveDetection` in task 6, so `passiveDetection` now contains `spotted`,
`notSpotted`, `skills`, `behavior` and `migrated`.

Update the two titles and the two hints, which still talk only about traps:

`lang/en.json`:
```json
      "passiveDetection": {
        "title": "Passive Detection (traps, clues, secret doors)",
        "hint": "Draw a Region where something hidden really is, add the 'Passive Detection' behavior to set its skill, DC, range and the message the player gets. Whenever a PC comes within range, their passive score against the DC decides whether they notice it. Once per PC per spot. Secret doors are configured on the wall itself instead."
      }
```

And the migration message key, inside `passiveDetection`:
```json
      "migrated": "Passive Detection: {count} trap behavior(s) converted to the new format."
```

`lang/it.json`:
```json
      "passiveDetection": {
        "title": "Rilevamento passivo (trappole, indizi, porte segrete)",
        "hint": "Disegna una Region dove si trova davvero qualcosa di nascosto, aggiungi il comportamento 'Rilevamento Passivo' per impostare abilità, CD, raggio e il messaggio che riceve il giocatore. Quando un PG entra nel raggio, la sua passiva contro la CD decide se se ne accorge. Una volta per PG per punto. Le porte segrete si configurano invece sul muro stesso."
      }
```

```json
      "migrated": "Rilevamento passivo: {count} comportamenti trappola convertiti al nuovo formato."
```

And `passiveDetection.behavior.label` becomes `"Passive Detection"` / `"Rilevamento Passivo"`.

- [ ] **Step 7: Verify the tests still pass**

Run: `npm test`
Expected: PASS, 29 tests

- [ ] **Step 8: Manual check of the migration**

On a world that **already** has a trap Region created before this change: reload, and the "converted to the new format" notification must appear. Open the Region: the behavior is now called Passive Detection, with DC and range identical to before and skill Perception. Switch the toggle back on (its key changed) and verify detection still works. Reload a second time: **no** second notification, the migration must not run again.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(passive-detection): rename the behavior type and migrate existing Regions"
```

---

### Task 8: Secret-door fields in the wall sheet

This is the risky part declared in the spec. If `renderWallConfig` does not hold in v14, the fallback is in Step 5.

**Files:**
- Create: `tools/passive-detection/wall-config.js`
- Modify: `tools/passive-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `FLAGS`, `SETTINGS`.
- Produces: `registerWallConfigInjection(moduleId)`; the `dc`, `range`, `message` flags on walls.

- [ ] **Step 1: Register the two default settings**

In `tools/passive-detection/index.js`, inside `register(moduleId)`:

```js
    game.settings.register(moduleId, SETTINGS.secretDoorDefaultDC, {
      name: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultDC.name",
      hint: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultDC.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 15
    });

    game.settings.register(moduleId, SETTINGS.secretDoorDefaultRange, {
      name: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultRange.name",
      hint: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultRange.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 10
    });
```

- [ ] **Step 2: Write the injection**

Create `tools/passive-detection/wall-config.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

/**
 * Adds per-door detection fields to the native Wall configuration sheet.
 *
 * Pattern verified against the real, v13-verified module "Wall Height" (theripper93/wall-height
 * v4.1.2, scripts/wall-height.js:108-135): in v13+ the hook's second argument is a native DOM
 * element, and an input named "flags.<moduleId>.<key>" is persisted by the sheet's own submit -
 * no listener and no setFlag call of our own.
 *
 * @param {string} moduleId
 */
export function registerWallConfigInjection(moduleId) {
  Hooks.on("renderWallConfig", (app, html) => {
    // ApplicationV2 can re-render partially without clearing what we injected, which would
    // duplicate the fieldset on every re-render. wall-height guards its light hook this way but
    // not its wall hook; the guard is cheap and the failure is visible, so we always guard.
    if (html.querySelector(`[name="flags.${moduleId}.${FLAGS.dc}"]`)) return;

    const doorField = html.querySelector('[name="door"]');
    if (!doorField) return;

    const document = app.document;
    const dc = document.getFlag(moduleId, FLAGS.dc) ?? "";
    const range = document.getFlag(moduleId, FLAGS.range) ?? "";
    const message = document.getFlag(moduleId, FLAGS.message) ?? "";

    const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
    const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);

    const t = (key) => game.i18n.localize(`DND5E_GM_TOOLKIT.secretDoor.wallConfig.${key}`);

    doorField.closest("fieldset").insertAdjacentHTML("afterend", `
      <fieldset>
        <legend>${t("legend")}</legend>
        <p class="hint">${t("hint")}</p>
        <div class="form-group">
          <label>${t("dc")}</label>
          <input name="flags.${moduleId}.${FLAGS.dc}" type="number" step="1" min="0"
                 value="${dc}" placeholder="${defaultDC}">
        </div>
        <div class="form-group">
          <label>${t("range")}</label>
          <input name="flags.${moduleId}.${FLAGS.range}" type="number" step="any" min="0"
                 value="${range}" placeholder="${defaultRange}">
        </div>
        <div class="form-group">
          <label>${t("message")}</label>
          <input name="flags.${moduleId}.${FLAGS.message}" type="text"
                 value="${foundry.utils.escapeHTML(message)}">
        </div>
      </fieldset>
    `);

    app.setPosition({ height: "auto" });
  });
}
```

- [ ] **Step 3: Hook up the injection**

In `tools/passive-detection/index.js`, inside `onReady(moduleId)` after the toggle check:

```js
    registerWallConfigInjection(moduleId);
```

with the import `import { registerWallConfigInjection } from "./wall-config.js";`

- [ ] **Step 4: Add the strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT`:

```json
    "secretDoor": {
      "wallConfig": {
        "legend": "Passive Detection",
        "hint": "Only applies to walls whose door type is Secret. Leave a field empty to use the world default shown as its placeholder.",
        "dc": "Detection DC",
        "range": "Detection Range",
        "message": "Message on Success"
      }
    }
```

In `lang/it.json`:

```json
    "secretDoor": {
      "wallConfig": {
        "legend": "Rilevamento passivo",
        "hint": "Vale solo per i muri con tipo porta Segreta. Lascia un campo vuoto per usare il default del mondo, mostrato come suggerimento.",
        "dc": "CD di rilevamento",
        "range": "Raggio di rilevamento",
        "message": "Messaggio alla riuscita"
      }
    }
```

And inside `DND5E_GM_TOOLKIT.settings`:

```json
      "secretDoorDefaultDC": {
        "name": "Secret doors: default DC",
        "hint": "Used by every secret door that has no DC of its own, so a freshly drawn one already works."
      },
      "secretDoorDefaultRange": {
        "name": "Secret doors: default range",
        "hint": "Distance in scene units within which a PC's passive Perception is checked against a secret door."
      }
```

```json
      "secretDoorDefaultDC": {
        "name": "Porte segrete: CD di default",
        "hint": "Usata da ogni porta segreta che non ha una CD propria, così una porta appena disegnata funziona già."
      },
      "secretDoorDefaultRange": {
        "name": "Porte segrete: raggio di default",
        "hint": "Distanza in unità di scena entro cui la percezione passiva di un PG viene confrontata con una porta segreta."
      }
```

- [ ] **Step 5: Manual check, and the moment for the fallback if needed**

Reload. Open the configuration of any wall: under the door type the "Passive detection" box must appear with three fields and the hints from the defaults. Enter DC 12, save, reopen: the value must still be there. Reopen and close several times: the box **must not duplicate**.

If the box does not appear or `html.querySelector` throws, the hook does not hold in v14: fall back to the pattern already in `lockpicking`, that is a button in the scene controls that, with a wall selected, opens a `DialogV2` with the same three fields and saves them with `setFlag`. The data shape does not change, so task 9 stays valid as it is.

- [ ] **Step 6: Commit**

```bash
git add tools/passive-detection/wall-config.js tools/passive-detection/index.js lang/en.json lang/it.json
git commit -m "feat(passive-detection): detection fields in the wall configuration"
```

---

### Task 9: Secret door detection

**Files:**
- Modify: `tools/passive-detection/sources.js`
- Modify: `tools/passive-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `closestPointOnSegment`, `pullBack` (task 3), the flags from task 8.
- Produces: `collectSecretDoorDetectables({scene, observerCenter, actor, moduleId}) -> Detectable[]`.

- [ ] **Step 1: Add the wall source**

In `tools/passive-detection/sources.js`, task 6 already wrote at the top:

```js
import { closestPointInBounds } from "../../core/geometry.js";
import { FLAGS } from "../../scripts/constants.js";
```

**Extend these two existing lines**, don't add new ones: importing the same identifier twice
(`FLAGS`, `closestPointInBounds`) from ES modules is a `SyntaxError`. The result must
be:

```js
import { closestPointInBounds, closestPointOnSegment, pullBack } from "../../core/geometry.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";
```

```js
/**
 * Turns every secret door on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectSecretDoorDetectables({ scene, observerCenter, actor, moduleId }) {
  const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
  const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);
  const detectables = [];

  for (const wall of scene.walls) {
    if (wall.door !== CONST.WALL_DOOR_TYPES.SECRET) continue;

    const [x0, y0, x1, y1] = wall.c;
    const point = closestPointOnSegment(observerCenter, { x: x0, y: y0 }, { x: x1, y: y1 });

    // The target here IS a wall, so a sight ray aimed at it always collides with it and nothing
    // would ever be detected. Aim half a grid square short of the wall instead. When the observer
    // is closer than that there is no room to pull back - and at that range they are against the
    // wall anyway, so the sight test is simply skipped.
    const sightPoint = pullBack(point, observerCenter, canvas.grid.size / 2);
    const seen = wall.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

    detectables.push({
      key: wall.uuid,
      skill: "prc",
      dc: wall.getFlag(moduleId, FLAGS.dc) ?? defaultDC,
      point,
      sightPoint: sightPoint ?? point,
      range: wall.getFlag(moduleId, FLAGS.range) ?? defaultRange,
      message: wall.getFlag(moduleId, FLAGS.message) || null,
      spottedKey: "DND5E_GM_TOOLKIT.secretDoor.spotted",
      missedKey: "DND5E_GM_TOOLKIT.secretDoor.notSpotted",
      requiresSight: sightPoint !== null,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => wall.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
    });
  }

  return detectables;
}
```

- [ ] **Step 2: Include the walls in the hook**

In `tools/passive-detection/index.js`, replace the construction of the detectables inside the hook:

```js
      const detectables = [
        ...collectRegionDetectables({ scene, observerCenter, actor, moduleId, typeId: TYPE_ID }),
        ...collectSecretDoorDetectables({ scene, observerCenter, actor, moduleId })
      ];
      if (!detectables.length) return;
```

and update the import:

```js
import { collectRegionDetectables, collectSecretDoorDetectables } from "./sources.js";
```

- [ ] **Step 3: Add the strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT.secretDoor`, next to `wallConfig`:

```json
      "spotted": "{name} spots something odd about this stretch of wall (passive Perception meets/beats DC {dc}).",
      "notSpotted": "{name} passes a secret door without noticing it (DC {dc})."
```

In `lang/it.json`:

```json
      "spotted": "{name} nota qualcosa di strano in questo tratto di parete (percezione passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa davanti a una porta segreta senza accorgersene (CD {dc})."
```

- [ ] **Step 4: Verify the tests still pass**

Run: `npm test`
Expected: PASS, 29 tests

- [ ] **Step 5: Manual check**

Draw a wall with door type Secret, without touching its fields: move a PC within the default range and verify it triggers with the default DC. Set a custom message and try it with a second PC: the custom text must reach only whoever succeeds. Put the secret door **behind another wall** and verify it is not detected: that is the case the pull-back of the sight point must keep blocking. Bring a PC into contact with the door: it must still be detected, because below half a square the sight test is skipped. **The door must never be revealed**: no change to the wall's state.

- [ ] **Step 6: Commit**

```bash
git add tools/passive-detection/sources.js tools/passive-detection/index.js lang/en.json lang/it.json
git commit -m "feat(passive-detection): passive detection of secret doors"
```

---

### Task 10: Hidden creature detection

**Files:**
- Create: `tools/hidden-creatures/index.js`
- Create: `tools/hidden-creatures/sources.js`
- Modify: `tools/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: core and geometry.
- Produces: from `sources.js` — `collectCreatureDetectables({targets, actor, moduleId}) -> Detectable[]`, `isHiddenCreature(tokenDocument) -> boolean`, `tokenCenter(tokenDocument) -> {x, y}`, and the constant `HIDING_STATUS = "hiding"`, used by tasks 11 and 12.

- [ ] **Step 1: Write the creature source**

Create `tools/hidden-creatures/sources.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

export const HIDING_STATUS = "hiding";

/**
 * Centre of a token in pixel space.
 * @returns {{x: number, y: number}}
 */
export function tokenCenter(tokenDocument) {
  const gridSize = tokenDocument.parent.grid.size;
  return {
    x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
    y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
  };
}

/**
 * Both markers are required. `hidden` alone would catch tokens a GM hides for staging reasons
 * (NPCs not yet in play, scenery); the `hiding` status alone would catch creatures the players
 * can already see. See tools/hidden-creatures/marker-guard.js for the safety net that stops a
 * forgotten marker from failing silently.
 * @returns {boolean}
 */
export function isHiddenCreature(tokenDocument) {
  return tokenDocument.hidden === true
    && tokenDocument.actor?.statuses?.has(HIDING_STATUS) === true;
}

/**
 * Turns hidden creatures into detectables for one observing PC.
 *
 * The DC is the creature's passive Stealth, read live: no stored roll, so nothing to keep in
 * sync and no dialog to interrupt anyone.
 *
 * @param {object} options
 * @param {object[]} options.targets   TokenDocuments already known to be hidden creatures.
 * @param {object} options.actor       Actor of the observing PC.
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectCreatureDetectables({ targets, actor, moduleId }) {
  const range = game.settings.get(moduleId, SETTINGS.creatureDetectionRange);

  return targets.map(token => {
    const point = tokenCenter(token);
    const seen = token.getFlag(moduleId, FLAGS.detectedBy) ?? [];

    return {
      key: token.uuid,
      skill: "prc",
      dc: token.actor.system.skills?.ste?.passive ?? 0,
      point,
      sightPoint: point,
      range,
      message: null,
      spottedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.spotted",
      missedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.notSpotted",
      requiresSight: true,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => token.setFlag(moduleId, FLAGS.detectedBy, [...seen, actor.id])
    };
  });
}
```

- [ ] **Step 2: Write the tool**

Create `tools/hidden-creatures/index.js`:

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";
import { HIDING_STATUS, collectCreatureDetectables, isHiddenCreature, tokenCenter } from "./sources.js";

/**
 * Passive Perception against a hidden creature's passive Stealth.
 *
 * The comparison is symmetric, so it runs on both sides of a movement: a creature crawling toward
 * the party exposes itself exactly as much as the party walking toward it, and only checking the
 * PC's movement would miss half the real cases.
 */
export default {
  id: "hidden-creatures",
  titleKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The hooks below are attached once per page load, at "ready".
      requiresReload: true
    });

    game.settings.register(moduleId, SETTINGS.creatureDetectionRange, {
      name: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.name",
      hint: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 30
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      if (tokenDocument.actor?.type === "character") {
        const targets = scene.tokens.filter(isHiddenCreature);
        await detect({ observerToken: tokenDocument, targets, moduleId });
        return;
      }

      if (!isHiddenCreature(tokenDocument)) return;

      // The creature moved: re-check every PC against this one creature.
      for (const pcToken of scene.tokens) {
        if (pcToken.actor?.type !== "character") continue;
        await detect({ observerToken: pcToken, targets: [tokenDocument], moduleId });
      }
    });

    // A creature that stops hiding and hides again deserves a fresh chance against everyone,
    // so the record of who spotted it is wiped when the status comes off.
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has(HIDING_STATUS)) return;

      const actor = effect.parent;
      if (!(actor instanceof Actor)) return;

      const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
      for (const token of tokens) {
        await token?.unsetFlag(moduleId, FLAGS.detectedBy);
      }
    });
  }
};

/**
 * @param {object} options
 * @param {object} options.observerToken  TokenDocument of the observing PC.
 * @param {object[]} options.targets      TokenDocuments of hidden creatures.
 * @param {string} options.moduleId
 * @returns {Promise<void>}
 */
async function detect({ observerToken, targets, moduleId }) {
  const actor = observerToken.actor;
  if (!actor) return;

  const detectables = collectCreatureDetectables({ targets, actor, moduleId });
  if (!detectables.length) return;

  const observerCenter = tokenCenter(observerToken);

  await runDetection({
    observer: actor,
    detectables,
    measure: (point) => sceneDistance(observerCenter, point),
    isSightBlocked: (point) => isSightBlocked(observerCenter, point),
    report: ({ observer, detectable, spotted }) => reportDetection({
      moduleId, observer, detectable, spotted,
      toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
    })
  });
}
```

- [ ] **Step 3: Register the tool**

In `tools/index.js`:

```js
import passiveDetection from "./passive-detection/index.js";
import hiddenCreatures from "./hidden-creatures/index.js";
import lockpicking from "./lockpicking/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  passiveDetection,
  hiddenCreatures,
  lockpicking
];
```

- [ ] **Step 4: Add the strings**

In `lang/en.json`, inside `tools`:

```json
      "hiddenCreatures": {
        "title": "Hidden Creatures (passive Perception)",
        "hint": "Mark an NPC's token as both hidden on the canvas and carrying the Hiding status, and every PC that comes within range is checked: their passive Perception against the creature's passive Stealth. Nothing is revealed - the player is told privately that they have noticed something. Once per PC until the creature hides again."
      }
```

And at top level inside `DND5E_GM_TOOLKIT`:

```json
    "hiddenCreatures": {
      "spotted": "{name} catches movement that should not be there (passive Perception meets/beats DC {dc}).",
      "notSpotted": "{name} walks past something hidden and lying in wait (DC {dc})."
    }
```

And inside `settings`:

```json
      "creatureDetectionRange": {
        "name": "Hidden creatures: detection range",
        "hint": "Distance in scene units within which a PC's passive Perception is compared with a hidden creature's passive Stealth. Without a limit, a high passive would notice an ambush across the whole map."
      }
```

In `lang/it.json`, inside `tools`:

```json
      "hiddenCreatures": {
        "title": "Creature nascoste (percezione passiva)",
        "hint": "Marca il token di un PNG sia come nascosto sulla canvas sia con lo status Nascosto, e ogni PG che entra nel raggio viene controllato: percezione passiva contro furtività passiva della creatura. Non viene rivelato nulla, al giocatore arriva in privato che ha notato qualcosa. Una volta per PG, finché la creatura non si ri-nasconde."
      }
```

```json
    "hiddenCreatures": {
      "spotted": "{name} coglie un movimento che non dovrebbe esserci (percezione passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa accanto a qualcosa di nascosto e in agguato (CD {dc})."
    }
```

```json
      "creatureDetectionRange": {
        "name": "Creature nascoste: raggio di rilevamento",
        "hint": "Distanza in unità di scena entro cui la percezione passiva di un PG viene confrontata con la furtività passiva di una creatura nascosta. Senza un limite, una passiva alta noterebbe un agguato dall'altro capo della mappa."
      }
```

- [ ] **Step 5: Verify the tests still pass**

Run: `npm test`
Expected: PASS, 29 tests

- [ ] **Step 6: Manual check**

Enable the tool and reload. Take an NPC with Stealth, hide its token and apply the Hiding status to it. Move a PC within 30: whoever has a sufficient passive gets the message, the others don't and the GM sees the failure. Move the same PC again: no repeat. **Move the creature** toward a PC standing still: the check must trigger anyway, it is the symmetric case. Remove the Hiding status and put it back: everyone must get a new chance. Verify it does not trigger with a wall in between.

- [ ] **Step 7: Commit**

```bash
git add tools/hidden-creatures/ tools/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): passive Perception against passive Stealth"
```

---

### Task 11: Warning on inconsistent markers

**Files:**
- Create: `tools/hidden-creatures/marker-guard.js`
- Modify: `tools/hidden-creatures/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `HIDING_STATUS` from task 10.
- Produces: `registerMarkerGuard()`.

- [ ] **Step 1: Write the guard**

Create `tools/hidden-creatures/marker-guard.js`:

```js
import { HIDING_STATUS } from "./sources.js";

/**
 * Requiring both markers means forgetting one produces no detection at all, silently - the worst
 * way for this to fail, because nothing looks broken. These two hooks turn that silence into a
 * one-line notice for the GM.
 *
 * It only ever tells: no marker is applied or removed automatically. Hiding a token and declaring
 * a creature hidden are two different intentions, and guessing which one was meant would be worse
 * than saying nothing.
 */
export function registerMarkerGuard() {
  Hooks.on("createActiveEffect", (effect) => {
    if (!game.user.isGM) return;
    if (!effect.statuses?.has(HIDING_STATUS)) return;

    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;

    const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
    const visible = tokens.filter(token => token && !token.hidden);
    if (!visible.length) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsHidden", {
        name: actor.name
      })
    );
  });

  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (!game.user.isGM) return;
    if (changes.hidden !== true) return;
    if (tokenDocument.actor?.type === "character") return;
    if (tokenDocument.actor?.statuses?.has(HIDING_STATUS)) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsStatus", {
        name: tokenDocument.name
      })
    );
  });
}
```

- [ ] **Step 2: Hook up the guard**

In `tools/hidden-creatures/index.js`, at the end of `onReady(moduleId)`:

```js
    registerMarkerGuard();
```

with `import { registerMarkerGuard } from "./marker-guard.js";`

- [ ] **Step 3: Add the strings**

In `lang/en.json`, inside `DND5E_GM_TOOLKIT.hiddenCreatures`:

```json
      "markerWarning": {
        "needsHidden": "{name} is marked as Hiding but its token is still visible to players, so it will not be detected. Hide the token too.",
        "needsStatus": "{name} is hidden from players but has no Hiding status, so it will not be detected. Add the status if it is meant to be lying in wait."
      }
```

In `lang/it.json`:

```json
      "markerWarning": {
        "needsHidden": "{name} è marcato come Nascosto ma il suo token è ancora visibile ai giocatori, quindi non verrà rilevato. Nascondi anche il token.",
        "needsStatus": "{name} è nascosto ai giocatori ma non ha lo status Nascosto, quindi non verrà rilevato. Aggiungi lo status se è in agguato."
      }
```

- [ ] **Step 4: Manual check**

Apply the Hiding status to an NPC whose token is visible: the warning must appear, to the GM only. Hide the token: no further warning, and from then on detection works. Hide a token with no status: warning of the other kind. Hide a PC token: **no** warning, PCs are not subject to this check.

- [ ] **Step 5: Commit**

```bash
git add tools/hidden-creatures/marker-guard.js tools/hidden-creatures/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): warn the GM when the two markers are inconsistent"
```

---

### Task 12: Surprise proposal

**Files:**
- Create: `tools/hidden-creatures/surprise.js`
- Modify: `tools/hidden-creatures/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `isHiddenCreature` (task 10), `FLAGS`.
- Produces: `registerSurprisePrompt(moduleId)`.

- [ ] **Step 1: Write the proposal**

Create `tools/hidden-creatures/surprise.js`:

```js
import { FLAGS } from "../../scripts/constants.js";
import { isHiddenCreature } from "./sources.js";

const SURPRISED_STATUS = "surprised";

/**
 * Offers to mark as surprised every PC that failed to notice an ambusher.
 *
 * Timed on encounter creation, not on combat start: dnd5e reads statuses when initiative is
 * rolled (CONFIG.DND5E.conditionEffects.initiativeDisadvantage), and Foundry's usual flow rolls
 * initiative before "Begin Combat" is pressed. Applying the status at combatStart would therefore
 * be too late to grant the disadvantage, which is the whole point of applying it.
 *
 * At encounter creation the combatant list may still be empty, so the proposal is built from
 * scene state - which is the same record the detection already keeps.
 *
 * Nothing is applied without confirmation: the module cannot know whether the fight actually
 * started from the ambush or whether the party was alerted some other way.
 *
 * @param {string} moduleId
 */
export function registerSurprisePrompt(moduleId) {
  Hooks.on("createCombat", async (combat, options, userId) => {
    if (!game.user.isGM) return;
    if (game.user.id !== userId) return;

    const scene = combat.scene ?? canvas.scene;
    if (!scene) return;

    const ambushers = scene.tokens.filter(isHiddenCreature);
    if (!ambushers.length) return;

    const candidates = scene.tokens.filter(token => {
      if (token.actor?.type !== "character") return false;
      return ambushers.some(ambusher => {
        const detectedBy = ambusher.getFlag(moduleId, FLAGS.detectedBy) ?? [];
        return !detectedBy.includes(token.actor.id);
      });
    });
    if (!candidates.length) return;

    const chosen = await promptForSurprised(candidates);
    if (!chosen?.length) return;

    for (const token of candidates) {
      if (!chosen.includes(token.id)) continue;
      await token.actor.toggleStatusEffect(SURPRISED_STATUS, { active: true });
    }
  });
}

/**
 * @param {object[]} candidates  TokenDocuments of PCs that missed at least one ambusher.
 * @returns {Promise<string[]|null>} chosen token ids, or null if dismissed
 */
async function promptForSurprised(candidates) {
  const rows = candidates.map(token => `
    <div class="form-group">
      <label>
        <input type="checkbox" name="${token.id}" checked>
        ${foundry.utils.escapeHTML(token.name)}
      </label>
    </div>
  `).join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.title") },
    content: `<p>${game.i18n.localize("DND5E_GM_TOOLKIT.surprise.hint")}</p>${rows}`,
    ok: {
      label: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.confirm"),
      callback: (_event, button) => candidates
        .filter(token => button.form.elements[token.id]?.checked)
        .map(token => token.id)
    },
    rejectClose: false
  });
}
```

- [ ] **Step 2: Hook up the proposal**

In `tools/hidden-creatures/index.js`, at the end of `onReady(moduleId)`:

```js
    registerSurprisePrompt(moduleId);
```

with `import { registerSurprisePrompt } from "./surprise.js";`

- [ ] **Step 3: Add the strings**

In `lang/en.json`, at top level inside `DND5E_GM_TOOLKIT`:

```json
    "surprise": {
      "title": "Surprised by the Ambush?",
      "hint": "These PCs did not notice at least one hidden creature on this scene. Uncheck anyone who should not be surprised, then confirm. Apply this before rolling initiative - dnd5e grants the disadvantage at roll time.",
      "confirm": "Mark as Surprised"
    }
```

In `lang/it.json`:

```json
    "surprise": {
      "title": "Sorpresi dall'imboscata?",
      "hint": "Questi PG non hanno individuato almeno una creatura nascosta su questa scena. Togli la spunta a chi non deve essere sorpreso, poi conferma. Applicalo prima di tirare l'iniziativa: dnd5e assegna lo svantaggio al momento del tiro.",
      "confirm": "Marca come sorpresi"
    }
```

- [ ] **Step 4: Manual check**

With a hidden creature on the scene not spotted by at least one PC, create an encounter: the dialog with the list must appear, all ticked. Confirm: the chosen PCs get the Surprised icon. Roll initiative and verify dnd5e applies the disadvantage. Cancel the dialog on a second encounter: **no** status applied. Create an encounter on a scene **without** hidden creatures: no dialog. Have all PCs spot the creature and create an encounter: no dialog.

- [ ] **Step 5: Commit**

```bash
git add tools/hidden-creatures/surprise.js tools/hidden-creatures/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): surprise proposal when the encounter is created"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: no code.

> The README text this task wrote was in Italian at the time. The README has since been converted
> to English; its current content supersedes the snippets that used to be quoted here.

- [ ] **Step 1: Replace the heading and the opening paragraph**

The current text says there are "only two" toggles, which is no longer true. Replace the first lines
up to the Installation section with the new opening: one toggle per tool plus a few settings in a
flat list, the reload requirement, and the common thread "the module never rolls dice".

- [ ] **Step 2: Rewrite the "Available tools" section**

Replace the whole section, from the heading down to and including the note on the barred door, with
one entry each for Passive Detection (traps and clues on Regions; secret doors on the wall itself,
never revealed), Hidden Creatures (both markers required, symmetric check, surprise proposal on
encounter creation) and Lockpicking; then the "Where notifications go" section, the barred-door note
and an "Upgrading from a previous version" section explaining the automatic Region migration and
the need to switch the toggle back on.

- [ ] **Step 3: Update "Adding a new tool" and "Structure"**

At the end of the "Adding a new tool" section, before the paragraph on the bundler, add the note that
a new **passive detection** needs no change to `core/`: a function producing *detectables* (shape
documented in `core/detection.js`) passed to `runDetection` is enough.

Replace the "Structure" block with the tree that lists `core/` (`detection.js`, `recipients.js`,
`geometry.js`, `notify.js`), `tools/<name>/index.js`, `lib/libwrapper-shim.js`, `lang/{en,it}.json`
and `tests/`, followed by: "`lib/` is reserved for vendored third-party code; `core/` is our own
shared code."

- [ ] **Step 4: Add tests and the release warning**

Before the "Release" section, add a "Tests" section (`npm install`, `npm test`; the tests cover the
pure code, persistence comes in through callbacks; `npm` is only for the tests).

At the end of the "Release" section, add the warning that the "Create Zip Archive" step lists the
folders to include **explicitly**, so a new folder missing from that list works in development and
is missing from the release.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update the README for passive detection"
```
