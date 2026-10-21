# Swarm Architecturer — UI Design Handoff (MVP)

**Status:** Visual design handoff, written before implementation starts.
**Authority:** `PRODUCT_CONCEPT_V1.1.md` and `TECHNICAL_DESIGN.md` are authoritative. This document only sets visual values and the visual treatment of behavior those two documents already define. It adds no features, screens, controls or dependencies. If this document conflicts with either of them, they win.
**Implements into:** `src/ui/tokens.css` (all `--sa-*` tokens below), `src/ui/base.css`, and the per-module CSS files (TD 4.1). "TD x.y" refers to sections of `TECHNICAL_DESIGN.md`; "PC x.y" refers to `PRODUCT_CONCEPT_V1.1.md`.

---

## 1. Visual direction: "Drafting sheet"

The editor should feel like a **technical drawing on good paper**: a warm off-white sheet, graphite ink, and a small set of muted, pigment-like type inks. It is a precise instrument for thinking, not a monitoring console.

| Principle | What it means in practice |
|---|---|
| **The canvas is the sheet** | The canvas is the only warm, textured surface (paper tone plus a faint dot grid). Panels are plain white and quiet, so the eye goes to the diagram (PC 14). |
| **Shape before color** | Each component type is recognizable from its **outline, its icon and its type label**, even in grayscale. Color is the third cue, never the only one (TD 12). |
| **One accent, used for intent** | A single cobalt accent marks selection, primary actions and valid connections. Type inks never appear on buttons or chrome. |
| **Ink, not glow** | Flat fills, 1–2 px strokes, no gradients, no glow, no glassmorphism, and shadows only on floating layers (popovers, dialogs, toasts). |
| **Spec-sheet labels** | Type labels use small uppercase monospace text ("AGENT", "TOOL"), like annotations on a drawing. Names use the proportional system font. |
| **Calm density** | A 13 px UI base, generous inspector spacing, and no KPI tiles, charts or colored status chips in the chrome. |

**What we are avoiding.** *Enterprise dashboard:* gray-blue chrome, dense data tables, cards with metric badges, and heavy left navigation. *Generic AI aesthetic:* dark backgrounds with neon gradients, purple-cyan glows, sparkle icons and animated particle edges.

**Theme scope.** The MVP ships a **light theme only**. Neither source document calls for a dark theme. All colors go through tokens, so a dark theme could be added later without touching component CSS.

---

## 2. Color tokens

All contrast ratios below were computed with the WCAG 2.x formula against the stated background. Text tokens are ≥ 4.5:1. Non-text indicators that carry meaning (input borders, selection, group outlines, edges) are ≥ 3:1 against their adjacent color.

### 2.1 Neutrals and surfaces

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--sa-color-canvas` | `#F5F3EE` | Canvas background (also the PNG export `backgroundColor`, TD 10) | — |
| `--sa-color-canvas-grid` | `#DDD8CD` | Canvas dot grid (React Flow `<Background variant="dots">`, gap 20, size 1) | decorative |
| `--sa-color-surface` | `#FFFFFF` | Toolbar, palette, inspector, dialogs, library | — |
| `--sa-color-surface-sunken` | `#EFECE6` | Inspector section headers, skeleton rows, table header, input disabled | — |
| `--sa-color-surface-hover` | `#F5F3EE` | Hover background for rows, list entries, ghost buttons | — |
| `--sa-color-border` | `#D8D3C8` | Decorative dividers between panels and rows (not used as the only boundary of a control) | decorative |
| `--sa-color-border-strong` | `#8C8679` | Input, select and checkbox boundaries; secondary button border | 3.62 on surface, 3.26 on canvas |
| `--sa-color-text` | `#1F1D1A` | Primary text, node names | 16.8 on surface, 15.2 on canvas |
| `--sa-color-text-muted` | `#5C574F` | Hints, descriptions, counts, timestamps | 7.2 on surface, 6.5 on canvas, ≥ 6.0 on every node fill |
| `--sa-color-text-disabled` | `#8F897D` | Disabled labels (exempt from contrast; always paired with the `disabled` attribute) | 3.5 on surface |
| `--sa-color-backdrop` | `rgba(31, 29, 26, 0.40)` | `<dialog>::backdrop` | — |

