# Passive detection — design

Date: 2026-09-02
Status: approved in brainstorming, to be turned into an implementation plan

## Goal

Automate the rolls that interrupt the flow of play and that are based on passive skills. Today the
module covers a single case (traps). This increment generalizes the mechanism and adds two new
subjects, without ever asking anyone for a roll.

Guiding principle: **the module never rolls dice**. It compares a passive value of the observer
with a passive value or a DC of the target, and reports the result to whoever needs it.

## Scope

In:

- **Shared core** — decision and notification, reusable by any source.
- **Engine 1, static points** — traps and hidden clues (Region), secret doors (wall).
- **Engine 2, hidden creatures** — passive Perception against passive Stealth, plus the surprise
  proposal at the start of combat.

Out, with a spec of their own in the future:

- **Engine 3, passive Insight against an NPC's Deception.** Excluded because it is not triggered by
  any movement: it needs an entry point in the interface that the module does not have today, and
  its UI questions must not block the rest, which is already clear.
- **Automatic modifiers to the passive** (−5 with disadvantage, +5 with advantage). Dropped.

## Decisions and their rationale

### Stealth and Deception are read as passives

`system.skills.ste.passive` (10 + mod) and not a stored Stealth roll.

Important consequence: **no state is needed for the target.** The "ask once and remember in a flag"
pattern used by `lockpicking` for lock DCs, which was the natural candidate, goes away. No dialog,
no flag, no drift. This also holds for engine 3 when it arrives.

It departs from the written rules (hiding is an active Stealth check) and does so deliberately: an
active check would reintroduce exactly the interruption we are removing.

### Secret doors are never revealed

On success only the notification goes out. The player decides what to do.

Besides being the intended GMing choice, it removes a real technical constraint: a
`WALL_DOOR_TYPES.SECRET` wall is hidden from players **at world level, not per user**. Revealing it
to the single PC who noticed it is impossible; revealing it would reveal it to everyone. By
revealing nothing the problem simply does not exist.

### Secret-door data lives on the wall, not on a Region

Traps necessarily need a Region: Foundry has no native "trap" object. Secret doors do — the `SECRET`
wall is already drawn. Also requiring a Region would mean two objects to keep aligned by hand, which
diverge as soon as the wall is moved.

The module already stores per-wall data as flags (`lockpicking` uses `wall.document.getFlag(moduleId,
"lockDC")`), so it is not a new pattern: the only new part is where the GM types them.

### A creature is hidden only if it has both markers

Token hidden on the canvas (`token.hidden`) **and** the dnd5e `hiding` status.

`hidden` alone would produce false positives: GMs also hide tokens for staging reasons (NPCs that
have not entered yet, decorations). `hiding` alone would let through creatures the players already
see.

The cost of requiring both is silent failure when one is forgotten, and it is explicitly mitigated:
see "Safety net on the markers".

### Surprise is proposed, not applied

The module cannot know whether combat really starts from the ambush or whether the PCs were alerted
some other way. Applying `surprised` on its own would produce errors discovered with initiative
already rolled, that is, too late. A confirmation dialog costs one click and leaves control where it
belongs.

### Two tools on top of a shared library

`Passive Detection` and `Hidden Creatures`, plus `core/`, which is not visible in the settings.
It follows the convention documented in the README (one tool = one folder = one toggle) and keeps
the most debatable part separable: you can have traps and secret doors without carrying along the
creature and surprise automation.

## Architecture

```
core/detection.js        decides: dedup, distance, sight, passive vs DC, calls the notification
core/notify.js           targeted whisper + toast; registers the socket
core/geometry.js         point/bbox and point/segment distance, sight test

tools/passive-detection/            (formerly trap-detection)
  index.js                          toggle, behavior registration, migration, moveToken hook
  passive-detection-behavior.js     Region behavior schema
  wall-config.js                    field injection into the wall sheet

tools/hidden-creatures/
  index.js                          toggle, symmetric moveToken hook
  surprise.js                       surprise proposal to the GM
```

`lib/` stays reserved for vendored third-party code (today the libWrapper shim). `core/` is our own
shared code, sibling of `tools/`.

### The load-bearing boundary

