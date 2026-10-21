# Swarm Architecturer — Component Color and Delete Confirmation Design

**Status:** Design report only. This change adds no application code, tests, dependencies or edits to other specs.
**Authority:** `PRODUCT_CONCEPT_V1.1.md` (PC) and `TECHNICAL_DESIGN.md` (TD) remain authoritative for product meaning. This report **replaces** these visual rules: the accent rule in `UI_DESIGN_HANDOFF.md` (UH) §2.3, and `UI_V2_DESIGN.md` (V2) §2.3 (contrast columns), §4.1, §4.2 and §6 (swatch and caption copy). It also tightens UH §7.4 (toast), UH §8.4 (dialogs) and TD 5.3, 8.5, 11.2 and 12 for delete feedback. The implementation worker updates those sections in the same change set that implements them. Anything not mentioned here keeps its current behavior.
**Inputs inspected:** PC 6.2, 8.3, 9 (M2); TD 5.1–5.3, 6.7, 7.1, 8.5, 11.2, 12, 13; UH §1, §2, §5, §7.4, §8, §9; V2 §0, §2.3, §3, §4, §5, §6; `src/ui/{tokens.css,base.css,Dialog.tsx,ConfirmDialog.tsx,Toast.tsx}`, `src/canvas/{canvas.css,nodes/ComponentNode.tsx}`, `src/inspector/{AccentPicker.tsx,inspector.css}`, `src/palette/palette.css`, `src/editor/actions.ts`, `src/app/{EditorScreen.tsx,shortcuts.ts}`, `src/library/LibraryScreen.tsx`, `src/persistence/unloadGuard.ts`, and the tests that cover them.

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
| D-N1 | **Editor deletions** (undoable) do not show a blocking dialog. They delete immediately and show an app-styled **Undo toast**. **Library deletions** (not undoable) always use the app-styled `ConfirmDialog`. No path uses `window.confirm`, `alert` or `prompt`. |
| D-N2 | `ConfirmDialog` gets an explicit contract: initial focus on Cancel, Escape cancels, backdrop click does nothing, the busy state cannot be dismissed, errors appear inline, and focus is restored deterministically. |
| D-N3 | The Undo toast may only undo the deletion it reports. It is dismissed on the next history change. It pauses while hovered or focused, and it is announced exactly once. |
| D-N4 | The `beforeunload` "Leave site?" prompt is **browser-owned**. It cannot be styled, re-worded or replaced, and the app does not try to. |

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
| Markdown export, aria-labels, announcements | Never mention colors (unchanged). |

---

## 2. Destructive delete: confirmation and notification

### 2.1 Current inventory (as inspected)

| Path | Code | Undoable | Today |
|---|---|---|---|
| Delete / Backspace on canvas selection | `app/shortcuts.ts:106` → `actions.deleteSelection` | yes | immediate; toast "Deleted …" + Undo; plus `announce` |
| Toolbar Delete | `toolbar/Toolbar.tsx:297` | yes | same |
| Inspector Delete (component, relationship, multi) and "Delete group (keeps members)" | `inspector/*Inspector.tsx` | yes | same |
| Ungroup (`Mod+Shift+G`) with groups selected | `editor/actions.ts` `ungroupSelection` → `deleteElements` | yes | **no feedback at all** |
| Library row Delete (ok and damaged rows) | `library/LibraryScreen.tsx:333` `ConfirmDialog` | no | app-styled modal; success only announced; failure toast appears behind the modal |
| Tab close or reload with unsaved changes | `persistence/unloadGuard.ts` | — | browser `beforeunload` prompt |

No code path uses `window.confirm`, `alert` or `prompt`. Every prompt the user sees during a delete is already app-styled; the only native one is the leave-page prompt (§2.6).

### 2.2 Policy