### 2.2 Interaction and status

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--sa-color-accent` | `#2650C8` | Selection outline, primary button fill, links, valid connection line, active segmented option | 6.9 on surface, 6.2 on canvas |
| `--sa-color-accent-hover` | `#1E41A6` | Primary button hover and active | — |
| `--sa-color-accent-soft` | `rgba(38, 80, 200, 0.16)` | Selection halo, selected list row background | decorative |
| `--sa-color-on-accent` | `#FFFFFF` | Text on accent fill | 6.9 |
| `--sa-color-focus` | `#1F1D1A` | Keyboard focus ring (deliberately graphite, not accent; see 9.1) | 15.2 on canvas |
| `--sa-color-focus-gap` | `#FFFFFF` | Inner gap of the focus ring | — |
| `--sa-color-danger` | `#B42318` | Error text and icons, destructive button fill, invalid connection line | 6.6 on surface |
| `--sa-color-danger-hover` | `#931D13` | Destructive button hover | — |
| `--sa-color-danger-soft` | `#FBEAE8` | Error banner and field-error background | — |
| `--sa-color-on-danger` | `#FFFFFF` | Text on danger fill | 6.6 |
| `--sa-color-success` | `#2E6A4C` | "Saved" icon and text | 6.4 on surface |
| `--sa-color-warning-text` | `#7A4A06` | Text in warning banners (tab conflict, damaged row note) | 6.7 on warning-soft |
| `--sa-color-warning-soft` | `#FBF1DC` | Warning banner background | — |
| `--sa-color-info-soft` | `#EFECE6` | Backup notice banner background (neutral on purpose; it is persistent and must not look alarming) | — |
| `--sa-color-toast-bg` | `#2A2723` | Toast background | — |
| `--sa-color-toast-text` | `#F5F3EE` | Toast text | 13.4 |
| `--sa-color-toast-action` | `#9DB4F5` | Toast action button text ("Undo") | 7.3 |

### 2.3 Component type inks

Each type has an **ink** (border, icon, type label) and a **fill** (node background). The node name is always `--sa-color-text` (≥ 14:1 on every fill), and the description is always `--sa-color-text-muted` (≥ 6.0:1).

| Type | Ink token / hex | Fill token / hex | Ink contrast on fill / on canvas |
|---|---|---|---|
| Agent | `--sa-type-agent-ink` `#36597D` | `--sa-type-agent-fill` `#EDF2F7` | 6.5 / 6.6 |
| Orchestrator | `--sa-type-orchestrator-ink` `#1D3557` | `--sa-type-orchestrator-fill` `#E6ECF4` | 10.4 / 11.2 (white on ink 12.4) |
| Tool | `--sa-type-tool-ink` `#875611` | `--sa-type-tool-fill` `#FBF3E3` | 5.7 / 5.6 |
| Memory / Data Store | `--sa-type-memory-ink` `#2E6A4C` | `--sa-type-memory-fill` `#EBF4EE` | 5.7 / 5.8 |
| External System | `--sa-type-external-ink` `#57534C` | `--sa-type-external-fill` `#F1EFEA` | 6.7 / 6.9 |
| Decision / Routing Rule | `--sa-type-decision-ink` `#6C3D74` | `--sa-type-decision-fill` `#F5EEF6` | 7.2 / 7.4 |
| External hatch | `--sa-type-external-hatch` `#E4E0D7` | — | decorative |

Agent and Orchestrator share a hue family on purpose: an Orchestrator *is* an Agent (PC 6.2). They are told apart by structure (section 5), not by hue.

### 2.4 Canvas structure

| Token | Value | Use |
|---|---|---|
| `--sa-edge-stroke` | `#6B655B` | Default relationship stroke and arrowhead (5.2:1 on canvas) |
| `--sa-edge-stroke-hover` | `#1F1D1A` | Hovered edge |
| `--sa-edge-stroke-selected` | `var(--sa-color-accent)` | Selected edge and its arrowhead |
| `--sa-edge-label-text` | `#3A3631` | Edge label text (10.8:1 on canvas) |
| `--sa-edge-label-bg` | `#F5F3EE` | Edge label background (equal to the canvas, so labels "cut" the line) |
| `--sa-group-border` | `#857F72` | Group outline (3.6:1 on canvas) |
| `--sa-group-fill` | `rgba(87, 83, 76, 0.05)` | Group body (alpha ≤ 0.12 per TD 6.5) |
| `--sa-group-header-fill` | `rgba(87, 83, 76, 0.10)` | Group header bar |
| `--sa-handle-fill` | `#FFFFFF` | Connection handle fill |
| `--sa-handle-border` | `var(--sa-color-accent)` | Connection handle ring |

