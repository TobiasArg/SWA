# Swarm Architecturer — Component Color and Delete Confirmation Design

**Status:** Design record, **implemented** (merged in `a5375fe`: commits `d50d053`, `96ef20e`, `c438ff3`, `b59ef0c`, `fbbd14f`). The canonical description of shipped behavior is now in the specs (see "Implementation record" below). This report keeps the rationale, contrast tables and the original acceptance list, and is not a second implementation spec.
**Authority (at design time):** `PRODUCT_CONCEPT_V1.1.md` (PC) and `TECHNICAL_DESIGN.md` (TD) were authoritative for product meaning. This report **replaced** these visual rules: the accent rule in `UI_DESIGN_HANDOFF.md` (UH) §2.3, and `UI_V2_DESIGN.md` (V2) §2.3 (contrast columns), §4.1, §4.2 and §6 (swatch and caption copy). For delete interactions it **replaced** the "undoable editor deletions need no confirmation" rule (PC 8.3 / M2 wording, UH §8.1, TD 5.3, 11.2 and 12): every editor delete asks first in an app-styled modal (§2). It also tightened UH §8.4 (dialogs); those sections were updated with the implementation. Anything not mentioned here described then-current behavior.
**Later supersession (2026-10-23):** this record's D-N4 and §2.5 toast-timing/no-history-binding decision describe only the initial color/delete-confirmation implementation. They are superseded by the shipped roadmap v2 toast contract in `ROADMAP_V2_DESIGN.md` §0.1 and `TECHNICAL_DESIGN.md` §5.2: Delete, Tidy and restore Undo are entry-bound and session-scoped; action toasts last 10 s and pause on hover/focus, while plain toasts last 5 s. The later multi-selection Color feature is specified in the roadmap and technical design: differing color settings (Type default included) are shown as mixed, and a color choice announces the selected component count and chosen color. The original single-component picker rules remain as shipped.
**Inputs inspected:** PC 6.2, 8.3, 9 (M2); TD 5.1–5.3, 6.7, 7.1, 8.5, 11.2, 12, 13; UH §1, §2, §5, §7.4, §8, §9; V2 §0, §2.3, §3, §4, §5, §6; `src/ui/{tokens.css,base.css,Dialog.tsx,ConfirmDialog.tsx,Toast.tsx}`, `src/canvas/{canvas.css,nodes/ComponentNode.tsx}`, `src/inspector/{AccentPicker.tsx,inspector.css}`, `src/palette/palette.css`, `src/editor/actions.ts`, `src/domain/operations.ts` (`deleteElements`, `applyCommand`), `src/app/{EditorScreen.tsx,shortcuts.ts}`, `src/toolbar/Toolbar.tsx`, `src/inspector/{Component,Relationship,Group,MultiSelection}Inspector.tsx`, `src/inspector/inspectorContext.tsx`, `src/library/LibraryScreen.tsx`, `src/persistence/unloadGuard.ts`, and the tests that cover them.

---

## Implementation record (as shipped)

**Where the rules now live.** Color: UH §2.3, §5.1–5.2, §8.1, §9.3, §12; V2 §0 C7, §2.3, §3.2, §3.4, §4, §6, §11, §12; TD 3.1, 6.2, 7.1, 7.2, 12. Confirmation: PC 8.3 and M2; TD 5.3, 6.1, 6.5, 6.7, 8.5, 11.2, 11.3, 12, 13, 15; UH §7.4, §8.4. The later toast contract lives in ROADMAP §0.1 and TD §5.2. Those current sections describe the code; this record retains the earlier rationale and acceptance list.

**Implemented as designed, with tests:** D-C1–D-C6 (`src/domain/palette.ts`, 22 `[data-palette]` rules in `tokens.css`, color-free type rules, Tomato tint `#FADCD6`; AC-C1–C11 in `palette.test.ts`, `ComponentNode.test.tsx`, `AccentPicker.test.tsx`, `ComponentInspector.test.tsx`, `e2e/ui-v2.spec.ts`) and D-N1–D-N5 (one `requestDelete` in `EditorScreen.tsx` for all nine routes, hardened `ConfirmDialog`, library inline error and focus restore, ESLint rules, toast unchanged at that implementation stage (later superseded by roadmap v2), and `unloadGuard`; AC-N1–N14 in `App.integration.test.tsx`, `ConfirmDialog.test.tsx`, `actions.test.ts`, `LibraryScreen.test.tsx`, `e2e/a11y-keyboard.spec.ts`, `scenario-e.spec.ts`, `scenario-i.spec.ts`).

**Differences from the text below:**

- ED7 / AC-N7: the canvas focus target is the editor's `<main data-sa-canvas tabIndex={-1}>` region (with an inset focus ring in `base.css`), not the React Flow wrapper.
- ED6: Confirm dispatches only if the current selection still equals the IDs the dialog described; otherwise it closes without deleting.
- §2.3 copy: the ungroup and groups-only descriptions use plural forms for several groups ("The groups are removed. Their components stay on the canvas.").
- §2.6: lint also restricts `globalThis.Notification`.
- §1.8: the library empty-state icon row still uses its `--sa-type-*-ink` classes rather than `data-palette` (same colors, no visual change). The palette panel uses `data-palette="type-*"` as designed.
- §4 `services.*`: `EditorScreen` imports the pure helpers from `editor/actions.ts` directly; `services.ts` and the placeholders are unchanged.

**Original design-time deferrals:** O1–O5 kept their defaults (no field rename, no threshold or "don't ask again", and no Undo toast after Ungroup). O6 deferred toast enhancements at that time; roadmap v2 later shipped entry-bound/session-scoped Undo, action-toast timing and pause behavior. Toast stacking, Escape dismissal, a toast focus ring and announcement de-duplication remain outside that shipped contract. No new grayscale screenshot with colored fills was recorded; V2 §11 item 1 notes this, and type-cue parity is covered by tests instead.

---

## 0. Decisions at a glance