**Sources produce "detectables", the core decides and notifies.** A source only knows how to find
the candidates near an observer and describe them in a normalized shape:

```js
{
  key,            // stable identity, for deduplication
  skill,          // "prc" | "inv"
  dc,             // number
  point,          // {x, y} used for distance
  sightPoint,     // {x, y} used for the sight test
  range,          // in scene units
  message,        // custom text, or null — used only on success
  spottedKey,     // default i18n key on success
  missedKey,      // i18n key on failure, always
  requiresSight,  // boolean
  hasSeen(),      // → boolean
  markSeen()      // → Promise
}
```

Three details of this shape, decided while writing the implementation plan:

- **`point` and `sightPoint` are distinct.** Secret doors need it: there the target is the wall
  itself and the point from which sight is measured cannot coincide with the one from which
  distance is measured. For every other subject they are the same point.
- **Two i18n keys instead of one.** Success and failure have different texts, and a single fallback
  key was not enough.
- **`message` applies only on success.** On failure the generic text is always used: the custom
  text describes what is noticed, and whoever fails notices nothing — showing it to them would
  reveal exactly what the DC was meant to protect.

`hasSeen`/`markSeen` are closures already bound to the **observer/target pair**: the source builds
them, because only it knows where the state lives (flag on the behavior, on the wall or on the
token). The core never touches a Foundry document.

How the three sources fill the shape:

| Field | Region | `SECRET` wall | Hidden creature |
|---|---|---|---|
| `skill` | from the behavior (`prc`/`inv`) | always `prc` | always `prc` |
| `dc` | from the behavior | flag on the wall, or world default | the NPC's `system.skills.ste.passive` |
| `point` | closest point of the bounding box | closest point of the segment | token center |
| `range` | from the behavior | flag on the wall, or world default | world setting |
| `message` | from the behavior | flag on the wall | always `null` |
| state | flag on the behavior | flag on the wall | `detectedBy` on the token |

`core/detection.js` does not know what traps, doors or goblins are. It receives an observer and a
list of detectables, and for each one it always runs the same sequence:

1. `hasSeen()` → if yes, skip (no repeats)
2. observer/`point` distance > `range` → skip
3. `requiresSight` and sight blocked → skip
4. `observer.system.skills[skill].passive >= dc` → outcome
5. notify according to the outcome, then `markSeen()`

Why this boundary: adding engine 3 tomorrow means writing **a single new source**, zero changes to
the core. And it is the part testable in isolation, because persistence comes in through callbacks
and not from Foundry.

## Data model

### Region behavior

Type renamed from `trapfinder.trapDetection` to **`trapfinder.passiveDetection`**.

| Field | Type | Notes |
|---|---|---|
| `events` | `_createEventsField({events: []})` | stays, for the reason already documented in the existing comment |
| `skill` | StringField, choices `prc`/`inv` | default `prc` |
| `dc` | NumberField | unchanged, initial 15 |
| `range` | NumberField | unchanged, initial 10 |
| `message` | StringField | new, optional: text shown to the player |
| `requiresSight` | BooleanField | new, default `true` |

`skill` is a field and not a separate tool because trap and clue are the exact same mechanism: only
which passive is read changes.

### Secret-door wall

`flags.trapfinder.<key>` inputs injected into the wall sheet, **saved by the native submit with no
code of ours**: `dc`, `range`, `message`.

A `SECRET` wall **takes part on its own** using two new world settings (default DC and range); the
fields on the wall are optional overrides. Without the defaults the GM would have to edit every
single door for the tool to do anything.

See "World settings" below for the overall count.

### Hidden creature token

No stored DC: it is the NPC's `system.skills.ste.passive`, read on the fly.

Only state: `flags.trapfinder.detectedBy`, the list of ids of the PC actors that have spotted it.
**Reset when the `hiding` status is removed**, so a creature that hides again gives everyone a new
chance.

A creature detection range is also needed as a world setting (proposed default 30 units). With no
limit, a high passive would notice an ambush from the other end of the map.

**No custom message for creatures** in this increment: the default i18n text is always used. A
per-token field would exist only to be almost always empty.

## Migration

