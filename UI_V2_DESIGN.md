# Swarm Architecturer — UI v2 Design Report ("Ported canvas")

**Status:** Design report for the v2 visual update. No application code is part of this change.
**Authority:** `PRODUCT_CONCEPT_V1.1.md` (PC) and `TECHNICAL_DESIGN.md` (TD) stay authoritative for product meaning and behavior. This report **replaces** the visual rules in `UI_DESIGN_HANDOFF.md` (UH) §2.1 (canvas tokens), §2.4 (canvas structure), §5.1–5.3 (node anatomy, per-type shapes, handles) and §6 (edge styling). It replaces the geometry rules in TD 6.4 (floating straight edges) and adds to TD 3.1/3.5/3.6/3.7 (persisted accent), TD 6.3 (pointer connect) and TD 10 (PNG bounds). The implementation worker updates those TD and UH sections in the same change set that implements them. Anything this report does not mention keeps its v1 behavior.
**Superseded color rule (as built):** the accent-only rule in this report (C7, the §2.3 "ink/tint" roles, §3.2 band and hatch colors, §3.4 chip fill, §4.1–4.2, §6 copy, §11 items 1 and 3, §12 items 11–14) was replaced by `UI_COLOR_CONFIRMATION_DESIGN.md` §1 and is now implemented: a component's one effective palette entry (the selected color, else the type default) drives node fill **and** ink, including the logo, type label and Orchestrator band. The sections named above are updated to the shipped behavior; `UI_V2_REFINEMENT.md` §1's "accents only on the component border and details" describes the earlier v2 build. Persisted IDs, schema and migration (§5) are unchanged.
**Visual reference:** n8n's editor, used only for its *look*: a light dotted canvas, cards with distinct silhouettes, concrete connection ports on the node outline, and curved connectors. No screenshot was present in this worktree; the decisions below rely only on the reference traits named in the brief. Nothing about n8n's *semantics* (inputs vs. outputs, execution, data items) is adopted.

---

## 0. Non-negotiable product constraints (read first)

The canvas documents an architecture. It is **not** an executable workflow. Every v2 decision must keep these rules:

| # | Constraint | How v2 keeps it |
|---|---|---|
| C1 | Arrow direction keeps the existing semantic: **source → target**, read as "Source {verb} target" (TD 3.2, 6.4). | The arrowhead stays at the stored `targetId` end only. Ports never change which end is the source or target. |
| C2 | **Directed** relationship types keep a **target arrowhead**. | Same rule as v1. `markerEnd` is still set only for `direction === "directed"`. |
| C3 | **Undirected** relationships have **no arrowheads**. | Dashed stroke, identical terminal rings at both ends, no start or end marker. |
| C4 | No path implies execution order or data flow. | Ports are not typed: there are no input or output ports, and no "left = in, right = out" convention. Every port can hold either end of any relationship. Edges never animate. There are no moving dots, flow particles, gradients, tapering, step numbers, "+" add-next buttons on ports, run or item counters, or "trigger" badges. Curves are symmetric in shape; only the arrowhead tells you the direction. |
| C5 | Agent and Orchestrator **share one base silhouette**. The Orchestrator gets a **distinct marker that is not a shape**. | Both use the rounded rectangle. The Orchestrator adds a solid ink header band, a hub icon and the "ORCHESTRATOR" label (§3.2). |
| C6 | Tool and External System have **clearly different silhouettes**. | Tool is a chamfered octagon. External System is a dashed, hatched parallelogram (§3.2). |
| C7 | A component's selected color (`accent`) is its **one palette entry**: it drives the node fill and every ink part, overriding the fixed type colors. Without a selection the type default applies. Groups stay neutral. | §4 (as built, `UI_COLOR_CONFIRMATION_DESIGN.md` §1). Groups have no `accent` field and no picker. |
| C8 | Color is never the only cue (TD 12). | The silhouette, details, icon and type label identify a type and never change with the color. The color carries no meaning and is not announced, exported to Markdown, or used in aria-labels. |

---

## 1. Visual direction

"Ported canvas": a lighter, cooler-neutral dotted sheet, white-edged cards with a distinct outline per type, small round ports that appear on the outline when you need them, and soft cubic connectors that end in small terminal rings. It keeps v1's "shape before color", "ink, not glow" and spec-sheet type labels (UH §1). What changes is that ports become concrete and the type outlines become stronger.

**Kept from v1 unchanged:** typography (UH §3), spacing, radius and elevation tokens (UH §4), panel chrome, the focus ring (UH §9.1), the group interaction model (TD 6.5), edge labels as SVG text with the v1 label rules (TD 6.4), and no dark theme.

---

## 2. Tokens

### 2.1 Canvas (replaces UH §2.1 canvas rows and §2.4)

All ratios use the WCAG 2.x formula and were computed for this report.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--sa-color-canvas` | `#F7F6F3` (was `#F5F3EE`) | Canvas background; the PNG export `backgroundColor` (read from this token, as today) | — |
| `--sa-color-canvas-grid` | `#C9C4B8` (was `#DDD8CD`) | Dot grid: `<Background variant={Dots} gap={20} size={1.5} color=var(--sa-color-canvas-grid)>` | 1.61 on canvas (decorative) |
| `--sa-edge-stroke` | `#6B655B` (unchanged) | Edge stroke, arrowhead, terminal ring | 5.34 on canvas |
| `--sa-edge-stroke-hover` | `#1F1D1A` (unchanged) | Hovered edge | 15.6 |
| `--sa-edge-stroke-selected` | `var(--sa-color-accent)` (unchanged) | Selected edge | 6.34 |
| `--sa-edge-label-text` | `#3A3631` (unchanged) | Edge label text | 11.1 |
| `--sa-edge-label-bg` | `var(--sa-color-canvas)` | Label plate (follows the canvas so labels still "cut" the line) | — |
| `--sa-edge-terminal-fill` | `var(--sa-color-canvas)` | Inside of the terminal ring | — |
| `--sa-port-fill` | `#FFFFFF` | Port disc fill | — |
| `--sa-port-border` | `#6B655B` | Port disc ring at rest | 5.34 on canvas, 5.77 on white |
| `--sa-port-active` | `var(--sa-color-accent)` | Ring and fill of the hovered, snapped or dragging port | 6.34 on canvas |
| `--sa-port-invalid` | `var(--sa-color-danger)` | Connection line over an invalid target (unchanged v1 rule) | 6.6 |
| `--sa-group-border` | `#857F72` (unchanged) | Group outline | 3.68 on canvas |
| `--sa-group-fill` / `--sa-group-header-fill` | unchanged | Group body / header | decorative |
| `--sa-node-surface` | `#FFFFFF` | Icon chip plate, on every node and with every color | — |

The type ink and fill tokens (UH §2.3) are **unchanged**. Their contrast against the new canvas:

| Type | Ink on canvas | Ink on own fill | Text `#1F1D1A` on fill | Muted text on fill |
|---|---|---|---|---|
| Agent `#36597D` / `#EDF2F7` | 6.74 | 6.47 | 14.93 | 6.36 |
| Orchestrator `#1D3557` / `#E6ECF4` | 11.44 | 10.40 | 14.15 | 6.03 (white on band 12.36) |
| Tool `#875611` / `#FBF3E3` | 5.77 | 5.65 | 15.24 | 6.49 |
| Memory `#2E6A4C` / `#EBF4EE` | 5.92 | 5.70 | 14.98 | 6.38 |
| External `#57534C` / `#F1EFEA` | 7.07 | 6.65 | 14.63 | 6.23 |
| Decision `#6C3D74` / `#F5EEF6` | 7.60 | 7.21 | 14.77 | 6.29 |

### 2.2 Geometry constants (new `src/canvas/shapes.ts`, exported, unit-tested)

