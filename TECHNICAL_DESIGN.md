# Swarm Architecturer — Technical Design (MVP)

**Status:** Implementation-ready design for the MVP.
**Authority:** `PRODUCT_CONCEPT_V1.1.md` (the "product spec") is authoritative. Where this document adds a rule the spec leaves open, it is marked **[Design decision]** and applies to every implementation agent.
**Scope guard:** No backend, no accounts or authentication, no AI/LLM calls, no collaboration, no runtime, workflow engine, executable conditions or state machine. The app is a static, local-first web app.
**Date of research:** 2026-10-21.
**UI v2 update:** Sections 3.1, 3.5, 3.6, 3.7, 5.1, 6.1, 6.3, 6.4, 7.1, 7.3, 10, 12 and 15.3 describe the "ported canvas" as built (`UI_V2_DESIGN.md`): per-type silhouettes, component accent, port pins on relationships, curved edges, schema version 2. **Release note:** schema v2 is *rollback-incompatible* (not destructive): a build that only knows v1 rejects v2 files and shows v2 IndexedDB records as damaged; no data is deleted and everything opens again after rolling forward. **UI v2 refinement (2026-10-21):** curves carry a minimum bow and tangent-aligned arrowheads, edge labels are placed clear of nodes (callout fallback), and the PNG margin is exact (§6.4, §10, §17.5). Render-only: the schema stays v2 and the saved JSON is unchanged.

---

## 0. How to read this document

| Section | Use it for |
|---|---|
| 1 | Stack and dependency decisions |
| 2 | Canvas library evaluation and licensing |
| 3 | Domain types, constants and validation (the schema contract) |
| 4 | Module boundaries and data flow |
| 5 | Editor store, commands and undo/redo |
| 6 | Interaction contracts (nodes, edges, groups, direction, selection, keyboard) |
| 7 | Inspector specification |
| 8 | Local persistence |
| 9 | JSON import/export |
| 10 | PNG export |
| 11 | Library screen and app shell |
| 12 | Accessibility |
| 13 | Error states |
| 14 | Security and privacy |
| 15 | Test and build strategy |
| 16 | Risks |
| 17 | Phased plan, parallel workstreams, file ownership and commits |
| 18 | Traceability: M1–M9 and Scenarios A–J |
| 19 | Verified facts vs. assumptions |

---

## 1. Stack and rationale

| Concern | Decision | Rationale |
|---|---|---|
| Language | **TypeScript**, `strict: true`, `noUncheckedIndexedAccess: true` | Domain invariants are encoded in types; spec section 13 suggests TS. |
| UI framework | **React 19** | Spec suggestion; required by the chosen canvas library. |
| Build/dev | **Vite** with the official `react-ts` template | Spec suggestion; static output; no server. |
| Canvas | **React Flow — `@xyflow/react` v12** (MIT) | See section 2. |
| Schema validation | **Zod 4** (MIT) | One declarative schema for import and pre-save validation, with paths for error messages. Clear value over hand-written shape checks. |
| Local storage | **IndexedDB** via **`idb`** (ISC, ~1 kB wrapper) | See section 8. |
| PNG export | **`html-to-image`**, pinned to **`1.11.11`** (MIT) | The approach React Flow's own "Download Image" example documents; see section 10. |
| State management | **Hand-written store** (`subscribe`/`getState` + `useSyncExternalStore`) | Dozens of entities; immutable snapshots are enough. No Redux/Zustand/Immer needed. |
| Routing | **Hand-written hash router** (two routes) | `#/` and `#/a/<id>`; avoids a router dependency. |
| Styling | **Plain CSS with CSS custom properties** (one tokens file + one CSS file per feature module) | The spec *suggests* Tailwind but also says to avoid dependencies without clear value. Per-module CSS files also give clean file ownership for parallel agents. Design agents own the visual values in `src/ui/tokens.css`. **[Design decision]** |
| Icons | Inline SVG components in `src/ui/icons.tsx` | No icon library dependency. |
| Fonts | System font stack only | No network font requests (Scenario J) and no font-embedding problems in PNG export. |
| Markdown | `react-markdown` (lazy-loaded preview only). Notes are stored and edited as Markdown *source*; an Edit/Preview toggle renders them. **[Design decision, post-MVP addition]** | Raw HTML is skipped (`skipHtml`, no raw-HTML plugin), links pass `safeLink`, images render as text placeholders so no network request happens. The renderer is a separate chunk loaded on first preview. |
| Unit/component tests | **Vitest** + **@testing-library/react** + **@testing-library/user-event** + **jsdom** + **fake-indexeddb** | Standard Vite-native tooling. |
| End-to-end tests | **Playwright** (`@playwright/test`) | React Flow needs real layout (ResizeObserver, measured DOM); Scenarios A–J run in a real browser. |
| Lint/format | ESLint config from the Vite template; Prettier optional | Keep template defaults. |

### 1.1 Dependency list (complete)

Runtime: `react`, `react-dom`, `@xyflow/react`, `zod`, `idb`, `html-to-image@1.11.11` (exact pin), `react-markdown` (notes preview, lazy-loaded; added for the documentation feature, licenses in `public/THIRD_PARTY_LICENSES.md`).
Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `fake-indexeddb`, `@playwright/test`, ESLint packages from the template.