**React Flow mapping.** Where `@xyflow/react` v12 exposes `--xy-*` CSS variables (for example edge stroke, handle colors, selection box, minimap and attribution background), set them to the `--sa-*` tokens above in `canvas.css` instead of overriding React Flow class rules. *Assumption:* check the exact variable names against the installed `@xyflow/react/dist/style.css`, and fall back to class overrides for any that do not exist.

---

## 3. Typography

System fonts only. There are no `@font-face` rules and no network font requests (TD 1, Scenario J).

| Token | Value |
|---|---|
| `--sa-font-sans` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--sa-font-mono` | `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace` |

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--sa-text-2xs` | 11 px / 14 px | 600, mono, uppercase, letter-spacing 0.06em | Node type label, group member count, keyboard hints in tooltips |
| `--sa-text-xs` | 12 px / 16 px | 400 | Field hints, descriptions on nodes, edge labels, table secondary text |
| `--sa-text-sm` | 13 px / 18 px | 400; 600 for labels | **UI base**: buttons, inputs, inspector body, list entries |
| `--sa-text-md` | 14 px / 20 px | 600 | Node name, inspector section summaries, dialog body |
| `--sa-text-lg` | 16 px / 22 px | 600 | Dialog titles, inspector header (selected element name) |
| `--sa-text-xl` | 20 px / 28 px | 600 | Library page title |

Weight tokens: `--sa-weight-regular: 400`, `--sa-weight-semibold: 600`. Do not use any other weights.

Use `font-variant-numeric: tabular-nums` for counts and timestamps. The Notes textarea uses `--sa-font-mono` to signal that it holds Markdown source (TD 7.1).

---

## 4. Spacing, sizing, radius, elevation

**Spacing (4 px base):** `--sa-space-1: 2px`, `--sa-space-2: 4px`, `--sa-space-3: 8px`, `--sa-space-4: 12px`, `--sa-space-5: 16px`, `--sa-space-6: 24px`, `--sa-space-7: 32px`, `--sa-space-8: 48px`.

**Control sizes:** `--sa-control-h: 32px` (buttons, inputs, selects), `--sa-control-h-sm: 28px` (row actions, relationship list secondary buttons), `--sa-icon-sm: 16px`, `--sa-icon-md: 20px`. Every interactive target is at least 24 × 24 px (WCAG 2.5.8); prefer 32 px.

**Radius:** `--sa-radius-sm: 4px` (inputs, buttons), `--sa-radius-md: 6px` (nodes, popovers), `--sa-radius-lg: 8px` (dialogs, toasts, group container).

**Stroke widths:** `--sa-stroke-thin: 1px`, `--sa-stroke: 1.5px`, `--sa-stroke-strong: 2px`, `--sa-stroke-selected: 2.5px` (edges).

**Elevation:** only floating layers cast shadows.
- `--sa-shadow-popover: 0 4px 12px rgba(31, 29, 26, 0.12), 0 1px 3px rgba(31, 29, 26, 0.08)` (relationship type picker, menus, tooltips)
- `--sa-shadow-dialog: 0 16px 40px rgba(31, 29, 26, 0.20)` (dialogs, toasts)

Nodes and panels have **no** shadow. Panels are separated from the canvas by a `--sa-color-border` hairline.

**Motion:** `--sa-duration-fast: 120ms`, `--sa-ease: cubic-bezier(0.2, 0, 0, 1)`. Use motion only for hover and color transitions and for panel collapse. Under `prefers-reduced-motion: reduce`, set both durations to `0ms`. Edges never animate.

---

## 5. Component node treatments

### 5.1 Shared node anatomy

Nodes use the default sizes from TD 3.3, with `--sa-radius-md` corners unless a type overrides them and 10 px × 12 px padding. The content stacks top to bottom:

1. **Type row:** a 16 px type icon in ink color, then the type label (`--sa-text-2xs`, mono, uppercase, ink color): "AGENT", "ORCHESTRATOR", "TOOL", "DATA STORE", "EXTERNAL", "DECISION".
2. **Name:** `--sa-text-md`, `--sa-color-text`, one line with ellipsis.
3. **Description** (if present): `--sa-text-xs`, `--sa-color-text-muted`, at most 2 lines, then ellipsis. Omit the row when there is no description; do not render a placeholder.

Nothing else is shown on a node (PC 14). If a node belongs to a group, the group container already shows that, so do not add a group badge.

### 5.2 Per-type treatments (each one combines a shape cue, an icon and a label)