| Constant | Value | Meaning |
|---|---|---|
| `NODE_STROKE` | 1.5 | Silhouette stroke width (px) |
| `NODE_STROKE_HOVER` | 2.25 | Stroke width on hover |
| `ORCHESTRATOR_STROKE` | 2 | Orchestrator silhouette stroke |
| `ROUNDED_RADIUS` | 12 | Agent and Orchestrator corner radius |
| `OCTAGON_CHAMFER` | 12 | Tool corner cut (45°, 12 px on each axis) |
| `CYLINDER_CAP_RY` | `min(8, height / 7)` | Memory lid and base ellipse vertical radius |
| `PARALLELOGRAM_SKEW` | 14 | External System horizontal skew |
| `HEXAGON_POINT` | 20 | Decision point depth (left and right vertices) |
| `ORCHESTRATOR_BAND` | 24 | Header band height |
| `SELECTION_INFLATE` | 4 | Selection outline distance outside the silhouette |
| `PORT_RADIUS` | 5 | Port disc radius (10 px visual) |
| `PORT_HIT` | 24 | Port hit area (px square; WCAG 2.5.8) |
| `TERMINAL_RADIUS` | 3.5 | Edge terminal ring radius (stroke 1.5) |
| `ARROW_LENGTH` / `ARROW_HALF_WIDTH` | 10 / 4.5 | Unchanged from v1 `arrowheadGeometry` |
| `CURVE_MIN` / `CURVE_MAX` / `CURVE_FACTOR` | 32 / 120 / 0.4 | Control-point distance `clamp(0.4 · chord, 32, 120)` |
| `CURVE_BOW_MAX` | 24 | Largest minimum bow (px), perpendicular to the chord; every curve bends at least this much unless it already does (§8.5 step 5) |
| `CURVE_BOW_FACTOR` | 0.15 | Bow target as a fraction of the chord length |
| `CURVE_BOW_MIN_CHORD` | 24 | Below this chord length no bow is added (touching or overlapping nodes; §8.5 step 10) |
| `PARALLEL_STEP` | 20 (was 12) | Perpendicular bulge step for parallel relationships |
| `LABEL_PAD_X` / `LABEL_PAD_Y` | 6 / 2 | Edge label plate padding (px); equals the v1 `labelBgPadding` |
| `LABEL_LINE_HEIGHT` | 15 | Baseline spacing of a two-line label (px) |
| `LABEL_CLEARANCE` | 4 | Gap kept between a label plate and any obstacle (px); §8.5 "Labels" |
| `CONNECTION_RADIUS` | 20 | React Flow `connectionRadius` (snaps to a port within 20 px) |

### 2.3 Accent palette (16 fixed IDs)

Each accent has an **ink** (silhouette stroke, icon chip ring and glyph, type label, Memory rim, External hatch, Orchestrator band) and a **tint** (the node fill). As built, the accent is the component's one palette entry (C7, §4); the UI calls it "Color". The IDs are the persisted values; they are stable and never renamed or recolored in place (see §5.4). CSS tokens: `--sa-accent-{id}-ink`, `--sa-accent-{id}-tint`. The TS source of truth is `ACCENT_IDS` and `ACCENTS` in `src/domain/constants.ts`, in this order (the picker uses the same order).

| # | ID | Display name | Ink | Tint | Ink : canvas | Ink : lowest of (white, canvas, every type fill) | Ink : own tint (type label, ≥ 4.5) |
|---|---|---|---|---|---|---|---|
| 1 | `tomato` | Tomato | `#B23A2B` | `#FADCD6` | 5.50 | 5.00 | 4.61 |
| 2 | `coral` | Coral | `#A8452F` | `#FADFD2` | 5.46 | 4.97 | 4.65 |
| 3 | `tangerine` | Tangerine | `#9A4D10` | `#FBE2C8` | 5.64 | 5.13 | 4.88 |
| 4 | `mustard` | Mustard | `#7D5F00` | `#F6E7B0` | 5.54 | 5.04 | 4.84 |
| 5 | `olive` | Olive | `#5F6512` | `#E9EBC2` | 5.79 | 5.26 | 5.10 |
| 6 | `fern` | Fern | `#3F6B2A` | `#D9EBCF` | 5.80 | 5.28 | 5.00 |
| 7 | `mint` | Mint | `#1F6E55` | `#CDEDE0` | 5.68 | 5.17 | 4.91 |
| 8 | `teal` | Teal | `#106A6E` | `#C9EAEA` | 5.87 | 5.34 | 4.97 |
| 9 | `lagoon` | Lagoon | `#0F6584` | `#CBE6F2` | 6.04 | 5.50 | 5.02 |
| 10 | `sky` | Sky | `#2C5F9E` | `#D3E3F6` | 6.00 | 5.46 | 4.97 |
| 11 | `denim` | Denim | `#3B4F8F` | `#D9DEF2` | 7.19 | 6.54 | 5.81 |
| 12 | `indigo` | Indigo | `#4F46A5` | `#DFDCF5` | 7.06 | 6.42 | 5.70 |
| 13 | `lavender` | Lavender | `#6A4AA0` | `#E6DCF4` | 6.27 | 5.70 | 5.13 |
| 14 | `plum` | Plum | `#86397E` | `#F1D8EC` | 6.70 | 6.09 | 5.44 |
| 15 | `rose` | Rose | `#A3355A` | `#F8D6E1` | 6.05 | 5.50 | 4.88 |
| 16 | `cocoa` | Cocoa | `#6E4B35` | `#EBDDD1` | 7.14 | 6.49 | 5.81 |