| Delete kind | Interaction | Feedback |
|---|---|---|
| Undoable editor deletion (anything that dispatches `deleteElements`) | **No confirmation.** Deletes immediately (PC 8.3: "the user sees it happen"; M2: canvas edits can be undone). A modal on every Delete key would break keyboard flow. | Undo toast (§2.4), announced once (§2.5). |
| Ungroup of selected groups | Same as above. | Toast "Ungrouped {n} group(s). Members kept." + Undo. |
| Library delete (not undoable) | **App-styled `ConfirmDialog`** (§2.3), always (PC 8.3, M2 "Library deletions are protected by confirmation instead of undo"). | On success: a toast "Deleted '{name}'." with **no** Undo button, because there is nothing to undo. |
| Any future destructive action that is not undoable | Must use `ConfirmDialog`. | Same as library. |
| Native `window.confirm` / `alert` / `prompt` | **Forbidden.** Enforce with ESLint core `no-alert` (no new dependency). | — |

### 2.3 `ConfirmDialog` contract (`src/ui/ConfirmDialog.tsx`, `src/ui/Dialog.tsx`)

| # | Rule |
|---|---|
| CD1 | Native `<dialog>` opened with `showModal()`: top layer, background inert, Tab and Shift+Tab stay inside (unchanged). |
| CD2 | `aria-labelledby` = title ("Delete '{name}'?"). The consequence text ("This cannot be undone. Export it to JSON first if you want a backup.") is passed as `description`, so it becomes `aria-describedby` (today it is the body, not described). |
| CD3 | Buttons are right-aligned: **Cancel** (secondary) then **Delete** (destructive fill), in this DOM order. The confirm label is the specific verb ("Delete"), never "OK" or "Yes". |
| CD4 | **Initial focus on Cancel**, set explicitly after `showModal()`. Today it works only because Cancel is the first focusable element; React `autoFocus` does not fire when an always-mounted dialog opens later. Enter on the focused Cancel cancels. Nothing submits the destructive action by default. |
| CD5 | **Escape = Cancel.** **Backdrop click does nothing** (no light dismiss), so a stray click cannot cancel or confirm. |
| CD6 | **Busy** (after Delete is pressed): both buttons are disabled, the confirm label reads "Deleting…", the dialog has `aria-busy="true"`, and the `cancel` event is `preventDefault()`ed so Escape cannot close a dialog mid-operation (today `onClose` → `onCancel` also runs while busy). Repeated confirm clicks are ignored. |
| CD7 | **Failure:** the dialog stays open, busy clears, and an inline error (`role="alert"`, danger icon + text, `--sa-color-danger` on `--sa-color-danger-soft`) appears above the buttons. No toast while the modal is open, because it would render behind the backdrop. |
| CD8 | **Cancel:** the dialog closes and focus returns to the control that opened it (the row's "Delete {name}" button). |
| CD9 | **Success:** the dialog closes, then the toast "Deleted '{name}'." appears (no action). Focus moves to the next row's name link, else the previous row's, else the "New architecture" button (header or empty state). Focus never falls to `<body>`. |
| CD10 | Visuals: UH §8.4 unchanged (440 px, 24 px padding, `--sa-shadow-dialog`, `--sa-color-backdrop`). Focus ring per UH §9.1. |

### 2.4 Undo toast contract (`src/ui/Toast.tsx`, `src/editor/actions.ts`, `src/app/EditorScreen.tsx`)

| # | Rule |
|---|---|
| UT1 | Message from `deletionMessage` (unchanged copy, for example "Deleted 1 component and 3 relationships."). Action button "Undo" with `aria-keyshortcuts` "Control+Z Meta+Z" and tooltip "Undo (⌘Z / Ctrl+Z)". |
| UT2 | **It never takes focus** when it appears. Keyboard users reach it by Tab (the region is after the app content) or use `Mod+Z`, which has the same effect. |
| UT3 | **At most one Undo toast.** A new deletion replaces the previous Undo toast instead of stacking a second one. |
| UT4 | **It is bound to its own history entry.** The toast is dismissed on the next history change: any successful dispatch, undo or redo, or leaving the editor. The Undo button can therefore never undo a different, later edit (today a 5 s toast can undo an unrelated move). |
| UT5 | Undo goes through the same `undo` callback as `Mod+Z` in `EditorScreen` (which announces "Undid the last change."), not `store.undo()` directly. |
| UT6 | Duration **8 s** for toasts with an action (5 s without). The timer **pauses** while the pointer is over the toast or focus is inside it, and restarts at full duration on leave (WCAG 2.2.1). `Escape` with focus inside the toast dismisses it. |
| UT7 | After Undo is activated, the toast closes and focus moves to the canvas focus target (the React Flow wrapper), never `<body>`. |
| UT8 | Visuals: UH §7.4 unchanged (toast-bg, toast-text, toast-action 7.3:1). Inside `.sa-toast`, the focus ring uses `--sa-color-toast-text` as its outline color, because the graphite ring is about 1.2:1 on `#2A2723`. |
| UT9 | Toasts are excluded from PNG export (they are outside the canvas, so this is unchanged). |

### 2.5 Announcements: exactly once

- `.sa-toast-region` becomes the single persistent live region for toasts (`role="status"`, `aria-live="polite"`), rendered empty at mount so that insertions are announced reliably. Individual `.sa-toast` elements lose their own `role`/`aria-live`.
- `deleteSelection` stops calling `feedback.announce(message)` separately. Today the same text goes to both the LiveRegion and a `role="status"` toast, which risks a double announcement. TD 12's "LiveRegion for deletions" is updated to say "toast region".
- Undo, redo and save failure keep using `LiveRegion` (unchanged).

### 2.6 `beforeunload` is browser-owned

- The leave-page prompt (`unloadGuard.ts`, active while the save status is `pending`, `saving` or `error`; TD 8.5) is drawn by the browser. **It cannot be styled, its text cannot be changed** (`returnValue` strings are ignored by current Chromium, Firefox and Safari), its buttons cannot be relabelled, and an app dialog cannot replace it, because the handler must decide synchronously. Browsers may also suppress it without prior user interaction.
- The app keeps the guard as is (`preventDefault()` + `returnValue = ""`) and **does not** add custom copy or an app modal on unload.
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
| AC-N1 | The library delete dialog opens with Cancel focused. Escape closes it with nothing deleted. A backdrop click leaves it open. The description is exposed via `aria-describedby`. | `LibraryScreen.test.tsx` (extend "requires confirmation") |
| AC-N2 | While `remove` is pending, both buttons are disabled, Escape does not close the dialog, and a second confirm does not call `repository.remove` twice. | `LibraryScreen.test.tsx` |
| AC-N3 | When `remove` rejects, the dialog stays open with a `role="alert"` message, and no toast is shown. | `LibraryScreen.test.tsx` |
| AC-N4 | Success shows the toast "Deleted 'Old'." with no button, and focus is on the next row's name link (or "New architecture" when the list becomes empty). Cancel returns focus to "Delete Old". | `LibraryScreen.test.tsx` |
| AC-N5 | An editor delete shows one toast with Undo. A second delete replaces it, so there is only one Undo button. | `Toast.test.tsx`, `actions.test.ts` |
| AC-N6 | After a delete followed by a move, the deletion toast is gone, so Undo cannot revert the move. | `actions.test.ts` or `App.integration.test.tsx` |
| AC-N7 | The toast timer pauses on hover and focus-within, Escape dismisses the toast, and the actionable duration is 8000 ms (fake timers). | `Toast.test.tsx` |
| AC-N8 | The deletion text appears in exactly one `aria-live` container. Toast Undo results in the announcement "Undid the last change." | `App.integration.test.tsx` |
| AC-N9 | Ungroup with a group selected shows "Ungrouped 1 group. Members kept." + Undo. | `actions.test.ts` |
| AC-N10 | Lint fails on `window.confirm`/`alert`/`prompt` (`no-alert`). | `npm run lint` |
| AC-N11 | `unloadGuard` behavior is unchanged: it calls `preventDefault` only for `pending`, `saving` and `error`, and sets no custom message. | `unloadGuard.test.ts` (unchanged; it already covers this) |
| AC-N12 | e2e keyboard: Delete key → toast visible → Tab reaches Undo → Enter restores the component and focus lands in the canvas. | `e2e/a11y-keyboard.spec.ts`, `e2e/scenario-i.spec.ts` |

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
| `src/ui/Dialog.tsx`, `src/ui/ConfirmDialog.tsx` | CD2, CD4–CD7 (`cancel` guard, explicit focus, inline error slot, busy label) |
| `src/library/LibraryScreen.tsx`, `LibraryScreen.test.tsx` | Inline error, success toast, focus restore (AC-N1–N4) |
| `src/ui/Toast.tsx`, `Toast.test.tsx`, `src/ui/base.css` | Region live region, single Undo toast, pause, Escape, durations, toast focus ring |
| `src/editor/actions.ts`, `actions.test.ts` | Drop the duplicate `announce`; toast keyed to the history entry; ungroup feedback |
| `src/app/EditorScreen.tsx`, `App.integration.test.tsx` | Feedback `undo` uses the announced callback; dismiss on history change |
| `eslint.config.js` | `"no-alert": "error"` |
| `e2e/ui-v2.spec.ts`, `e2e/a11y-keyboard.spec.ts`, `e2e/scenario-i.spec.ts` | AC-C11, AC-N12 |
| `UI_DESIGN_HANDOFF.md` §2.3, §7.4, §8.1, §8.4; `UI_V2_DESIGN.md` §2.3, §4.1–4.2, §6; `TECHNICAL_DESIGN.md` 5.3, 7.1, 11.2, 12 | Fold in this report (canonical update) |

**Not touched:** `src/persistence/unloadGuard.ts` (§2.6), the schema, validation, serialization and Markdown export.

---

## 5. Implementation stages (for the Build coordinator)

| Stage | Outcome | Depends on | Difficulty | Validation |
|---|---|---|---|---|
| S1 Palette source | §1.2–1.7: resolver, tokens, `canvas.css`, `ComponentNode`, Tomato fix | — | 3 (CSS cascade restructure plus PNG fidelity) | unit AC-C1–C8; `npm run test`; e2e `ui-v2` PNG |
| S2 Palette surfaces | §1.8: picker copy and swatches, inspector header, palette panel, undo label | S1 | 2 | AC-C9, AC-C10, AC-C11 |
| S3 ConfirmDialog contract | §2.3 plus library wiring | — (parallel to S1) | 2 | AC-N1–N4, AC-N10 |
| S4 Undo toast and announcements | §2.4–2.5 plus ungroup feedback | — (shares nothing with S3 except `base.css`, so reserve it to S4 and let S3 avoid it) | 3 (history binding and focus) | AC-N5–N9, AC-N12 |
| S5 Spec fold-in | §4 doc rows | S1–S4 | 1 | review |

All UI stages route to `stage-ui`. **Commits:** `feat(canvas): drive node fill and ink from one effective palette entry` (S1), `feat(inspector): rename accent to color and match header ink` (S2), `fix(ui): harden delete confirmation focus, busy and error states` (S3), `fix(ui): bind undo toast to its deletion and announce once` (S4), `docs: fold color and confirmation design into handoffs` (S5). Each commit passes `npm run lint`, `npm run test` and the affected e2e specs.

## 6. Open decisions (defaults chosen; none block implementation)

| # | Question | Default |
|---|---|---|
| O1 | Rename the persisted `accent` field to `color`? | **No.** That would need a schema bump for no user benefit. Only UI copy changes. |
| O2 | Confirm large editor deletions (for example ≥ 10 elements)? | **No.** Undo covers them, and a threshold makes the behavior unpredictable (PC 8.3). Revisit only with user evidence. |
| O3 | Chip plate white vs. ink-filled with a white glyph? | **White plate.** It reads as a logo on every fill, and it keeps the inverted treatment unique to the Orchestrator band. |
| O4 | Hatch opacity 0.16? | 0.16. Adjust within 0.12–0.20 after a visual check. It is decorative. |
