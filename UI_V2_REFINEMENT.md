# Swarm Architecturer — UI v2 Refinement (design amendment)

**Status:** Historical design amendment to `UI_V2_DESIGN.md` (V2) for the earlier `sa-canvas-v2` build. It contains no application code. Its curve, label and PNG decisions (F1–F4) were folded into the canonical documents; read those for current behavior.
**Superseded color rule:** the component color statements below (§0 constraints, §1 coverage note) describe the earlier v2 build, in which an accent recolored only the border and details. That rule is **no longer current**. The implemented contract is `UI_COLOR_CONFIRMATION_DESIGN.md` §1 and the updated `UI_V2_DESIGN.md` (C7, §2.3, §4): a component's one effective palette entry (the selected color, else the type default) drives the node fill **and** ink, including the type label, logo and Orchestrator band.
**Scope (at the time):** It closes four findings from the coordinator's visual review of the `sa-canvas-v2` implementation against V2 and the user brief. At the time, where this document and V2 disagreed, this document won; today the updated V2 and `UI_COLOR_CONFIRMATION_DESIGN.md` are authoritative. Anything not mentioned here keeps its V2 behavior.
**Handoff:** The implementation worker for `sa-canvas-v2` folds these rules into the canonical `UI_V2_DESIGN.md`, `TECHNICAL_DESIGN.md` (TD) and `UI_DESIGN_HANDOFF.md` (UH), and changes the code (§7). That worker treats this file as the source of the decisions. It does not need to be kept in sync once those documents are updated.
**Visual evidence:** `/var/folders/nh/pdv3nwtx327dn_nb9d3v3xc80000gn/T/opencode/ui-v2-nodes-grayscale.png` (a grayscale canvas screenshot of the `sa-canvas-v2` build: six default-style nodes in two rows, five relationships).

---

## 0. Findings and decisions at a glance

| # | Finding (review evidence) | Root cause in `sa-canvas-v2` | Decision |
|---|---|---|---|
| F1 | The six silhouettes stay distinguishable in the grayscale screenshot. | — | Record V2 §12 criterion 21 as **completed** (§1). |
| F2 | Facing, aligned ports draw an exactly straight line (screenshot: Agent → Orchestrator → Tool, External → Decision). | `cubicEdgeGeometry` puts `P1 = P0 + n_s·d` and `P2 = P3 + n_t·d`. For facing ports on one line, all four points are collinear. | **Minimum bow** (§2): every path gets a deterministic perpendicular bow that fades out once the curve already bends. The arrowhead follows the true end tangent. Undirected paths are computed in canonical order. |
| F3 | With default-size nodes at x = 100, 400 and 700, the label "delegates to · coordinates" runs under the neighboring nodes (screenshot: only "…ates to · coor…" is visible). | The label is placed at `B(labelPosition)` with no collision check. The plate is wider than the 80 px gap, and the edge layer paints beneath the nodes. | **Collision-aware label layout** (§3): try on the path, then on the path in two lines, then a callout with a leader. A semantic label is never dropped or hidden. |
| F4 | The exported PNG has visibly less than 48 CSS px margin around the curves. | `computeExportFrame` already adds 48 px per side to the image size, then calls `getViewportForBounds(bounds, W, H, 0.1, 2, 0.05)`. That call (in @xyflow/system 12.12) fits the bounds with its own ≈2.4 % padding and **zooms up to 2×**, which takes away the 48 px. | **Explicit transform** (§4): `zoom = s`, `x = (48 − B.x)·s`, `y = (48 − B.y)·s`, `getViewportForBounds` removed. Bounds are tightened to the painted extents. |

Constraints this amendment kept unchanged (as of the earlier v2 build; the color rule is superseded, see the header): the six type silhouettes and their paths (V2 §3.2), the 16 accent IDs and hex values (V2 §2.3), accents only on the component border and details (V2 §4 at the time; now replaced by the single-palette fill and ink rule of `UI_COLOR_CONFIRMATION_DESIGN.md` §1), no group colors, no execution or data-flow semantics (V2 C4: no animation, no flow markers, symmetric shapes), arrowheads only at the semantic target (C1–C3), and no network features.

---

## 1. F1: grayscale check, recorded as completed

V2 §12 criterion 21 and §11 item 1 are **completed (manual review, 2026-10-21, coordinator)**.