**WCAG non-text contrast (1.4.11).** Every ink is ≥ 4.97:1 against the canvas, the inspector surface and every type fill, and ≥ 4.61:1 against its own tint (Tomato's tint was changed from `#F9D9D3`, unrounded 4.4985:1, to `#FADCD6` so the type label passes 4.5:1). Every palette entry, type defaults included, also passes ink:white ≥ 4.5 (logo on the white chip, white Orchestrator band text), text and muted text on the fill ≥ 4.5 and selection outline on the fill ≥ 3; `src/domain/palette.test.ts` checks all of them on the unrounded values. Tints are decorative fills (1.02–1.24:1 on the canvas) and always sit inside an ink stroke. The only text in the ink is the type label; name and description keep the neutral text colors.

**Distinguishability.** The 16 hues are not designed to be told apart by color alone (16 categorical hues cannot be). That is acceptable because accents carry no product meaning (C8). The picker shows each name in text (§6).

**Selection versus accent.** Some inks (sky, denim, indigo, lavender) are near the cobalt selection accent `#2650C8` (1.01–1.13:1). Selection is therefore never shown by color alone. It is a separate outline 4 px outside the silhouette plus an 8 px halo (§7.1), so an accented node and a selected node look different in grayscale too.

---

## 3. Component node silhouettes

### 3.1 Rendering technique

Each component node draws its silhouette as **one inline SVG** that fills the node box (`<svg class="sa-node__shape" width={w} height={h} overflow="visible" aria-hidden>`). It replaces the v1 CSS border, `border-radius`, `::before` lid, `box-shadow` inset bar and `clip-path` frame. Inside the SVG, in paint order:

1. `path.sa-node__halo`: the inflated outline (§7.1). Visible only when selected; hidden while exporting.
2. `path.sa-node__selection`: the inflated outline, stroked. Visible only when selected; hidden while exporting.
3. `path.sa-node__body`: the silhouette, `fill: var(--sa-node-fill)`, `stroke: var(--sa-node-border)`, `stroke-width: NODE_STROKE`, `stroke-linejoin: round`.
4. Type details (`path.sa-node__detail`): the cylinder rim, the External hatch, the Orchestrator band. Their paths come from `shapes.ts`.

**No `url(#…)` references.** No `<pattern>`, `<clipPath>`, `<marker>` or gradient. v1 inlined arrowheads for PNG fidelity (TD 6.4), and v2 keeps that rule. The External hatch is computed as explicit line segments clipped mathematically to the convex parallelogram (`hatchSegments(w, h, step = 8)`), so the export needs no ID resolution and IDs cannot collide between nodes.

The HTML content (type row, name, description) sits above the SVG and is inset per shape (§3.3). The React Flow node box (`width × height`) stays a rectangle for drag, box selection, `NodeResizer` and the minimap. Clicking a transparent corner outside the silhouette (at most 20 px, at hexagon points) still hits the node. That is accepted; see §10 open decision D7.

`shapes.ts` is pure and exports:

```ts
export type ShapeKind = "rounded" | "octagon" | "cylinder" | "parallelogram" | "hexagon";
export type PortSide = "top" | "right" | "bottom" | "left";
export const PORT_SIDES: readonly PortSide[] = ["top", "right", "bottom", "left"];

export function shapeKindFor(component: Pick<Component, "type">): ShapeKind;
export function shapePath(kind: ShapeKind, w: number, h: number, inflate?: number): string; // SVG d, box-local
export function shapeDetails(component: Component, w: number, h: number): string[];          // detail paths
export function portAnchor(kind: ShapeKind, w: number, h: number, side: PortSide): Position;  // box-local, on outline
export function portNormal(side: PortSide): Position;                                         // unit, axis-aligned
export function contentInsets(component: Component): { top: number; right: number; bottom: number; left: number };
export function hatchSegments(w: number, h: number, step: number): string;
```

`inflate` grows the outline evenly. It is applied to the box (`-inflate` origin, `w + 2·inflate`, `h + 2·inflate`) and to radius-type parameters (radius, chamfer and cap `ry` grow by `inflate`). Skew and point depth are scaled so that edges stay parallel to the base outline.

### 3.2 Per-type shape matrix (implementation-ready)

The coordinates are box-local: `(0, 0)` is the top-left of the node box, `w × h` is the effective size (TD 3.3 defaults and `MIN_SIZE` and `MAX_SIZE` unchanged). The paths are written for `inflate = 0`.

| Type (`data-type` / `data-subtype`) | `ShapeKind` | Silhouette path | Type details (non-color cues) | Ports (anchor on outline) | Icon / label |
|---|---|---|---|---|---|
| **Agent** (`agent`) | `rounded` | Rounded rectangle, radius 12: `M12,0 H w-12 A12,12 0 0 1 w,12 V h-12 A12,12 0 0 1 w-12,h H12 A12,12 0 0 1 0,h-12 V12 A12,12 0 0 1 12,0 Z` | None (baseline) | top `(w/2, 0)`, right `(w, h/2)`, bottom `(w/2, h)`, left `(0, h/2)` | person-in-circle / "AGENT" |
| **Orchestrator** (`agent` + `orchestrator`) | `rounded` (**same as Agent**, C5) | Same path; stroke `ORCHESTRATOR_STROKE` 2 px | **Non-shape marker:** a solid header band 24 px high, filled with the node's effective ink (`--sa-node-ink`: the Orchestrator ink by default, the selected color's ink otherwise) and clipped to the top of the rounded rectangle (`M0,24 V12 A12,12 0 0 1 12,0 H w-12 A12,12 0 0 1 w,12 V24 Z`). The type row sits inside the band in white (12.36:1 on the default ink, ≥ 5.90:1 on every color ink). It also uses the hub icon and the "ORCHESTRATOR" label. | Same as Agent | hub / "ORCHESTRATOR" |
| **Tool** (`tool`) | `octagon` | Chamfered octagon, 12 px cuts: `M12,0 H w-12 L w,12 V h-12 L w-12,h H12 L0,h-12 V12 Z` | The v1 left ink bar is removed (the silhouette carries the cue now) | top `(w/2, 0)`, right `(w, h/2)`, bottom `(w/2, h)`, left `(0, h/2)` | wrench / "TOOL" |
| **Memory / Data Store** (`memory`) | `cylinder` | Cylinder seen from the side, `ry = CYLINDER_CAP_RY`: `M0,ry A w/2,ry 0 0 1 w,ry V h-ry A w/2,ry 0 0 1 0,h-ry Z` | **Lid rim:** a second arc `M0,ry A w/2,ry 0 0 0 w,ry` stroked 1 px in the node border color (the front of the lid) | top `(w/2, 0)` (apex of the lid), right `(w, h/2)`, bottom `(w/2, h)` (apex of the base), left `(0, h/2)` | stacked disks / "DATA STORE" |
| **External System** (`external_system`) | `parallelogram` | Right-leaning parallelogram, skew `s = 14`: `M s,0 H w L w-s,h H0 Z` | **Dashed** stroke `stroke-dasharray: 6 4` ("outside the modeled boundary", PC 14) **plus** a 45° hatch: `hatchSegments(w, h, 8)` stroked 1 px in the node ink at `stroke-opacity: 0.16` | top `(w/2, 0)`, right `(w - s/2, h/2)`, bottom `(w/2, h)`, left `(s/2, h/2)`. The side anchors are the midpoints of the slanted sides. | box-with-arrow / "EXTERNAL" |
| **Decision / Routing Rule** (`decision`) | `hexagon` | Horizontal hexagon, point depth `p = 20`: `M p,0 H w-p L w,h/2 L w-p,h H p L0,h/2 Z` (a readable nod to the flowchart diamond) | None beyond the pointed sides | top `(w/2, 0)`, right `(w, h/2)` (vertex), bottom `(w/2, h)`, left `(0, h/2)` (vertex) | fork / "DECISION" |
| **Group** (container, not a component) | n/a (not in `shapes.ts`) | v1 group outline unchanged: 1.5 px dashed (8 4) `--sa-group-border`, radius 8 | v1 header unchanged | **None.** Groups are never relationship endpoints (TD 6.3). | grip / name + member count |

**Why these shapes are distinct.** Rounded corners (Agent and Orchestrator), straight 45° cuts on all four corners (Tool), curved top and bottom (Memory), slanted sides (External), and pointed sides with a flat top and bottom (Decision) remain distinct at 50 % zoom, in grayscale and in the minimap-free PNG. Tool (octagon, solid stroke, upright) and External (parallelogram, dashed, hatched) differ in outline, stroke style and fill texture (C6).

**v1 → v2 mapping note.** The v1 Decision used chamfered corners. In v2, chamfers belong to Tool and Decision becomes the hexagon. Users who learned v1 must re-learn this one cue. Icons and labels are unchanged, so the cost is low (see D6).

### 3.3 Content insets (HTML content above the SVG)

`contentInsets(component)` returns padding values in px. The shape geometry guarantees that the text never crosses the outline at any size within `MIN_SIZE` (160 × 56) to `MAX_SIZE` (480 × 320).

| Shape | top | right | bottom | left | Notes |
|---|---|---|---|---|---|
| Agent `rounded` | 10 | 12 | 8 | 12 | Same as v1 |
| Orchestrator `rounded` | 0 | 12 | 6 | 12 | The type row is the 24 px band. The name starts 4 px below it. |
| Tool `octagon` | 10 | 14 | 8 | 14 | The cut is ≤ 2 px into the first text row |
| Memory `cylinder` | `2·ry + 4` (20 at default size) | 12 | `ry + 4` | 12 | Text starts below the lid rim |
| External `parallelogram` | 10 | 26 | 8 | 26 | `s + 12`, symmetric |
| Decision `hexagon` | 10 | 28 | 8 | 28 | `p + 8`. At `MIN_SIZE` the slanted edge at the first text row is ≤ 13 px from the box. |

### 3.4 Node anatomy (unchanged from v1 except where noted)

Type row: a 24 × 24 **icon chip** (new) followed by the type label. The chip is a 6 px-radius square, 1 px stroke in the node border color, with a 16 px glyph centered in it. Then the name (`--sa-text-md`, one line, ellipsis) and the optional description (`--sa-text-xs` muted, at most 2 lines). Nothing else appears on a node. The chip fill is always `--sa-node-surface` (white) and the ring and glyph are the node's effective ink. In the Orchestrator band the chip is omitted and the glyph is white, as in v1.

---

## 4. Node styling variables and the color rule (as built)

### 4.1 CSS custom properties per node