| # | Decision |
|---|---|
| D-C1 | A component has exactly **one effective palette entry**. It is either the user's selected color (`component.accent`) or the type default. That entry supplies **both** the node fill and the ink. The ink drives the stroke, the icon chip ring and glyph, the type label, the Memory rim, the External hatch and the Orchestrator band. |
| D-C2 | Type rules in CSS set **no color**. They keep only geometry (stroke width, shape, dash). A type color can therefore never override a selected color. |
| D-C3 | The type defaults are the six existing type pairs, expressed as palette entries (`type-agent` … `type-decision`). "Type default" is what a component shows when `accent` is absent. |
| D-C4 | Types stay distinguishable by silhouette, Orchestrator band, dash and hatch, icon, and type label, all of which are color-independent. Two components of different types with the same color must still be told apart in grayscale. |
| D-C5 | Every palette pair must pass the paired-contrast checks in §1.6. **Tomato fails one of them today** (ink on tint is 4.4985:1). Its tint changes from `#F9D9D3` to `#FADCD6`. The ID, name and hue family are unchanged. |
| D-C6 | Groups, edges, ports, selection, focus and app chrome stay neutral and never take a palette entry. The cobalt UI accent (`--sa-color-accent`) is unrelated to component color. |
| D-N1 | **Every editor delete asks first.** Every UI route that dispatches `deleteElements` (Delete and Backspace shortcuts, toolbar Delete, the component, relationship, group and multi-selection inspector Delete buttons, and Ungroup with groups selected) opens the app-styled `ConfirmDialog`. **Cancel changes nothing. Confirm performs exactly today's deletion**, followed by today's app-styled Undo toast and announcement. This **reverses** the earlier version of this report, which chose no confirmation for undoable editor deletions. |
| D-N2 | **Library deletions** keep their existing app-styled `ConfirmDialog` (not undoable). Editor and library share one `ConfirmDialog` contract: initial focus on Cancel, Escape cancels, a backdrop click does nothing, a busy state cannot be dismissed, errors appear inline, and focus is restored deterministically. |
| D-N3 | **No browser-native dialogs or notifications.** App interactions never use `window.alert`, `window.confirm`, `window.prompt` or the `Notification` API. All confirmations are `ConfirmDialog` (built on `Dialog`) and all notices are `Toast`. Lint enforces this rule. |
| D-N4 | **At the original delete-confirmation implementation only:** the existing Undo toast (copy, 5 s default duration, Undo action) and announcement stayed unchanged; no timing, stacking or history-binding changes were made in that stage. This decision was superseded by roadmap v2 (see header). |
| D-N5 | The `beforeunload` "Leave site?" prompt is **browser-owned**. It cannot be styled, re-worded or replaced, and the app does not try to. It is the only native prompt that remains, and it is not an app interaction. |
---

## 1. Component color: one effective palette source

### 1.1 Conflicts this resolves

| Current rule (where) | Problem | Replaced by |
|---|---|---|
| "The accent recolors **only** the silhouette stroke, the icon chip ring and glyph, the chip fill and the Memory lid rim … never the node fill" (UH §2.3, V2 §4.2) | The selected color does not drive the module background, so a "Teal" Tool still looks like a beige Tool with a teal outline. | D-C1: the selected entry drives fill **and** ink together (§1.4). |
| V2 §4.1 table: `--sa-node-fill` = "type fill (unchanged)", `--sa-node-label-ink` = "type ink (unchanged)" | Two color sources on one node (type fill and label, accent stroke and chip). | Fill and label come from the effective entry. |
| V2 §4.1 / `canvas.css` "Orchestrator band = orchestrator ink (unchanged)" | The band ignores the selected color. The stated reason ("white-on-pastel would fail") does not apply, because the band uses the **ink**, not the tint. | §1.5: the band uses the effective ink. White on every ink is ≥ 5.90:1. |
| `canvas.css` `.sa-node[data-type=…]` / `[data-subtype=…]` set `--sa-node-ink` and `--sa-node-fill`, and `[data-accent]` rules set only border and chip | Two competing rule sets. Type colors survive under an accent. | D-C2: one `[data-palette]` rule set (§1.3). Type rules are color-free. |
| External hatch is fixed `--sa-type-external-hatch` `#E4E0D7` | A fixed beige texture clashes with a colored fill. | The hatch is the effective ink at 16 % stroke opacity (§1.4). |
| Chip fill is white by default and the tint with an accent | Once the body becomes the tint, a tint chip would disappear into it. | The chip is always a white plate (`--sa-node-surface`) with an ink ring and glyph (§1.4). |
| Picker copy "Accent color" / "Accent: {name}" (V2 §6, TD 7.1) | "Accent" now means more than an accent, and it collides with the cobalt UI accent. | UI copy becomes "Color" / "Color: {name}" (§1.8). Persisted identifiers stay the same. |
| UH §1 "One accent, used for intent … Type inks never appear on buttons or chrome" | Still true for chrome. | Unchanged. Component palette entries appear only on component nodes, the picker swatches, the inspector header glyph and label, and the palette panel icons (§1.8). |

### 1.2 Data model (no schema change)

- The persisted field stays `component.accent?: AccentId` (V2 §5.1). Absent means type default, and `"default"` is never written. `ACCENT_IDS`, `E_INVALID_ACCENT`, `setComponentAccent`, duplicate copying, JSON round trip and Markdown omission are **unchanged**. No migration and no `SCHEMA_VERSION` bump are needed.
- Groups have no color field (V2 §4.3, unchanged).

### 1.3 The single resolver and the CSS contract

**TypeScript (new, pure): `src/domain/palette.ts`**

```ts
export const TYPE_PALETTE_IDS = [
  "type-agent", "type-orchestrator", "type-tool", "type-memory", "type-external", "type-decision",
] as const;
export type TypePaletteId = (typeof TYPE_PALETTE_IDS)[number];
export type PaletteId = AccentId | TypePaletteId;

/** The type default for a component (Orchestrator is keyed by subtype). */
export function typePaletteId(c: Pick<Component, "type" | "subtype">): TypePaletteId;

/** The one effective entry: a valid accent if set, else the type default. */
export function effectivePaletteId(c: Pick<Component, "type" | "subtype" | "accent">): PaletteId;

/** Hex values for tests and non-CSS consumers; mirrors tokens.css exactly. */
export const PALETTE: Record<PaletteId, { label: string; ink: string; fill: string }>;
```

`effectivePaletteId` returns the type default for an absent **or** invalid accent, which is the same guard `ComponentNode` applies today with `isAccentId`.

**CSS: one rule per entry, in `src/ui/tokens.css`**

```css
/* Component palette (UI_COLOR_CONFIRMATION_DESIGN §1.3): the only place a
   component color is chosen. Fill and ink always travel together. */
[data-palette="type-agent"] { --sa-palette-ink: var(--sa-type-agent-ink); --sa-palette-fill: var(--sa-type-agent-fill); }
/* … 5 more type entries … */
[data-palette="teal"] { --sa-palette-ink: var(--sa-accent-teal-ink); --sa-palette-fill: var(--sa-accent-teal-tint); }
/* … 15 more accent entries, in ACCENT_IDS order … */
```

