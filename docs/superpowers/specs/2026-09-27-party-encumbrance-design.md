# Party stash encumbrance — design

Date: 2026-09-27
Status: approved in brainstorming (questions asked and settled in chat), to be turned into an
implementation plan

## Goal

The party uses a dnd5e **Group** actor as a shared stash (coins, gear to sell). In dnd5e the Group
has no encumbrance of its own: the items it holds weigh on nobody, like a bottomless bag. By the
rules, though, somebody has to carry them.

The tool makes the stash's weight fall on the Group's members, in one of three modes chosen by the
GM on the Group sheet, and lets the GM restrict the distribution to a subset of members (e.g. only
the pack mule, or only the fighter and the barbarian).

It is not a house rule: it does not change a rule, it enforces the real one. That is why it lives in
the GM Toolkit and not in `dnd5e-house-rules`.

## Scope

In:

- New tool `party-encumbrance` (folder `tools/party-encumbrance/`), with an on/off toggle in
  Configure Settings, off by default, `requiresReload: true` like the others.
- **Virtual** share: the items stay in the Group, each carrier gets its part of the weight added on
  the fly in the encumbrance calculation. Nothing is written to the PCs.
- Three distribution modes plus "None", chosen per Group from its sheet.
- Choice of carriers per member, from the Group sheet.
- Tooltip on PC and NPC encumbrance bars explaining how much comes from the stash.
- Encumbrance status (dnd5e's native effects) consistent with the share.
- English base language (`lang/en.json`), complete Italian localization (`lang/it.json`), and a
  test that checks the keys stay aligned between the two languages.

Out:

- **Vehicles** as carriers. dnd5e already has its own native feature for a cart: a Vehicle member of
  the Group set as "primary vehicle", with the Group's inventory pointing at the vehicle and the
  capacity given by the draft animals. Vehicles are not listed among carriers and get no share.
- The **Variant** encumbrance thresholds in the "available capacity" calculation. The world uses
  the Standard rule: available capacity is measured against maximum capacity. Variant statuses
  still come out right, because dnd5e applies them on the final value.
- Physically moving items from the Group to the PCs.

## Verified compatibility

Read the source of dnd5e **5.3.3** and **6.0.5** (both compatible with Foundry v14): the hook
points below are identical in the two versions.

- `dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance` (static) computes encumbrance. It is
  called as `AttributesFields.prepareEncumbrance.call(this, rollData)` from `CharacterData`,
  `NPCData` and `VehicleData#prepareDerivedData`, so replacing the static property affects every
  call. It writes `encumbrance.value`, `thresholds`, `max`, `mod`, `stops`, `pct`, `encumbered`. No
  other derived calculation reads `encumbrance`: the speed reduction goes through status effects.
- `Actor5e#updateEncumbrance()` creates/updates/deletes the encumbrance status effect based on
  `encumbrance.value` and the thresholds. dnd5e calls it only when the actor or its items change,
  and only on the client of whoever made the change.
- `GroupData.members` is an array of `{ actor }` already filtered (missing actors, nested groups,
  duplicates) in `prepareBaseData`.
- `GroupActorSheet` (ApplicationV2): the Inventory tab has a sidebar with a
  `.encumbrance.card[data-uuid]` card for each member (the primary Vehicle is excluded if the
  inventory points at it), with the native bar read from `actor.system.attributes.encumbrance`.
- The Group's `dnd5e.inventorySource` flag (`"group"` or `"vehicle"`) decides whether the inventory
  shown is the Group's or the primary vehicle's.

## Decisions and their rationale

### Share computed on the fly, not an Active Effect nor a move

Three alternatives considered:

1. **Wrapper on `prepareEncumbrance`** (chosen). After the original calculation, the share is added
   to `encumbrance.value` and `pct` and `encumbered` are recomputed. It is derived data: it
   recomputes by itself, every client gets the same result from the same data, and switching the
   tool off brings everything back to native with no cleanup.
2. **Active Effect on the members.** dnd5e has no "extra weight" field: you could only lower the
   capacity, and the bar would show false numbers. On top of that, documents would have to be
   written and kept in sync on every PC.
3. **Moving the items into the PCs.** Not what is wanted: the shared stash must remain.

The wrapper goes through libWrapper (or the shim already included in `lib/`), like lockpicking.
Type `WRAPPER`: the original calculation always runs first, so an error in the tool can never stop
dnd5e from computing encumbrance. Target:
`dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance`. It is a static method: it must be
verified in Foundry that libWrapper and the shim wrap it correctly. If they cannot, the fallback is
replacing the static property by hand, keeping the original.

### One choice per Group, not only the primary Group

The mode lives on each Group, with `none` as default. It works even if the GM has not set dnd5e's
primary party, and no separate toggle is needed: "None" is the off position. An actor that belongs
to several active Groups gets the sum of the shares.

### Exclude, don't include

The flag stores the **excluded** members, not the carriers. By default everybody carries (the
common case needs no configuration); to give everything to the mule you untick the others. If
nobody carries, the weight is not distributed and the sheet says so: no silent fallback to
"everyone", consistent with the rest of the module.

### Only the GM configures

The mode menu and the carrier checkboxes can be changed only by the GM. Players see the same
information read-only. This prevents the distribution from changing mid-session without the GM
noticing.

### "Available capacity" is measured against maximum capacity

The world uses the Standard encumbrance rule: the only threshold that matters is maximum capacity
(`thresholds.maximum`, 15 × STR for a Medium creature). Available = `max(0, capacity − own weight)`.

### If everybody is full, fall back to "maximum capacity"

In "available capacity" mode, if the sum of the available capacities is 0 the formula would divide
by zero and the weight would vanish. Distribution by maximum capacity is used instead: everybody goes
over proportionally, which is what really happens to an overloaded party.

## Architecture

```
tools/party-encumbrance/
  index.js                  tool registration (toggle, onReady)
  allocate.js               pure function: stash weight + carriers + mode → shares
  stash.js                  a Group's stash weight; flag reading; carrier list
  encumbrance-wrapper.js    wrapper on prepareEncumbrance
  refresh.js                recomputes shares and refreshes the affected actors
  group-sheet.js            controls on the Group sheet
  actor-sheet.js            tooltip on PC and NPC encumbrance bars
tests/
  party-encumbrance.test.js allocate() and stash weight
  lang.test.js              en/it key alignment
```

### Data

Flag on the Group, under the module scope, key `partyEncumbrance` (added to `FLAGS` in
`scripts/constants.js`):

```js
{ mode: "none" | "equal" | "available" | "maximum", excluded: string[] /* actor ids */ }
```

Absent means `{ mode: "none", excluded: [] }`.

A Group's carriers: members of `type` `character` or `npc` whose id is not in `excluded`.

### `allocate.js` (pure)

```js
/**
 * @param {number} weight                 Stash weight, in the world's default units.
 * @param {{id: string, own: number, max: number}[]} carriers
 * @param {"equal"|"available"|"maximum"} mode
 * @returns {Map<string, number>}          Share per id, rounded to 0.1.
 */
export function allocate(weight, carriers, mode) {}
```

- `weight <= 0` or no carriers: empty map.
- `equal`: `weight / n`.
- `available`: `weight × avail_i / Σavail`, with `avail_i = max(0, max_i − own_i)`. If
  `Σavail = 0`, use `maximum`.
- `maximum`: `weight × max_i / Σmax`. If `Σmax = 0`, use `equal`.
- Rounding to 0.1 like dnd5e (`Math.round(x * 10) / 10`, same effect as `toNearest(0.1)`, which
  does not exist in tests outside Foundry).

A second pure function sums the maps of several Groups: `mergeShares(maps) → Map<id, {total,
bySource: [{groupId, groupName, share}]}>`. `bySource` feeds the tooltip.

### `stash.js`

- `stashWeight(group)`: sum of `item.system.totalWeightIn?.(units)` over the Group's items with
  `!item.container` (containers include their contents, and a bag of holding stays light as dnd5e
  intends); plus coins if `game.settings.get("dnd5e", "currencyWeight")`, with the same formula as
  `prepareEncumbrance` (`CONFIG.DND5E.encumbrance.currencyPerWeight`). Units: the world's default
  ones (`CONFIG.DND5E.encumbrance.baseUnits.default`, imperial or metric depending on
  `metricWeightUnits`), the same as PCs and NPCs.
- To be testable without Foundry, it receives its dependencies (items, currencies, settings, config)
  as arguments; the Foundry-dependent code is a thin adapter on top.
- `readConfig(group)`: the flag with defaults.
- `carriersOf(group)`: carriers as above.

### `encumbrance-wrapper.js`

After the original call, for `character` or `npc` actors:

1. Store the own weight: `encumbrance.stash = { own: encumbrance.value, share: 0, bySource: [] }`.
   Always stored, even with a zero share, because `refresh.js` reads it for "available capacity"
   mode.
2. If the current map (module cache, computed by `refresh.js`) has a share for `actor.id`:
   `value = (own + share)` rounded to 0.1, `pct` recomputed with the same native formula
   (`clamp(value × 100 / max, 0, 100)`), `encumbered` recomputed as native, `stash.share` and
   `stash.bySource` filled in.

The wrapper does not compute shares: it only reads them. That way it does not depend on the order
in which Foundry prepares actors at startup.

### `refresh.js`

`recompute()`:

1. For each actor of type `group` with a mode other than `none`: stash weight, carriers with
   `{ id, own: encumbrance.stash?.own ?? encumbrance.value, max: encumbrance.max }`, `allocate()`.
2. `mergeShares()` of the maps.
3. Comparison with the previous map: replace the cache, then for each actor whose share changed
   (including those that lost it) call `actor.reset()` (re-prepares derived data reading the new
   cache) and re-render its open sheets. Also re-render the sheets of active Groups.
4. Only on the active GM (`game.users.activeGM?.isSelf`), for the changed actors:
   `actor.updateEncumbrance()`, so the status effect follows the share even when what changed is
   the stash and not the actor.

When it runs: once on `ready` (by then all actors and Group items are prepared), then with
`foundry.utils.debounce` (~100 ms) on:

- `createItem`, `updateItem`, `deleteItem`: stash or member items;
- `updateActor`, `deleteActor`: Group flags and members, coins, STR, size, `powerfulBuild`;
- `createActiveEffect`, `updateActiveEffect`, `deleteActiveEffect`: effects that change STR or
  capacity;
- `updateSetting` for `dnd5e.currencyWeight`, `dnd5e.metricWeightUnits`, `dnd5e.encumbrance`.

No loops: `actor.reset()` fires no update hooks, and the status effect created by
`updateEncumbrance()` triggers a recompute that finds the same shares and stops.

The recompute is cheap (few Groups, few members), which is why it fires on all these events without
filtering up front which document is involved.

### `group-sheet.js`

`renderGroupActorSheet` hook, only if the Inventory tab is in the DOM.

- At the top of the inventory body: "Stash weight: 184.5 lb" and the mode menu (GM) or its text
  (players). With "None" the weight stays visible, so the GM sees it before choosing.
- In each `.encumbrance.card[data-uuid]` card of a `character` or `npc` member: a "Carries" checkbox
  (GM) or a ✓/✗ icon (players), and "Stash share: 46 lb" when the share is non-zero.
- A warning under the menu if the mode is active but there are no carriers: "No carriers: the stash
  weighs on no one".
- Changing the mode or a checkbox is a `group.setFlag(...)`: the recompute starts from the
  `updateActor` hook.

### `actor-sheet.js`

Render hook of dnd5e's PC and NPC sheets: if `encumbrance.stash.share > 0`, add a `data-tooltip` to
the encumbrance `.meter.progress` bar with one line per Group: "Of which 46 lb from The Company's
stash".

### Localization

All strings in `lang/en.json` (base language, Foundry's fallback) and `lang/it.json`, under
`DND5E_GM_TOOLKIT.tools.partyEncumbrance.*`. No hand-written text in the code. The English example
labels above are indicative; the Italian translation must be written in full, not left to the
fallback.

## Edge cases

| Case | Behavior |
|---|---|
| No carriers | Weight not distributed, warning on the Group sheet. |
| Everybody full in "available capacity" | Distribution by maximum capacity. |
| Actor in several active Groups | Sum of the shares, per-Group detail in the tooltip. |
| Empty stash or "None" mode | Zero share, bar identical to native. |
| Member deleted or removed from the Group | Already dropped by dnd5e; the share disappears on recompute. |
| Group inventory on the primary vehicle | Only the items left in the Group are distributed. |
| Unlinked token of a member | Shares the base actor's id, so it inherits the share. |
| Tool off | Wrapper not registered, native behavior, no cleanup. |
| libWrapper missing | Shim included in `lib/`. |
| Coins | Weigh only with dnd5e's "currency weight" on. |
| Metric units | Stash computed in the same units as the PCs. |

Errors: if the recompute of a Group throws, the error goes to the console (`console.error` with the
module prefix), that Group is skipped and the others go on. The wrapper wraps its own part in
`try/catch` after the original call: on error the encumbrance stays the native one.

## Tests

Automated (vitest, `npm test`):

- `allocate()`: the three modes; "available" falling back to "maximum"; "maximum" falling back to
  "equal" with zero capacities; no carriers; zero or negative weight; single carrier (gets
  everything); carrier whose own weight is over capacity (available 0); rounding to 0.1.
- `mergeShares()`: sum of several Groups and per-source detail.
- Stash weight: top-level items, items inside a container not counted twice, coins with the setting
  on and off.
- `lang.test.js`: every key in `en.json` exists in `it.json` and vice versa (also covers the
  existing tools).

Manual in Foundry (checklist in the plan):

1. Enable the tool, put items in the Group, choose each mode: the members' bars in the Group sheet
   and on the PC sheets change accordingly.
2. Untick everyone except the mule: all the weight goes to the mule.
3. Untick everyone: the warning appears, the bars go back to native.
4. As a player: menu and checkboxes not editable, tooltip visible on your own sheet.
5. Go over capacity with the share alone: the encumbrance status appears; empty the stash: it goes
   away.
6. Switch the tool off and reload: native bars.
7. Check on dnd5e 5.3.x and 6.0.x.

## Documentation and release

- Entry in the README under "Available tools".
- `tools/index.js`: import and register the tool.
- The release workflow zips the whole `tools/` folder: no change needed.
- Before this tool lands, Monster Recognition is taken out of the package (backed up outside the
  repo): its bestiary content is Wizards of the Coast material that must not ship in a module that
  may be published. The implementation plan does this as its first task.