A document's type **cannot be changed with an update**: the migration must recreate the behavior,
not modify it.

Procedure, one-off on `ready`, only on the active GM:

1. For every scene, every Region, every behavior of type `trapfinder.trapDetection`: read `dc` and
   `range` from `_source`, create a `trapfinder.passiveDetection` behavior on the same Region with
   those values, `skill: "prc"`, same `name` and same `disabled`, carry over the `notifiedActorIds`
   flag, then delete the old one.
2. Record that the migration happened in a `migrationVersion` world setting (`config: false`).

**`module.json` must declare both types for one version:**

```json
"documentTypes": { "RegionBehavior": { "trapDetection": {}, "passiveDetection": {} } }
```

If `trapDetection` disappeared right away, existing behaviors would become an unknown type before
the migration could read them. The old declaration is removed in a later release, when the
migration has certainly run everywhere.

## Notifications

```js
const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
```

- **Success** → whisper to the owners and to the GM; toast to the **connected** owners.
- **Failure** → whisper only to the GM, as today. No toast: telling the player they failed is
  already information the character does not have.
- The whisper stays in the log even for an offline player, the toast does not. So **chat is the
  reliable channel and the toast is only the attention nudge**: they are not alternatives, the toast
  never replaces the message.
- PC with no owner (a `character`-type ally run by the GM): everything to the GM, no toast. No
  broken case.
- Text: custom `message` if set, otherwise the subject's default i18n key.

The socket (`game.socket.on("module.trapfinder", …)`) is registered in `main.js` on `ready`
**always**, not behind a toggle: it costs nothing and prevents an enabled tool from emitting toward
clients with no listener.

On-screen alert in addition to the chat message: world setting, default yes.

## World settings

The module goes from 2 entries in Configure Settings to 7. It stays a readable flat list, so no
dedicated menu: the threshold for revisiting this choice is roughly ten entries.

| Entry | Type | Default | Introduced by |
|---|---|---|---|
| Passive Detection | toggle | off | this increment (formerly Trap Detection) |
| Hidden Creatures | toggle | off | this increment |
| Lockpicking | toggle | off | existing |
| Secret doors default DC | number | 15 | this increment |
| Secret doors default range | number | 10 | this increment |
| Creature detection range | number | 30 | this increment |
| On-screen alert as well as chat | boolean | yes | this increment |

Plus `migrationVersion`, not visible (`config: false`).

The README must be updated: today it says "there are only two toggles".

## Triggers

| Event | Who hooks it | What it does |
|---|---|---|
| `moveToken` of a PC token | `passive-detection` | gathers the scene's Regions and `SECRET` walls within range, passes them to the core |
| `moveToken` of a PC token | `hidden-creatures` | gathers the scene's hidden creatures within range |
| `moveToken` of a hidden creature | `hidden-creatures` | gathers the PCs within range: the comparison is symmetric, moving toward the party exposes as much as the reverse |
| removal of the `hiding` status | `hidden-creatures` | resets `flags.trapfinder.detectedBy` on the token |
| `createCombat` | `hidden-creatures` | proposes surprise |
| `renderWallConfig` | `passive-detection` | injects the fields into the wall sheet |

The two tools each register their own `moveToken`, governed by their respective toggle. They stay
independent: neither knows about the other. Everything runs GM-side only, as today.

## Distance and sight

| Subject | Measure |
|---|---|
| Region | point → bounding box (unchanged, the comment about the approximation stays) |
| Wall | point → segment on `wall.c` |
| Creature | center → center |

Sight test, verified against the v14.365 API:

```js
foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(
  origin, target, { type: "sight", mode: "any" }
) // true = wall in between → skip
```

### Pitfall: the secret door is itself a wall

The sight test from a PC to a point **on** the wall always collides with the wall itself: no secret
door would ever be detected.

Remedy: measure sight up to a point pulled back from the closest point on the segment toward the
observer, by `canvas.grid.size / 2` pixels along the observer→point unit vector. If the observer is
less than half a square from the wall the pulled-back point overshoots it: in that case the sight
test is skipped entirely, because at that distance the PC is touching the wall anyway.