- **Evidence:** `/var/folders/nh/pdv3nwtx327dn_nb9d3v3xc80000gn/T/opencode/ui-v2-nodes-grayscale.png`. In grayscale, these cues tell the six types apart: rounded rectangle (Agent), rounded rectangle with a solid dark header band (Orchestrator), chamfered octagon (Tool), cylinder with a lid rim (Data Store), dashed and hatched parallelogram (External), and hexagon (Decision). Each also has its icon chip and type label.
- **Coverage note (historical, earlier v2 build):** the screenshot shows the **default (type) style**. At the time, the with-accent half of the criterion held by construction: an accent changed only the stroke color, the chip tint and the glyph color (V2 §4.2 as it then read), never the path, dash, hatch, band, icon or label. Component test V2 §12 #11–12 covered it, and no new screenshot was required. **Current behavior differs:** a selected color now also recolors the node fill, type label and Orchestrator band (`UI_COLOR_CONFIRMATION_DESIGN.md` §1, updated V2 C7 and §4). Shape, dash, hatch, band presence, icon and label text stay color-independent; see the updated V2 §11 item 1 for how that is verified now.
- The implementer copies this record into the canonical V2 §12 #21 (§7).

---

## 2. F2: visible curvature on every relationship path

### 2.1 New constants (`src/canvas/shapes.ts`, exported, unit-tested)

| Constant | Value | Meaning |
|---|---|---|
| `CURVE_BOW_MAX` | 24 | Largest minimum bow (px), perpendicular to the chord |
| `CURVE_BOW_FACTOR` | 0.15 | Bow target as a fraction of the chord length |
| `CURVE_BOW_MIN_CHORD` | 24 | Below this chord length no bow is added (overlapping or touching nodes; V2 §8.5 degenerate rules apply) |

`CURVE_MIN/MAX/FACTOR`, `PARALLEL_STEP = 20`, `TERMINAL_RADIUS`, `ARROW_LENGTH` and `ARROW_HALF_WIDTH` are unchanged.

### 2.2 Algorithm (replaces V2 §8.5 steps 3–6 and 9; `cubicEdgeGeometry` in `floating.ts`)

Notation: `R = TERMINAL_RADIUS`, `L = ARROW_LENGTH`, `n_s` and `n_t` are the port normals, `A_s` and `A_t` are the anchors. Sides come from pins or V2 §8.3, as before.

0. **Canonical order for undirected edges.** If `direction === "undirected"` and `sourceId > targetId` (code-point order), swap `A_s↔A_t` and `n_s↔n_t`, negate `parallelOffset`, and use `1 − labelPosition` (and the swapped label request, §3) **before any arithmetic**. Directed edges are never swapped. This makes the emitted `d` string, and so the dash phase of the `6 4` stroke, byte-identical whatever the stored order is.
1. `P0 = A_s + n_s·R`.
2. Provisional end `E`. Directed: `E = A_t + n_t·(R + 0.75 + L − 2)` (the V2 line end). Undirected: `E = A_t + n_t·R`.
3. Chord `c = E − P0`, `ℓ = |c|`. `d = clamp(CURVE_FACTOR·ℓ, CURVE_MIN, CURVE_MAX)`. Base controls: `C1 = P0 + n_s·d`, `C2 = E + n_t·d`.
4. **Bow normal `b̂`** (geometric, so it does not depend on IDs or stored order). Let `ĉ = c/ℓ` and `p = (−ĉ.y, ĉ.x)`.
   - If `|ĉ.x| ≥ |ĉ.y|` (horizontal-dominant; exact 45° counts as horizontal): `b̂ = ±p` with `b̂.y < 0` (bows **up**).
   - Otherwise: `b̂ = ±p` with `b̂.x > 0` (bows **right**).
   - If `ℓ < CURVE_BOW_MIN_CHORD`, skip steps 4–6: `σ = parallel shift only` (V2 behavior).