- `ComponentNode` sets `data-palette={effectivePaletteId(component)}` on `.sa-node`. It keeps `data-accent` (the stored choice, which existing e2e tests use) but **no CSS rule reads `data-accent` any more**.
- `.sa-node` maps the entry once, and nothing else sets these variables:

```css
.sa-node {
  --sa-node-ink: var(--sa-palette-ink, var(--sa-type-external-ink));   /* neutral fallback */
  --sa-node-fill: var(--sa-palette-fill, var(--sa-type-external-fill));
  --sa-node-border: var(--sa-node-ink);
  --sa-node-chip-ink: var(--sa-node-ink);
  --sa-node-chip-fill: var(--sa-node-surface);
  --sa-node-label-ink: var(--sa-node-ink);
}
.sa-node[data-subtype="orchestrator"] { --sa-node-stroke-rest: 2px; }  /* geometry only */
/* .sa-node[data-type="tool" | "memory" | …]: no color declarations at all. */
```

- Delete the 16 `.sa-node[data-accent="…"]` rules and the color declarations in the 5 type/subtype rules in `canvas.css`.
- `data-palette` takes only values from `PaletteId`. It is never built from user text (TD 3.4).
- The fallback is the neutral External pair, so a missing attribute looks neutral rather than like an Agent.

### 1.4 Paired fill and ink: what each node part uses

| Node part | Value | Pair used for contrast |
|---|---|---|
| Silhouette body fill | `--sa-node-fill` (entry fill) | fill vs canvas: decorative; the ink stroke is the boundary |
| Silhouette stroke | `--sa-node-ink` | ink vs canvas ≥ 3:1 |
| Icon chip plate | `--sa-node-surface` `#FFFFFF`, always | — |
| Icon chip ring and glyph (the module "logo") | `--sa-node-ink` | ink vs white ≥ 4.5:1 |
| Type label text ("TOOL") | `--sa-node-ink` | ink vs fill ≥ 4.5:1 (11 px text) |
| Name | `--sa-color-text`, unchanged | text vs fill ≥ 4.5:1 |
| Description | `--sa-color-text-muted`, unchanged | muted vs fill ≥ 4.5:1 |
| Memory lid rim | `--sa-node-ink` | decorative detail |
| External hatch | `--sa-node-ink` at `stroke-opacity: 0.16` | decorative texture; the dashed stroke is the cue |
| Orchestrator band fill | `--sa-node-ink` | white vs ink ≥ 4.5:1 |
| Orchestrator band type row (glyph and label) | `--sa-color-on-accent` `#FFFFFF`, unchanged | white vs ink ≥ 4.5:1 |
| Selection outline and halo | `--sa-color-accent` and `-soft`, unchanged | selection vs fill ≥ 3:1 |
| Ports, edges, terminals, edge labels, groups | unchanged neutrals | — |

Text never takes the **fill**. The only text that takes the **ink** is the type label, which already used the type ink before this change.

### 1.5 Default-type behavior and Orchestrator treatment

- **Type default:** with no `accent`, `effectivePaletteId` returns the type entry and the node looks exactly like v2 does today. The only visible changes are the hatch (now a 16 % ink texture) and the chip plate (white, as it already is in the default style). Default nodes need no visual regression beyond the hatch.
- **Selected color:** with `accent: "teal"`, the fill becomes the teal tint and every ink part becomes the teal ink, on every type.
- **Orchestrator:** the type default is `type-orchestrator` (`#1D3557` / `#E6ECF4`). With a selected color, the **band takes the selected ink** and the body takes the selected fill. Orchestrator identity is carried by structure, not hue: the 24 px band, the 2 px stroke, the hub icon and the "ORCHESTRATOR" label (PC 6.2, V2 C5). A teal Orchestrator next to a teal Agent is told apart by the band.
- **Agent vs. Orchestrator default hues** stay in one family on purpose (UH §2.3). This is unchanged.

### 1.6 Contrast rules and the current values

Each `PaletteId` pair must satisfy all of the following (WCAG 2.x relative luminance, computed on the exact hex values, **not rounded**):

| Check | Minimum | Why |
|---|---|---|
| ink : fill | 4.5 | type label text on the body |
| ink : `#FFFFFF` | 4.5 | glyph on the chip plate; inspector header glyph and label |
| `#FFFFFF` : ink | 4.5 | Orchestrator band type row |
| `--sa-color-text` : fill | 4.5 | name |
| `--sa-color-text-muted` : fill | 4.5 | description |
| ink : canvas `#F7F6F3` | 3.0 | node boundary (1.4.11) |
| `--sa-color-accent` : fill | 3.0 | selection outline drawn over the body edge |

Computed values (min across the column in **bold**):

| Entry | ink:fill | text:fill | muted:fill | ink:white = white:ink | ink:canvas | select:fill |
|---|---|---|---|---|---|---|
| type-agent | 6.47 | 14.93 | 6.36 | 7.29 | 6.74 | 6.09 |
| type-orchestrator | 10.40 | 14.15 | 6.03 | 12.36 | 11.44 | 5.77 |
| type-tool | 5.65 | 15.24 | 6.49 | 6.23 | 5.77 | 6.21 |
| type-memory | 5.70 | 14.98 | 6.38 | 6.40 | 5.92 | 6.11 |
| type-external | 6.65 | 14.63 | 6.23 | 7.64 | 7.07 | 5.96 |
| type-decision | 7.21 | 14.77 | 6.29 | 8.21 | 7.60 | 6.02 |
| tomato (current tint `#F9D9D3`) | **4.4985 ✗** | 12.73 | 5.42 | 5.94 | 5.50 | 5.19 |
| tomato (new tint `#FADCD6`) | 4.61 | ≥ 12.8 | ≥ 5.4 | 5.94 | 5.50 | ≥ 5.2 |
| coral | 4.65 | 13.25 | 5.65 | 5.90 | 5.46 | 5.40 |
| tangerine | 4.88 | 13.46 | 5.74 | 6.10 | 5.64 | 5.49 |
| mustard | 4.84 | 13.59 | 5.79 | 5.98 | 5.54 | 5.54 |
| olive | 5.10 | 13.71 | 5.84 | 6.26 | 5.79 | 5.59 |
| fern | 5.00 | 13.40 | 5.71 | 6.27 | 5.80 | 5.46 |
| mint | 4.91 | 13.44 | 5.73 | 6.14 | 5.68 | 5.48 |
| teal | 4.97 | 13.16 | 5.61 | 6.35 | 5.87 | 5.37 |
| lagoon | 5.02 | 12.92 | 5.51 | 6.53 | 6.04 | 5.27 |
| sky | 4.97 | 12.88 | 5.49 | 6.49 | 6.00 | 5.25 |
| denim | 5.81 | 12.56 | **5.35** | 7.77 | 7.19 | **5.12** |
| indigo | 5.70 | 12.57 | **5.35** | 7.63 | 7.06 | **5.12** |
| lavender | 5.13 | 12.74 | 5.43 | 6.77 | 6.27 | 5.19 |
| plum | 5.44 | 12.63 | 5.38 | 7.24 | 6.70 | 5.15 |
| rose | 4.88 | **12.57** | 5.36 | 6.53 | 6.05 | **5.12** |
| cocoa | 5.81 | 12.65 | 5.39 | 7.72 | 7.14 | 5.16 |