This is the only part of this design that is deduced and **not verified** against a real module. It
must be tried first in implementation; if it does not hold, the fallback is disabling the sight test
for secret doors only and relying on range alone.

## Safety net on the markers

Requiring both `token.hidden` and the `hiding` status means that forgetting one makes everything fail
**silently**, which is the worst way to fail.

Mitigation: when the GM applies `hiding` to a token still visible to players, or hides a token with
no `hiding` status, a `ui.notifications` message only for them explains that the creature does not
take part in detection. No automatic fix: the module flags, it does not decide.

## Surprise

The moment is **the creation of the encounter** (`createCombat`), not its start.

Reason: dnd5e reads statuses **when it rolls initiative**
(`initiativeDisadvantage: new Set(["incapacitated", "surprised"])`, `module/config.mjs:3813`).
Foundry's normal flow is create the encounter → add the combatants → roll initiative → press Begin
Combat. `combatStart` would therefore arrive **after** the rolls, and the status would give no
disadvantage: exactly the thing it is applied for.

When the encounter is created the combatants may not be there yet, so the proposal is based on the
**state of the scene** — PC tokens against the hidden creatures present — which is the data the
module already has anyway. The dialog fires only if undetected hidden creatures really exist, so
outside ambushes it does not get in the way.

On confirmation `surprised` is applied with `actor.toggleStatusEffect("surprised", { active: true })`.
`surprised` is `pseudo: true` in dnd5e, which means "it does not appear in the conditions appendix
but **works as a status effect**" (`module/_types.mjs:600`): it is a normal token HUD icon. That is
why no fallback button is needed — if the proposal is missed, it can be applied by hand.

## Tests

Vitest **only on `core/`**, with no CI job.

The core is pure: persistence comes in through callbacks (`hasSeen`/`markSeen`), so it can be
tested without Foundry. It is also where a bug fails silently at the table: deduplication, range,
sight filter, passive against DC, choice of recipients.

Dev-only: Foundry keeps loading the raw ES modules, no bundler comes in and the `tools/` structure
stays directly loadable as today.

Sources (Region, wall, token) and UI injections are verified by hand at the table:

- trap with DC and range, success and failure
- clue with passive Investigation instead of Perception
- secret door with a custom message, and the same one behind a wall
- creature with both markers, with only one, and after it hides again
- surprise proposal, confirmed and cancelled
- a trap Region created before the migration, which must keep working

## Known risks

| Risk | Mitigation |
|---|---|
| Injection into `renderWallConfig` is verified on wall-height v4.1.2, which declares `verified: 13`; the module targets 14 | Try it first; fallback: a dialog from a button in the scene controls, reusing the DialogV2 pattern already in `lockpicking` |
| ApplicationV2 may partially re-render and duplicate the injected fields | Guard at the top of the hook: if the input already exists, exit. wall-height uses it in the lights hook but not in the walls one |
| The sight test toward a secret door collides with the wall itself | Point pulled back by half a square; if it does not hold, no sight test for secret doors only |
| The migration recreates documents: if it fails halfway, duplicate behaviors remain | Run per Region with `Promise.all` and set `migrationVersion` only at the end of a complete cycle |
| Marker forgotten on a creature → no notification, silently | Notification to the GM only when the two markers are inconsistent |

## Verified references

- Injecting fields into a config sheet: [wall-height v4.1.2](https://github.com/theripper93/wall-height), `scripts/wall-height.js:108-135`. `html` is native DOM in v13+; an input named `flags.<moduleId>.<key>` is saved by the native submit with no extra code; `app.setPosition({height: "auto"})` after the injection.
- [`ClockwiseSweepPolygon.testCollision`](https://foundryvtt.com/api/classes/foundry.canvas.geometry.ClockwiseSweepPolygon.html) — v14.365, `mode: "any"` returns a boolean.
- [`combatStart`](https://foundryvtt.com/api/functions/hookEvents.combatStart.html) — v14.365, fires on the client that starts it, before the database update. Not used, but it is what led to choosing `createCombat`.
- dnd5e: `hiding` status (`module/config.mjs:3875`), `surprised` (`3769`), `initiativeDisadvantage` (`3813`), semantics of `pseudo` (`module/_types.mjs:600`).