5. **Existing bend** `h = max(|(C1 − P0)·b̂|, |(C2 − P0)·b̂|)`. **Bow target** `B = min(CURVE_BOW_MAX, CURVE_BOW_FACTOR·ℓ)`. **Bow** `β = max(0, B − h)`. The bow is continuous in node positions: it is largest for aligned facing ports and fades to 0 once the S or C shape already bends by `B`.
6. **Parallel shift as a scalar on `b̂`:** `π = parallelOffset · (leftNormal(c)·b̂)`, where `leftNormal(c) = (c.y, −c.x)/ℓ` (the V2 sign convention; `leftNormal(c)·b̂` is exactly ±1). **Total shift** `σ = π + sgn(π)·β`, with `sgn(0) = +1`. The bow therefore always pushes **away** from the straight line on the side the parallel offset already chose. Index 0 bows toward `b̂`.
7. `P1 = C1 + b̂·σ`, `P2 = C2 + b̂·σ`.
8. **End point and arrowhead.**
   - Directed: tip `T = A_t + n_t·(R + 0.75)` (unchanged, so it touches the target ring). Direction `u = normalize(T − P2)`, or `−n_t` if that length is 0. `P3 = T − u·(L − 2)`. Triangle = `arrowheadGeometry(T, u)`. Because `P3` lies on the segment `P2 → T`, the curve's end tangent `P3 − P2` is **exactly parallel to `u`**, so the arrowhead never kinks against the curve. This also fixes the V2 kink on parallel edges, whose shifted `P2` pulled the tangent away from `−n_t`.
   - Undirected: `P3 = E`.
9. Path `M P0 C P1 P2 P3`. Terminal rings, label `t` and degenerate rules are unchanged from V2 §8.5. Step 0 decides the label `t` mapping.

**Arrow tilt:** the arrowhead now enters at an angle (≤ about 18° by construction; 13.5° in the 80 px-gap example). Its tip stays on the target ring, and all three triangle corners stay outside the target node box (verified over 106 728 Rule A placements, §6 U4). Direction is still carried **only** by the arrowhead at the stored target (C1, C2). The bow side is geometric and the same for both directions, so it adds no direction cue (C4).

### 2.3 Parallel relationships

`computeParallelInfo` is unchanged (unordered pair, canonical side, `PARALLEL_STEP = 20`, index order, `labelPosition` 0.5/0.65/0.35/…). With the bow, the totals for aligned facing ports become `σ = β, +20+β, −20−β, +40+β, −40−β, …`:

- No edge of a fan is straight (`|σ| ≥ β`).
- Neighbors differ by ≥ 20 px of control shift, so midpoints are ≥ 15 px apart. Worked example (default Agents at x = 100 and 700, y = 100, undirected): midpoint y for indexes 0–4 = 126, 111, 177, 96, 192.
- When `h ≥ B` (nodes already offset), `β = 0` and the fan is exactly V2's.

Opposite-direction directed relationships between the same pair are parallel edges, as in V2. They share the geometric `b̂`, and their parallel indexes separate them.

### 2.4 Connection preview (V2 §8.1 step 2)

- **Snapped to a port:** the preview uses `cubicEdgeGeometry` with `directed = false`, no parallel offset, and the pressed side and snapped side. It shows the same bow the final edge will have (before the arrowhead), so what the user sees is what they get.
- **Not snapped:** unchanged (end tangent toward the pointer). A preview is not a relationship.

### 2.5 Worked numbers (for unit tests)

Default Agents (220 × 88) at (100, 100) and (400, 100), sides right → left (`A_s = (320, 144)`, `A_t = (400, 144)`):

| Case | P0 | P1 | P2 | P3 | Max deviation from chord |
|---|---|---|---|---|---|
| Directed | (323.5, 144) | (355.5, 134.36) | (355.75, 134.36) | (387.97, 142.13) | 6.53 px |
| Undirected | (323.5, 144) | (355.5, 133.05) | (364.5, 133.05) | (396.5, 144) | 8.21 px |

Same pair with the target at x = 700 (`A_t = (700, 144)`): undirected `P1 = (443.5, 120)`, `P2 = (576.5, 120)`, deviation 18.0 px. Directed `P3 = (687.89, 142.53)`, deviation 17.45 px. All values are rounded to 2 decimals. Tests compare within 0.01.

---

## 3. F3: readable labels that never cover nodes

### 3.1 Principle

A label is part of the relationship's meaning, so it is **always rendered in full** (after the unchanged V1 40-character truncation). It is never covered by, and never covers, any node body or node text. When it does not fit on its curve, it moves to free space and keeps a visible link to its curve.

### 3.2 Global, deterministic layout (`src/canvas/edgeLabels.ts`, pure)