| Type | Border / shape (primary cue) | Fill | Icon (inline SVG, `ui/icons.tsx`) |
|---|---|---|---|
| **Agent** | 1.5 px solid ink border, 6 px radius. The plain baseline. | agent-fill | Simple person-in-circle glyph |
| **Orchestrator** | 2 px solid ink border **plus a solid ink header band** behind the type row (full width, 24 px tall). Inside the band, the type label and icon are white (`--sa-color-on-accent`, 12.4:1 on the ink). It is the only node type with a filled header, so it reads as "in charge" at any zoom level. | orchestrator-fill (body) | Hub glyph: a center dot with three spokes ending in small dots |
| **Tool** | 1.5 px solid ink border, **4 px radius (tighter, more mechanical)**, plus a 4 px ink bar along the left edge, inside the border. | tool-fill | Wrench glyph |
| **Memory / Data Store** | 1.5 px solid ink border. The top corners use an **elliptical radius (`50% / 10px`)**, which gives a "disk lid" curve, and a second 1 px ink rule runs 6 px below the top, so the node reads as a storage cylinder seen from the side. The bottom corners use 6 px. | memory-fill | Stacked-disk (database) glyph |
| **External System** | 1.5 px **dashed** ink border (dash 6, gap 4) and a **45° diagonal hatch** fill (`repeating-linear-gradient` of `--sa-type-external-hatch` 1 px lines every 8 px over the fill), meaning "outside the modeled boundary" (PC 14, TD 12). | external-fill + hatch | Box with an arrow leaving it |
| **Decision / Routing Rule** | 1.5 px solid ink border with **chamfered corners** (10 px 45° cuts, drawn with `clip-path: polygon(...)`; draw the border with an inset outline or an inner element so the cuts are stroked), a nod to the flowchart decision diamond without the unreadable diamond shape. | decision-fill | Fork glyph (one line splitting into two) |

**Grayscale check (acceptance):** in a grayscale screenshot, all six types must remain distinguishable by border style, header band, corner shape or hatch, and icon. This is the "not color alone" requirement for nodes.

### 5.3 Handles and resize

- **Handles:** four 8 px circles (`--sa-handle-fill`, 1.5 px `--sa-handle-border`) centered on the node edges. They are hidden at rest and shown on node hover, keyboard focus and selection (TD 6.3). Each has a 16 px invisible hit area.
- **Resize:** `NodeResizer` on selected nodes. Use 8 px square corner handles in accent with white fill, and a selection-colored line.

### 5.4 Group container

A group is a **container, not a component** (PC 6.6, PC 14), so it gets none of the node vocabulary: no type ink, no type label and no icon chip.

- **Outline:** 1.5 px **dashed** `--sa-group-border` (dash 8, gap 4), `--sa-radius-lg`.
- **Body:** `--sa-group-fill`, with `pointer-events: none` (TD 6.5).
- **Header** (`.sa-group-header`, 32 px = `GROUP_HEADER`): `--sa-group-header-fill`, with a 1 px dashed rule at the bottom. It shows a grip glyph (6 dots, 16 px, muted), then the group name (`--sa-text-sm`, semibold, text), then the member count in `--sa-text-2xs` mono muted ("3 MEMBERS"; "EMPTY" for zero members). Use `cursor: grab`, and `grabbing` while dragging.
- **Empty group:** same treatment. The body shows nothing extra; the "EMPTY" count is the cue.
- The group is always drawn below edges and nodes (z-order from TD 6.2).

---

## 6. Relationship (edge) styling

All relationship types share one neutral ink. The **type is read from the label**, not from color. With ten types, color coding would add a legend to learn (low cognitive load, PC 14) and would fail for color-blind readers.

| Property | Directed | Undirected |
|---|---|---|
| Stroke | 1.5 px **solid** `--sa-edge-stroke` | 1.5 px **dashed** `--sa-edge-stroke`, `stroke-dasharray: 6 4` |
| Arrowhead | Closed arrowhead at the **target only**, about 10 px, filled with the current stroke color | **None at either end** |
| Label | As defined in TD 6.4 | As defined in TD 6.4 |

Both cues (dash pattern and arrowhead) are always present together. Never style an undirected edge to suggest an order: no gradient, no tapering, no start marker.

**Label styling:** `--sa-text-xs` in `--sa-edge-label-text` on an `--sa-edge-label-bg` rounded rectangle (`labelBgPadding` [6, 2], radius 3), at the midpoint of the path. Labels are SVG text, so they appear in the PNG export (TD 6.4). Truncation follows TD 6.4.

**Edge states:**