`ComponentNode` sets `data-type`, `data-subtype`, **`data-palette="{entry}"`** = `effectivePaletteId(component)` (`src/domain/palette.ts`: the accent when valid, else `type-agent`, `type-orchestrator`, `type-tool`, `type-memory`, `type-external` or `type-decision`) and, only when an accent is set, `data-accent` (kept for tests; no CSS rule reads it). One `[data-palette]` rule per entry in `tokens.css` sets `--sa-palette-ink` and `--sa-palette-fill`; `.sa-node` is the only rule that maps them, and type and subtype rules set geometry only (for example the Orchestrator's 2 px stroke). CSS resolves:

| Variable or part | Value (type default or selected color) |
|---|---|
| `--sa-node-fill` (silhouette body) | entry fill (type fill, or the color's tint) |
| `--sa-node-border` (silhouette stroke) | entry ink |
| `--sa-node-chip-fill` | `--sa-node-surface` (white), always |
| `--sa-node-chip-ink` (icon glyph, chip ring) | entry ink |
| `--sa-node-label-ink` (type label text) | entry ink |
| Name and description text | `--sa-color-text` / `--sa-color-text-muted`, unchanged |
| Lid rim (Memory) | entry ink |
| External hatch | entry ink at `stroke-opacity: 0.16` |
| Orchestrator band | entry ink; its type row stays white |

The fallback when no entry applies is the neutral External pair. **Never** derive a CSS selector or class from user text (TD 3.4); `data-palette` and `data-accent` take only validated IDs.

### 4.2 Where a palette entry appears (testable)

- On a component node: fill, stroke, chip ring and glyph, type label, Memory rim, External hatch and Orchestrator band, all from the same entry. A selected color therefore overrides the type colors on every type.
- Outside the node: the picker swatches (§6) and the component inspector header glyph and label (effective entry, matching the node); the palette panel item icons use their `type-*` entry because they represent types.
- Never: edges, ports, terminals, groups, selection and focus, the minimap or app chrome.
- Type cues never change with the color: `data-shape`, the `[data-detail]` set, the dash pattern, the icon and the type label are identical with no color and with each of the 16 colors (`ComponentNode.test.tsx`).

### 4.3 Groups stay neutral

`Group` gets no `accent` field. `GroupNode` sets no `data-accent`. The group inspector shows no Appearance section. If an imported file puts an `accent` key on a group, the default Zod strip removes it silently (current behavior for unknown keys).

---

## 5. Data model and persistence

### 5.1 Component accent field

```ts
// src/domain/constants.ts
export const ACCENT_IDS = [
  "tomato", "coral", "tangerine", "mustard", "olive", "fern", "mint", "teal",
  "lagoon", "sky", "denim", "indigo", "lavender", "plum", "rose", "cocoa",
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const ACCENTS: Record<AccentId, { label: string; ink: string; tint: string }>; // §2.3 values

// src/domain/types.ts — Component
accent?: AccentId; // absent = type default. "default" is never written.
```

- **Serialization (TD 3.7):** `serializeComponent` emits `accent` right **after `size`** and before `properties`, only when it is defined. This keeps the output byte-stable and diff-friendly.
- **Validation:** the shape schema accepts `accent: text(64).optional()`, kept as a string just like `subtype`. Semantic validation adds **`E_INVALID_ACCENT`**: "Component {id}: accent must be one of {ACCENT_IDS joined by ', '}." An unknown ID makes the import fail with a listed issue, which is consistent with `storeKind`/`accessScope`.
- **Command:** `{ kind: "setComponentAccent"; ids: string[]; accent: AccentId | undefined }`. This is **one** undo entry labelled "Change color". It does nothing if no value changes. It throws the existing `E_COMPONENT_NOT_FOUND` for unknown IDs and for group IDs (a group is not a component), and `E_INVALID_ACCENT` for an accent outside `ACCENT_IDS`. The v2 UI dispatches it with one ID; the array form keeps multi-selection possible later (D2).
- **Duplicate** (`duplicateComponents`) copies `accent`. **Retype** does not exist for components.
- **Markdown export (TD 9.3):** `accent` is **not** emitted, because it is presentation, not architecture. **JSON export:** emitted as stored. **aria-labels:** unchanged, with no color names.

### 5.2 Relationship port pins (no schema change)

Pinned ports go in the existing open `relationship.visual` record, which TD 3.1 already preserves verbatim:

```json
"visual": { "ports": { "source": "right", "target": "left" } }
```

- Both keys are optional. An absent key means **automatic** for that end (§8.3).
- Readers use a type guard (`readPortPins(visual): { source?: PortSide; target?: PortSide }`). A value that is not one of `top|right|bottom|left` counts as automatic and is **preserved verbatim** (never rewritten unless the user changes the pins).
- A new command `{ kind: "setRelationshipPorts"; id: string; ports: { source?: PortSide; target?: PortSide } | null }` (undo label "Reset relationship ports") replaces only `visual.ports` and keeps other `visual` keys. `null` deletes `ports`, and an empty `visual` becomes `undefined`. It throws the existing `E_RELATIONSHIP_NOT_FOUND` for an unknown ID and a new `E_INVALID_PORT` for a side outside `top|right|bottom|left`.
- `addRelationship` carries pins from the pointer flow inside the same command (one undo entry).
- `reverseRelationship` (directed generic only) **swaps** `ports.source` and `ports.target` together with the IDs, so the line keeps its physical attachment and only the arrowhead moves.
- `retypeRelationship` and `setRelationshipDirection` keep `visual` unchanged.
- Older builds already ignore and preserve `visual`, so port pins are fully backward compatible and need no schema bump.

### 5.3 Schema version and migration (recommended: Option A)

| Option | What happens | Pros | Cons |
|---|---|---|---|
| **A (recommended): bump `SCHEMA_VERSION` to 2, identity migration `MIGRATIONS[1] = (raw) => raw`, always write 2** | v1 files and IndexedDB records open unchanged and are rewritten as v2 on the next save. The existing opportunistic rewrite in `repository.ts` also rewrites them on first read. | Older builds **reject** v2 files with the existing `E_SCHEMA_VERSION_UNSUPPORTED` message instead of silently losing data. Uses the migration hook TD 3.6 already provides. The written version is the same for every file. | After upgrading, an older build cannot open *any* record or file saved by v2, even ones without accents. A rolled-back build shows those IndexedDB rows as damaged (the data stays intact, is not deleted, and opens again after a roll-forward). |
| B: stay at v1, add the optional field | Fully additive | Older builds open everything | **Silent data loss:** the older build's Zod schema strips the unknown `accent` key on parse, and the next autosave or export writes the file without colors. No warning is shown. |
| C: minimum-version writing (write 1 when no component has an accent, else 2) | Like A, but only colored files bump | Best compatibility | The version depends on the content. `repository.ts` rewrite logic (`oldVersion !== SCHEMA_VERSION`) and `toArchitectureFile` need special cases. Removing the last accent downgrades the file. More test surface. |

**Recommendation: Option A.** The app is a static local-first build, so mixed-version users are rare (two deployments, or a shared JSON file). Silent loss of user-chosen data (B) is worse than a clear "unsupported version" message (A). Option C is the fallback if the coordinator needs files to stay openable in older builds (D1).

**Option A implementation checklist:**

1. `types.ts`: `SCHEMA_VERSION = 2`. `ArchitectureFile.schemaVersion: 2`.
2. `serialize.ts`: write `SCHEMA_VERSION`; do not hard-code `1` (it is hard-coded today at `toArchitectureFile`).
3. `migrate.ts`: `MIGRATIONS[1] = (raw) => raw`, with a comment that v2 only *adds* the optional `component.accent`.
4. `schema.ts`: `schemaVersion: z.literal(SCHEMA_VERSION)` stays as is. Add the `accent` shape field.
5. Tests: a v1 fixture (`lead-hunting-engine.json`, still `schemaVersion: 1`) imports and re-exports as `schemaVersion: 2` with identical content otherwise. A v2 file with `accent` round-trips byte-stably. A version 3 file gives `E_SCHEMA_VERSION_UNSUPPORTED`. A stored v1 IndexedDB record opens and is rewritten as v2.
6. **Not a destructive migration:** content is unchanged and nothing is deleted. It is still rollback-incompatible, so record it in the release notes.

### 5.4 Palette stability rules

- An ID is never removed, renamed or recolored in a way that changes its hue family. Small contrast fixes to the hex values are allowed when every check in §2.3 still passes.
- Adding an ID changes what older v2 builds accept. That means a **schema bump** (v3) with an identity migration, so older builds reject the file instead of failing `E_INVALID_ACCENT`.

---

## 6. Color picker (component inspector)

**Placement:** a new collapsible **Appearance** section, last in the component inspector for every component type (after the type-specific fields and before the read-only Relationships list). It does not appear in the group, relationship, architecture or multi-selection inspectors (D2).

**Structure:** a native `<fieldset>` with `<legend>Color</legend>`, containing **17 native `<input type="radio" name="accent-{componentId}">`**: "Type default" first, then the 16 accents in `ACCENT_IDS` order. Each radio has a visually hidden `<label>` with the display name ("Tomato") and `title` set to the same name. Native radios give arrow-key movement, a single tab stop and correct `checked` semantics without custom ARIA.

**Layout:** "Type default" is a full-width row (a 28 px swatch showing the type fill with a type-ink ring, followed by the visible text "Type default"). Below it is a 4 × 4 grid of 28 × 28 px swatches with 8 px gaps (above the 24 px WCAG 2.5.8 minimum). A caption under the grid always shows the current value as text: "Color: Tomato" or "Color: Type default" (`--sa-text-xs`, muted, with `aria-live` off because the radio already announces it).

**Swatch rendering:** each swatch sets `data-palette` (the accent ID, or the component's `type-*` entry for "Type default"), so it reads the same CSS entry as the node: a 6 px-radius square filled with the entry **fill**, plus a 2 px inner ring in the **ink**. The swatch boundary is the ink ring (≥ 4.97:1 on the white panel), so it passes 1.4.11 even though the tint alone is about 1.2:1.

**States:**

| State | Visual | Non-color cue |
|---|---|---|
| Rest | tint + 2 px ink ring | — |
| Hover | outer 1 px `--sa-color-border-strong` ring, 2 px gap | ring appears |
| Checked | 16 px check glyph centered in the ink color, **plus** a 2 px `--sa-color-text` outer ring with a 2 px gap; caption updates | check glyph and outer ring |
| Keyboard focus | standard focus ring (UH §9.1: graphite double ring) around the swatch, outside the checked ring | double ring |
| Checked + focus | both rings; the focus ring is outermost | — |
| Disabled | not used (the picker is never disabled) | — |

**Behavior:** a change event dispatches `setComponentAccent` immediately (no Apply button). Each change is one undo entry; arrow-key browsing creates one entry per step (see D4). Choosing "Type default" dispatches `accent: undefined`. Undo and redo update the checked radio through the store subscription. Nothing is announced in the LiveRegion, because the radio itself announces the change.

---

## 7. Interaction states (canvas)

### 7.1 Component nodes

| State | Treatment | Non-color cue |
|---|---|---|
| Rest | silhouette stroke 1.5 px in `--sa-node-border`; ports hidden | silhouette, icon, label |
| Hover | stroke 2.25 px, same color (v1 darkened the border to text color; v2 thickens it so the accent stays visible); all 4 ports appear | thicker stroke, ports |
| Selected | `sa-node__selection`: the outline inflated by 4 px, stroked 2 px `--sa-color-accent`. `sa-node__halo`: the same inflated outline, stroked 8 px `--sa-color-accent-soft`, painted under the body. Ports visible. `NodeResizer` shown (box handles, unchanged). | second outline that follows the silhouette, plus the halo |
| Keyboard focus | v1 focus ring on the **rectangular** wrapper (`.react-flow__node:focus-visible`), outside the selection outline | rectangular double ring, distinct from the shape-following selection |
| Dragging | `cursor: grabbing`; no shadow and no scale (v1) | cursor |
| Connection source (a drag started from one of its ports) | ports stay visible; the source port is filled `--sa-port-active` | filled port |
| Connection candidate (another component while a connection drag is active) | its 4 ports are shown on **every** component | ports appear |
| Valid target under the pointer | stroke 2.25 px `--sa-port-active`; the port that would be used (snapped, or the automatic choice, §8.2) is filled `--sa-port-active` and scaled 1.2× | filled port, thicker stroke |
| Invalid target (pane, group, same node) | connection line `--sa-port-invalid`, `cursor: not-allowed` (v1) | cursor; no picker on release |
| Exporting (`.sa-exporting`) | rest style; selection, halo, ports, resize handles and focus ring hidden | — |

### 7.2 Ports (React Flow `Handle`, `type="source"`, Loose mode, v1 IDs `top|right|bottom|left`)

- They are positioned **absolutely at `portAnchor(...)`** with `left`/`top` in px and `transform: translate(-50%, -50%)`, not by React Flow's side-midpoint CSS. This places the parallelogram side ports on the slanted outline.
- Visual: a 10 px disc, white fill, 1.5 px `--sa-port-border` ring. The hit area is 24 × 24 (`::after`, inset −7 px).
- Visibility: hidden at rest. Shown on node hover, `:focus-within`, selection, and on all components while any connection drag is active (`[data-connecting]` on `.sa-canvas`). They are excluded from PNG export by the existing `exportFilter`.
- Hover over a port: ring and fill `--sa-port-active`, `cursor: crosshair`.
- Ports are **not** keyboard tab stops (unchanged from v1). The Connect dialog is the keyboard path (§8.4).
- Ports have no in/out role, no count limit and no order (C4).

### 7.3 Edges

| State | Stroke | Arrowhead (directed only) | Terminal rings | Label |
|---|---|---|---|---|
| Rest | 1.5 px `--sa-edge-stroke`; dashed `6 4` if undirected | filled `--sa-edge-stroke` | 1.5 px `--sa-edge-stroke` ring, `--sa-edge-terminal-fill` inside | v1 |
| Hover | `--sa-edge-stroke-hover` | hover color | hover color | v1 |
| Selected | `--sa-edge-stroke-selected`, 2.5 px | accent | accent | v1 (1 px accent plate border) |
| Keyboard focus | v1 focus treatment around the label plate | — | — | — |
| Exporting | rest | rest | rest (kept: part of the edge SVG) | rest |

The path never animates (C4). React Flow's `animated` stays `false`.

---

## 8. Connections

### 8.1 Pointer connection (replaces the TD 6.3 "Connect (pointer)" bullet; picker behavior unchanged)

1. **Start:** press on a port of component S. The pressed port's side becomes `sourcePort` (always pinned).
2. **Drag:** the ports of every component appear. The connection line is a **preview cubic** (§8.5 formula) from S's anchor along S's port normal to the pointer. When React Flow snaps to a port within `CONNECTION_RADIUS` 20 px, the preview is the undirected §8.5 curve from S's pressed port to that port's anchor (the same bow the final edge will have, no parallel offset, no arrowhead), so the user sees the curve they will get; otherwise the end tangent points straight at the pointer. The line is dashed `6 4`, 1.5 px `--sa-port-active` (danger over invalid targets, v1), with the v1 end dot.
3. **Release on a port of T** (`connection.targetHandle` set, T ≠ S, T is a component): `targetPort` = that side (pinned).
4. **Release on T's body** (not near a port): `targetPort` stays **automatic** (not stored). The highlighted port during the hover is the automatic choice from §8.3, so what the user saw is what they get.
5. **Release elsewhere:** nothing happens (v1: no picker).
6. The **RelationshipTypePicker** opens exactly as in v1. Choosing a type dispatches one `addRelationship` with `visual: { ports: { source, target? } }`. Cancel creates nothing.

The release side never changes the semantics: the dragged-from node is **always the source**, as in v1. Port choice is purely visual.

### 8.2 Snapping and highlight rule while hovering a target body

The highlighted port is `autoPortFor(T, pinnedSourceAnchor)` (§8.3 rule B), so the body-drop preview and the final render match.

### 8.3 Deterministic automatic port selection (`autoPorts`, pure, in `shapes.ts` or `ports.ts`)

This rule applies to every relationship end without a valid pin: all Connect-dialog relationships, imported v1 relationships, body drops, and pins that were reset.

**Rule A (both ends automatic).** Input: absolute node rects S and T and both IDs.

```
gapX = max(T.x - (S.x + S.w), S.x - (T.x + T.w))
gapY = max(T.y - (S.y + S.h), S.y - (T.y + T.h))
dx = centerX(T) - centerX(S);   dy = centerY(T) - centerY(S)
canonicalForward = sourceId < targetId          // tie-breaker only

if gapX >= gapY:                                // horizontal separation wins ties
    forward = dx > 0 || (dx == 0 && canonicalForward)
    return forward ? { source: "right", target: "left" } : { source: "left", target: "right" }
else:
    forward = dy > 0 || (dy == 0 && canonicalForward)
    return forward ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" }
```

**Properties (unit-test each one):**

- Deterministic: it uses only geometry and IDs. It never uses array order, time or pointer history.
- **Order-independent physically:** swapping source and target (for example, the stored order of an undirected relationship) attaches to the same physical sides. This is needed for C4: stored order must not show up visually.
- The ID tie-breaker applies only to exact center alignment.

**Rule B (one end pinned).** The automatic end uses the port of its node whose anchor is nearest (Euclidean) to the pinned end's anchor. Ties resolve in the order `right, bottom, left, top`.

**Connect dialog (§8.4) stores no pins.** It always uses Rule A at render time, so its relationships re-route when nodes move.

### 8.4 Connect dialog (keyboard path)

The behavior is unchanged (TD 6.3, `ConnectDialog.tsx`). Add one static note line under the direction note: "Ports are chosen automatically from the components' positions." Port pinning by keyboard is out of scope for v2 (D3).

### 8.5 Curved path geometry (replaces TD 6.4 "floating" and "straight" rules)

For each relationship:

1. Resolve the sides (pins or §8.3). Anchors `A_s`, `A_t` are the absolute node position plus `portAnchor(kind, w, h, side)`. Normals `n_s`, `n_t` come from `portNormal(side)` (top `(0,-1)`, right `(1,0)`, bottom `(0,1)`, left `(-1,0)`).
2. **Terminal rings:** circles of radius `TERMINAL_RADIUS` centered on `A_s` and `A_t`, drawn on **both** ends of **every** edge. They are symmetric, so they add no direction cue.
3. **Line start:** `P0 = A_s + n_s · TERMINAL_RADIUS` (the outer edge of the ring).
4. **Provisional end:** directed `E = A_t + n_t · (TERMINAL_RADIUS + 0.75 + ARROW_LENGTH − 2)`; undirected `E = A_t + n_t · TERMINAL_RADIUS`. Chord `c = E − P0`, `ℓ = |c|`.
5. **Controls and minimum bow:** `d = clamp(CURVE_FACTOR · ℓ, CURVE_MIN, CURVE_MAX)`, base controls `C1 = P0 + n_s · d`, `C2 = E + n_t · d`. Bow normal `b̂` is geometric (independent of IDs and stored order): with `ĉ = c/ℓ` and `p = (−ĉ.y, ĉ.x)`, a horizontal-dominant chord (`|ĉ.x| ≥ |ĉ.y|`, 45° counts as horizontal) takes `b̂ = ±p` with `b̂.y < 0` (bows up); otherwise `b̂ = ±p` with `b̂.x > 0` (bows right). If `ℓ < CURVE_BOW_MIN_CHORD`, skip the bow (`b̂ = (0, −1)` for the label rule, shift = parallel only). Otherwise the existing bend is `h = max(|(C1 − P0)·b̂|, |(C2 − P0)·b̂|)`, the bow target is `B = min(CURVE_BOW_MAX, CURVE_BOW_FACTOR · ℓ)`, and the bow is `β = max(0, B − h)`. The bow is largest for aligned facing ports and fades to 0 once the curve already bends by `B`, so it is continuous in node positions.
6. **Parallel shift and bow as one scalar on `b̂`:** `π = parallelOffset · (leftNormal(c) · b̂)` with `leftNormal(c) = (c.y, −c.x)/ℓ` (the V2 sign convention). Total shift `σ = π + sgn(π) · β` with `sgn(0) = +1`, so the bow always pushes away from the straight line on the side the parallel offset chose. `P1 = C1 + b̂ · σ`, `P2 = C2 + b̂ · σ`. For aligned facing ports, the totals for parallel indexes are `σ = β, +20 + β, −20 − β, …`, so no edge of a fan is straight and midpoints stay ≥ 15 px apart. When `h ≥ B` (nodes already offset), `β = 0` and the fan is exactly V2's.
7. **Path:** `M P0 C P1 P2 P3`, built by the pure `cubicEdgeGeometry(...)` in `floating.ts`. Do not use React Flow's `getBezierPath`; its curvature rules are not this specification.
8. **Undirected canonical order (step 0, before any arithmetic):** if the edge is undirected and `sourceId > targetId` (code-point order), the geometry swaps the anchors and normals, negates `parallelOffset`, and uses `1 − labelPosition`. Directed edges are never swapped. The `d` string, the terminal rings and the label point are therefore identical whatever the stored order, which also keeps the `6 4` dash phase identical. The DOM still exposes the stored roles on the terminal rings (`data-terminal`, `data-side`).
9. **Directed end and arrowhead:** tip `T = A_t + n_t · (TERMINAL_RADIUS + 0.75)` (the arrow tip touches the ring). The arrow direction is the unit `u = normalize(T − P2)` (or `−n_t` if that is zero), so `P3 = T − u · (ARROW_LENGTH − 2)` lies on the segment `P2 → T` and the curve's end tangent `P3 − P2` is **exactly parallel to `u`**. The arrowhead therefore never kinks against the curve. This replaces the V2 rule "end tangent equals `−n_t`", which broke on parallel edges whose shifted `P2` pulled the tangent away from `−n_t`. The triangle is `arrowheadGeometry(T, u)`, the same path format as before. Undirected: `P3 = E`, no arrowhead. The arrowhead enters at an angle of at most about 18°; its corners stay outside the target node box (U4 sweep), and the bow side is geometric, so it adds no direction cue.
10. **Degenerate cases:** if the chord is shorter than `CURVE_BOW_MIN_CHORD` (overlapping or touching nodes), no bow is added and only the parallel shift applies. For directed edges, the arrowhead is still drawn at `T`, because the direction must never disappear (C2). Coincident anchors give a zero-length path plus terminals and arrowhead; nothing is thrown.

**Labels (replaces the V2 "label at B(t)" rule).** The label point is `B(t)` with `t = labelPosition` after step 0. Its text is the v1 canvas label (40-character truncation). Placement is **collision-aware** and computed once per render for every edge (`layoutDiagramLabels` in `canvas/edgeLabels.ts`, from the live node rects), in ascending relationship `id` order. Each label is tried in this order, and the first free candidate wins:

- **Path, one line:** centered on `B(t)` for `t = clamp(baseT + k, 0.2, 0.8)`, `k = 0, +0.1, −0.1, +0.2, −0.2, +0.3, −0.3`.
- **Path, two lines:** the same `t` list with a two-line plate. The text splits at the first `" · "` (line 1 keeps the `·`), otherwise at the space nearest the middle code point (`floor(n/2)`; the earlier space wins ties).
- **Callout:** a one-line plate away from the curve, joined to `B(baseT)` by a leader. Directions are tried in the order `b̂, −b̂, up, down, left, right`, at radii `12 + 12·j` px for `j = 0…19`. The leader must not cross any node box.
- **Fallback:** a callout directly above `B(baseT)` that moves strictly upward past whatever it would cover. It always terminates, and a label is never dropped or hidden. Its leader may pass behind nodes, which the edge layer paints beneath (node fills are opaque).

Obstacles are the component boxes, group header strips, arrowhead boxes and terminal rings, and earlier plates, each inflated by `LABEL_CLEARANCE`. Edge paths are not obstacles. Plates are 12 px text, `(max line width + 2·LABEL_PAD_X) × (15·lines + 2·LABEL_PAD_Y)`. The leader is a 1 px `--sa-edge-stroke` dashed (`2 2`) line, with no markers, never animated and not pointer-active. A callout plate also has a 1 px `--sa-edge-stroke` border. Together these tell a callout apart from a node and from an undirected (`6 4`) edge. Labels are SVG, so they export.

**Boundary geometry rule:** endpoints are **port anchors on the silhouette** (§3.2), never the bounding-rectangle intersection. This fixes the v1 gap where floating edges stopped on the invisible box corner of chamfered Decision nodes. Every anchor must lie on the outline within 0.5 px; this is unit-tested by a point-on-segment or point-on-ellipse check for each `ShapeKind` and side, at `MIN_SIZE`, the default size and `MAX_SIZE`.

### 8.6 Relationship inspector: ports row

Add a read-only **Ports** row:

- Format: "{Source name}: {Right side | Automatic} · {Target name}: {Left side | Automatic}". Component names are used for both directed and undirected relationships. No arrow glyph is used, so undirected order is never shown as direction (TD 6.4).
- A **"Reset ports to automatic"** secondary button appears when any pin exists. It dispatches `setRelationshipPorts(id, null)` and then moves focus to the Ports row text.

---

## 9. PNG export implications (TD 10)

| Topic | Decision |
|---|---|
| Shapes | Inline SVG with CSS-variable fills and strokes, as v1 edges already use. They export with html-to-image 1.11.11. No `url(#…)` references (§3.1). |
| Dots | `<Background>` is outside `.react-flow__viewport`, so the PNG keeps a flat `--sa-color-canvas` background with no dots. This is intended: the dots are an editing aid. |
| Ports | Excluded (`exportFilter` already drops `.react-flow__handle`). |
| Terminals and arrowheads | Included (part of the edge SVG). The arrow tip touches the terminal ring, so with ports removed nothing appears detached. |
| Selection, halo, focus, resize | Hidden by `.sa-exporting` (extend the CSS rule to `.sa-node__selection`, `.sa-node__halo`). |
| Accents | Included as rendered. |
| **Export bounds (behavior change)** | `B` is the union, in flow coordinates, of: every component and group box, inflated by 1 px (the 2 px Orchestrator outline); for every edge, the **exact** bounding box of its cubic (per axis, the curve at `t = 0`, `1` and at the interior roots of `B′(t)`) inflated by 0.75 px, not the control-point hull; every arrowhead's three vertices and both terminal rings (`R + 0.75`); and every label plate and leader end point, from the same layout the canvas draws (§8.5 "Labels"). `CanvasApi.getDiagramBounds()` returns this union (`computeDiagramBounds` in `canvas/bounds.ts`), and `exportPng` uses it instead of `getNodesBounds()`. |
| **Export frame (behavior change)** | `PAD = 48`, `MAX = 4096`, `RATIO = 2`. `s = min(1, MAX / (B.width + 2·PAD), MAX / (B.height + 2·PAD))`, with no lower clamp. Image size is `ceil((B + 2·PAD)·s)` CSS px, capped at 4096. Transform `{ x: (PAD − B.x)·s, y: (PAD − B.y)·s, zoom: s }`. `getViewportForBounds` is **not** used: it fits with its own padding and zooms up to 2×, which removed the margin. The margin is `48·s` CSS px on the left and top (`96·s` device px at `pixelRatio: 2`); right and bottom are within one pixel of that. Implemented as `computeExportFrame` in `io/exportPng.ts`. |
| Baseline | Scenario H has no stored image baseline; its check is pixel-statistical and it passes. The export margin is checked by e2e E3 and E4 and by the reviewed fixture (§12 M2). |

---

## 10. Open decisions (each has a default so implementation is not blocked)

| ID | Decision | Default in this report | Alternatives / impact |
|---|---|---|---|
| D1 | Schema strategy for `accent` | **Option A** (bump to v2, identity migration, always write 2) | Option C if v2 files must stay openable in older builds (§5.3) |
| D2 | Accent in the multi-selection inspector | **Not in v2.** Single-component inspector only. | The command already takes `ids[]`. Adding it later is UI work only (a mixed state shows no radio checked). |
| D3 | Keyboard port pinning | **Not in v2.** Connect dialog = automatic ports. | Add two optional "Source side / Target side" selects (default "Automatic") to the Connect dialog and the Relationship inspector. |
| D4 | History coalescing for arrow-key browsing in the picker | **None.** One undo entry per change. | Coalesce consecutive `setComponentAccent` on the same ID within 1 s; this needs a history merge key. |
| D5 | Port visibility at rest | **Hidden** (terminal rings mark the connected ends) | Always-visible ports would look closer to n8n but add clutter at 50+ nodes and would need a separate export rule. |
| D6 | Decision shape change (chamfer → hexagon) | **Accept** the re-learning | Keep the chamfer for Decision and give Tool another non-parallelogram silhouette (for example, a notched-tab rectangle). |
| D7 | Hit area of transparent outline corners | **Bounding box** (≤ 20 px slack) | Shape-accurate hit testing (`pointer-events: none` on the wrapper, `visiblePainted` on the path) conflicts with React Flow drag handling. Not recommended. |
| D8 | Canvas tone change (`#F5F3EE` → `#F7F6F3`) | **Accept** (lighter, closer to the reference) | Keep v1 paper: every contrast value in §2.1 and §2.3 still passes (the inks were checked against both). |

---

## 11. Accessibility criteria (v2 additions to TD 12 and UH §9.3)

1. **Not color alone:** in a grayscale screenshot, the six component variants are distinguishable by silhouette, header band, dash and hatch, icon and label, both **with and without** any accent. **Status: completed (2026-10-21).** Coordinator manual review of the default-style grayscale screenshot, then an implementation re-check of a new color and grayscale capture of all six types, each in default style and with an accent (the capture used tomato, mustard, teal, plum, coral and cocoa). In grayscale all six are distinguishable with and without accents: rounded rectangle (Agent); rounded rectangle with a solid dark header band (Orchestrator); chamfered octagon (Tool); cylinder with a lid rim (Data Store); dashed, hatched parallelogram (External); hexagon (Decision). Each also has its icon chip and type label. Accents change only the border stroke, the chip tint and the glyph color. The Data Store name line is visible at default height. The screenshots are review artifacts kept outside the repository. **Note:** this review predates the color update (C7), which now also recolors the fill, label and band. No new grayscale capture is recorded; structural parity across all 16 colors is covered by `ComponentNode.test.tsx` (shape, details, dash, icon and label unchanged).
2. **Non-text contrast:** silhouette strokes (type ink or accent ink) ≥ 3:1 against the canvas and their own fill (actual ≥ 4.97:1). The selection outline ≥ 3:1 (6.34). Port ring ≥ 3:1 (5.34). Edge stroke and terminals ≥ 3:1 (5.34). Picker swatch rings ≥ 3:1 on white.
3. **Text contrast:** ≥ 4.5:1 for name, description and the ink-colored type label on every palette fill, and for white band text on every ink (§2.3, `palette.test.ts`).
4. **Selection is not only a color:** an extra outline at a 4 px offset plus the halo, distinct from the rectangular focus ring.
5. **Picker:** fieldset and legend, native radios with accessible names equal to the display names, one tab stop, arrow keys, a visible checked indicator that is not color (check glyph and outer ring), a visible text caption of the current value, and targets ≥ 24 × 24 (actual 28).
6. **Canvas semantics unchanged:** node and edge aria-labels contain no color or port wording. Direction is still announced only through `describeRelationship` (directed: "A delegates to B"; undirected: the v1 wording).
7. **Keyboard parity:** every relationship that can be made with a pointer can also be made with the Connect dialog (automatic ports).
8. **Motion:** no new motion. Port appearance uses `--sa-duration-fast` opacity, which is 0 under `prefers-reduced-motion`.

---

## 12. Acceptance criteria (testable)

**Unit (Vitest)**

1. `shapeKindFor` returns `rounded` for Agent **and** Orchestrator, `octagon` for Tool, `cylinder` for Memory, `parallelogram` for External, and `hexagon` for Decision.
2. For each `ShapeKind` × side × size in {`MIN_SIZE`, default, `MAX_SIZE`}, `portAnchor` lies on the outline from `shapePath` within 0.5 px.
3. `autoPorts` matches a table of at least 12 placements (all four quadrants, aligned, overlapping, equal gaps). Swapping source and target gives the same physical sides. Calls with identical input return identical output.
4. Rule B nearest-port selection, including the tie order.
5. `cubicEdgeGeometry`: for directed edges the arrow tip is `TERMINAL_RADIUS + 0.75` from the anchor, and the arrow direction is parallel to the end tangent `P3 − P2` (angle below 1e-9 rad; U4). Every edge with chord ≥ `CURVE_BOW_MIN_CHORD` bows as §8.5 (U1, U2, U5). Undirected edges return no arrowhead. Parallel index 1 and 2 bulge to opposite sides. Swapping the stored ends of an undirected edge gives an identical path, terminals and label point (U3). The label point equals `B(labelT)`.
6. `getDiagramBounds` contains the exact extent of every curve (not the control-point hull; U9), every arrowhead vertex, every terminal ring, every label plate and every leader end point (§9).
7. Domain: `setComponentAccent` (single undo entry, no-op on an unchanged value, `E_COMPONENT_NOT_FOUND` for unknown and group IDs, `E_INVALID_ACCENT` for unknown accents), `setRelationshipPorts` (keeps other `visual` keys, `null` removes `ports`), `reverseRelationship` swaps pins, `duplicateComponents` copies `accent`.
8. Validation: an unknown accent gives `E_INVALID_ACCENT`. Malformed `visual.ports` is valid and preserved verbatim.
9. Migration: a v1 file migrates to v2 unchanged. A v2 round trip is byte-stable with `accent` after `size`. Version 3 is rejected. A stored v1 IndexedDB record is rewritten as v2.
10. Markdown export output is identical for an architecture with and without accents.

**Component (Testing Library)**

11. A node with `accent: "teal"` has `data-accent="teal"` and `data-palette="teal"`. On every type the fill resolves to `#C9EAEA`, and the stroke, chip ink, type label and Memory rim resolve to `#106A6E`; the chip plate stays `#FFFFFF`. The name color is unchanged.
12. The Orchestrator with an accent takes the band fill of the selected ink (`#106A6E` for teal); without one it is `#1D3557`.
13. Groups never render `data-accent` or `data-palette`. The group inspector has no "Color" fieldset.
14. Picker: a `group` role named "Color" with 17 radios, each swatch's `data-palette` equal to its value ("Type default" = `type-{type}`). Names match §2.3. Exactly one is checked. Choosing one dispatches one command. Undo restores the previous checked radio. The caption text updates.

**End-to-end (Playwright)**

15. Drag from Agent A's right port to Tool B's left port and choose "Uses". The relationship persists `visual.ports = {source: "right", target: "left"}`. The path starts at A's right anchor. The arrowhead points into B's left port.
16. Drag from a port and release on B's body. Only `ports.source` is persisted. The highlighted port before release equals the rendered target port.
17. Connect dialog: no `visual` is written. Moving B from the right of A to below A re-routes the edge to bottom → top.
18. An undirected `shares_context_with` relationship shows no arrowhead and two identical terminal rings. Reversing the stored order in a fixture renders identical pixels. The canonical order of §8.5 step 8 applies before any arithmetic, so the path, terminals and label are identical.
19. Reset ports in the inspector removes the pins in one undo step.
20. PNG export (Scenario H pixel check, plus E3 and E4 below): it contains shapes, accents, labels, terminals and arrowheads, and no ports or selection. A curve that bulges beyond the node bounds is fully inside the image, with a 48 CSS px margin on every side (§9 "Export frame").
21. Grayscale screenshot check (manual review, recorded): the six variants can be told apart with and without accents. **Completed 2026-10-21** (§11 item 1).
22. Scenarios A–J stay green. Scenario K is not run or prioritized.

**Refinement acceptance status (2026-10-21).** The curve, label and export rules above are verified by these tests. Commits: `2fb60a4` (curves), `91198a6` (export frame), `17bad54` (labels), `eb89a20` (export bounds).

- **Unit (Vitest), passing:** U1, U2, U5 and U6 in `src/canvas/floating.test.ts`; U3 and U4 in `floating.test.ts`; U7 (stages a–f) in `src/canvas/edgeLabels.test.ts`; U8 (frame vectors, no `getViewportForBounds` import) in `src/io/exportPng.test.ts`; U9 in `src/canvas/bounds.test.ts`.
- **End-to-end (Playwright), passing:** E1 (every path bows at least 5 px from its chord), E2 (no label plate intersects a node, full label text, A→B has a `.sa-edge-leader`), E3 (uncapped export margin) and E4 (capped export margin) in `e2e/ui-v2.spec.ts`.
- **E5 (regression), passing:** items 15–19 above and Scenarios A–J are green. Scenario K is not run.
- **Manual, recorded:** M1 is item 21 (completed). M2 is complete: the review fixture (A → B "delegates to · coordinates", B → C, and an undirected `shares_context_with`) was re-exported at 1836 × 436 device px. All curves bow visibly, the A → B label is a callout above the pair with a dashed leader, and the margins are equal. Measured margins are left 96, top 95, right 96 and bottom 98 device px (expected 96). The capped fixture (E4: 8192 × 250 device px) has margins 64, 64, 64 and 65 device px (expected 64.48).
- **Shipped validation:** typecheck, lint, 542 unit tests, build and 26 e2e tests (Scenario K excluded) pass.

---

## 13. Suggested implementation stages (for the Build coordinator)

| Stage | Outcome | Main files | Difficulty | Depends on |
|---|---|---|---|---|
| S1 Domain + schema | `AccentId`, `accent` field, `E_INVALID_ACCENT`, `setComponentAccent`, `setRelationshipPorts`, reverse swaps pins, schema v2 identity migration, serialization order, Markdown unchanged | `domain/*`, `domain/validation/*`, `editor/*` tests | 3: cross-module data contract and migration | — |
| S2 Geometry | `shapes.ts` (paths, anchors, insets, hatch), `autoPorts`, `cubicEdgeGeometry`, arrowhead by tangent, `getDiagramBounds` math | `canvas/shapes.ts`, `canvas/floating.ts` (+ tests) | 3: pure but precise math | — (parallel with S1) |
| S3 Nodes, tokens, ports (UI) | SVG silhouettes, accent CSS, ports at anchors, states | `ComponentNode.tsx`, `canvas.css`, `ui/tokens.css`, `ui/icons.tsx` | 3 (UI → `stage-ui`) | S1, S2 |
| S4 Edges + pointer connect | Curved edges with terminals, preview connection line, pin capture, body-drop auto | `RelationshipEdge.tsx`, `ConnectionLine.tsx`, `interactions.ts`, `projection.ts`, `CanvasView.tsx` | 4: React Flow integration | S2, S3 |
| S5 Inspector | Appearance picker; Ports row and reset; Connect dialog note | `inspector/*`, `ConnectDialog.tsx` | 3 (UI → `stage-ui`) | S1 |
| S6 Export + e2e + docs | `getDiagramBounds` wired into `exportPng`, `.sa-exporting` rules, new e2e specs, Scenario H baseline, TD/UH section updates | `io/exportPng.ts`, `canvas/canvasApi.ts`, `e2e/*`, `TECHNICAL_DESIGN.md`, `UI_DESIGN_HANDOFF.md` | 3 | S3–S5 |

Suggested commits: one per stage. Each stage must leave `npm run typecheck && npm run lint && npm test` green, and S4 and S6 also leave `npm run e2e` green. S1 is the only stage with persistence risk. It is rollback-incompatible, not destructive (§5.3).

---

## 14. Traceability

| Brief requirement | Section |
|---|---|
| Light dotted canvas | §2.1 |
| Distinct silhouettes, implementation-ready per-type matrix | §3.2–3.3 |
| Agent and Orchestrator share a silhouette; Orchestrator non-shape marker | §0 C5, §3.2 |
| Tool and External clearly different | §0 C6, §3.2 |
| Memory, Decision and Group treatment | §3.2, §4.3 |
| One palette entry drives fill and ink, default = type styling, groups neutral (as built, superseding "border and details only") | §4 |
| 16-color stable palette, hex, WCAG non-text contrast | §2.3, §5.4, §11 |
| Accessible picker states | §6 |
| JSON persistence impact, migration, compatibility trade-offs | §5 |
| Fixed port anchors, pointer behavior, automatic ports for the Connect dialog | §7.2, §8.1–8.4 |
| Curves, arrowheads, labels, parallel edges | §8.5 |
| Custom-shape edge boundary geometry | §3.2, §8.5 |
| PNG export implications | §9 |
| Direction semantics; no execution or data-flow implication | §0 C1–C4, §8 |
| Interaction states, a11y criteria, acceptance criteria, open decisions | §7, §11, §12, §10 |