```ts
export interface LabelRequest {
  id: string;                      // relationship id
  text: string;                    // relationshipCanvasLabel(rel)
  curve: [Position, Position, Position, Position]; // P0..P3 after §2.2 (canonical order for undirected)
  baseT: number;                   // labelPosition after §2.2 step 0
  bowNormal: Position;             // b̂ from §2.2 step 4 (or (0,-1) when ℓ < CURVE_BOW_MIN_CHORD)
}
export interface LabelPlacement {
  mode: "path" | "path-wrapped" | "callout";
  lines: [string] | [string, string];
  plate: Rect;                     // absolute, un-inflated
  leader: { from: Position; to: Position } | null; // callout only
}
export type MeasureText = (text: string) => number; // CSS px width at the label font
export function layoutEdgeLabels(requests: LabelRequest[], obstacles: Rect[], measure: MeasureText): Map<string, LabelPlacement>;
```

The canvas computes it **once per render for all edges**, from the live internal node rects. The edge components read their placement from it, through edge `data` or a context. `getDiagramBounds` (§4) calls the same function with the same inputs, so the PNG matches the screen.

**Constants:** font 12 px (`.react-flow__edge-text`, unchanged). `LABEL_PAD_X = 6`, `LABEL_PAD_Y = 2` (the current `labelBgPadding`). `LABEL_LINE_HEIGHT = 15`. Plate size = `(ceil(max line width) + 2·LABEL_PAD_X) × (15·lines + 2·LABEL_PAD_Y)`, so 19 px for one line and 34 px for two. `LABEL_CLEARANCE = 4`.

**Measuring:** in the app, `measure` uses a cached `CanvasRenderingContext2D.measureText` with the resolved `400 12px <--sa-font-sans>` font. Where that is unavailable (jsdom), the fallback is `7 × code points`, which is conservative for a 12 px sans. Unit tests always inject `measure`.

**Obstacles** (all absolute, each inflated by `LABEL_CLEARANCE` before testing):

1. every component node box (it contains the silhouette and all node text);
2. every group's header strip `{x, y, width, height: GROUP_HEADER}` (group bodies are **not** obstacles, since edges cross groups by design);
3. every edge's arrowhead triangle bounding box and both terminal-ring boxes (`R + 0.75` around the anchor);
4. every plate already placed in this pass.

Edge paths are **not** obstacles. The plate still "cuts" the line (V1 rule).

**Order:** requests are placed in ascending relationship `id` order (code points). This is independent of array order and stored direction.

A candidate plate is **free** when its rectangle does not intersect any inflated obstacle (touching edges count as free).

### 3.3 Placement stages (first free candidate wins)

**Stage A: on the path, one line.** Canonical offsets `k = [0, +0.1, −0.1, +0.2, −0.2, +0.3, −0.3]`. Candidate `t = clamp(baseT + k, 0.2, 0.8)`. For undirected edges `baseT` and `+k` are already in canonical order (§2.2 step 0). Duplicate `t` values after clamping are skipped. The plate is centered on `B(t)`.

**Stage B: on the path, two lines.** This stage runs only if the text can be split:

- If the text contains `" · "`, split at the **first** occurrence. Line 1 = text before it plus `" ·"`, line 2 = the rest (for example "delegates to ·" / "coordinates").
- Otherwise split at the space closest to the middle code point. On a tie, use the earlier space.
- No space means no Stage B.

Use the same `t` list as Stage A, with a two-line plate.

**Stage C: callout, one line, with a leader.** Anchor `Q = B(baseT)`. Directions in this order, with duplicates removed keeping the first: `b̂, −b̂, (0,−1), (0,1), (−1,0), (1,0)`. For `r_j = 12 + 12·j`, `j = 0…19` (12 to 240 px), and for each direction `v`, the candidate center is `Q + v·(r_j + |v.x|·w/2 + |v.y|·h/2)`, where `w × h` is the one-line plate. The first candidate that is free **and** whose leader does not intersect any un-inflated node box wins.

**Stage D: guaranteed fallback (callout, one line).** Start with the center `Q + (0, −(12 + h/2))`. While the plate intersects inflated obstacles, set its bottom to `min(top of every intersecting inflated obstacle)` and test again. Each step moves strictly upward past at least one obstacle, so this ends after at most `obstacles + 1` steps. The leader may then pass behind nodes. The edge layer paints beneath the node layer and node fills are opaque, so it never crosses node text.