No other dependency may be added without a coordinator decision (record it in this file's section 16 or an ADR note in the PR).

**Versions:** npm `latest` on 2026-10-21 was: `@xyflow/react` 12.12.0, `react` 19.3.1, `vite` 8.3.5, `zod` 4.6.7, `idb` 8.0.4, `html-to-image` 1.11.13 (pin 1.11.11 instead, see 10), `react-markdown` 10.1.0 (installed; range `^10.1.0`), `vitest` 5.0.5, `@playwright/test` 1.64.1, `typescript` 7.0.2. Use the versions the Vite `react-ts` template installs on the day of scaffolding, and commit the lockfile. If TypeScript 7 breaks the template's ESLint/`typescript-eslint` toolchain, pin the newest TypeScript major that the toolchain supports and note it in the scaffolding commit. Use caret ranges for everything except `html-to-image`.

---

## 2. Canvas library evaluation and choice

### 2.1 Comparison (criteria from spec section 13)

| Criterion | React Flow (`@xyflow/react` v12) | tldraw (SDK v5) |
|---|---|---|
| Custom nodes | First-class: `nodeTypes` map of React components; any HTML inside. | Custom shapes via shape utils; whiteboard-oriented model. |
| Typed, directed/undirected connections | Custom `edgeTypes`; per-edge `markerEnd`/`markerStart` (omit for undirected); `data` payload; `isValidConnection` to reject invalid endpoints; `ariaLabel`, `focusable`, `interactionWidth` per edge. | Arrows with bindings; arrowheads configurable; semantic typing must be layered on via meta. |
| Grouping, moving members as a group | Has sub-flows (`parentId`, child positions relative to parent). We do **not** use them (see 6.5); we implement group move ourselves in a thin adapter. Either way is feasible. | Native frames/groups, but with tldraw's own membership semantics (spatial), which conflict with "position does not change membership". |
| Serialization | We own the data: controlled `nodes`/`edges` are a projection of our domain model. Nothing library-specific is persisted. | Has its own store/snapshot format; mapping back to our schema is extra work. |
| Persistence integration | Trivial: library holds no state we need to persist except viewport (`onMoveEnd`). | Store-sync APIs; would need to be bypassed to keep our JSON as the single source of truth. |
| Licensing | **MIT** (checked: LICENSE file, "Copyright (c) 2019-2025 webkid GmbH"). Free in production. Attribution badge requested unless subscribed to React Flow Pro. | **Not free in production.** Checked license page: default license allows development use only; production needs a trial (100 days), hobby (non-commercial, requires "made with tldraw" watermark, discretionary) or commercial license with a license key. npm license field: "SEE LICENSE IN LICENSE.md". |
| Maintenance | Active (v12.12.0 on npm, 2026-10). Maintained by webkid GmbH (xyflow). | Active (v5.5.2 on npm). |
| Accessibility | Built-in: focusable nodes/edges, Enter/Space select, Escape deselect, `ariaLabelConfig`, `domAttributes`, live region for movement. | Canvas-centric; less form-like a11y. |

### 2.2 Decision

**Use React Flow (`@xyflow/react` v12).** It fits a semantic node/edge editor, keeps our JSON the single source of truth, and is MIT-licensed with no production key or watermark. tldraw is rejected mainly on licensing (production key and possibly watermark or commercial license) and on its spatial grouping model.

### 2.3 Production licensing obligations

- Ship the license notices of all runtime dependencies: Stage 0 writes a static `public/THIRD_PARTY_LICENSES.md` (copied to `dist/` by Vite) listing each runtime dependency with its license text/copyright line, and the coordinator updates it whenever a runtime dependency changes. No license-collection build plugin is added. Licenses: React (MIT), `@xyflow/react` (MIT), Zod (MIT), `idb` (ISC), `html-to-image` (MIT).
- **Keep the React Flow attribution badge** (do not set `proOptions.hideAttribution`). The React Flow docs ask that it only be removed by Pro subscribers. MIT does not legally require the badge; keeping it costs nothing. **[Design decision]**
- The badge is outside `.react-flow__viewport`, so it does not appear in PNG exports.

---

## 3. Domain model and validation (schema contract)

All of section 3 is the contract every workstream codes against. It lives in `src/domain/types.ts`, `src/domain/constants.ts` and `src/domain/validation/*`. It does not import React or React Flow.

### 3.1 Types (`src/domain/types.ts`) — exactly the product schema

```ts
export const SCHEMA_VERSION = 2 as const;

export interface ArchitectureFile {
  schemaVersion: 2;
  architecture: Architecture;
}

export interface Viewport { x: number; y: number; zoom: number }
export interface Position { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface Architecture {
  id: string;
  name: string;
  description?: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  components: Component[];
  relationships: Relationship[];
  groups: Group[];
  canvas?: { viewport?: Viewport };
}

export type ComponentType = "agent" | "tool" | "memory" | "external_system" | "decision";

export interface ExternalLink { label?: string; url: string }

export interface Component {
  id: string;
  type: ComponentType;
  subtype?: "orchestrator";            // only when type === "agent"
  name: string;
  description?: string;
  notes?: string;                      // Markdown source
  links?: ExternalLink[];
  position: Position;                  // absolute canvas coordinates, top-left of node
  size?: Size;                         // set only after a user resize
  accent?: AccentId;                   // v2: decoration only (border and details); absent = type default
  properties?: Record<string, string>; // type-specific fields (3.3)
  behavior?: AgentBehavior;            // only when type === "agent"
}

export interface AgentBehavior {
  purpose?: string;
  role?: string;
  responsibilities?: string[];
  boundaries?: string[];
  activation?: string;
  rules?: string[];
  delegation?: string;
  outputs?: string;
  failureHandling?: string;
}

export type RelationshipType =
  | "delegates_to" | "supervises" | "uses" | "reads_from" | "writes_to"
  | "shares_context_with" | "reports_to" | "hands_off_to" | "depends_on"
  | "generic";

export type Direction = "directed" | "undirected";

export interface Relationship {
  id: string;
  type: RelationshipType;
  sourceId: string;      // component id; subject of the relation
  targetId: string;      // component id
  direction: Direction;
  label?: string;
  description?: string;
  visual?: Record<string, unknown>; // preserved verbatim; v2 reads only `visual.ports` (port pins, below)
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  notes?: string;
  memberComponentIds: string[];  // single source of truth for membership
  bounds: Rect;                  // visual metadata, derived (6.5)
}

export interface Selection {
  componentIds: string[];
  relationshipIds: string[];
  groupIds: string[];
}
```

Rules carried over verbatim from the spec: components have no `groupId` and no association lists; Orchestrator = `type: "agent"`, `subtype: "orchestrator"` with the same schema as Agent.

**Accent [UI v2]:** `AccentId` is one of the 16 fixed IDs in `ACCENT_IDS` (`tomato, coral, tangerine, mustard, olive, fern, mint, teal, lagoon, sky, denim, indigo, lavender, plum, rose, cocoa`; display names, ink and tint in `ACCENTS`, `src/domain/constants.ts`). The accent recolors only the node's border and icon chip, never the fill, text or the Orchestrator band. IDs are persisted, so they are never renamed or removed; adding one is a schema bump. Components only: groups have no `accent` (an `accent` key on a group is stripped on import). `accent` is not exported to Markdown (9.3) and does not appear in aria-labels.

**Port pins [UI v2]:** a relationship may carry `visual: { ports: { source?: "top"|"right"|"bottom"|"left", target?: … } }` (`readPortPins`, `src/domain/ports.ts`). An absent key means *automatic* for that end (6.4). A malformed value is treated as automatic and preserved verbatim. No schema field was added for this; ports are not typed (no input/output roles) and never change which end is the source.

**Optional-field normalization [Design decision]:** An empty string or empty array in an optional field is stored as *absent* (the key is removed). Setting a field to `""` in the inspector removes it. This keeps exported JSON clean and comparisons stable. `name` is never empty (3.5).

### 3.2 Relationship type metadata (`src/domain/constants.ts`)

| `type` | Display name | Verb (for sentences/labels) | Direction mode |
|---|---|---|---|
| `delegates_to` | Delegates To | delegates to | fixed `directed` |
| `supervises` | Supervises | supervises | fixed `directed` |
| `uses` | Uses | uses | fixed `directed` |
| `reads_from` | Reads From | reads from | fixed `directed` |
| `writes_to` | Writes To | writes to | fixed `directed` |
| `shares_context_with` | Shares Context With | shares context with | fixed `undirected` |
| `reports_to` | Reports To | reports to | fixed `directed` |
| `hands_off_to` | Hands Off To | hands off to | fixed `directed` |
| `depends_on` | Depends On | depends on | fixed `directed` |
| `generic` | Generic | *(label, or "relates to" when no label)* | configurable, default `directed` |

```ts
export const RELATIONSHIP_TYPES: Record<RelationshipType, {
  label: string; verb: string; direction: "directed" | "undirected" | "configurable";
}>;
export function allowedDirections(t: RelationshipType): Direction[]; // fixed → [d], generic → both
export function defaultDirection(t: RelationshipType): Direction;    // generic → "directed"
```

No restriction on which component types may be endpoints of which relationship type (the spec says "usually"). **[Design decision]**

### 3.3 Component type metadata and type-specific property keys

| `type` | Display name | Default name | Default size (w×h) | `properties` keys (all optional strings) | `behavior` |
|---|---|---|---|---|---|
| `agent` | Agent | "Agent" | 220×88 | none | allowed |
| `agent` + `subtype: "orchestrator"` | Orchestrator | "Orchestrator" | 220×88 | none | allowed |
| `tool` | Tool | "Tool" | 200×72 | `inputs`, `outputs`, `technicalReference` | forbidden |
| `memory` | Memory / Data Store | "Data Store" | 200×80 | `storeKind`, `accessScope`, `contents`, `accessNotes` | forbidden |
| `external_system` | External System | "External System" | 220×80 | `systemKind`, `boundaryNotes`, `referenceLink` | forbidden |
| `decision` | Decision / Routing Rule | "Decision" | 200×80 | `condition`, `outcomes` | forbidden |

Enumerated property values (validated):

- `storeKind` ∈ `"memory" | "vector" | "relational" | "file" | "other"`
- `accessScope` ∈ `"shared" | "private"`

All other property values are free text. **Unknown property keys** in `properties` (from hand-edited or future files) are accepted, preserved on round trip, and not shown in the inspector. **[Design decision]**

The common fields `name`, `description`, `notes`, `links` apply to all types.

**Decision/Routing Rule** is included: it costs one node style and two text fields, and the importer must accept `"decision"` anyway because it is in `ComponentType`. **[Design decision]**

Size constants: `MIN_SIZE = 160×56`, `MAX_SIZE = 480×320`. Effective size of a component = `size ?? DEFAULT_SIZE[type]`. Rendered nodes always use the effective size as fixed `width`/`height`, so domain geometry never depends on DOM measurement.

Group geometry constants: `GROUP_PADDING = 24`, `GROUP_HEADER = 32`.

Placement constants: `DUPLICATE_OFFSET = { x: 24, y: 24 }`, `ARROW_NUDGE = 8`, `ARROW_NUDGE_LARGE = 40`.

### 3.4 IDs

- New IDs: `` `${prefix}_${crypto.randomUUID()}` `` with prefixes `arch`, `cmp`, `rel`, `grp` (`src/domain/ids.ts`).
- Imported IDs: any non-empty string up to 200 characters is accepted and preserved (spec 12.5.3). IDs are only used as data, React keys and React Flow ids, never as HTML/CSS selectors.

### 3.5 Validation rules (`src/domain/validation/`)

Validation is a pure function used in three places: JSON import, loading a record from IndexedDB, and before every save.

```ts
export interface ValidationIssue { code: ValidationCode; path: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export function parseArchitectureFile(raw: unknown): ValidationResult<ArchitectureFile>;
// = migrate → shape (Zod) → referential/semantic checks → normalize. Collects all issues.
export function validateArchitecture(a: Architecture): ValidationIssue[]; // semantic checks only (pre-save)
```

Pipeline order (stop after a stage that produced issues, otherwise continue and collect *all* issues of a stage):

1. **JSON parse** (import only, in `io/`): failure → `E_JSON_PARSE`.
2. **Migration** (`migrate.ts`): input must be an object with numeric `schemaVersion`.
3. **Shape** (`schema.ts`, Zod): types, required fields, enums, limits.
4. **Semantic/referential** (`validate.ts`).
5. **Normalization** (`normalize.ts`): recompute group bounds (6.5). Normalization never fails.

`accent` is a string in the shape schema (like `subtype`) and checked against `ACCENT_IDS` in the semantic stage. `visual.ports` is never validated: any value is valid and preserved.

Shape schemas use plain `z.object` (unknown keys are **stripped**, the Zod 4 default) **except** `properties` (`z.record(z.string(), z.string())`) and `visual` (`z.record(z.string(), z.unknown())`), which are preserved. Dropping unknown top-level keys is silent. **[Design decision]**

Timestamps: `createdAt`/`updatedAt` must be strings matching `^\d{4}-\d{2}-\d{2}T` and `Number.isFinite(Date.parse(value))`. (Deliberately lenient instead of a strict ISO validator.)

Numbers: all coordinates finite; `zoom` finite and `> 0`; `size.width/height` finite and `> 0`; `bounds.width/height` finite and `>= 0`. Sizes outside `MIN_SIZE..MAX_SIZE` on import are clamped during normalization, not rejected.

Names: `name` (architecture, component, group) must be a string with at least one non-whitespace character.

#### Issue codes and messages

Messages are plain English, include IDs (truncated to 80 characters with "…") and are rendered as text.

| Code | Rule | Message template |
|---|---|---|
| `E_FILE_TOO_LARGE` | File > 5 MB | "The file is larger than 5 MB and cannot be imported." |
| `E_JSON_PARSE` | Not valid JSON | "The file is not valid JSON ({parser message})." |
| `E_NOT_ARCHITECTURE_FILE` | Not an object / no `architecture` | "This file is not a Swarm Architecturer architecture file." |
| `E_SCHEMA_VERSION_MISSING` | No numeric `schemaVersion` | "The file has no schemaVersion, so its format cannot be determined." |
| `E_SCHEMA_VERSION_UNSUPPORTED` | `schemaVersion` not an integer in 1–2 | "The file uses format version {v}. This version of Swarm Architecturer supports format versions 1 to 2." |
| `E_SHAPE` | Zod issue (missing field, wrong type, bad enum) | "{path}: {reason}" e.g. "architecture.components[3].name: expected a non-empty text value." |
| `E_LIMIT_EXCEEDED` | Safety caps exceeded (below) | "{path}: too many items ({n}; the maximum is {max})." / "…text is longer than {max} characters." |
| `E_DUPLICATE_ID` | ID repeated across components, relationships and groups | "ID {id} is used more than once ({kinds})." |
| `E_DANGLING_RELATIONSHIP` | `sourceId`/`targetId` not a component | "Relationship {relId} references unknown component {id} ({field})." |
| `E_GROUP_AS_ENDPOINT` | endpoint is a group ID | "Relationship {relId} uses group {id} as its {field}. Groups cannot be relationship endpoints." |
| `E_SELF_RELATIONSHIP` | `sourceId === targetId` | "Relationship {relId} connects component {id} to itself." **[Design decision: self-relationships are not allowed]** |
| `E_INVALID_DIRECTION` | direction not allowed for type | "Relationship {relId} of type {Type} must be {allowed}." |
| `E_INVALID_ACCENT` | `accent` not in `ACCENT_IDS` | "Component {id}: accent must be one of {ACCENT_IDS joined by ', '}." |
| `E_INVALID_SUBTYPE` | `subtype` on non-agent, or unknown value | "Component {id}: subtype \"orchestrator\" is only allowed on agents." / "…unknown subtype \"{value}\"." |
| `E_BEHAVIOR_NOT_ALLOWED` | `behavior` on non-agent | "Component {id} ({Type}) cannot have agent behavior fields." |
| `E_INVALID_PROPERTY_VALUE` | `storeKind`/`accessScope` not in enum | "Component {id}: {key} must be one of {values}." |
| `E_UNKNOWN_MEMBER` | member ID not a component | "Group {groupId} lists unknown component {id} as a member." |
| `E_GROUP_AS_MEMBER` | member ID is a group ID | "Group {groupId} lists group {id} as a member. Groups cannot be nested." |
| `E_MULTIPLE_MEMBERSHIP` | component in > 1 group (or twice in one group) | "Component {id} belongs to more than one group ({groupIds})." |
| `E_STORAGE_INVARIANT` | pre-save validation failed (bug) | "The architecture could not be saved because it is internally inconsistent: {first issue}." |

Safety caps (untrusted input, generous for "dozens" of components): components ≤ 1,000; relationships ≤ 3,000; groups ≤ 200; links per component ≤ 100; list items per behavior list ≤ 500; any single string ≤ 50,000 characters; IDs ≤ 200 characters.

UI shows at most 20 issues, then "…and {n} more problems."

### 3.6 Migration (`src/domain/validation/migrate.ts`)

```ts
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  1: (raw) => raw, // v2 only adds the optional `component.accent`; v1 content is valid as is.
};
// Applied in sequence up to SCHEMA_VERSION; each step sets schemaVersion to fromVersion + 1.
```

- `schemaVersion === 1` → migrated by the identity step to 2 (content unchanged). A v1 file therefore imports without loss and is exported as `schemaVersion: 2`.
- `schemaVersion === 2` → unchanged.
- Higher than `SCHEMA_VERSION` (for example 3) → `E_SCHEMA_VERSION_UNSUPPORTED`.
- Lower than 1, non-integer, or missing → `E_SCHEMA_VERSION_MISSING` / `E_SCHEMA_VERSION_UNSUPPORTED`.

The same function runs on records read from IndexedDB, so a stored v1 record is read as v2 and rewritten as v2 by the opportunistic rewrite on first read. **Rollback:** the v2 bump is not destructive, but a v1-only build rejects every v2 file and treats v2 IndexedDB rows as damaged until the app is rolled forward (record this in release notes).

### 3.7 Canonical serialization (`src/domain/serialize.ts`)

`toArchitectureFile(a: Architecture): ArchitectureFile` builds a new object with a fixed key order (the order in 3.1; `accent` is written right after `size`), writes `schemaVersion: SCHEMA_VERSION` (2), omits absent optional fields, and preserves array order. Export uses `JSON.stringify(file, null, 2) + "\n"`. IndexedDB stores the same object. This makes exports diff-friendly in version control and makes round trips byte-stable.

---

## 4. Module boundaries and data flow

### 4.1 Directory layout

```
index.html
vite.config.ts                 # incl. production CSP injection (14)
playwright.config.ts
public/THIRD_PARTY_LICENSES.md
src/
  main.tsx                     # mounts <App/>
  app/                         # app shell: routing, screens, global shortcuts
    App.tsx  router.ts  EditorScreen.tsx  shortcuts.ts  app.css
  domain/                      # pure TS, no React, no React Flow
    types.ts  constants.ts  ids.ts  geometry.ts  factories.ts
    commands.ts  operations.ts  selectors.ts  serialize.ts  normalize.ts
    validation/  schema.ts  validate.ts  migrate.ts  issues.ts  index.ts
  history/                     # undo/redo (pure TS)
    history.ts
  editor/                      # editor store binding domain + history + selection
    storeTypes.ts  store.ts  context.tsx  actions.ts
  canvas/                      # the ONLY module that imports @xyflow/react (plus io/exportPng.ts)
    CanvasView.tsx  projection.ts  dragController.ts  floating.ts
    nodes/ComponentNode.tsx  nodes/GroupNode.tsx
    edges/RelationshipEdge.tsx
    RelationshipTypePicker.tsx  ConnectDialog.tsx  canvasApi.ts  canvas.css
  palette/                     # component library (left panel)
    Palette.tsx  palette.css
  inspector/                   # right panel
    Inspector.tsx  ArchitectureInspector.tsx  ComponentInspector.tsx
    AgentSections.tsx  TypeFields.tsx  RelationshipList.tsx
    RelationshipInspector.tsx  GroupInspector.tsx  MultiSelectionInspector.tsx
    fields/  TextField.tsx  TextAreaField.tsx  ListField.tsx  LinksField.tsx  SelectField.tsx
    inspector.css
  toolbar/
    Toolbar.tsx  SaveStatusIndicator.tsx  toolbar.css
  library/                     # architecture library (home screen)
    LibraryScreen.tsx  ArchitectureRow.tsx  dialogs.tsx  library.css
  persistence/                 # IndexedDB, autosave, unload guard, tab sync
    types.ts  db.ts  repository.ts  autosave.ts  unloadGuard.ts  tabSync.ts
  io/                          # import/export
    types.ts  exportJson.ts  importJson.ts  exportPng.ts  download.ts  readFile.ts
  ui/                          # shared primitives, no domain knowledge
    tokens.css  base.css  Button.tsx  Dialog.tsx  ConfirmDialog.tsx
    Toast.tsx  LiveRegion.tsx  icons.tsx  safeLink.ts
  test/setup.ts                # Vitest setup (jest-dom, fake-indexeddb/auto)
e2e/                           # Playwright scenarios + fixtures
```

Tests are co-located as `*.test.ts(x)` next to the file under test and belong to the same owner.

### 4.2 Dependency rules (enforced by review; optionally by an ESLint `no-restricted-imports` rule)

```
domain   ← history ← editor ← { canvas, inspector, palette, toolbar, app }
domain   ← persistence ← { app, library, toolbar }
domain   ← io ← { app, library, toolbar }
ui       ← { canvas, inspector, palette, toolbar, library, app }
canvas   ← app (EditorScreen) ; canvas/canvasApi ← io/exportPng, toolbar
```

- `domain/` and `history/` import nothing from React, React Flow, IndexedDB or the DOM (except `crypto.randomUUID` in `ids.ts`).
- Only `canvas/**` and `io/exportPng.ts` import `@xyflow/react`. Only `io/exportPng.ts` imports `html-to-image`. Only `persistence/**` imports `idb`.
- No module except `editor/store.ts` mutates editor state; everyone else calls the store API.

### 4.3 Data flow

```
user input ─► canvas / inspector / palette / toolbar
                 │  store.dispatch(Command, {coalesceKey?})
                 ▼
            editor/store.ts ── applyCommand (domain/operations.ts) ──► new Architecture (immutable)
                 │                └─ history.push(before, after)
                 ├─► subscribers re-render (useSyncExternalStore selectors)
                 │      canvas/projection.ts maps Architecture → React Flow nodes/edges
                 └─► persistence/autosave.ts (subscribed) ─ debounce ─► validate ─► repository.put
```

The architecture object is the single source of truth. React Flow is fully controlled; nothing in React Flow's internal state is persisted except the viewport, which the canvas writes back through `store.setViewport`.

---

## 5. Editor store, commands and undo/redo

### 5.1 Commands (`src/domain/commands.ts`) — the only way to change content

```ts
export type Command =
  | { kind: "addComponent"; component: Component }
  | { kind: "duplicateComponents"; items: { sourceId: string; newId: string }[] }
  | { kind: "deleteElements"; componentIds: string[]; relationshipIds: string[]; groupIds: string[] }
  | { kind: "moveElements"; componentPositions: Record<string, Position>; groupDeltas: Record<string, Position> }
  | { kind: "resizeComponent"; id: string; position: Position; size: Size }
  | { kind: "updateComponent"; id: string; patch: Partial<Pick<Component, "name" | "description" | "notes" | "links">> }
  | { kind: "setComponentProperty"; id: string; key: string; value: string | undefined }
  | { kind: "updateBehavior"; id: string; patch: Partial<AgentBehavior> }
  | { kind: "setSubtype"; id: string; subtype: "orchestrator" | undefined }
  | { kind: "setComponentAccent"; ids: string[]; accent: AccentId | undefined }          // UI v2
  | { kind: "addRelationship"; relationship: Relationship }
  | { kind: "updateRelationship"; id: string; patch: { label?: string; description?: string } }
  | { kind: "retypeRelationship"; id: string; type: RelationshipType }
  | { kind: "setRelationshipDirection"; id: string; direction: Direction }  // generic only
  | { kind: "reverseRelationship"; id: string }                              // generic + directed only
  | { kind: "setRelationshipPorts"; id: string; ports: { source?: PortSide; target?: PortSide } | null } // UI v2
  | { kind: "createGroup"; group: { id: string; name: string }; memberIds: string[] }
  | { kind: "updateGroup"; id: string; patch: { name?: string; description?: string; notes?: string } }
  | { kind: "assignToGroup"; componentIds: string[]; groupId: string | null };

export interface CommandResult {
  architecture: Architecture;
  summary?: { deletedComponents: number; deletedRelationships: number; deletedGroups: number };
}
export class DomainError extends Error { code: string }
export function applyCommand(a: Architecture, c: Command): CommandResult; // pure; throws DomainError
```

`patch` semantics: a key present with value `undefined` or `""` (or `[]`) removes the field (3.1 normalization). `name` patches with blank values throw `DomainError("E_NAME_REQUIRED")`.

#### Operation semantics (`src/domain/operations.ts`)

| Command | Effect | Invariants / errors |
|---|---|---|
| `addComponent` | Append component. | ID unique; `subtype`/`behavior` only on agents. |
| `duplicateComponents` | For each source: copy all fields except `id` (including `accent`); `name` = `"{name} (copy)"`; position + `DUPLICATE_OFFSET`. **Relationships are not copied; the copy joins no group.** **[Design decision]** | Source must exist. |
| `deleteElements` | Remove listed groups (members are kept, i.e. ungrouped). Remove listed relationships. Remove listed components, **plus every relationship whose source or target is a removed component**, plus their IDs from every `memberComponentIds`. Recompute bounds of groups that lost members (empty groups keep their last bounds). Returns `summary`. | Unknown IDs are ignored. |
| `moveElements` | Set absolute positions for listed components. Translate `bounds` of each group in `groupDeltas`. Then, for every group containing a moved component **or** listed in `groupDeltas`, recompute bounds from members if it has members (6.5). | Positions finite. |
| `resizeComponent` | Set `position` and `size` (clamped to MIN/MAX). Recompute the bounds of its group. | — |
| `updateComponent` / `setComponentProperty` / `updateBehavior` | Patch fields. | `behavior` only on agents; enum checks for `storeKind`/`accessScope`. |
| `setSubtype` | Set/remove `subtype`. All other data unchanged (spec 6.2). | Agent only. |
| `addRelationship` | Append. Direction must be allowed for the type. | Endpoints must be existing components (not groups), distinct. |
| `retypeRelationship` | Change `type`. New direction: fixed types → their fixed direction; to `generic` → keep current direction. `label`/`description`/endpoints unchanged. | — |
| `setRelationshipDirection` | Change direction. | `type === "generic"` only. |
| `setComponentAccent` | Set or remove `accent` on the listed components (one undo entry, "Change accent color"; no-op when nothing changes). | Components only: unknown or group IDs → `E_COMPONENT_NOT_FOUND`; unknown accent → `E_INVALID_ACCENT`. |
| `setRelationshipPorts` | Replace only `visual.ports`, keeping other `visual` keys; `null` removes `ports` (an empty `visual` becomes absent). Undo label "Reset relationship ports". | Unknown ID → `E_RELATIONSHIP_NOT_FOUND`; a side outside `top|right|bottom|left` → `E_INVALID_PORT`. |
| `reverseRelationship` | Swap `sourceId`/`targetId` **and** `visual.ports.source`/`target`, so the line keeps its physical attachment and only the arrowhead moves. | `type === "generic"` and `direction === "directed"` only. |
| `createGroup` | Remove `memberIds` from any current group (explicit reassignment), create group with those members, compute bounds. | ≥ 1 member; members are components. |
| `updateGroup` | Patch name/description/notes. | — |
| `assignToGroup` | Remove each component from its current group; if `groupId` not null, append to that group. Recompute affected bounds. | Target group exists. |

`selectors.ts` (pure): `getComponent`, `getGroupOfComponent(a, id): Group | undefined`, `getRelationshipsOf(a, id): { outgoing: Relationship[]; incoming: Relationship[]; undirected: Relationship[] }` (directed incident relationships split by role; undirected ones listed once regardless of stored order), `relationshipDisplayLabel(rel)` (6.4), `describeRelationship(a, rel)` (sentence for aria-labels, e.g. "Validation Agent reads from Shared Lead Store" / "Discovery Agent and Validation Agent share context").

`factories.ts`: `createComponent(type, opts: { subtype?, position, existingNames })` (default name with numeric suffix: "Agent", "Agent 2", …), `createRelationship(type, sourceId, targetId)`, `createGroup(name)`, `createArchitecture(name, now)`.

### 5.2 History (`src/history/history.ts`)

Snapshot-based undo over immutable domain states. Structural sharing makes snapshots cheap at "dozens of components" scale. Operations are domain commands, so undo is independent of the canvas library (spec 13).

```ts
interface HistoryEntry { before: Architecture; after: Architecture; coalesceKey?: string; label: string }
interface History { past: HistoryEntry[]; future: HistoryEntry[]; openCoalesceKey?: string }

push(h, entry): History    // clears future; merges into top entry when entry.coalesceKey === h.openCoalesceKey
undo(h): { history: History; architecture: Architecture } | null   // returns top.before
redo(h): { history: History; architecture: Architecture } | null   // returns entry.after
breakCoalescing(h): History
```

- Cap: 200 entries (oldest dropped).
- **Coalescing:** inspector text inputs dispatch on every keystroke with `coalesceKey = "${entityId}:${field}"`. Consecutive dispatches with the same key merge into one entry (keep the first `before`, update `after`). Coalescing is broken by: field blur, any command with a different key, selection change, undo/redo.
- Arrow-key nudges use `coalesceKey = "nudge:" + sortedIds.join(",")` so holding an arrow is one step.
- History starts empty when an architecture is opened and is never persisted (spec M2).

**Coverage (exactly spec M2):** everything expressible as a `Command` is undoable. Not undoable (no `Command`; direct store methods): selection, viewport, architecture rename/description (library-level — the toolbar name *is* the library rename), import, exports, library actions.

**`updatedAt`:** the store sets `updatedAt = now` on every content change, **including undo and redo** (it overwrites the restored snapshot's timestamp), so the library order reflects the latest edit. Viewport changes do not touch `updatedAt`.

### 5.3 Editor store (`src/editor/storeTypes.ts`, `store.ts`, `context.tsx`)

```ts
export interface EditorState {
  architecture: Architecture;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;          // increments on every architecture change (content or viewport)
  contentRevision: number;   // increments on content changes only
}

export type DispatchResult =
  | { ok: true; summary?: CommandResult["summary"] }
  | { ok: false; error: DomainError };

export interface EditorStore {
  getState(): EditorState;
  subscribe(listener: () => void): () => void;
  dispatch(cmd: Command, opts?: { coalesceKey?: string; label?: string }): DispatchResult;
  undo(): void;
  redo(): void;
  breakCoalescing(): void;
  setSelection(sel: Selection): void;              // prunes unknown IDs; breaks coalescing
  setViewport(v: Viewport): void;                  // no history; no updatedAt change
  renameArchitecture(name: string): void;          // no history (library-level)
  setArchitectureDescription(d: string | undefined): void; // no history
}

export function createEditorStore(initial: Architecture, now?: () => string): EditorStore;
```

- After every architecture change (including undo/redo), selection is pruned to existing IDs.
- `context.tsx`: `EditorProvider`, `useEditorStore()`, `useEditorState<T>(selector, isEqual?)` via `useSyncExternalStore`.
- `actions.ts` (UI-agnostic helpers used by canvas, inspector, toolbar and shortcuts so behavior is identical everywhere):
  - `deleteSelection(store)` → dispatches `deleteElements`, then shows a toast "Deleted 1 component and 3 relationships." with an **Undo** button and announces it via the live region (spec 8.3 "the user sees it happen").
  - `duplicateSelection(store)`, `groupSelection(store)` (name "Group", "Group 2", …; selects the new group), `ungroupSelection(store)` (6.5), `nudgeSelection(store, dx, dy)`.

---

## 6. Interaction contracts (canvas)

### 6.1 React Flow configuration (`canvas/CanvasView.tsx`)

| Prop | Value | Why |
|---|---|---|
| `nodes`, `edges` | from `projection.ts` + transient drag/resize/selection state | Controlled flow. |
| `onNodesChange` | apply only `position` (while dragging), `dimensions`, `select` changes to local transient state via `applyNodeChanges`; ignore `remove` | Domain is changed only through commands. |
| `onEdgesChange` | apply only `select`; ignore `remove` | Same. |
| `deleteKeyCode` | `null` | Deletion is handled by `app/shortcuts.ts` → `actions.deleteSelection`. |
| `connectionMode` | `ConnectionMode.Loose` | Every port is a `source` handle; the node you drag from is the source. |
| `connectionRadius` | `20` | Snaps to a port within 20 px (`CONNECTION_RADIUS`). |
| `isValidConnection` | both ends are component nodes and `source !== target` | Groups can never be endpoints; no self-relationships. |
| `onConnect` | open `RelationshipTypePicker` (6.3) | Type chosen explicitly. |
| `edgesReconnectable` | `false` | Changing endpoints is not in scope; delete and reconnect instead. |
| `elevateNodesOnSelect` | `false` | Groups must stay under components. |
| `disableKeyboardA11y` | `true` | We implement arrow-key nudging ourselves through domain commands (6.7). Tab focus and Enter/Space selection keep working. |
| `nodesFocusable`, `edgesFocusable` | `true` | Keyboard access. |
| `multiSelectionKeyCode` | default (Meta on macOS, Control elsewhere) | — |
| `selectionKeyCode` | default (`Shift`, box select) | — |
| `onMoveEnd` | `store.setViewport(viewport)` | Persist the view (M7). |
| `defaultViewport` / `fitView` | stored viewport if present; otherwise `fitView` on open | Restore view (Scenario F). |
| `minZoom` / `maxZoom` | `0.2` / `2` | — |
| `ariaLabelConfig` | product-specific strings | 12. |
| `proOptions` | not set (attribution visible) | 2.3. |
| Children | `<Background/>`, `<MiniMap/>` (optional, hidden < 900px width) | Zoom buttons live in the toolbar, not in `<Controls/>`. |

`canvasApi.ts` exposes, via a React context set by `CanvasView`, `{ zoomIn, zoomOut, fitView, screenToFlowPosition, getViewportElement(): HTMLElement | null, getNodesBounds(): Rect, getDiagramBounds(): Rect }` so the toolbar, palette and PNG export never import React Flow directly. `getDiagramBounds()` (UI v2) is the union of the node bounds and, for every relationship, the bounds of its cubic (four control points, terminal rings, arrow tip) plus an estimated label plate (10).

### 6.2 Projection (`canvas/projection.ts`, pure, unit-tested)

```ts
toFlowNodes(a: Architecture, selection: Selection): Node[]
toFlowEdges(a: Architecture, selection: Selection): Edge[]
```

- **Group nodes first**, then component nodes (array order). Group node: `id = group.id`, `type: "group-container"`, `position = {bounds.x, bounds.y}`, `width/height = bounds`, `draggable: true`, `dragHandle: ".sa-group-header"`, `connectable: false`, `selectable: true`, `zIndex: 0`, `data: { group }`.
- Component node: `id = component.id`, `type: "component"`, `position`, `width/height` = effective size, `zIndex: 10`, `data: { component, groupName? }` (the node renders `data-type`, `data-subtype` and, only for a validated accent, `data-accent`; its silhouette is an inline SVG per `ShapeKind`, `canvas/shapes.ts`), `domAttributes: { "aria-roledescription": "component" }`, `ariaLabel`/`aria-label` = "{Type display}: {name}. {description}".
- Edge: `id = rel.id`, `type: "relationship"`, `source = rel.sourceId`, `target = rel.targetId`, `markerEnd = { type: MarkerType.ArrowClosed }` **only if directed**, no `markerStart` ever, `zIndex: 5`, `interactionWidth: 16`, `ariaLabel = describeRelationship(...)`, `data: { relationship, parallelOffset, labelPosition }` (parallel-pair spreading, 6.4). The edge component resolves ports and geometry itself from the live node rects.
- No `parentId` is used. Positions are absolute. Groups are siblings, not parents.

### 6.3 Creating components and relationships

**Add component (palette):**
- *Click* a palette item (button): add at the visible canvas center (via `canvasApi.screenToFlowPosition` of the canvas center, minus half the default size), offset by +24px per consecutive click-add without an intervening move, select the new component.
- *Drag* a palette item onto the canvas (HTML5 drag-and-drop, MIME `application/x-swarm-component`, payload `{type, subtype?}`): add at the drop point (`screenToFlowPosition`), select it.
- Palette items: Orchestrator, Agent, Tool, Memory / Data Store, External System, Decision / Routing Rule.
- Adding never changes group membership, even when dropped inside a group's bounds (spec 6.6).

**Connect (pointer) [UI v2 ports]:** each component node renders four ports (`Handle type="source"`, ids `top|right|bottom|left`) positioned on the silhouette outline (`portAnchor`), hidden at rest and shown on node hover, focus-within, selection and on every component while a connection drag is active. They are not keyboard tab stops.
1. Pressing a port makes its side the **source port**, always pinned. The connection line is a dashed preview cubic from that anchor along its normal.
2. Releasing on a port of another component (within the 20 px snap radius) pins the **target port** too. Releasing on a component body leaves the target port *automatic*; while hovering, the port that the automatic rule would pick (Rule B, 6.4) is highlighted (`.sa-port--active`), so what is shown is what is rendered. The highlight is delivered to the node through `ConnectHintContext` (`canvas/nodeContext.ts`).
3. `onConnect` → `RelationshipTypePicker` opens anchored near the drop point:
   - A `role="listbox"` of the 10 types (display name + one-line "reads as" hint), arrow keys to move, Enter to choose, Escape / outside click to cancel.
   - Choosing a type dispatches **one** `addRelationship` with `direction = defaultDirection(type)` and `visual: { ports: { source, target? } }`, and selects the new relationship (inspector opens it).
   - Cancelling creates nothing.
   - Dropping on a group, the pane, or the same node is rejected by `isValidConnection` (no picker).
The dragged-from node is always the source; port choice is purely visual.

**Connect (keyboard alternative):** with exactly one component selected, toolbar/inspector action **"Connect…"** (shortcut `C` when focus is not in a text field) opens `ConnectDialog`: a `<dialog>` with *Relationship type* select and *Target component* select (all components except the source, sorted by name) and the note "Ports are chosen automatically from the components' positions." OK dispatches `addRelationship` **without** `visual`, so the edge re-routes when nodes move. Keyboard port pinning is out of scope; pins can be reset (not set) from the relationship inspector (7.3). **[Design decision; keeps relationship creation keyboard-accessible]** The read-only Relationships list in the inspector does *not* create relationships (spec 5.5).

### 6.4 Edge rendering and direction semantics (`canvas/edges/RelationshipEdge.tsx`, `canvas/floating.ts`)

- **Ports and curved paths [UI v2, replaces the v1 floating straight edge]:** every end attaches to a *port anchor on the node silhouette* (`portAnchor(kind, w, h, side)` in `canvas/shapes.ts`; never the bounding-box intersection). Sides come from `visual.ports` when valid, else from the deterministic automatic rule (`autoPorts`, evaluated against the live node rects at render time, so automatic edges re-route when a node moves):
  - *Rule A (both ends automatic):* compare the horizontal and vertical gaps between the rects; the larger gap (horizontal wins ties) decides: right→left / left→right, or bottom→top / top→bottom, by the sign of the centre distance, with the ID order as a tie-breaker only at exact alignment. Swapping source and target yields the same physical sides, so stored order is never visible.
  - *Rule B (one end pinned):* the automatic end uses the port of its node nearest to the pinned anchor (ties: right, bottom, left, top).
  - The path is a cubic `M P0 C P1 P2 P3` (`cubicEdgeGeometry`, `canvas/floating.ts`): `P0` is the source anchor pushed out by `TERMINAL_RADIUS` (3.5) along its normal, control distance `clamp(0.4 × chord, 32, 120)` along each port normal, so the curve leaves and enters perpendicular to the outline. **[UI v2 refinement]** A minimum bow (`CURVE_BOW_MAX` 24, `CURVE_BOW_FACTOR` 0.15, `CURVE_BOW_MIN_CHORD` 24) keeps every relationship visibly curved, including aligned facing ports; it fades to zero once the curve already bends. Undirected edges are built in canonical (code-point) id order, so the stored order is never visible. React Flow's `getBezierPath` is not used. The full algorithm is UI_V2_DESIGN §8.5.
  - **Terminal rings** (`circle.sa-edge-terminal`, `data-terminal`, `data-side`) are drawn on *both* ends of every edge, so they carry no direction.
- **Parallel edges** keep the unordered-pair index; both inner control points shift along the bow-adjusted normal in `PARALLEL_STEP` = 20 px steps (ends stay on the ports). **[UI v2 refinement]** On top of the minimum bow the fan has no straight edge, and midpoints of neighbouring edges stay at least 15 px apart (UI_V2_DESIGN §8.5). Labels are placed by the layout described under *Label* below.
- Nothing handle-related besides the optional port pins is stored in the domain; edges never animate. **[UI v2 refinement]** Label layout and the curve bow are render-only: they are computed from live geometry each render, never stored, and not part of the saved JSON or the Markdown export.
- **Directed:** a closed arrowhead at the **target** end only. It is an inline path (`path.sa-edge-arrow`; no SVG `<marker>`, no `url(#…)`, so PNG export needs no ID resolution) whose tip touches the target terminal ring. **[UI v2 refinement]** Its direction is the curve's end tangent, `u = normalize(T − P2)`, and the last curve segment is aligned to it, so the arrowhead never kinks against the curve (this replaces the earlier `-n_target` rule, which broke on parallel edges). The projection still sets `markerEnd` only for directed relationships and the edge uses it as the on/off switch.
- **Undirected:** no arrowheads at either end, plus a dashed stroke as a second, non-color cue. **[Design decision]** The stored source/target order is never shown as a direction anywhere (canvas, inspector, aria-labels, exports).
- **Label** (rendered by the edge itself as SVG, inside its own `<g>`, so it is part of the SVG and always included in PNG export; `BaseEdge` draws only the path). **[UI v2 refinement]** Markup: `rect.react-flow__edge-textbg` (radius 3) and `text.react-flow__edge-text` with one or two `tspan`s 15 px apart; the group carries `data-mode` (`path`, `path-wrapped` or `callout`). Callouts add a dashed leader and a 1 px plate border (`.sa-edge-label__plate--callout`). Text:
  - predefined type without label → type verb, e.g. "reads from";
  - predefined type with label → "reads from · {label}";
  - `generic` with label → "{label}"; without label → "relates to".
  - Labels truncate to 40 characters with "…" on the canvas (full text in inspector and aria-label).
  - **[UI v2 refinement] Placement** (`canvas/edgeLabels.ts`, pure): on the path in one line, then on the path in two lines, then as a callout with a leader, and finally a guaranteed fallback callout above the pair, so a label is never dropped or covered by a node. Obstacles are the component boxes, group header strips, arrowhead boxes, terminal rings and earlier plates, each inflated by `LABEL_CLEARANCE` (4 px). The canvas computes it once per render for all edges (`layoutDiagramLabels`, from the live node rects) and hands each edge its placement through `EdgeLabelLayoutContext` (`EdgeLabelLayoutProvider` in `CanvasView`). An edge rendered outside the canvas lays out only against its own nodes. Plate padding is `LABEL_PAD_X` 6 and `LABEL_PAD_Y` 2; text is 12 px. Text measurement uses `canvas` `measureText`, with a 7 px per code point fallback where that is unavailable (jsdom).
- Parallel relationships between the same pair are allowed; the second and later ones bulge to alternating sides (index-based, 20 px steps) so labels do not overlap. **[Design decision]**
- Selected edge: thicker stroke + selection color; focus ring for keyboard focus.

**Direction actions (enforced in domain, mirrored in UI):**

| Relationship | Direction control in inspector | Reverse action |
|---|---|---|
| predefined directed | read-only text "Directed (fixed by type)" | none (not rendered) |
| `shares_context_with` | read-only text "Undirected (fixed by type)" | none |
| `generic`, directed | radio: **Directed** / Undirected | "Reverse direction" button (swaps source/target) |
| `generic`, undirected | radio: Directed / **Undirected** | none (button hidden) |

### 6.5 Groups (`canvas/dragController.ts`, `canvas/nodes/GroupNode.tsx`, domain geometry)

**Geometry (`domain/geometry.ts`):**

```ts
effectiveSize(c: Component): Size
componentRect(c: Component): Rect
computeGroupBounds(members: Component[]): Rect
// minX/minY/maxX/maxY over member rects;
// x = minX - GROUP_PADDING; y = minY - GROUP_PADDING - GROUP_HEADER;
// width = (maxX - minX) + 2*GROUP_PADDING; height = (maxY - minY) + 2*GROUP_PADDING + GROUP_HEADER
recomputeGroupBounds(a: Architecture, groupIds: Iterable<string>): Architecture
// groups with ≥1 member get computeGroupBounds; empty groups keep their bounds
```

Bounds are always the tight padded box (they shrink as well as grow). They never determine membership.

**Rendering:** group node sits under components (6.2). It shows a header bar (`.sa-group-header`) with the group name and a member count, a dashed outline and a translucent fill (alpha ≤ 0.12). The group body has `pointer-events: none` so clicks and box-selection inside a group reach the pane, edges and components; only the header and outline are interactive. The group is dragged by its header. Groups have no handles and no resize control.

**Rules (spec 6.6, all enforced in `operations.ts`):**

| Interaction | Result |
|---|---|
| **Group** (toolbar, `Mod+G`, multi-selection inspector) with ≥1 component selected | `createGroup` with selected components; any that were in another group are moved (never in two groups). Selected groups/relationships in the selection are ignored. New group selected. |
| **Ungroup** (`Mod+Shift+G`) with group(s) selected | Delete those groups (members and relationships kept) = same as deleting the group. |
| **Ungroup** with component(s) selected | `assignToGroup(componentIds, null)`; groups remain (possibly empty). |
| Inspector "Group" select on a component | `assignToGroup([id], groupId \| null)`. |
| Group inspector member row "Remove from group" | `assignToGroup([id], null)`. |
| Drag a member outside the bounds | Membership unchanged; bounds recomputed to enclose it. |
| Drag a non-member into the bounds | Membership unchanged. |
| Drag a group (by header) | All members move by the same delta; one history step. |
| Delete a group | Members, their positions and relationships unchanged. |
| Delete a member | Removed from the group; group remains even if empty. |
| Empty group | Keeps last bounds; can be renamed, moved (by header), assigned to, deleted. |
| Connect to a group | Impossible (no handles; `isValidConnection` rejects). |

**Drag controller (pure helper + hooks in `CanvasView`):**

1. `onNodeDragStart(event, node, nodes)`: compute the *moving set*: every dragged component + every member of every dragged group (deduplicated). Record start positions for components and groups.
2. `onNodeDrag`: delta = current position of the dragged node − its start. Write transient positions (start + delta) for the whole moving set and for dragged groups, and transient bounds for affected groups (via `computeGroupBounds` on transient positions) into the local node state. Members move live with their group.
3. `onNodeDragStop`: dispatch **one** `moveElements` with final absolute positions for all moved components and `groupDeltas` for dragged groups; clear transient state. If the delta is zero, dispatch nothing.

Resize: `NodeResizer` on selected component nodes (`minWidth/minHeight` = MIN_SIZE, max via clamp), transient during resize, one `resizeComponent` on resize end.

### 6.6 Selection

- Source of truth: `store.selection`. React Flow `select` changes are translated into `store.setSelection` (component/group/relationship IDs split by node/edge type).
- Click selects one; `Mod`+click toggles; `Shift`+drag box-selects; click on empty pane clears.
- Selection is not undoable (M2).
- Inspector rules: nothing → Architecture inspector; exactly one element → its inspector; more → Multi-selection inspector.
- Selecting from the inspector (relationship list, group member list) calls `store.setSelection` and the canvas reflects it. No automatic panning. **[Design decision]**

### 6.7 Keyboard shortcuts (`app/shortcuts.ts`, single `keydown` listener on the editor screen)

`Mod` = Cmd on macOS, Ctrl elsewhere. "Editable focus" = focus in `input`, `textarea`, `select` or `[contenteditable]`.

| Key | Action | When |
|---|---|---|
| `Mod+Z` | Undo | Always in the editor (also in text fields: app undo replaces native text undo; consecutive typing is one step). `preventDefault`. |
| `Mod+Shift+Z`, `Ctrl+Y` | Redo | Always in the editor. |
| `Delete`, `Backspace` | Delete selection (`actions.deleteSelection`) | Not in editable focus. |
| `Escape` | Close topmost popover/dialog → cancel in-progress connection → clear selection | Always. |
| `Mod+D` | Duplicate selected components | Not in editable focus. `preventDefault`. |
| `Mod+G` / `Mod+Shift+G` | Group / Ungroup | Not in editable focus. |
| `C` | Open Connect dialog | Exactly one component selected, not in editable focus. |
| Arrow keys / `Shift`+Arrow | Nudge selected components and groups by 8 / 40 px (`moveElements`, coalesced) | Focus on the canvas, not editable. |
| `Tab` / `Shift+Tab` | React Flow focus traversal; Enter/Space selects focused node/edge | Canvas. |
| `Mod+=` / `Mod+-` / `Shift+1` | Zoom in / out / fit | Not in editable focus. |

---

## 7. Inspector specification (`src/inspector/`)

All inputs have visible `<label>`s. Text edits dispatch on change with a coalesce key and call `store.breakCoalescing()` on blur. Each field component keeps a local draft and re-syncs from the store when the stored value changes for reasons other than its own edits (undo/redo, selection change).

### 7.1 Component inspector — Agent / Orchestrator (spec 5.2)

| Section | Fields (store path) | Control |
|---|---|---|
| **Identity** | Name (`name`, required) | text input; blank shows "Name is required" and is not committed; blur restores last valid value |
| | Kind: Agent / Orchestrator (`subtype`) | segmented control → `setSubtype` (data preserved) |
| | Description (`description`) | single-line text input, hint "Shown on the node" |
| | Purpose (`behavior.purpose`), Role (`behavior.role`) | textareas |
| | Group (`Group.memberComponentIds`) | select: "None" + groups by name → `assignToGroup` |
| **Responsibilities** | Responsibilities (`behavior.responsibilities`), Boundaries (`behavior.boundaries`) | `ListField`: textarea, one item per line; committed as trimmed non-empty lines |
| **Behavior** | Activation, Behavioral Rules (`rules`, ListField), Delegation, Outputs, Failure Handling | textareas |
| **Appearance** (UI v2) | Accent color (`accent`) | `AccentPicker`: `<fieldset>` with legend "Accent color" and 17 native radios ("Type default" + the 16 accents in `ACCENT_IDS` order, accessible names = display names) and a text caption "Accent: {name}". A change dispatches `setComponentAccent` immediately (one undo entry per change; nothing is announced beyond the radio). Placed after the type-specific fields and before Relationships, **open by default** (as built). Present for every component type; not in the group, relationship, architecture or multi-selection inspectors. |
| **Relationships** | read-only `RelationshipList` (7.4) | — |
| **Documentation** | Notes (`notes`, Markdown source), External links (`links`) | `NotesField`: textarea (monospace hint "Markdown") with an Edit/Preview toggle (two `aria-pressed` buttons; Preview renders `ui/MarkdownPreview`, see 14); `LinksField` rows of label + URL with add/remove buttons |
| Footer actions | Connect…, Duplicate, Delete | buttons → `actions.*` |

Sections are collapsible (`<details>`/`<summary>`); Identity and Appearance open by default.

### 7.2 Component inspector — other types

All component types get the same **Appearance** section as 7.1 (the accent picker).

Identity (Name, Description, Group), then **type fields** (`TypeFields.tsx`), then Relationships, then Documentation (Notes, Links).

| Type | Fields |
|---|---|
| Tool | Inputs (textarea, `inputs`), Outputs (textarea, `outputs`), Technical reference (text, `technicalReference`) |
| Memory / Data Store | Store kind (select: Not set, Memory, Vector, Relational, File, Other → `storeKind`), Access scope (select: Not set, Shared, Private → `accessScope`), Contents (textarea), Access notes (textarea) |
| External System | System kind (text, `systemKind`), Boundary / ownership notes (textarea, `boundaryNotes`), Reference link (text, `referenceLink`; rendered as a link next to the field only if `safeLink` accepts it) |
| Decision / Routing Rule | Condition (textarea, `condition`), Outcomes (textarea, `outcomes`) |

### 7.3 Relationship inspector

- Header sentence: directed → "**From** {source name} **to** {target name}"; undirected → "**Between** {A} **and** {B}". Each name is a button that selects that component.
- Type: select of the 10 types → `retypeRelationship`.
- Direction: per table in 6.4.
- **Ports** (read-only row, UI v2): "{Source name}: {Right side | Automatic} · {Target name}: {Left side | Automatic}" (component names for both directed and undirected, no arrow glyph). A secondary button **"Reset ports to automatic"** appears only while a pin exists; it dispatches `setRelationshipPorts(id, null)` (one undo step) and moves focus to the row.
- Label (text), Description (textarea).
- Delete button.

### 7.4 Read-only Relationships list (component inspector)

- Built from `getRelationshipsOf`. Grouped by relationship type (display name headings). Within a type, outgoing entries ("→ Target name"), incoming entries ("← Source name"), undirected entries ("↔ Other name"). Label shown after the name if present.
- Each entry has two controls: the main button selects the relationship (opens relationship inspector); a secondary button "Go to {other name}" selects the other component.
- No add/edit/delete controls in this list (spec 5.5). Empty state: "No relationships yet. Drag from a node's edge handle to another component, or use Connect…".

### 7.5 Group inspector

Name (required), Description, Notes (`NotesField` with Edit/Preview, as in 7.1); Members list (each: name button to select the member, "Remove from group" button); action "Delete group (keeps members)".

### 7.6 Architecture inspector (nothing selected) and Multi-selection inspector

- Architecture: Name (renames; not undoable), Description (not undoable), counts of components/relationships/groups, a short hint on adding components.
- Multi-selection: "{n} components, {m} relationships, {k} groups selected"; actions: Group selected components (enabled if ≥1 component), Remove from groups, Duplicate (components only), Delete.

---

## 8. Local persistence (`src/persistence/`)

### 8.1 Decision: IndexedDB (via `idb`)

| | localStorage | IndexedDB |
|---|---|---|
| Capacity (MDN, checked) | 5 MiB per origin | Large share of disk (browser-specific quota) |
| API | Synchronous; blocks the main thread on every autosave | Asynchronous, transactional |
| Errors | `QuotaExceededError` | `QuotaExceededError` |
| Structured data | strings only | structured clone |

IndexedDB wins on capacity, async writes and transactions. `localStorage` is used only for non-critical UI preferences (panel collapsed state, dismissed backup banner) under the key prefix `sa:ui:`; failures there are ignored.

### 8.2 Schema

- Database `swarm-architecturer`, version `1`.
- Object store `architectures`, `keyPath: "architecture.id"`, value = canonical `ArchitectureFile` (3.7). The stored format equals the export format, so there is exactly one serialization path.
- No indexes; the library uses `getAll()` and sorts in memory (fine at the expected scale).

### 8.3 Repository API (`repository.ts`)

```ts
export type StoredRecord =
  | { status: "ok"; file: ArchitectureFile }
  | { status: "damaged"; id: string; name: string; issues: ValidationIssue[]; raw: unknown };

export interface Repository {
  list(): Promise<StoredRecord[]>;                       // runs migrate + validate on each record
  get(id: string): Promise<StoredRecord | undefined>;
  put(file: ArchitectureFile): Promise<void>;            // validates first; throws SaveError
  create(name: string): Promise<ArchitectureFile>;
  duplicate(id: string): Promise<ArchitectureFile>;      // new arch id, name "{name} (copy)", inner IDs kept
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}
export function openRepository(): Promise<Repository>;    // throws StorageUnavailableError
```

`put` re-validates (`validateArchitecture`) before writing (spec 12.2: validation runs before saving). A failing record is never written.

### 8.4 Autosave (`autosave.ts`)

```ts
export type SaveStatus = "saved" | "pending" | "saving" | "error";
export interface SaveController {
  getStatus(): { status: SaveStatus; error?: string };
  subscribe(l: () => void): () => void;
  flush(): Promise<boolean>;   // save now if dirty; resolves true if saved
  retry(): void;
  dispose(): void;
}
export function startAutosave(store: EditorStore, repo: Repository): SaveController;
```

- Subscribes to `revision`. On change: status `pending`; debounce 400 ms, max wait 2 s; then `saving` → `repo.put(toArchitectureFile(state.architecture))` → `saved`, or `error` with a message (quota, storage unavailable, `E_STORAGE_INVARIANT`).
- Only one write in flight; changes during a write schedule one follow-up write with the latest state.
- After `error`, the next change retries automatically; the toolbar also offers **Retry**.
- `flush()` is awaited before leaving the editor (Library button, opening an import).
- Toolbar labels: `saved` → "Saved", `pending`/`saving` → "Saving…", `error` → "Save failed" + Retry (spec 18).

### 8.5 Unload guard and storage durability

- `unloadGuard.ts`: `beforeunload` handler calls `preventDefault()` (and sets `returnValue`) while status is `pending`, `saving` or `error` (spec 12.2 "Unsaved changes").
- On the first architecture creation or import, call `navigator.storage?.persist?.()` once (user-initiated moment; Chromium/Safari decide silently, Firefox may prompt). The result is not required for operation.
- The library shows a persistent backup notice: "Your architectures are stored only in this browser. Clearing site data erases them. Export to JSON to keep a backup." (dismissible banner + always-visible footer line) (spec 18).

### 8.6 Multiple tabs (`tabSync.ts`)

`BroadcastChannel("swarm-architecturer")` (feature-detected; no-op if missing):
- Editor posts `{type: "opened", id, tabId}` on open; another tab that has the same architecture open answers `{type: "also-open", id}`; both show a non-blocking banner: "This architecture is also open in another tab. Edits in one tab can overwrite edits in the other."
- Repository writes post `{type: "changed", id}`; an open library screen reloads its list.
- Last write wins. No merging. **[Design decision]**

---

## 9. JSON import and export (`src/io/`)

### 9.1 Export (`exportJson.ts`, `download.ts`)

- `exportArchitectureJson(a)` → `JSON.stringify(toArchitectureFile(a), null, 2) + "\n"` → `Blob` (`application/json`) → `download(blob, filename)` via a temporary `<a download>` and `URL.createObjectURL` (revoked after click).
- Filename: `{slug(name) || "architecture"}.json`, slug = lowercase ASCII letters/digits/hyphens, ≤ 60 chars.
- Exports from the in-memory state (no save required). Available in the editor toolbar and in each library row.
- Library export of a **damaged** record downloads its raw stored JSON (`{slug}-raw.json`) so data is never trapped.

### 9.2 Import (`importJson.ts`, `readFile.ts`)

```ts
export type ImportResult =
  | { ok: true; file: ArchitectureFile; renamed: boolean }
  | { ok: false; issues: ValidationIssue[] };
export async function importArchitectureFile(file: File, repo: Repository, now: () => string): Promise<ImportResult>;
```

Steps (spec 12.5):
1. Reject files > 5 MB (`E_FILE_TOO_LARGE`) before reading.
2. `file.text()` → `JSON.parse` (`E_JSON_PARSE`).
3. `parseArchitectureFile` (migrate → shape → semantic → normalize). Any issue → return `{ok:false}`; **nothing is written**.
4. If `repo.exists(architecture.id)`: new ID `arch_<uuid>`, name `"{name} (imported)"`, `renamed = true`. All component, relationship and group IDs are preserved.
5. Set `updatedAt = now`; keep `createdAt`.
6. `repo.put(file)`; return `{ok:true}`. The caller opens the new architecture (route `#/a/<id>`) with empty history.

Entry points: library "Import JSON" button and editor toolbar "Import" (flushes the current save, then imports; never replaces the open architecture). UI uses `<input type="file" accept=".json,application/json">`.

Error UI: an `ImportErrorDialog` (`<dialog>`) titled "This file can't be imported", listing issues (max 20, see 3.5) and "Nothing was saved." Import is not undoable.

### 9.3 Markdown export (`exportMarkdown.ts`)

- `exportArchitectureMarkdown(a)` → a deterministic documentation document (`text/markdown`), filename `{slug(name) || "architecture"}.md`. Available from the editor **Export ▾** menu ("Markdown document") and as **Export Markdown** on each healthy library row (not on damaged rows). Export only; there is no Markdown import.
- Content: title and description, summary counts, Groups (description, members, notes, plus an "Ungrouped" list), Components (type, orchestrator subtype, groups, description, agent behavior, type properties, safe links, notes), Relationships (source, verb, direction arrow, target, label, description). The Relationships section states that relationships are semantic documentation, not execution order, control flow or data flow.
- Determinism: groups and components sort by name then id (codepoint order), relationships by source name, target name, type, label, id. Timestamps, canvas geometry, the component `accent` and relationship `visual` (port pins) are never emitted (output is identical with and without accents). Empty fields and empty sections are omitted.
- Escaping: single-line structured fields are backslash-escaped; multi-line fields are escaped per line; notes are embedded verbatim with any unclosed code fence closed. Only `safeLink` URLs become Markdown links; others are shown as code spans.

---

## 10. PNG export (`src/io/exportPng.ts`)

**Approach (React Flow "Download Image" example technique):** render the diagram's DOM to PNG with `html-to-image`'s `toPng`, targeting the `.react-flow__viewport` element and overriding its transform so that the full diagram (not just the visible part) fits the image.

```ts
export async function exportPng(api: CanvasApi, name: string): Promise<void>;
```

1. If there are no components and no groups → button disabled ("Nothing to export").
2. `bounds = api.getDiagramBounds()` (`computeDiagramBounds`, `canvas/bounds.ts`). **[UI v2 refinement]** `B` is the union of: every component and group box, inflated by 1 px; every edge's exact cubic bounding box (per axis, the curve at `t = 0`, `1` and the interior roots of `B′(t)`), inflated by 0.75 px, not the control-point hull; every arrowhead's three vertices and both terminal rings (`R + 0.75`); and every label plate and leader end point from the same `layoutDiagramLabels` the canvas draws. With nothing to draw it is a zero rect. The label layout is pure and independent of render timing.
3. Frame (`computeExportFrame`, `io/exportPng.ts`). **[UI v2 refinement]** `PAD = 48`. `s = min(1, 4096 / (B.width + 96), 4096 / (B.height + 96))`, with no lower clamp. Image size `ceil((B + 96)·s)` CSS px, capped at 4096 (the small epsilon keeps floating-point noise from adding a pixel). `pixelRatio: 2`, so the final image is at most 8192 px.
4. Transform: `transform = { x: (48 − B.x)·s, y: (48 − B.y)·s, zoom: s }`. **[UI v2 refinement]** `getViewportForBounds` is no longer used. It fits the bounds with its own padding (about 2.4 %) and zooms up to 2×, which removed the margin. The margin is `48·s` CSS px on every side, so it shrinks with the diagram when the 4096 px cap applies, and it is `96·s` device px on the exported PNG.
5. Add class `sa-exporting` to the React Flow root for the duration (CSS hides ports/handles, resize controls, focus rings and the selection outline and halo, `.sa-node__selection` / `.sa-node__halo`), then:
   ```ts
   toPng(api.getViewportElement()!, {
     backgroundColor: <canvas background token>,
     width, height, pixelRatio: 2,
     style: { width: `${width}px`, height: `${height}px`,
              transform: `translate(${frame.transform.x}px, ${frame.transform.y}px) scale(${frame.transform.zoom})` },
     filter: (node) => !(node instanceof HTMLElement && node.classList.contains("react-flow__handle")),
   })
   ```
6. Remove `sa-exporting` in `finally`; download as `{slug}.png`.

**UI v2 rendering notes:** node silhouettes, accents, terminal rings and inline arrowheads are plain SVG with CSS-variable fills (no `url(#…)` references), so they export as rendered. Ports are excluded (`exportFilter` drops `react-flow__handle`). `<Background>` dots sit outside `.react-flow__viewport`, so the PNG has a flat `--sa-color-canvas` (`#F7F6F3`) background by design.

Why this satisfies Scenario H: group nodes and edges (with SVG-text labels, 6.4) are all inside `.react-flow__viewport`; MiniMap, attribution and toolbar are outside it. System fonts avoid web-font embedding issues.

**Version pin:** React Flow's example states that `html-to-image` releases after **1.11.11** did not export images correctly and pins 1.11.11. We pin exactly `1.11.11`. Upgrading requires the PNG e2e check (15.3) to pass.

Failure → toast "Image export failed. Try zooming out or reducing the diagram size." (error logged to console). SVG export is deferred (spec M8 allows it).

---

## 11. Library screen and app shell

### 11.1 Routing (`app/router.ts`)

- `#/` → Library. `#/a/<encodeURIComponent(id)>` → Editor. Anything else → Library.
- Opening an unknown or damaged ID → Library with toast "That architecture could not be opened."
- Browser back/forward work via `hashchange`.

### 11.2 Library screen (`library/`)

- **Loading:** skeleton rows while `repo.list()` runs.
- **Empty:** "No architectures yet." + primary **New architecture** + **Import JSON**.
- **List:** a `<table>` (name, last edited (relative + exact in `title`), counts) sorted by `updatedAt` desc. Row actions: Open (row name is a link to `#/a/<id>`), Rename, Duplicate, Export JSON, Export Markdown, Delete.
- **New architecture:** dialog with Name (default "Untitled architecture", required) → `repo.create` → open editor (Scenario A: it appears in the library).
- **Rename:** dialog with Name.
- **Delete:** `ConfirmDialog` "Delete '{name}'? This cannot be undone. Export it to JSON first if you want a backup." with **Delete** (destructive) / Cancel; Cancel is focused by default.
- **Damaged rows:** marked "Can't be opened" with the first issue message; actions Export raw JSON, Delete.
- **Storage unavailable:** full-page error (13).
- Backup notice (8.5).

### 11.3 Editor screen (`app/EditorScreen.tsx`)

Layout: toolbar (top, `<header>`), palette (left, `<aside aria-label="Component library">`, collapsible), canvas (`<main>`), inspector (right, `<aside aria-label="Inspector">`, collapsible). Collapse buttons use `aria-expanded`; state remembered in `localStorage`.

Lifecycle: `repo.get(id)` → if ok, `createEditorStore(file.architecture)` → `startAutosave` → `tabSync.open(id)` → render. On leave: `await saveController.flush()`, dispose.

### 11.4 Toolbar (`toolbar/`)

Left: "Library" back button; architecture name (inline-editable text input → `renameArchitecture` on blur/Enter; Escape reverts); `SaveStatusIndicator` (`role="status"`).
Center: Undo, Redo (disabled per `canUndo/canRedo`), Zoom out, Zoom in, Fit.
Right: Group, Ungroup, Connect…, Delete (enabled per selection), **Export ▾** (JSON, Markdown, PNG), **Import**.
All icon buttons have `aria-label` and a tooltip with the shortcut.

---

## 12. Accessibility

Targets: spec section 18 (labelled forms, legible text and contrast, clear selection, keyboard delete/undo/redo/Escape, form/panel navigation). Aim for WCAG 2.2 AA on all non-canvas UI.

- **Forms:** every control has a `<label>`; errors use `aria-invalid` + `aria-describedby`.
- **Dialogs:** native `<dialog>` with `showModal()` (built-in focus containment and Escape); focus returns to the opener on close.
- **Live announcements:** one polite `LiveRegion` (`ui/LiveRegion.tsx`) for deletions, undo/redo ("Undid: Delete component"), save failures, import results.
- **Canvas:** nodes and edges focusable; node `aria-label` = "{Type}: {name}. {description}"; edge `aria-label` = `describeRelationship`; `ariaLabelConfig` overrides React Flow's default help text to mention our shortcuts. Arrow-key nudge and Connect dialog give keyboard-only paths for move and connect.
- **Not color alone:** each component type differs by silhouette **and** icon **and** type text (Agent/Orchestrator rounded rectangle, Tool chamfered octagon, Memory cylinder, External System dashed hatched parallelogram, Decision hexagon); the Orchestrator differs from the Agent by a solid header band + hub icon + "ORCHESTRATOR" label (a marker, not a shape); undirected edges are dashed and have no arrowheads. The accent color carries no meaning: it is not announced, not in aria-labels and not in Markdown export. The accent picker is a native radio group with text names and a visible text caption.
- **Ports:** not keyboard tab stops; the Connect dialog (automatic ports) is the keyboard path for every relationship the pointer can make. Node and edge aria-labels contain no color or port wording.
- **Selection:** a 2 px outline that follows the silhouette, inflated 4 px, plus an 8 px halo, with ≥ 3:1 contrast against the canvas; the keyboard focus ring stays on the rectangular node wrapper, distinct from selection.
- **Contrast:** text ≥ 4.5:1; tokens validated by design agents.
- **Motion:** no animations needed; port fade-in uses `--sa-duration-fast`, which is 0 under `prefers-reduced-motion`.
- **Panels:** logical Tab order toolbar → palette → canvas → inspector; panel landmarks labelled.

---

## 13. Error states

| Situation | Detection | User-facing behavior | Data effect |
|---|---|---|---|
| IndexedDB unavailable (blocked, disabled) | `openRepository` throws | Full-page message: "Swarm Architecturer can't store data in this browser (storage is blocked or unavailable). Check privacy settings or try another browser." | none |
| Save failed (quota, transaction error) | `repo.put` rejects | Toolbar "Save failed" + Retry; live announcement; unload guard active | Last good record kept; in-memory state intact |
| Pre-save validation failed (bug) | `validateArchitecture` issues | "Save failed" with `E_STORAGE_INVARIANT` message; console error with issues | Invalid state never written |
| Stored record damaged / newer version | `repo.list/get` → `damaged` | Library row "Can't be opened" + Export raw / Delete | unchanged |
| Import invalid | `importArchitectureFile` → issues | Import error dialog, "Nothing was saved." | nothing written |
| Import ID collision | `repo.exists` | Toast "Imported as '{name} (imported)' because an architecture with the same ID already exists." | new architecture |
| Domain command rejected | `dispatch` → `ok:false` | Should be prevented by UI; if it happens: toast with the error message | no change, no history entry |
| Connection to invalid target | `isValidConnection` false | Connection line shows invalid state; nothing created | none |
| Required name blank | field validation | Inline "Name is required"; reverted on blur | not committed |
| PNG export failure | `toPng` rejects | Toast (10) | none |
| Open unknown architecture | router | Library + toast | none |
| Same architecture in two tabs | `tabSync` | Banner (8.6) | last write wins |
| Leaving with pending/failed save | `beforeunload` | Browser leave-page prompt | — |

---

## 14. Security and privacy

- **No network:** the app makes no network requests at runtime. Production `index.html` gets a CSP meta tag injected by a tiny `transformIndexHtml` plugin in `vite.config.ts` (build only, so Vite dev/HMR is unaffected):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`
  (`'unsafe-inline'` for styles is needed for React Flow's inline style attributes and html-to-image's cloned styles.)
- **Untrusted text:** all user/imported text is rendered as React text nodes. `dangerouslySetInnerHTML` is forbidden (lint rule `react/no-danger` or code review). Markdown notes are rendered only by `ui/MarkdownPreview` (react-markdown, `skipHtml`, no raw-HTML plugin, URL transform limited to `safeLink` protocols, `img` replaced by a text placeholder so remote images never load).
- **Links:** `ui/safeLink.ts` renders `<a href>` only for `http:`, `https:` and `mailto:` URLs (parsed with `new URL`), always with `target="_blank" rel="noopener noreferrer"`. Other values are shown as plain text. Links are only followed on explicit user click.
- **No secrets, no telemetry, no analytics, no external fonts or CDNs.** Scenario J is tested by failing any non-local request in Playwright (15.3).
- Imported data limits (3.5) bound memory use.

---

## 15. Test and build strategy

### 15.1 Scripts (in `package.json`, set up in Stage 0)

`dev` (vite), `build` (`tsc -b && vite build`), `preview`, `typecheck` (`tsc -b --noEmit` or template equivalent), `lint` (eslint), `test` (vitest run), `test:watch`, `e2e` (playwright test, starts `vite preview` via `webServer`).
**Quality gate for every stage and commit:** `typecheck`, `lint`, `test` green; `build` green from Stage 0 onward; `e2e` green from the integration stage on.

### 15.2 Unit and component tests (Vitest)

| Area | Must cover |
|---|---|
| `domain/operations` | every command in 5.1; delete cascade (relationships + membership + bounds); retype direction rules; generic direction/reverse allowed, predefined rejected; createGroup reassignment; assignToGroup; empty group keeps bounds; duplicate (no relationships, no group); subtype switch preserves data |
| `domain/geometry` | `computeGroupBounds`; member moved outside → bounds grow; shrink on member removal |
| `domain/validation` | each issue code with a fixture; the spec 12.4 example parses **valid**; unknown `properties` keys preserved; Zod strips unknown top-level keys; caps; messages match templates |
| `domain/serialize` | canonical key order; absent optional fields omitted; `parse(serialize(x))` deep-equals `x` |
| `history` | push/undo/redo; coalescing by key; break on blur/other key; cap; future cleared on push |
| `editor/store` | dispatch/undo/redo update `architecture`, `canUndo/canRedo`, `updatedAt`; selection pruning; viewport not in history; rename not in history |
| `persistence` (fake-indexeddb) | create/list/get/put/duplicate/rename/remove; damaged record handling; put rejects invalid; autosave debounce, single in-flight, retry after error, flush |
| `io/importJson` | valid import creates new record; collision renames + new ID; invalid writes nothing; oversized file rejected |
| `canvas/projection` | group nodes before components; directed → `markerEnd`, undirected → none; no `parentId`; sizes |
| `canvas/dragController` (pure part) | moving set dedup (group + selected member); deltas; zero-delta no-op |
| `inspector` (RTL) | Agent fields edit + persist through store; generic direction controls shown/hidden per type; relationship list read-only and selection behavior; name required; group select assignment |
| `library` (RTL + fake repo) | empty/loading/list states; delete requires confirmation |

### 15.3 End-to-end (Playwright, Chromium required; Firefox and WebKit run in CI if available)

One spec file per scenario `e2e/scenario-a.spec.ts` … `scenario-j.spec.ts` plus `e2e/ui-v2.spec.ts` (UI v2: port-to-port and port-to-body connections, automatic re-routing, undirected geometry independent of stored order, reset ports, accent persistence/undo/duplicate/round trip, schema v1 → v2 import, PNG bounds for a bulging curve, and the UI v2 refinement checks E1–E4: curve bow, label clearance and PNG margins at 48 CSS px and at the 4096 px cap), fixtures in `e2e/fixtures/` (spec 12.4 example file; invalid files: dangling relationship, duplicate membership, unsupported version, malformed JSON; a performance fixture with 100 components, 150 relationships, 10 groups).

- **H (PNG):** export, read the downloaded file, assert PNG signature, dimensions and a clean frame (no content cropped at the edge), no selection-colored pixels, and the presence of both terminal rings and the arrowhead in the DOM before export. There is no stored image baseline: the check is pixel-statistical against the v2 canvas background `#F7F6F3`. Set `SA_E2E_PNG_DIR=<dir>` to also write the exported PNGs for human review.
- **J (no external services):** `page.route("**/*", ...)` aborts and records any request whose host is not the preview server; run the full A–I flow; assert zero recorded requests. No login screens exist.
- **Performance check (spec 18):** with the performance fixture, measure time for: select (click → inspector shows) < 100 ms, drag of a group with 10 members stays smooth (record frame times via `requestAnimationFrame` sampling during a scripted drag; target median ≤ 32 ms), zoom/pan responsive. These are the established targets for "dozens" (with headroom) **[Design decision]**; failures are reported, tuned (memoized node components, `onlyRenderVisibleElements`), and re-measured.

### 15.4 Build output

`vite build` → static `dist/` deployable to any static host. No server code, no environment variables, no secrets.

---

## 16. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| `html-to-image` export fidelity (fonts, SVG markers, CSS vars) and the 1.11.11 pin | Medium / High (Scenario H) | Follow React Flow's documented approach; exact pin; system fonts; SVG-text labels; e2e image check; spike in Stage C first week. Fallback: hand-built SVG serialization of the domain model rasterized via `<canvas>` (only if the spike fails). |
| Group z-order: group container obscuring edges or capturing clicks | Medium / Medium | Translucent fill, `pointer-events: none` on group body, header-only drag, explicit `zIndex` (groups 0, edges 5, components 10). Verify in canvas spike; if edge z-index does not lift edges above group nodes, the translucent fill keeps them visible and clickable anyway. |
| Controlled React Flow + immutable store performance | Low / Medium | Dozens of nodes; memoized `ComponentNode`/`RelationshipEdge`; selector-based subscriptions; perf e2e. |
| Undo stacking mismatch with drag/resize (multiple entries per gesture) | Medium / Medium | Commit on drag stop / resize end only; unit + e2e tests. |
| Browser storage eviction (Safari 7-day policy with tracking prevention; storage pressure) | Medium / High (data loss) | `navigator.storage.persist()`; backup notice; easy JSON export; documented in UI. |
| Two tabs overwriting each other | Low / Medium | `tabSync` warning banner; last write wins. |
| TypeScript 7 / lint toolchain incompatibility | Medium / Low | Pin the newest TS supported by the template's lint stack (1.1). |
| React Flow API drift across 12.x minors | Low / Medium | Caret within 12.x; lockfile; canvas isolated behind `canvas/` and `canvasApi`. |
| Scope creep (templates, SVG) | Medium / Medium | Templates and SVG export remain out of scope and require a coordinator decision. The Markdown notes preview is an approved post-MVP addition (16.1). |
| Hand-edited import files with stale group bounds | Medium / Low | Normalization recomputes bounds rather than rejecting. |

### 16.1 Dependency decision: Markdown notes preview (2026-10-21)

Approve the runtime dependency `react-markdown@^10.1.0` for the Notes preview; the installed version is `10.1.0` (per `package-lock.json`). A formatted read view lets users inspect Markdown notes without replacing source editing or relying on an online service. Load the renderer lazily only when Preview is requested; its code and dependencies are isolated in a separate 117 kB preview chunk rather than the initial bundle. Treat notes as untrusted: skip raw HTML (`skipHtml`, with no raw-HTML plugin), and render images as text placeholders so remote images are never fetched. Links remain restricted through `safeLink` (14).

---

## 17. Implementation plan

The project is a Git repository (branch `sa-canvas-v2`, branched from `main`). The commit guidance below applies to it. §17.5 lists the commit sequence, including the UI v2 refinement commits.

### 17.1 Stages and product phases

| Stage | Product phase (spec 17) | Parallel? | Difficulty (1–5) |
|---|---|---|---|
| **S0** Foundation and contracts | 1 | sequential (blocks all) | 2 — mechanical scaffolding + transcribing this document's contracts |
| **WS-A** Domain operations, history, editor store | 1–2 | parallel | 3 — core logic, invariants, coalescing |
| **WS-B** Validation, persistence, JSON I/O | 2–3 | parallel | 3 — many rules, async storage, error mapping |
| **WS-C** Canvas, palette, PNG export (UI) | 1–3 | parallel | 4 — React Flow integration, group drag, floating edges, export fidelity |
| **WS-D** Inspector (UI) | 2 | parallel | 3 — many forms, coalescing, derived list |
| **WS-E** App shell, library, toolbar, shortcuts (UI) | 3 | parallel | 3 — screens, lifecycle, error states |
| **S-INT** Integration, e2e A–J, accessibility and perf pass | 4 | sequential (after A–E) | 3 — cross-module verification |

UI workstreams (C, D, E) are UI/UX development and should be routed to the UI-designated worker per the coordinator's routing policy.

### 17.2 Stage S0 — Foundation and contracts (single agent)

**Outcome:** a building, lint-clean, test-running skeleton with all shared contracts frozen.
**Owns (creates):** `package.json`, lockfile, `index.html`, `vite.config.ts` (incl. CSP plugin), `tsconfig*.json`, ESLint config, `vitest` config/setup (`src/test/setup.ts`), `playwright.config.ts`, `.gitignore`, `public/THIRD_PARTY_LICENSES.md`, `src/main.tsx`, placeholder `src/app/App.tsx` (hands ownership to WS-E after S0), `src/domain/types.ts`, `src/domain/constants.ts`, `src/domain/commands.ts` (types + `DomainError` + `applyCommand` signature throwing "not implemented"), `src/domain/geometry.ts` (+ tests, fully implemented — shared by A, B, C), `src/domain/validation/issues.ts` (codes + message builders), `src/editor/storeTypes.ts`, `src/editor/context.tsx`, `src/persistence/types.ts` (`Repository`, `StoredRecord`, `SaveController`, `SaveStatus`), `src/io/types.ts` (`ImportResult`), `src/canvas/canvasApi.ts` (interface + context only), `src/ui/*` (tokens.css, base.css, Button, Dialog, ConfirmDialog, Toast + `useToast`, LiveRegion + `announce`, icons, safeLink + tests).
**Acceptance:** `npm run typecheck lint test build` pass; contracts match sections 3, 5.1, 5.3, 8.3, 8.4, 9.2 exactly; dependencies exactly as 1.1.
**Commit:** `chore: scaffold Vite React TS app and freeze domain/store contracts`.

**Contract freeze rule:** after S0, the contract files (`domain/types.ts`, `domain/constants.ts`, `domain/commands.ts`, `domain/geometry.ts`, `domain/validation/issues.ts`, `editor/storeTypes.ts`, `editor/context.tsx`, `persistence/types.ts`, `io/types.ts`, `canvas/canvasApi.ts`, `src/ui/**`, all config files) are owned by the coordinator and change only by coordinator decision; a worker that needs a change returns a change request instead of editing. Exception: design agents may adjust values in `src/ui/tokens.css` when the coordinator reserves it for them.

### 17.3 Parallel workstreams (start together after S0)

File ownership is exclusive. Tests co-located with owned files are owned by the same workstream. Reading other modules is fine; editing them is not. `package.json` and the lockfile belong to the coordinator after S0 (no new dependencies without a decision).

#### WS-A — Domain operations, history, editor store

- **Owns:** `src/domain/ids.ts`, `factories.ts`, `operations.ts`, `selectors.ts`, `serialize.ts`, `normalize.ts` (+ tests); replaces the stub body of `applyCommand` in `src/domain/commands.ts` **only by re-exporting from `operations.ts`** (the one-line change is pre-authorized); `src/history/history.ts` (+ tests); `src/editor/store.ts`, `src/editor/actions.ts` (+ tests).
- **Depends on:** S0.
- **Acceptance:** all 5.1 semantics and 5.2 history behavior unit-tested; coalescing works; `updatedAt` rules; selection pruning; `actions.deleteSelection` emits toast + announcement; ≥ 90 % line coverage on `domain/` and `history/`.
- **Consumers:** B (serialize, normalize), C, D, E (store, actions, selectors).

#### WS-B — Validation, persistence, JSON import/export

- **Owns:** `src/domain/validation/schema.ts`, `validate.ts`, `migrate.ts`, `index.ts` (+ tests and fixtures under `src/domain/validation/__fixtures__/`); `src/persistence/db.ts`, `repository.ts`, `autosave.ts`, `unloadGuard.ts`, `tabSync.ts` (+ tests); `src/io/exportJson.ts`, `importJson.ts`, `download.ts`, `readFile.ts` (+ tests).
- **Depends on:** S0. Uses `serialize.ts`/`normalize.ts` from WS-A: until they land, code against their signatures (declared in this document) and integrate when WS-A returns (soft dependency; B's final acceptance waits for A).
- **Acceptance:** every issue code in 3.5 has a passing fixture test; spec 12.4 example is valid; import of an invalid file writes nothing (verified via fake-indexeddb); collision path; autosave status transitions and flush; unload guard toggles; damaged records listed.

#### WS-C — Canvas, palette, PNG export (UI)

- **Owns:** everything under `src/canvas/` except `canvasApi.ts`'s interface (implements the provider inside `CanvasView.tsx`), `src/palette/**`, `src/io/exportPng.ts` (+ tests).
- **Depends on:** S0; WS-A store/selectors for integration (develop against `storeTypes.ts` with a local test double until A lands).
- **First task (spike, ≤ 1 day):** floating edges + group node z-order/pointer-events + one PNG export of a fixture with a group and labels. Report results before building the rest; if the spike fails, escalate with the fallback from 16.
- **Acceptance:** 6.1–6.7 behaviors (pointer and keyboard); drag of group moves members live and commits one undo step; member dragged outside keeps membership and bounds grow; groups not connectable; directed vs undirected rendering; type picker and Connect dialog; palette click/drag add; PNG export includes groups and labels and excludes handles/selection.

#### WS-D — Inspector (UI)

- **Owns:** `src/inspector/**` (+ tests).
- **Depends on:** S0; WS-A store/selectors/actions for integration (test double until then).
- **Acceptance:** section 7 complete for all types; fields optional; name required; coalesced typing = one undo step; relationship list read-only with select/go-to behavior; generic-only direction controls; group assignment select; Connect…/Duplicate/Delete buttons call `actions`.

#### WS-E — App shell, library, toolbar, shortcuts (UI)

- **Owns:** `src/app/**` (takes over `App.tsx` from S0), `src/library/**`, `src/toolbar/**` (+ tests).
- **Depends on:** S0; WS-B repository/autosave/import/export (test double until then); WS-A actions; mounts `CanvasView` (C), `Palette` (C), `Inspector` (D) by import — uses placeholder components until they land.
- **Acceptance:** section 11 screens and states; routing; editor lifecycle with flush; toolbar with save status, undo/redo, zoom/fit via `canvasApi`, export/import; all shortcuts in 6.7; backup notice; storage-unavailable page; tab banner.

#### Dependency graph

```
S0 ──┬─► WS-A ──┬────────────────────────────┐
     ├─► WS-B ◄─┘ (serialize/normalize)       │
     ├─► WS-C ◄── A (store, selectors)        ├─► S-INT
     ├─► WS-D ◄── A (store, selectors, actions)│
     └─► WS-E ◄── A, B, C, D (mounts/uses)  ──┘
```

All five can start immediately after S0. Hard integration order: A → (B, C, D) → E → S-INT. Expected critical path: S0 → C (most uncertain) → S-INT.

### 17.4 Stage S-INT — Integration, acceptance and polish

- **Owns:** `e2e/**`; may fix integration defects in any module **only with the coordinator re-reserving that file** for the fix.
- **Work:** wire everything; Scenarios A–J e2e (15.3); accessibility pass (12) with axe (`@axe-core/playwright` may be added as a dev dependency by coordinator decision) and manual keyboard walkthrough; performance check; Scenario-K-ready demo fixture (spec 15 Lead Hunting Engine) placed in `e2e/fixtures/lead-hunting-engine.json` for the post-MVP hypothesis check.
- **Acceptance:** section 18 traceability all green; spec section 17 completion criteria met.

### 17.5 Commit strategy (coordinator executes)

| # | Commit | Gate |
|---|---|---|
| 1 | `chore: scaffold app and freeze domain/store contracts` (S0) | typecheck, lint, test, build |
| 2 | `feat(domain): commands, history and editor store` (WS-A) | + unit tests |
| 3 | `feat(persistence): schema validation, IndexedDB autosave and JSON import/export` (WS-B) | + unit tests; build |
| 4 | `feat(canvas): React Flow canvas, groups, typed relationships, palette and PNG export` (WS-C) | + unit tests; manual smoke |
| 5 | `feat(inspector): component, relationship and group inspectors` (WS-D) | + RTL tests |
| 6 | `feat(app): library screen, toolbar, routing and shortcuts` (WS-E) | + RTL tests; app runs end to end |
| 7 | `test(e2e): acceptance scenarios A–J, a11y and performance checks` (S-INT) | all gates incl. e2e |

Commits 2–6 may land in any order that keeps the build green (each workstream's placeholders/test doubles make this possible); 6 lands after 4 and 5 so the shell mounts real components. Each commit message ends with the coordinator's attribution trailer.

**UI v2 refinement commits (2026-10-21, on `sa-canvas-v2`, in order):** `2fb60a4` `feat(canvas): bow every relationship curve and align arrowheads to the tangent`; `91198a6` `fix(export): keep a 48 px PNG margin with an explicit export transform`; `17bad54` `feat(canvas): place edge labels clear of nodes with callout fallback`; `eb89a20` `fix(export): bound the PNG by painted extents including label callouts`. The plan required each commit to keep typecheck, lint, unit tests, build and e2e (Scenario K excluded) green; the final state passed all of them (542 unit tests, 26 e2e). **Persistence:** the schema stays v2 and the saved JSON is unchanged; label layout and curve bow are render-only and never persisted. **Rollback:** revert these commits in reverse order. No data migration is needed.

---

## 18. Traceability

### 18.1 MVP requirements M1–M9

| Req | Design sections | Workstreams |
|---|---|---|
| M1 Architecture management | 8.3, 11.2 | B, E |
| M2 Canvas basics + undo/redo coverage | 5, 6.1–6.7 | A, C, E |
| M3 Component types and groups | 3.3, 6.2, 6.5 | A, C |
| M4 Properties | 3.1, 3.3, 7 | A, D |
| M5 Relationships (direction rules, cascade, no group endpoints) | 3.2, 5.1, 6.3, 6.4, 7.3 | A, C, D |
| M6 Grouping rules | 5.1, 6.5, 7.5 | A, C, D |
| M7 Local persistence (incl. viewport) | 8 | B, E |
| M8 JSON import/export + PNG | 9, 10 | B, C, E |
| M9 Visual clarity | 6.2, 6.4, 6.5, 12 | C (design tokens in `ui/`, S0 + design agents) |

### 18.2 Acceptance scenarios A–J

| Scenario | Satisfied by | Verified by |
|---|---|---|
| A Create architecture | 11.2 New, 8.3 `create` | `e2e/scenario-a` |
| B Build structure; Orchestrator distinct | 6.3 palette, 6.5 drag, 12 visual distinction | `scenario-b` (+ screenshot check of node types) |
| C Document behavior; persists | 7.1, 8.4 | `scenario-c` (edit all fields, reload, assert values) |
| D Typed relationships; arrows; list; generic-only direction | 6.3, 6.4, 7.3, 7.4 | `scenario-d` (assert `marker-end` on directed, none on undirected; list read-only; generic radio/reverse present only for generic) |
| E Groups (move, reassign, outside drag, reload, delete, not endpoint) | 5.1, 6.5 | `scenario-e` |
| F Restore after browser restart | 8, 6.1 viewport | `scenario-f` (new browser context with same storage state) |
| G JSON round trip; invalid rejected, nothing saved | 3.7, 9 | `scenario-g` (deep-equal of IDs/positions/directions/membership; library count unchanged after invalid import) |
| H PNG with groups and labels | 10 | `scenario-h` |
| I Delete cascade + undo/redo; all M2 ops | 5.1, 5.2, 5.3 | `scenario-i` + unit tests per command |
| J No external services | 1, 14 | `scenario-j` (network recorder) |

Scenario K is out of the release gate; S-INT provides the Lead Hunting Engine fixture for it.

---

## 19. Verified facts vs. assumptions

**Context7 was not available in this session.** Facts below were checked on 2026-10-21 against official sources (React Flow docs at reactflow.dev, the xyflow GitHub LICENSE, tldraw's license page at tldraw.dev, zod.dev, MDN, and the npm registry).

### 19.1 Verified

- `@xyflow/react` is MIT ("Copyright (c) 2019-2025 webkid GmbH"); npm latest 12.12.0.
- React Flow v12: package `@xyflow/react`, styles at `@xyflow/react/dist/style.css`; `node.width/height` are fixed dimensions, measured values in `node.measured`; `parentId` replaces `parentNode`; `colorMode` exists.
- `<ReactFlow>` props used here exist: `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `onConnect`, `isValidConnection`, `connectionMode` (default `'strict'`), `onNodeDragStart/onNodeDrag/onNodeDragStop`, `onSelectionChange`, `onBeforeDelete`, `deleteKeyCode` (default `'Backspace'`, nullable), `selectionKeyCode`, `multiSelectionKeyCode`, `onlyRenderVisibleElements`, `fitView`, `onMoveEnd`, `defaultViewport`, `nodeTypes`, `edgeTypes`, `proOptions`, `ariaLabelConfig`, `edgesReconnectable`, `elevateNodesOnSelect`, `nodeDragThreshold`.
- Edge fields: `markerStart`, `markerEnd`, `label`, `ariaLabel`, `focusable`, `selectable`, `deletable`, `reconnectable`, `interactionWidth`, `domAttributes`, `type`, `data`.
- Accessibility: `nodesFocusable`, `edgesFocusable`, `disableKeyboardA11y` (disables arrow-key movement; Tab focus and selection still work), `ariaLabelConfig`, node `ariaRole`, `domAttributes`; Enter/Space select, Escape clears selection.
- `NodeResizer` props: `minWidth`, `minHeight`, `isVisible`, `keepAspectRatio`, `onResizeStart`, `onResizeEnd`.
- `getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding)`. Verified as a library signature; the app no longer calls it (UI v2 refinement, §10 step 4).
- React Flow "Download Image" example uses `html-to-image` pinned to 1.11.11 because later versions did not export correctly (per the example page); npm latest is 1.11.13.
- Floating-edges example uses `internals.positionAbsolute` and `measured` of internal nodes.
- Removing the React Flow attribution is requested only for Pro subscribers.
- tldraw: production use requires a license key (trial 100 days / hobby with "made with tldraw" watermark / commercial); default license is development-only; npm license field "SEE LICENSE IN LICENSE.md"; latest 5.5.2.
- Zod 4: `z.object` strips unknown keys by default; `z.strictObject`/`z.looseObject` exist; `z.record(keySchema, valueSchema)`; issues carry `path`.
- MDN: localStorage 5 MiB per origin; IndexedDB quota is a share of disk; `navigator.storage.persist()`; Safari may delete script-written storage after 7 days without interaction when tracking prevention is on; `QuotaExceededError`.
- npm latest versions listed in 1.1 and licenses: React MIT, Zod MIT, `idb` ISC, `html-to-image` MIT, Vite MIT, Vitest MIT, Playwright Apache-2.0, TypeScript Apache-2.0.

### 19.2 Assumptions to confirm during implementation (owner)

| Assumption | Check | Owner |
|---|---|---|
| Edge `zIndex` above group nodes renders edges over group fills | Canvas spike; fallback in 16 | WS-C |
| Edge label SVG (`rect.react-flow__edge-textbg` and `text.react-flow__edge-text`, drawn by the edge itself since the UI v2 refinement, not `BaseEdge`'s `label`) is included in `toPng` output | Canvas spike PNG | WS-C |
| `html-to-image@1.11.11` works with React 19 / current Chromium, Firefox, WebKit | Spike + `scenario-h` | WS-C / S-INT |
| `NodeResizer.onResizeEnd` provides final `x, y, width, height` (type `OnResizeEnd`, params not documented on the page) | Read the type in `node_modules` | WS-C |
| `dragHandle` node option limits dragging to the group header selector | Spike | WS-C |
| Exact `getNodesBounds` signature in 12.12 | Read the type in `node_modules` | WS-C |
| Vite template's TypeScript/ESLint versions are mutually compatible | Scaffold | S0 |
| Performance targets in 15.3 are met without `onlyRenderVisibleElements` | Perf e2e | S-INT |