| State | Treatment |
|---|---|
| Rest | as above |
| Hover | stroke `--sa-edge-stroke-hover`; the label text stays the same |
| Selected | stroke `--sa-edge-stroke-selected`, width `--sa-stroke-selected`, arrowhead in accent; label background gets a 1 px accent border |
| Keyboard focus | the focus ring (9.1) drawn around the label rectangle, plus the selected stroke if the edge is also selected |
| Exporting (`.sa-exporting`) | rest style only; selection and focus hidden (TD 10) |

**Connection line (while dragging from a handle):** 1.5 px accent dashed line ending in a small accent dot. Over an invalid target (a group, the pane, the same node; TD 6.3, 13) the line switches to `--sa-color-danger` and the cursor to `not-allowed`. The red color is reinforced by the cursor change and by the fact that no picker opens on release.

**Parallel edges:** the 12 px perpendicular offsets from TD 6.4. No extra styling.

---

## 7. Interaction states (canvas and panels)

| State | Visual treatment | Non-color cue |
|---|---|---|
| **Node hover** | border darkens to `--sa-color-text`; handles appear | handles appear |
| **Node selected** | a 2 px accent outline drawn 2 px outside the border, plus a 4 px `--sa-color-accent-soft` halo; resize handles | outline thickness and halo; resize handles |
| **Node focused (keyboard)** | focus ring (9.1) | double-ring shape, distinct from the selection outline |
| **Multi-selected** | each element shows the selected state; the box-select rectangle uses accent at 8% fill with a 1 px accent border | — |
| **Group selected** | outline becomes **solid** 2 px accent; header fill becomes `--sa-color-accent-soft` | dashed → solid |
| **Dragging** | `cursor: grabbing`; no shadow and no scale change | cursor |
| **Inspector list row selected** | `--sa-color-accent-soft` background and a 2 px accent bar on the left | the bar |
| **Disabled button** | `--sa-color-text-disabled`, no hover change, `cursor: not-allowed` | the `disabled` attribute (screen readers) |
| **Field error** | border `--sa-color-danger` 1.5 px; message below the field in danger color with a 16 px alert icon ("Name is required", TD 7.1); `aria-invalid` and `aria-describedby` set | icon and text |

### 7.1 Save status (`SaveStatusIndicator`, TD 8.4)

The indicator is a text pill in the toolbar, **icon plus word**, never a colored dot alone:

| Status | Icon | Text | Color |
|---|---|---|---|
| `saved` | check | "Saved" | `--sa-color-success` icon, `--sa-color-text-muted` text |
| `pending` / `saving` | three-dot ellipsis (static; under reduced motion it never animates) | "Saving…" | muted |
| `error` | alert triangle | "Save failed", then a compact secondary **Retry** button | `--sa-color-danger` for icon and text; pill background `--sa-color-danger-soft` |

Keep the indicator at a fixed minimum width (about 96 px) so the toolbar does not shift when the status changes.

### 7.2 Loading states

- **Library list:** 3 skeleton rows of `--sa-color-surface-sunken` bars (name 40%, date 20%, counts 15%), with an optional opacity pulse (0.6 ↔ 1, 1.2 s) disabled under reduced motion. The table header stays visible.
- **Editor opening:** the panels render empty, and the canvas shows centered muted text, "Opening architecture…". No spinner is needed.
- **PNG export running:** the Export menu item shows "Exporting…" and is disabled until it finishes.

### 7.3 Empty states

Empty states are text-first and calm, with no illustrations or mascots.

- **Library empty (TD 11.2):** a centered block (max 400 px) with the title "No architectures yet." (`--sa-text-lg`), one muted sentence, and the two buttons **New architecture** (primary) and **Import JSON** (secondary). A row of the six type icons in their inks (16 px, 12 px gap) above the title adds identity at no cost.
- **Canvas empty:** a centered, non-interactive hint (`pointer-events: none`) in `--sa-text-sm` muted: "Add components from the library on the left: click to place, or drag onto the canvas." It disappears once there is any component.
- **Relationship list empty:** the TD 7.4 text, in muted `--sa-text-xs`.
- **Group with no members:** the "EMPTY" count in the header (5.4). In the group inspector, the members list shows "No members. Select components and use Group, or assign them in their inspector."

### 7.4 Error, notice and confirmation surfaces