**Leader** (Stages C and D): a straight segment from `Q` to the nearest point on the plate's rectangle boundary. It is `<line class="sa-edge-leader">`, 1 px `--sa-edge-stroke`, `stroke-dasharray: 2 2`, no markers, `pointer-events: none`, never animated. It follows the edge's hover and selected stroke colors, as the terminals do. A callout plate also gets a 1 px `--sa-edge-stroke` plate border. These two cues tell a callout apart from a node and from an undirected (`6 4`) edge.

### 3.4 Rendering

The edge renders its label itself and no longer uses `BaseEdge`'s `label`. It draws, inside the edge's own `<g>` (so a click still selects the edge and the PNG still includes it):

- `rect.react-flow__edge-textbg` (radius 3);
- `text.react-flow__edge-text` with one or two `<tspan>`s (`text-anchor: middle`, baselines spaced 15 px apart);
- for callouts, the leader and the plate border.

The class names stay the same, so the existing CSS and e2e selectors keep working. The aria-label, the inspector text and the 40-character truncation are unchanged.

### 3.5 Worked example (the review case)

Agents A, B, C are 220 × 88 at x = 100, 400 and 700 (y = 100). A → B is `delegates_to` with label "coordinates", so the canvas text is "delegates to · coordinates". The free gap between A and B is 80 px, or 72 px after clearance.

- Stage A fails: the one-line plate is about 160 px wide.
- Stage B fails: "delegates to ·" is about 80 px plus 12 px padding, which is more than 72.
- Stage C chooses `v = b̂ = (0,−1)` at the first `r_j` whose plate bottom is ≤ 96 (node top 100 − 4). The plate sits above the pair, centered on `Q.x`, with a dashed leader down to the curve.

The test asserts the mode, not the exact pixels: `mode === "callout"`, plate ∩ every inflated node box = ∅, and the text equals the full display label.

---

## 4. F4: PNG export keeps 48 CSS px per side

### 4.1 Bounds = painted extents (`getDiagramBounds`, replaces V2 §9 "Export bounds")

`B` is the union, in flow coordinates (CSS px), of:

1. every node box (components **and** groups), inflated by 1 px. The largest export stroke is the 2 px Orchestrator outline, whose outer half reaches 1 px outside the box. Selection and halo are hidden while exporting.
2. for every edge, the **exact** bounding box of its cubic, inflated by 0.75 px (half the 1.5 px stroke). Per axis, solve `B′(t) = 0`: `a·t² + b·t + c = 0` with `a = 3(−P0 + 3P1 − 3P2 + P3)`, `b = 6(P0 − 2P1 + P2)`, `c = 3(P1 − P0)`. If `|a| < 1e-9`, use the linear root `−c/b`. Evaluate `B(t)` at `t ∈ {0, 1} ∪ roots ∩ (0, 1)`. This replaces V2's control-point hull, which can overstate the extent by up to about 25 % of the bulge and so put extra, uneven margin around curves.
3. every arrowhead triangle (its 3 vertices) and every terminal ring box (`R + 0.75` around the anchor);
4. every label plate and leader endpoint from §3, after layout.

### 4.2 Frame and transform (`computeExportFrame`, replaces TD 10 steps 3–4)

```
PAD = 48 (EXPORT_PADDING), MAX = 4096 (EXPORT_MAX_SIDE), RATIO = 2 (EXPORT_PIXEL_RATIO)
W0 = B.width  + 2·PAD
H0 = B.height + 2·PAD
s  = min(1, MAX / W0, MAX / H0)                 // never > 1, no lower clamp
W  = max(1, min(MAX, ceil(W0·s − 1e-6)))        // CSS px image width
H  = max(1, min(MAX, ceil(H0·s − 1e-6)))
transform = { x: (PAD − B.x)·s, y: (PAD − B.y)·s, zoom: s }
```

- **Do not call `getViewportForBounds`.** Remove the import from `exportPng.ts`.
- The margin is defined **before** the max-side scaling. On the exported image it is `48·s` CSS px, or `96·s` device px at `pixelRatio 2`, on the left and top. Right and bottom margins are in `[48·s, 48·s + 1)` CSS px because of the `ceil`.
- There is no `minZoom` clamp. V1's 0.1 clamp would crop diagrams wider than about 41 000 px. Readability at very small `s` is accepted, since completeness wins.
- Unchanged: `toPng` options, `backgroundColor` from `--sa-color-canvas`, `exportFilter`, `.sa-exporting`, the html-to-image 1.11.11 pin, the file name and error handling.

