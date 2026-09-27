# GM Toolkit (dnd5e)

A Foundry VTT module (v14+, requires `dnd5e`) with tools and automations for running the session —
**not house rules** (no optional rule variants: for those see the separate
[dnd5e-house-rules](https://github.com/FabioC-88/dnd5e-house-rules) module). Each tool lives in its
own folder and is switched on/off from **Configure Settings**, under "GM Toolkit (dnd5e)": one
toggle per tool plus a few settings, in a flat list with no dedicated popup. **After switching a
tool on or off, Foundry will ask you to reload**: it is required, because some registrations
(behaviors, wrappers, hooks) happen only once at startup.

The common thread of the detection tools: **the module never rolls dice**. It compares passive
values and tells you the outcome, so checks that would break the pace never reach the table as a
request to roll.

## Installation

In Foundry, **Add-on Modules > Install Module**, paste the manifest:

```
https://github.com/FabioC-88/trapfinder/releases/latest/download/module.json
```

Then enable the module in your world (requires the `dnd5e` system). If you also have
[libWrapper](https://foundryvtt.com/packages/lib-wrapper) installed, the module will use it
automatically for lockpicking (better compatibility with other modules); otherwise it uses a
bundled shim, with nothing else to install.

The module ships in English with a complete Italian localization.

## Available tools

- **Passive Detection** (`passive-detection`, off by default) — covers two different containers
  for the same concept.

  *Traps and clues*: draw a **Region** on the Regions layer (invisible to players) at the true
  location of what is hidden and add the "Passive Detection" behavior to it. You set the
  **skill** (Perception or Investigation), **DC**, **range**, an optional **message**, and whether
  **line of sight** is required. When a PC token comes within range, its passive score against the
  DC decides whether it notices. One outcome per PC per spot.

  *Secret doors*: no Region needed. A wall with door type **Secret** takes part on its own, using
  the default DC and range you set once for the world; in the wall configuration you will find
  fields to override them for that single door and to write a message of its own.
  **The door is never revealed**: only the notification goes out, and what to do with it is up to
  the player.

- **Hidden Creatures** (`hidden-creatures`, off by default) — the PC's passive Perception against
  the creature's **passive Stealth** (10 + modifier, read on the fly: no roll, nothing to set on
  the NPC). For a token to take part it needs **both** markers: token hidden on the canvas **and**
  the "Hidden" status. If you set only one, the module tells you, instead of silently doing
  nothing. The check is symmetric: it also triggers when the creature is the one moving toward the
  party. When an encounter is created, if there are undetected ambushers, the module proposes who
  to mark as **Surprised** — with confirmation, and before you roll initiative, because dnd5e
  applies the disadvantage at the moment of the roll.

- **Lockpicking** (`lockpicking`, off by default) — click a locked door **as you already normally
  do**: instead of the silent default behavior (just a sound), you get a prompt to attempt picking
  the lock with the Thieves' Tools of the PC you currently control/have selected. The first time on
  a door it asks you for the lock's DC and remembers it for later attempts. Only GM clicks are
  intercepted — for players the behavior stays Foundry's native one.

- **Party Stash Encumbrance** (`party-encumbrance`, off by default) — dnd5e gives a **Group** actor
  no encumbrance of its own, so the coins and loot the party keeps in it weigh on nobody. With this
  tool on, the Inventory tab of every Group's sheet gets a **Distribution** menu: *Equal shares*,
  *By available capacity* (whoever has more room left takes more), or *By maximum capacity* - each
  Group starts on **None**, so nothing is split until a GM picks one. Each member card gets a
  **Carries** checkbox: untick everyone but the pack mule and the mule takes it all. The share
  counts toward each carrier's encumbrance bar and statuses, and hovering a PC's bar shows how much
  of it comes from the stash. Nothing is moved and nothing is written to the PCs: switch the tool
  off and every bar is native again. Only the GM can change the distribution; players see it
  read-only. Vehicles never carry: for a cart, use dnd5e's own primary vehicle with
  draft animals.

### Where notifications go

Whoever **succeeds** receives a private chat message, plus an on-screen alert if the setting is on;
the GM gets a copy. Whoever **fails** receives nothing: only you see the failure, because telling a
player they failed already tells them there was something to notice.

**Note**: "barred/stuck door" (a further state beyond closed/open/locked, which needs to be forced
open even once unlocked) is deferred to a later increment — it has no native equivalent in Foundry
and depends on the same click-interception mechanism used for lockpicking, which should be
validated at the table before extending it.

### Upgrading from a previous version

Trap Regions already drawn are **converted automatically** on first startup, and you get a
notification with how many were migrated. You do, however, have to **switch the toggle back on**
once: the tool moved from `trap-detection` to `passive-detection`, and with the key the setting that
remembers whether it was enabled changed too.

## Adding a new tool

1. Create `tools/<name>/index.js` exporting `{ id, titleKey, hintKey, default: false, register(moduleId), onReady(moduleId) }`.
   - `register(moduleId)` registers the on/off toggle (`game.settings.register`, `config: true`,
     `requiresReload: true` — the registrations below run only once per page load, so a runtime
     toggle requires a reload) and, if it needs to touch `CONFIG.*` before Foundry initializes the
     settings (e.g. status effects, custom Region Behaviors), does it here — not in `onReady()`.
   - `onReady(moduleId)` hooks up the needed hooks/APIs, only if the toggle is on.
2. Add the translation keys to `lang/en.json` (base language) and `lang/it.json`.
3. Import and register the new tool in `tools/index.js`:
   ```js
   import passiveDetection from "./passive-detection/index.js";
   import hiddenCreatures from "./hidden-creatures/index.js";
   import lockpicking from "./lockpicking/index.js";
   import myFeature from "./my-feature/index.js";
   export const TOOLS = [passiveDetection, hiddenCreatures, lockpicking, myFeature];
   ```

If the new tool is a **passive detection** you do not need to touch `core/`: a function that
produces *detectables* (the shape is documented in `core/detection.js`) and passes them to
`runDetection` is enough. Deduplication, range, line of sight, comparison with the passive and
choice of recipients are already done.

No bundler needed: Foundry loads ES modules directly, so the registry in `tools/index.js` is the
only place to update to hook up a new folder.

## Structure

```
module.json                        Foundry manifest
scripts/main.js                    "init"/"ready" hooks: registers all tools
scripts/constants.js               module id, setting and flag keys
core/                              code shared between tools (not a tool itself)
  detection.js                     the decision: dedup, range, sight, passive vs DC
  recipients.js                    who gets the chat message and who the on-screen alert
  geometry.js                      distances and line-of-sight tests
  notify.js                        private chat message and alert via socket
tools/<name>/index.js              one tool per folder
lib/libwrapper-shim.js             official libWrapper shim (MIT, vendored from ruipin/fvtt-lib-wrapper)
lang/{en,it}.json                  translations (English is the base language)
tests/                             tests of the pure code, run with vitest
```

`lib/` is reserved for vendored third-party code; `core/` is our own shared code.

## Tests

```
npm install
npm test
```

The tests cover the **pure** code — `core/` and the pure parts of the tools — where persistence
comes in through callbacks, so it can be tested without Foundry. Sources and interface injections
are verified in play. No bundler: `npm` is only for the tests, Foundry keeps loading the ES modules
directly.

## Release

Every push of a `v*` tag (e.g. `v0.2.0`) triggers `.github/workflows/release.yml`, which:
1. updates `version` and `download` in `module.json` based on the tag;
2. commits `module.json` to `main`;
3. creates the package zip;
4. publishes a GitHub Release with `module.json` and the zip attached, ready for the manifest URL
   above.

Watch out: the "Create Zip Archive" step lists the folders to include **explicitly**. A new
top-level folder that is not added to that list works in development and is missing from the
release, where the module errors on the first import.