| Surface | Treatment |
|---|---|
| **Storage unavailable** (full page, TD 13) | A centered block (max 480 px) on `--sa-color-surface`: a 20 px alert icon in danger, the title in `--sa-text-lg`, and the body text. No other chrome. |
| **Backup notice** (TD 8.5) | A banner at the top of the library list on `--sa-color-info-soft`, with an info icon, the text and a "Dismiss" ghost button. The always-visible footer line is `--sa-text-xs` muted. |
| **Tab conflict banner** (TD 8.6) | A 32 px strip directly under the toolbar on `--sa-color-warning-soft` with `--sa-color-warning-text` and a warning icon. It does not overlay the canvas; it pushes the canvas down. |
| **Damaged library row** | Name in muted text, a warning icon plus "Can't be opened", and the first issue in `--sa-text-xs`. Only the allowed actions are shown. |
| **Toast** (TD 5.3, 10, 13) | Bottom-center of the canvas, 16 px above the bottom edge, `--sa-color-toast-bg`, `--sa-radius-lg`, `--sa-shadow-dialog`, max 480 px wide. Text in toast-text; action ("Undo") as a text button in toast-action. It never covers the toolbar or the panels. |
| **Import error dialog** (TD 9.2) | The dialog style from 8.3, 560 px wide. The issues are a scrollable list (max 50vh) in `--sa-text-xs` with IDs in mono, then "Nothing was saved." in semibold. |

---

## 8. Forms and dialogs

### 8.1 Inspector layout

- **Header:** a sticky bar at the top of the panel with the type icon and mono type label (or "RELATIONSHIP", "GROUP", "ARCHITECTURE", "SELECTION"), then the element name in `--sa-text-lg` on the next line.
- **Sections** (`<details>`): the summary row is 36 px tall on `--sa-color-surface-sunken`, `--sa-text-sm` semibold, with a chevron that rotates on open and a 1 px `--sa-color-border` below. The section body has 16 px padding and 16 px gaps between fields.
- **Footer actions** (Connect…, Duplicate, Delete): a row of secondary buttons at the end of the scroll content. Delete uses the destructive *outline* variant there; the solid destructive fill is reserved for confirmation dialogs.

### 8.2 Fields

| Element | Style |
|---|---|
| Label | above the control, `--sa-text-sm` semibold, `--sa-color-text`, 4 px gap |
| Hint | below the control, `--sa-text-xs` muted (for example "Shown on the node", "One item per line", "Markdown") |
| Text input / select | height `--sa-control-h`, padding 0 × 8 px, 1 px `--sa-color-border-strong`, `--sa-radius-sm`, surface background; hover border `--sa-color-text-muted` |
| Textarea | minimum 3 rows (ListField and Notes minimum 4), `resize: vertical`, same border |
| Read-only direction text (TD 6.4) | plain `--sa-text-sm` text with a lock glyph, e.g. "Directed (fixed by type)". It is not styled as a disabled input, because it is information, not a control. |
| Segmented control (Agent / Orchestrator; Directed / Undirected) | 1 px border-strong container; the active option has an accent fill with white text **and** a check glyph; inactive options are surface with text color |
| Relationship header sentence (TD 7.3) | `--sa-text-sm`; component names are link-style buttons (accent, underlined on hover and focus) |
| Relationship list entries (TD 7.4) | 32 px rows; a direction glyph (→ ← ↔) in mono muted at a fixed 16 px width, so the glyph, not color, carries direction; the name in text color; the label in muted; the "Go to" button as a 28 px ghost icon button on the right |

### 8.3 Buttons

| Variant | Rest | Hover | Use |
|---|---|---|---|
| Primary | accent fill, on-accent text | accent-hover | One per view: "New architecture", dialog confirm |
| Secondary | surface, 1 px border-strong, text | surface-hover | Most actions |
| Ghost | transparent, text (icon buttons) | surface-hover | Toolbar icons, panel collapse, "Go to" |
| Destructive | danger fill, on-danger text | danger-hover | The confirm button in a delete dialog only |
| Destructive outline | surface, 1 px danger border, danger text | danger-soft | Inspector Delete, library row Delete |

All buttons use `--sa-text-sm` semibold labels, `--sa-radius-sm` and `--sa-control-h`. Icon-only buttons are 32 × 32 with an `aria-label` and a tooltip (TD 11.4).

**Tooltips:** `--sa-color-toast-bg` background, toast-text, `--sa-text-xs`, with the shortcut in a mono `--sa-text-2xs` chip. Show them after a 500 ms hover delay, and immediately on keyboard focus.

### 8.4 Dialogs (native `<dialog>`, TD 12)