### 4.3 Test vectors (unit, exact)

| `B` (x, y, w, h) | `s` | `W × H` (CSS) | transform `x, y` | Margin L/T (CSS) |
|---|---|---|---|---|
| (−37.5, 12, 600, 200) | 1 | 696 × 296 | 85.5, 36 | 48 |
| (−1, −1, 6002, 90) | 4096/6098 = 0.671696 | 4096 × 125 | 32.913, 32.913 | 32.241 |
| (0, 0, 0.5, 0.5) | 1 | 97 × 97 | 48, 48 | 48 |

For each row, check: `B.x·zoom + x = 48·s` and `(B.x + B.width)·zoom + x ≤ W − 48·s + 1e-9`. The same holds for y.

---

## 5. Changes to existing V2 rules (for the canonical update)

| V2 location | Change |
|---|---|
| §2.2 constants | Add `CURVE_BOW_MAX`, `CURVE_BOW_FACTOR`, `CURVE_BOW_MIN_CHORD` (§2.1) and the label constants (§3.2). |
| §8.1 step 2 | Snapped preview uses the §2.4 rule. |
| §8.5 steps 3–6, 8, 9 | Replaced by §2.2 and §3. Step 5's "end tangent equals `−n_t`" becomes "end tangent is parallel to the arrow direction `u`; the tip touches the ring". |
| §9 "Export bounds" | Replaced by §4.1. TD 10 steps 3–4 are replaced by §4.2. |
| §12 #5, #6, #18, #20, #21 | Replaced or extended by §6. |
| TD 6.4 | "Label at `B(labelPosition)`" becomes "label placed by §3 (path → path-wrapped → callout)". The parallel-edge paragraph refers to §2.3. |
| UH §6 (edge styling) | Add the leader and callout plate styles (§3.3). |

---

## 6. Acceptance tests

**Unit (Vitest)**

- **U1 Curvature, aligned facing.** For the §2.5 cases, and for right→left, left→right, bottom→top and top→bottom with gaps 40, 80, 300 and 600 px: the maximum perpendicular distance of `B(t)` (201 samples) from the line `P0→P3` is ≥ `0.6·B`.
- **U2 Curvature, everywhere.** Property sweep: Agent at the origin, target Agent offset over x ∈ [−700, 700] and y ∈ [−500, 500] in 10 px steps (non-overlapping only), Rule A sides, directed and undirected, `parallelOffset ∈ {0, ±20, 40}`. Every edge with `ℓ ≥ 24` has a maximum deviation ≥ `0.25·B`. The reference implementation gives a worst ratio of 0.2887.
- **U3 Undirected swap.** Swapping the stored source/target (and pins) of an undirected relationship gives an identical `path` string, identical terminals and an identical label placement. This includes parallel indexes 0–4.
- **U4 Arrowhead.** For directed edges: `|tip − A_t| = R + 0.75`. The angle between `u` and `P3 − P2` is < 1e-9 rad. No triangle vertex lies strictly inside the target node box over the U2 sweep. There is never an arrowhead at the source.
- **U5 Parallel fan.** For aligned facing ports, indexes 0–4 have pairwise midpoint distances ≥ 15 px, and none has a deviation below `0.6·B`. When `h ≥ B`, the controls equal V2's output, so the fan is unchanged.
- **U6 Continuity.** With the target Agent at dx ∈ {300, 600}, moving it 1 px at a time through exact horizontal alignment (dy from −40 to +40, sides stay right → left) changes `P1` and `P2` by ≤ 2 px per step (reference: ≤ 1.51). There is no jump.
- **U7 Label stages.** With an injected `measure = 7 px/char`: (a) a short label in a wide gap gives `mode "path"` at `baseT`; (b) the §3.5 layout gives `"callout"` with no node intersection and the full text; (c) a gap that fits "delegates to ·" but not the full line gives `"path-wrapped"` with the split defined in §3.3; (d) 6 labels between one pair never overlap each other (each plate is disjoint from the others after inflation); (e) a closed ring of obstacles that blocks Stages A–C reaches Stage D and terminates; (f) the output is independent of request array order.
- **U8 Export frame.** The §4.3 vectors match exactly (within 1e-6), and `getViewportForBounds` is not imported (a static check, or a mock that asserts it is not called).
- **U9 Bounds.** For a cubic whose extreme lies strictly inside `(0, 1)`, `getDiagramBounds` equals the analytic extreme ± 0.75 and is smaller than the control-point hull.