- **Tomato fix (D-C5):** V2 §2.3 lists Tomato ink-on-tint as "4.50", but the unrounded value is 4.4985. That was acceptable for a glyph (3:1), but it fails 4.5:1 once the type label sits on the tint. The new tint `#FADCD6` gives 4.61:1. V2 §5.4 allows small hex contrast fixes that keep the hue family. Update `ACCENTS.tomato.tint`, `--sa-accent-tomato-tint`, and the V2 §2.3 row.
- Fills are decorative against the canvas (1.02–1.24:1). They never carry the node boundary; the ink stroke does.
- Under `forced-colors: active`, fills and inks may disappear. Silhouettes, dashes and the band outline remain (UH §9.3 #7, unchanged).

### 1.7 How types stay distinguishable without type colors

Color never identifies a type (UH §1 "Shape before color", TD 12). The palette changes only `--sa-palette-*`. It must never change any of these per-type cues:

| Cue | Agent | Orchestrator | Tool | Memory | External | Decision |
|---|---|---|---|---|---|---|
| `data-shape` / silhouette | rounded | rounded | octagon | cylinder | parallelogram | hexagon |
| Structural detail | — | 24 px band, 2 px stroke | — | lid rim | dashed stroke 6 4 + hatch | pointed sides |
| Icon | person | hub | wrench | disks | box-arrow | fork |
| Type label | AGENT | ORCHESTRATOR | TOOL | DATA STORE | EXTERNAL | DECISION |

**Rule:** for any component, the rendered `data-shape`, the set of `[data-detail]` elements, the stroke dash, the icon and the label text are identical whether `accent` is absent or set to any of the 16 IDs.

### 1.8 Where the palette appears outside the node

| Surface | Rule |
|---|---|
| Color picker (Appearance section) | Every swatch sets `data-palette` (`type-*` for "Type default", the accent ID otherwise), so swatch and node use the same CSS source. A swatch is the entry fill plus a 2 px ink ring (V2 §6, otherwise unchanged). Legend "Color", caption "Color: {name}" / "Color: Type default", undo label "Change color". The radios, order, keyboard behavior and one-entry-per-change rule are unchanged. |
| Inspector header (component) | The kind glyph and type label use the **effective** ink via `data-palette` (replacing `data-ink` in `inspector.css` lines 41–46). The header and the node therefore match. |
| Palette panel (types to add) and library empty-state icon row | These represent **types**, not components. They use `data-palette="type-*"` and keep their type colors. |
| Groups (`GroupNode`, group inspector) | No `data-palette`, no Color section, neutral tokens only (V2 §4.3, unchanged). |
| Edges, ports, minimap, chrome, buttons | Never use a palette entry. |
| PNG export | Inherits the computed styles. No special case beyond the existing rest-stroke rule. |
| Architecture export and node labels | Color is omitted from Markdown export and component aria-labels. Single-component picker changes are not separately announced; roadmap v2 multi-selection color changes announce the selected component count and chosen color. |

---

## 2. Destructive delete: confirmation and notification

### 2.0 Correction to the earlier version of this report

The earlier report decided that **undoable editor deletions would not show a confirmation** and relied on the Undo toast alone. That decision is **withdrawn**. The user explicitly asked for the browser-style "are you sure?" delete popup to be recreated in the app's own visual style, at every delete entry point. This report now specifies that behavior (D-N1). Undo stays as a second safety net after a confirmed delete. The PC 8.3 and M2 rationale ("the user sees it happen", "canvas edits can be undone") still describes Undo correctly. It no longer justifies skipping the confirmation, and the fold-in (§4) updates that wording.

### 2.1 Inventory: today and after this change

| Path | Code | Undoable | Today | After |
|---|---|---|---|---|
| Delete / Backspace on canvas selection | `app/shortcuts.ts:106` → `context.deleteSelection` → `EditorScreen.tsx:279` | yes | immediate; toast "Deleted …" + Undo; `announce` | **ConfirmDialog**, then the same deletion, toast and announcement |
| Toolbar Delete | `toolbar/Toolbar.tsx:297` `onDelete` → `EditorScreen.tsx:363` | yes | same as above | **ConfirmDialog**, then the same |
| Inspector Delete: component, relationship, multi-selection, and "Delete group (keeps members)" | `inspector/{Component,Relationship,MultiSelection,Group}Inspector.tsx` → `commands.run("deleteSelection")` → `inspectorActions.deleteSelection` (`EditorScreen.tsx:249`) | yes | same as above | **ConfirmDialog**, then the same |
| Ungroup with groups selected (toolbar Ungroup, `Mod+Shift+G`) | `actions.ungroupSelection` → `deleteElements` with `groupIds` (`EditorScreen.tsx:282, 361`) | yes | immediate; no toast | **ConfirmDialog**, then the same dispatch (no new toast, see O5) |
| Ungroup with only components selected | `ungroupSelection` → `assignToGroup` | yes | immediate | unchanged. This is not a deletion, so there is no dialog. |
| React Flow's built-in delete key | `canvas/CanvasView.tsx:467` `deleteKeyCode={null}` | — | disabled | stays disabled. All deletes go through the routes above. |
| Library row Delete (ok and damaged rows) | `library/LibraryScreen.tsx:333` `ConfirmDialog` | no | app-styled modal; success only announced; failure toast appears behind the modal | **kept**; contract hardened (§2.4) |
| Tab close or reload with unsaved changes | `persistence/unloadGuard.ts` | — | browser `beforeunload` prompt | unchanged (§2.7) |

Verified: no code in `src` calls `window.confirm`, `alert`, `prompt` or the `Notification` API. (`persistence/tabSync.ts` only uses "Notification" inside its own `BroadcastChannel` identifiers.)

### 2.2 Policy

| Delete kind | Interaction | Feedback after Confirm |
|---|---|---|
| Editor deletion (any UI action that dispatches `deleteElements`) | **App-styled `ConfirmDialog`, always**, before anything is dispatched (§2.3). There is no size threshold and no "don't ask again" option (O2). | Existing Undo toast "Deleted …" + Undo, and the existing announcement (§2.5). |
| Ungroup of selected groups | Same dialog, with ungroup copy and the confirm label "Ungroup". | Existing behavior (no toast). The canvas change is visible and `Mod+Z` undoes it. |
| Library delete (not undoable) | Existing app-styled `ConfirmDialog`, hardened (§2.4). | Existing announcement (unchanged). |
| Any future destructive action | Must use `ConfirmDialog`. | Toast with Undo if undoable, otherwise none. |
| `window.alert` / `confirm` / `prompt`, `Notification` | **Forbidden** in application code (D-N3). Enforced with ESLint core rules (§2.6), with no new dependency. | — |

### 2.3 Editor delete confirmation flow (`src/app/EditorScreen.tsx`)

**One entry point.** `EditorScreen` owns a single `requestDelete(target: EditorStore, intent: "delete" | "ungroup")` and one `pendingDelete` state. Every route calls it instead of calling `services.actions.deleteSelection` / `ungroupSelection` directly:

- the shortcut context's `deleteSelection` (Delete, Backspace) and `ungroupSelection` (`Mod+Shift+G`, only when `selection.groupIds.length > 0`; otherwise it keeps calling `ungroupSelection` directly);
- the Toolbar `onDelete`, and `onUngroup` under the same group rule;
- `inspectorActions.deleteSelection(target)`, which covers all four inspector Delete buttons.

`shortcuts.ts`, `Toolbar.tsx` and the inspector components therefore stay unchanged: they already call these callbacks.

**Request.**

| # | Rule |
|---|---|
| ED1 | If the selection is empty, or the preview deletes nothing, no dialog opens and nothing happens (the same as today's empty-message early return). |
| ED2 | The request snapshots the selection IDs and computes a **preview** with the pure `previewDeletion(architecture, ids)` (new, in `editor/actions.ts`). The preview runs `applyCommand` with the same `deleteElements` command **without dispatching it**, so its counts always equal the real `summary` (cascaded relationships included). |
| ED3 | The request remembers the opener: `document.activeElement` at request time (the toolbar button, the inspector button, or the focused canvas node or wrapper for shortcuts). |
| ED4 | While a dialog is open, no second request opens a second dialog. The shortcut handler already ignores keys while `dialog[open]` exists (`shortcuts.ts:41,54`), and the background is inert, so toolbar and inspector clicks are blocked. |

**Dialog content** (built by the pure `deletionConfirmCopy(preview, intent)`, which reuses `deletionMessage`'s pluralization):

| Case | Title (`aria-labelledby`) | Description (`aria-describedby`) | Confirm label |
|---|---|---|---|
| Delete | "Delete {list}?", for example "Delete 1 component and 3 relationships?" | "You can undo this with Undo or ⌘Z / Ctrl+Z." When relationships are removed only because their components are, the description starts with "Connected relationships are deleted with their components." | "Delete" |
| Delete of groups only | "Delete 1 group?" | "Its components stay on the canvas. You can undo this with Undo or ⌘Z / Ctrl+Z." | "Delete" |
| Ungroup | "Ungroup 1 group?" / "Ungroup 2 groups?" | "The group is removed. Its components stay on the canvas. You can undo this with ⌘Z / Ctrl+Z." | "Ungroup" |

The copy never includes user-entered names inside markup (React text only, TD 3.4), and it never mentions colors.

**Outcomes.**

| # | Rule |
|---|---|
| ED5 | **Cancel** (the Cancel button, Enter or Space on the focused Cancel, or Escape): the dialog closes, **nothing is dispatched**, the architecture, undo history, selection and save status are unchanged, no toast appears and nothing is announced. Focus returns to the opener (ED3) if it is still connected and enabled, otherwise to the canvas focus target. |
| ED6 | **Confirm** (Delete or Ungroup, by click, Enter or Space): the dialog closes **first**, then `EditorScreen` calls the existing `services.actions.deleteSelection(target, feedback)` (or `ungroupSelection`). The dispatch, the single history entry, the toast copy and the announcement are therefore identical to today. The toast is not rendered behind the modal backdrop. |
| ED7 | After Confirm, focus moves to the canvas focus target (the React Flow wrapper, `[data-sa-canvas]`), never `<body>`. The opener may be gone (the inspector unmounts) or disabled (toolbar Delete with an empty selection). |
| ED8 | One Undo (toast or `Mod+Z`) restores everything a confirmed delete removed, in one step (unchanged single history entry). |
| ED9 | The editor deletion is synchronous, so the dialog never shows a busy state. `ConfirmDialog`'s busy and error states (CD6, CD7) are used only by the library. If the dispatch returns `ok: false`, the existing behavior applies (no toast). |

### 2.4 `ConfirmDialog` contract (`src/ui/ConfirmDialog.tsx`, `src/ui/Dialog.tsx`), shared by editor and library

| # | Rule |
|---|---|
| CD1 | Native `<dialog>` opened with `showModal()`: top layer, background inert, Tab and Shift+Tab stay inside (unchanged). |
| CD2 | `aria-labelledby` = title. The consequence text is passed as the new `description` prop, so it becomes `aria-describedby` (today the library passes it as `children`, which is not described). Library copy: title "Delete '{name}'?", description "This cannot be undone. Export it to JSON first if you want a backup." (unchanged text). `children` becomes optional. |
| CD3 | Buttons are right-aligned: **Cancel** (secondary) then the confirm button (destructive fill), in this DOM order. The confirm label is a specific verb ("Delete", "Ungroup"), never "OK" or "Yes". |
| CD4 | **Initial focus on Cancel**, set explicitly after `showModal()`. Today it works only because Cancel is the first focusable element; React `autoFocus` does not fire when an always-mounted dialog opens later. Nothing confirms by default. |
| CD5 | **Escape = Cancel.** **Backdrop click does nothing** (no light dismiss), so a stray click cannot cancel or confirm. |
| CD6 | **Busy** (async callers only, i.e. the library): both buttons are disabled, the confirm label reads "Deleting…", the dialog has `aria-busy="true"`, and the `cancel` event is `preventDefault()`ed so Escape cannot close it mid-operation (today `onClose` → `onCancel` also runs while busy). Repeated confirm clicks are ignored. |
| CD7 | **Failure** (library): the dialog stays open, busy clears, and an inline error (new `error` prop; `role="alert"`, danger icon + text, `--sa-color-danger` on `--sa-color-danger-soft`) appears above the buttons. No toast is shown while the modal is open, because it would render behind the backdrop. |
| CD8 | **Focus on close** is the caller's job, and it is deterministic. Editor: ED5 and ED7. Library: on Cancel, focus goes back to the row's "Delete {name}" button. On success, focus goes to the next row's name link, else the previous row's, else the "New architecture" button. Focus never falls to `<body>`. |
| CD9 | Visuals: UH §8.4 unchanged (440 px, 24 px padding, `--sa-shadow-dialog`, `--sa-color-backdrop`, destructive button tokens). Focus ring per UH §9.1. This **is** the app-styled recreation of the browser confirm: the same question-and-two-buttons structure, in the app's typography, color and focus treatment. |

### 2.5 Historical toast and announcement contract at the time (superseded for timing and binding)

- At the initial color/delete-confirmation implementation, after Confirm `deleteSelection` used `feedback.showToast(message, { action: { label: "Undo", onClick: () => store.undo() } })` and `feedback.announce(message)`. This describes that implementation stage only; current delete Undo is entry-bound, as noted in the header.
- **Original implementation-time deferrals:** single-toast stacking, Escape dismissal, a toast focus ring and announcement de-duplication remain unimplemented. Entry binding, editor-session dismissal, 10 s action-toast duration and hover/focus pause were later shipped in roadmap v2. The old UT3–UT7/§2.5 proposal was not the implementation contract.
- Cancel produces no toast and no announcement (ED5).

### 2.6 No browser-native dialogs or notifications (enforcement)

- Application code must not call `window.alert`, `window.confirm`, `window.prompt`, `new Notification(…)` or `Notification.requestPermission()`. Confirmations use `ConfirmDialog`/`Dialog`, and notices use `Toast` (plus `LiveRegion` for announcements).
- `eslint.config.js` (core rules only): `"no-alert": "error"`; `"no-restricted-globals": ["error", { name: "Notification", message: "Use Toast (UI_COLOR_CONFIRMATION_DESIGN D-N3)." }]`; `"no-restricted-properties": ["error", { object: "window", property: "Notification" }]`.

### 2.7 `beforeunload` is browser-owned

- The leave-page prompt (`unloadGuard.ts`, active while the save status is `pending`, `saving` or `error`; TD 8.5) is drawn by the browser. **It cannot be styled, its text cannot be changed** (`returnValue` strings are ignored by current Chromium, Firefox and Safari), its buttons cannot be relabelled, and an app dialog cannot replace it, because the handler must decide synchronously. Browsers may also suppress it without prior user interaction.
- The app keeps the guard as is (`preventDefault()` + `returnValue = ""`) and **does not** add custom copy or an app modal on unload. It is a browser-level guard on leaving the page, not an application interaction, so D-N3 does not cover it.
- In-app navigation (Back to library, opening another architecture) never relies on `beforeunload`. It uses `controller.flush()` and the existing app toast (`LEAVE_SAVE_FAILED_MESSAGE`) when the save fails. This is unchanged.
- The UH, TD and PC copy must not describe the leave prompt as app-styled.

---

## 3. Acceptance criteria (testable)

**Color**

| ID | Criterion | Test |
|---|---|---|
| AC-C1 | `effectivePaletteId` returns the accent for a valid `accent`, and `type-{type}` (`type-orchestrator` for the subtype) for an absent or invalid one. | unit `src/domain/palette.test.ts` |
| AC-C2 | `PALETTE` hex values equal `tokens.css` `--sa-type-*` / `--sa-accent-*` values, and there is exactly one `[data-palette="…"]` rule per `PaletteId` (22). | unit, `palette.test.ts` + `ComponentNode.test.tsx` token parser |
| AC-C3 | Every `PaletteId` passes all seven §1.6 checks with unrounded values (this fails today for Tomato and passes after the tint fix). | unit `palette.test.ts` (WCAG helper in the test) |
| AC-C4 | No `canvas.css` rule other than `.sa-node` declares `--sa-node-ink`, `--sa-node-fill`, `--sa-node-border`, `--sa-node-chip-*` or `--sa-node-label-ink`, and no rule selects on `[data-accent`. | `ComponentNode.test.tsx` (replaces the "Accent rules touch only border and chip" test) |
| AC-C5 | With `accent: "teal"` on Agent, Tool, Memory, External, Decision and Orchestrator nodes: fill resolves to `#C9EAEA`, and border, chip ink, label ink and rim resolve to `#106A6E`. The Orchestrator band fill resolves to `#106A6E`. The chip fill resolves to `#FFFFFF`. | `ComponentNode.test.tsx` (replaces "orchestrator band stays the orchestrator ink") |
| AC-C6 | Without an accent, each type resolves to its existing type ink and fill (default regression). | `ComponentNode.test.tsx` |
| AC-C7 | For every type, `data-shape`, the `[data-detail]` set, the dash pattern, the icon and the type label are identical with no accent and with each of the 16 accents. | `ComponentNode.test.tsx` |
| AC-C8 | Group nodes and the group inspector never contain `[data-palette]` or `[data-accent]`; edges and ports use no `--sa-palette-*`. | `ComponentNode.test.tsx`, `Inspector.test.tsx` |
| AC-C9 | The picker legend is "Color", the caption is "Color: Teal", the undo label is "Change color", each swatch's `data-palette` equals its value, and the "Type default" swatch is `type-{type}`. | `AccentPicker.test.tsx` |
| AC-C10 | The inspector header glyph and label color equals the node's ink for an accented component. | `ComponentInspector.test.tsx` |
| AC-C11 | e2e: setting Teal on a Tool changes the computed body `fill` and the chip glyph `color`. Undo restores both. Reload and duplicate keep both. PNG export succeeds. | `e2e/ui-v2.spec.ts` (extend the "accent" test) |

**Confirmation and notification**

| ID | Criterion | Test |
|---|---|---|
| AC-N1 | **Every route opens the dialog and dispatches nothing yet.** For each route: Delete key, Backspace key, toolbar Delete, component inspector Delete, relationship inspector Delete, multi-selection inspector Delete, "Delete group (keeps members)", and toolbar Ungroup and `Mod+Shift+G` with a group selected. After the trigger, a `role="dialog"` is open and the architecture and `canUndo` are unchanged. | `App.integration.test.tsx` (table-driven over the routes) |
| AC-N2 | **Content and initial focus.** The dialog's accessible name is the title from §2.3 (for example "Delete 1 component and 3 relationships?" for a component with 3 relationships). Its description is exposed via `aria-describedby`. The buttons are Cancel then Delete (or Ungroup), in that order. Cancel has focus when the dialog opens. | `ConfirmDialog.test.tsx` (new), `App.integration.test.tsx`; copy in `actions.test.ts` (`deletionConfirmCopy`) |
| AC-N3 | **Cancel makes no change**, by the Cancel button, by Enter on the focused Cancel, and by Escape: the architecture deep-equals the state before, the history length and `canUndo` are unchanged, the selection is unchanged, no toast or announcement appears, and focus returns to the opener (the toolbar Delete button, the inspector Delete button, or the focused canvas node for the shortcut route). | `App.integration.test.tsx`, `ConfirmDialog.test.tsx` |
| AC-N4 | A backdrop click leaves the dialog open and dispatches nothing. | `ConfirmDialog.test.tsx` |
| AC-N5 | **Confirm performs the same deletion**, by click and by keyboard (Tab to Delete, then Enter; and Space): exactly one `deleteElements` dispatch with the snapshotted IDs. The resulting architecture equals the one today's direct `deleteSelection` produces. The dialog is closed before the toast renders. | `App.integration.test.tsx`; `actions.test.ts` (`previewDeletion` counts equal `result.summary`, including cascaded relationships) |
| AC-N6 | **Toast and Undo after Confirm.** The existing toast "Deleted 1 component and 3 relationships." with an Undo button is shown, and the deletion text is announced as today. Toast Undo and `Mod+Z` each restore the full pre-delete architecture in one step. | `App.integration.test.tsx` |
| AC-N7 | After Confirm, focus is on the canvas focus target (`[data-sa-canvas]` wrapper), not `<body>`, including when the inspector that opened the dialog unmounts. | `App.integration.test.tsx` |
| AC-N8 | While the dialog is open, a second Delete key, `Mod+Z`, arrow keys and toolbar clicks neither open a second dialog nor change the architecture. | `App.integration.test.tsx` |
| AC-N9 | An empty selection opens no dialog (shortcut no-op; toolbar Delete stays disabled). Ungroup with only components selected opens no dialog and behaves as today. | `App.integration.test.tsx`; `Toolbar.test.tsx` (unchanged) |
| AC-N10 | Ungroup confirmation uses the title "Ungroup 1 group?" and the confirm label "Ungroup". After Confirm the group is gone, its members remain, and `Mod+Z` restores it. | `App.integration.test.tsx`, `actions.test.ts` |
| AC-N11 | **Library (kept and hardened):** the dialog opens with Cancel focused. Escape closes it with nothing deleted. A backdrop click leaves it open. The description is exposed via `aria-describedby`. While `remove` is pending, both buttons are disabled, Escape does not close it, and a second confirm does not call `repository.remove` twice. When `remove` rejects, the dialog stays open with a `role="alert"` message and no toast. Cancel returns focus to "Delete Old". On success, focus is on the next row's name link (or "New architecture" when the list becomes empty). | `LibraryScreen.test.tsx` (extend "requires confirmation") |
| AC-N12 | Lint fails on `window.confirm`/`alert`/`prompt` (`no-alert`) and on `Notification` use (`no-restricted-globals`/`no-restricted-properties`). `npm run lint` passes on the current tree. | `npm run lint` |
| AC-N13 | `unloadGuard` behavior is unchanged: it calls `preventDefault` only for `pending`, `saving` and `error`, and sets no custom message. | `unloadGuard.test.ts` (unchanged; it already covers this) |
| AC-N14 | **e2e keyboard and pointer.** (a) Select a component, press Delete: the dialog is visible with Cancel focused. Escape: the component is still there and focus is back on the canvas node. (b) Press Backspace, Tab to Delete, press Enter: the component is gone, the toast is visible, focus is in the canvas. Tab reaches the toast's Undo, and Enter restores the component. (c) Toolbar Delete → click Cancel: no change. Toolbar Delete → click Delete: deleted. | `e2e/a11y-keyboard.spec.ts` (extend at line 77), `e2e/scenario-i.spec.ts:29` and `e2e/scenario-e.spec.ts:77` (add the confirm step to the existing toolbar deletes) |

---

## 4. File and test touchpoints

| File | Change |
|---|---|
| `src/domain/palette.ts` (new), `src/domain/palette.test.ts` (new) | Resolver, `PALETTE`, contrast tests (AC-C1–C3) |
| `src/domain/constants.ts` | `ACCENTS.tomato.tint` → `#FADCD6` |
| `src/ui/tokens.css` | `--sa-accent-tomato-tint`; 22 `[data-palette]` rules; remove `--sa-type-external-hatch` once unused |
| `src/canvas/canvas.css` | Color-free type rules; delete 16 `[data-accent]` rules; band, hatch and chip per §1.4; update the header comment at lines 92–96 |
| `src/canvas/nodes/ComponentNode.tsx` | Add `data-palette`; keep `data-accent`; update the comment at lines 47–49 |
| `src/canvas/nodes/ComponentNode.test.tsx` | Replace the "touch only border and chip" and "band stays orchestrator ink" tests; add AC-C4–C8 |
| `src/inspector/AccentPicker.tsx`, `AccentPicker.test.tsx`, `inspector.css` | Copy "Color"; swatch `data-palette`; header `data-palette` replaces `data-ink` |
| `src/inspector/InspectorHeader.tsx`, `ComponentInspector.test.tsx` | Effective ink in the header (AC-C10) |
| `src/editor/commandLabels.ts` | "Change accent color" → "Change color" |
| `src/palette/palette.css`, `src/library/library.css` | Use `data-palette="type-*"` (no visual change) |
| `src/ui/Dialog.tsx`, `src/ui/ConfirmDialog.tsx`, `src/ui/ConfirmDialog.test.tsx` (new), `src/ui/base.css` | CD2–CD7: `description` and `error` props, optional `children`, explicit Cancel focus, `cancel` guard while busy, no backdrop dismiss, busy label, inline error styles (AC-N2–N4) |
| `src/editor/actions.ts`, `actions.test.ts` | New pure `previewDeletion` (via `applyCommand`) and `deletionConfirmCopy`. `deleteSelection` and `ungroupSelection` behavior is **unchanged** (AC-N2, AC-N5, AC-N10). |
| `src/app/services.ts`, `src/app/defaultServices.ts`, `src/app/placeholders/actions.ts` | Expose the two helpers on `services.actions` if `EditorScreen` reaches actions through services (keep the placeholders in sync) |
| `src/app/EditorScreen.tsx` | `pendingDelete` state, `requestDelete`, one `<ConfirmDialog>`; route shortcut `deleteSelection`/`ungroupSelection`, Toolbar `onDelete`/`onUngroup` and `inspectorActions.deleteSelection` through it; focus per ED5 and ED7 |
| `src/app/App.integration.test.tsx` | AC-N1–N3, AC-N5–N10 |
| `src/library/LibraryScreen.tsx`, `LibraryScreen.test.tsx` | Pass `description`; inline error instead of a toast behind the modal; focus restore (AC-N11) |
| `eslint.config.js` | `no-alert`, `no-restricted-globals` (`Notification`), `no-restricted-properties` (`window.Notification`) (AC-N12) |
| `e2e/a11y-keyboard.spec.ts`, `e2e/scenario-e.spec.ts`, `e2e/scenario-i.spec.ts` | AC-N14; the existing toolbar and keyboard deletes gain the confirm step |
| `e2e/ui-v2.spec.ts` | AC-C11 |
| `UI_DESIGN_HANDOFF.md` §2.3, §8.1, §8.4; `UI_V2_DESIGN.md` §2.3, §4.1–4.2, §6; `TECHNICAL_DESIGN.md` 5.3, 7.1, 11.2, 12; `PRODUCT_CONCEPT_V1.1.md` 8.3 and M2 wording | Fold in this report (canonical update): editor deletes confirm, then offer Undo; no native dialogs |

**Not touched:** `src/ui/Toast.tsx` and its tests (§2.5), `src/app/shortcuts.ts`, `src/toolbar/Toolbar.tsx`, the inspector components (they already call the rerouted callbacks), `src/persistence/unloadGuard.ts` (§2.7), the schema, validation, serialization and Markdown export. No new dependencies.

---

## 5. Implementation stages (for the Build coordinator)

| Stage | Outcome | Depends on | Difficulty | Validation |
|---|---|---|---|---|
| S1 Palette source | §1.2–1.7: resolver, tokens, `canvas.css`, `ComponentNode`, Tomato fix | — | 3 (CSS cascade restructure plus PNG fidelity) | unit AC-C1–C8; `npm run test`; e2e `ui-v2` PNG |
| S2 Palette surfaces | §1.8: picker copy and swatches, inspector header, palette panel, undo label | S1 | 2 | AC-C9, AC-C10, AC-C11 |
| S3 ConfirmDialog contract + library + lint | §2.4, §2.6: `Dialog`/`ConfirmDialog` props and behavior, `base.css` error styles, library wiring, ESLint rules | — (parallel to S1 and S2; S3 owns `base.css`) | 2 | AC-N2–N4 (component level), AC-N11, AC-N12 |
| S4 Editor delete confirmation | §2.3, §2.5: `previewDeletion`/`deletionConfirmCopy`, `EditorScreen` routing and focus, integration and e2e updates | S3 (uses the hardened `ConfirmDialog`) | 3 (four entry routes into one flow, focus across unmounting inspectors, e2e updates) | AC-N1–N10, AC-N14; `npm run test`; e2e `a11y-keyboard`, `scenario-e`, `scenario-i` |
| S5 Spec fold-in | §4 doc rows | S1–S4 | 1 | review |

All UI stages route to `stage-ui`. Reservations: S3 writes `src/ui/{Dialog,ConfirmDialog}.tsx`, `base.css`, `LibraryScreen.*`, `eslint.config.js`. S4 writes `editor/actions.*`, `app/{EditorScreen,services,defaultServices}.tsx/ts`, `app/placeholders/actions.ts`, `App.integration.test.tsx` and the three e2e specs. S1 and S2 touch none of these.

**Commits:** `feat(canvas): drive node fill and ink from one effective palette entry` (S1), `feat(inspector): rename accent to color and match header ink` (S2), `fix(ui): harden confirm dialog focus, busy and error states and forbid native dialogs` (S3), `feat(editor): confirm every delete in an app-styled dialog before undoable deletion` (S4), `docs: fold color and confirmation design into handoffs` (S5). Each commit passes `npm run lint`, `npm run test` and the affected e2e specs. S4's commit must include the e2e updates, because the toolbar and keyboard deletes in `scenario-e`, `scenario-i` and `a11y-keyboard` fail without the confirm step.

## 6. Open decisions (defaults chosen; none block implementation)

| # | Question | Default |
|---|---|---|
| O1 | Rename the persisted `accent` field to `color`? | **No.** That would need a schema bump for no user benefit. Only UI copy changes. |
| O2 | Skip the editor confirmation for small deletions, or offer "Don't ask again"? | **No.** The user asked for a confirmation at every delete entry point, and a threshold or opt-out makes the behavior unpredictable. Revisit only on explicit user request. |
| O3 | Chip plate white vs. ink-filled with a white glyph? | **White plate.** It reads as a logo on every fill, and it keeps the inverted treatment unique to the Orchestrator band. |
| O4 | Hatch opacity 0.16? | 0.16. Adjust within 0.12–0.20 after a visual check. It is decorative. |
| O5 | Add an Undo toast after a confirmed Ungroup (there is none today)? | **No** in this change (D-N4: reuse the existing feedback as-is). The canvas change is visible and `Mod+Z` undoes it. |
| O6 | Toast enhancements from the earlier report (single toast, history binding, pause, 8 s, Escape, focus ring, announcement de-duplication)? | **Deferred.** They were not requested and are out of scope here (§2.5). |