- Width 440 px (import error 560 px, ConnectDialog 400 px), max width `calc(100vw - 32px)`. Padding 24 px, `--sa-radius-lg`, `--sa-shadow-dialog`, backdrop `--sa-color-backdrop`.
- The title is `--sa-text-lg`, followed by the body with a 16 px gap and the button row with a 24 px gap. Buttons are right-aligned in the order **Cancel, then confirm** (confirm last).
- **Delete confirmation:** the confirm label is "Delete" in the destructive variant, and **Cancel has initial focus** (TD 11.2).
- **Relationship type picker** (TD 6.3): a popover, not a modal. 280 px wide, `--sa-shadow-popover`, `--sa-radius-md`. Each option is two lines: the display name (`--sa-text-sm` semibold) and the "reads as" hint (`--sa-text-xs` muted). The active option uses accent-soft plus a 2 px accent left bar. Shares Context With shows a small "↔ undirected" tag in mono muted, so the direction rule is visible before it is chosen.

---

## 9. Keyboard, focus and contrast guidance

### 9.1 Focus ring

A single focus style used everywhere through `:focus-visible`: `outline: 2px solid var(--sa-color-focus); outline-offset: 2px; box-shadow: 0 0 0 2px var(--sa-color-focus-gap)`. The result is a **graphite ring with a white gap**.

- It is distinct from selection in **both color and shape**: selection is an accent outline with a soft halo; focus is a graphite double ring. A focused, selected node shows both.
- Never remove an outline without replacing it with this ring.
- On the canvas, apply the ring to `.react-flow__node:focus-visible` and `.react-flow__edge:focus-visible` (on the edge label rectangle, or as a widened stroke for edges without a label).
- Inside `.sa-exporting`, hide all focus rings (TD 10).

### 9.2 Keyboard and order

- Tab order is toolbar → palette → canvas → inspector (TD 12). Panels have visible landmarks only through their headings; do not add extra focus stops.
- Palette items are real buttons with icon plus name (`--sa-text-sm`). Each one is focusable and activates on Enter or Space (click-to-add).
- Shortcut hints appear in tooltips and in the type picker footer ("↑↓ to choose, Enter to add, Esc to cancel") in `--sa-text-2xs` mono.
- Collapsed panels keep their toggle focusable and show `aria-expanded`.

### 9.3 Contrast and non-color rules (acceptance checklist)

1. All text meets 4.5:1 against its actual background (values in section 2).
2. Control boundaries, selection outlines, group outlines and edges meet 3:1 against the canvas or surface.
3. Component types differ by shape, icon and label (5.2); the grayscale check passes.
4. Directed and undirected edges differ by arrowhead and dash pattern.
5. Save status, errors and warnings always pair an icon with words.
6. Selection and focus differ in shape, not only in color.
7. **Forced colors** (`@media (forced-colors: active)`): borders and dash patterns carry the meaning. Use `CanvasText` for strokes, `Highlight` for selection outlines and keep `border-style: dashed` for External Systems, groups and undirected edges. The hatch and the fills may disappear; that is acceptable because the shape cues remain.

---

## 10. Layout and panel hierarchy

### 10.1 Editor (TD 11.3)

```
┌──────────────────────────── Toolbar 48px (surface, bottom hairline) ───────────────────────────┐
│ ‹ Library │ Name ▢ │ ✓ Saved     ↶ ↷ │ − + ⤢           Group Ungroup Connect… Delete │ Export ▾ Import │
├──────────┬─────────────────────────────────────────────────────────────────────┬───────────────┤
│ Palette  │                                                                     │ Inspector     │
│ 216px    │                     CANVAS (paper + dot grid)                       │ 340px         │
│ surface  │                       fills all remaining space                     │ surface       │
│          │                                          [minimap, ≥ 900px wide]    │ scrolls       │
└──────────┴─────────────────────────────────────────────────────────────────────┴───────────────┘
```

| Region | Size tokens | Notes |
|---|---|---|
| Toolbar | `--sa-toolbar-h: 48px` | Groups are separated by 1 px × 20 px `--sa-color-border` dividers. The architecture name input looks like plain text (no border) until hover or focus. |
| Palette | `--sa-palette-w: 216px`, collapsed `--sa-palette-w-collapsed: 48px` (icon rail) | Items are 40 px rows: type icon in its ink, then the name. The collapsed rail shows icons only, each with a tooltip and the item's `aria-label`. Each item has a drag cursor plus a click affordance. |
| Inspector | `--sa-inspector-w: 340px`, collapsed `0` with a 32 px edge toggle | Scrolls independently; its header is sticky. |
| Canvas | the remainder | No inner border or card frame: the paper runs to the panel hairlines. The MiniMap uses surface with 80% opacity and the border token, with nodes drawn in their type inks. |

**Hierarchy:** the canvas has the strongest visual weight (warm tone, the content). Panels are visually subordinate: white, quiet, no colored headers. Inside the inspector, the selected element's name is the strongest text. Only one primary (accent-filled) button appears per view, and the editor toolbar has none.