**End-to-end (Playwright)**

- **E1 Curved review layout.** The §3.5 fixture (A → B "delegates to · coordinates", B → C, and an undirected `shares_context_with`): every `.sa-edge-path` `d` attribute's `getPointAtLength` samples deviate ≥ 5 px from the straight line between the endpoints.
- **E2 Labels.** In the same fixture, every `.react-flow__edge-textbg` client rect is disjoint from every `.react-flow__node` client rect (component nodes). Every edge text's `textContent` (tspans joined by a space) equals the relationship's canvas label. A→B has a `.sa-edge-leader`.
- **E3 PNG margin, uncapped.** Export the E1 fixture. Find the non-background bounding box in device px with the existing `analyzePng` helper. Left and top margin ∈ [94, 98]; right and bottom ∈ [94, 100] (expected 96 = 2·48).
- **E4 PNG margin, capped.** Import a fixture of two unconnected 220 × 88 Agents at x = 0 and x = 5780 (y = 0). The image is 8192 × 250 device px. All four margins are within ±2 px of `96·s = 64.48` (right and bottom +2 more for the `ceil`).
- **E5 Regression.** V2 §12 #15–#19 still pass (the #18 "identical pixels" check now relies on §2.2 step 0). Scenarios A–J stay green. The Scenario H baseline is regenerated once and reviewed by a human. **Scenario K is not run or prioritized.**

**Manual (recorded)**

- **M1** F1 grayscale check: completed (§1).
- **M2** Re-export the §3.5 fixture to PNG and look at it: all curves bow visibly, the A→B label sits above with a dashed leader, and the four margins are equal. Save the PNG alongside the Scenario H baseline review.

---

## 7. Implementation handoff (for the `sa-canvas-v2` worker)

| Stage | Outcome | Main files | Difficulty | Depends on |
|---|---|---|---|---|
| R1 Geometry | §2 bow, canonical undirected order, tangent-aligned arrowhead, snapped preview; U1–U6 | `canvas/shapes.ts`, `canvas/floating.ts` (+ tests) | 3: precise pure math and property tests | — |
| R2 Export | §4 exact bounds and explicit frame; U8–U9, E3–E4 | `canvas/bounds.ts`, `canvas/CanvasView.tsx` (`getDiagramBounds`), `io/exportPng.ts` (+ tests, e2e) | 2: localized math | R1 (curve inputs), R3 for label plates (it can land first with V2 plate math) |
| R3 Labels (UI → `stage-ui`) | §3 layout module, global computation, custom label rendering, leader/callout styles; U7, E1–E2 | `canvas/edgeLabels.ts` (new), `canvas/edges/RelationshipEdge.tsx`, `canvas/CanvasView.tsx`, `canvas/canvas.css` | 4: global layout feeding per-edge React Flow components | R1 |
| R4 Docs | Fold §1–§6 into `UI_V2_DESIGN.md` (§2.2, §8.1, §8.5, §9, §12 incl. #21 record), TD 6.4 and 10, UH §6 | docs | 1 | R1–R3 |

**Suggested commits:** `feat(canvas): bow every relationship curve and align arrowheads to the tangent` (R1). `feat(canvas): place edge labels clear of nodes with callout fallback` (R3). `fix(export): keep a 48 px PNG margin with an explicit export transform` (R2, after R3 so the bounds include final plates). `docs: fold UI v2 refinement into design, technical and UI handoffs` (R4). Each commit keeps `npm run typecheck && npm run lint && npm test` green. R2 and R3 also keep `npm run e2e` green (excluding Scenario K).

**No open blockers.** Every rule above has a fixed constant, a tie-breaker and a test. Out of scope, observed in the screenshot and not decided here: the Data Store node in the screenshot shows no name line at its rendered height. The implementer should check it against V2 §3.3 (cylinder insets) separately.