### 10.2 Library (TD 11.2)

A single centered column, max width 960 px, with 32 px top padding on `--sa-color-canvas` (paper continuity with the editor) and a table on a surface card (1 px border, `--sa-radius-lg`).

- **Header row:** "Architectures" in `--sa-text-xl`, with **New architecture** (primary) and **Import JSON** (secondary) on the right.
- **Table:** 44 px rows with hairline separators; the header on surface-sunken in `--sa-text-xs` semibold muted. The name column is a link in text color that turns accent with an underline on hover and focus. Row actions are compact secondary and ghost buttons, always visible (not hover-only), so they work for keyboard and touch.

---

## 11. Responsive behavior (canvas keeps priority)

The MVP targets desktop and laptop. The rules below keep the canvas usable on smaller widths without adding features; they use only the collapse behavior TD 11.3 already defines, plus overlay positioning.

| Viewport width | Palette | Inspector | Toolbar | Canvas |
|---|---|---|---|---|
| ≥ 1280 px | expanded (216) | docked (340) | full labels | full width minus both panels |
| 1024–1279 px | **collapsed rail (48)** by default | docked (320) | text buttons for Group, Ungroup and Connect become icon buttons with tooltips | ≥ about 650 px wide |
| 768–1023 px | rail | **overlay drawer** (320 px, right edge, `--sa-shadow-popover`, over the canvas instead of beside it); it opens when the user expands it and is closed by its toggle or Escape | icon-only except the name and save status; MiniMap hidden (< 900, TD 6.1) | full width minus the rail |
| < 768 px | rail | overlay drawer at `min(100vw - 48px, 360px)` | the name input truncates; Export ▾ and Import become icon-only | not optimized; stays functional |

Rules:

- A stored collapse preference (`sa:ui:` in localStorage, TD 8.1) wins over the width default **only when it collapses** a panel. Width defaults never force a panel open over the canvas.
- Library: below 768 px, hide the counts column; the row actions wrap under the name.
- Dialogs never exceed `calc(100vw - 32px)`; their buttons wrap.

---

## 12. Token naming summary (for `src/ui/tokens.css`)

All tokens are declared on `:root` with the `--sa-` prefix:

- `--sa-color-*` (neutrals, interaction, status, toast)
- `--sa-type-{agent|orchestrator|tool|memory|external|decision}-{ink|fill}`, plus `--sa-type-external-hatch`
- `--sa-edge-*`, `--sa-group-*`, `--sa-handle-*`
- `--sa-font-*`, `--sa-text-*` (set the size and line height through paired `--sa-text-{step}-size` / `--sa-text-{step}-lh` tokens if a single shorthand token is awkward), `--sa-weight-*`
- `--sa-space-1` … `--sa-space-8`, `--sa-control-*`, `--sa-icon-*`, `--sa-radius-*`, `--sa-stroke-*`, `--sa-shadow-*`, `--sa-duration-*`, `--sa-ease`
- `--sa-toolbar-h`, `--sa-palette-w`, `--sa-palette-w-collapsed`, `--sa-inspector-w`

Module CSS references tokens only; no raw hex values outside `tokens.css`. The PNG exporter reads `--sa-color-canvas` for `backgroundColor` (TD 10) with `getComputedStyle`. Node component CSS selects the type treatment through a data attribute derived from the domain (for example `data-type="memory"` and `data-subtype="orchestrator"` on the node root), never from user-provided IDs (TD 3.4).

---

## 13. Traceability

| Requirement | Covered in |
|---|---|
| PC 14 / M9: types visually distinct; Orchestrator distinct from Agent; External outside the boundary; Groups as containers | 5.2, 5.4 |
| M9 / PC 5.4: directed vs. undirected easy to tell apart; labels readable | 6 |
| M9: selection and group states clear | 7, 9.1 |
| PC 18: autosave feedback; backup warning | 7.1, 7.4 |
| PC 18 / TD 12: labeled forms, contrast, keyboard, not color alone | 8.2, 9 |
| TD 11.2 / 13: loading, empty and error states | 7.2–7.4 |
| TD 1 / 14: system fonts, no external resources | 3 |
| Scenario H: export legibility | 2.1 (canvas token), 6 (SVG labels), 9.1 (hidden in export) |

**Out of scope here (deliberately not added):** dark theme, per-relationship-type edge colors, animated edges, illustrations, custom fonts, an icon library, a Markdown preview, and any new controls or screens.
