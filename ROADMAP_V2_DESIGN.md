# Swarm Architecturer — Roadmap v2 Design

Status: design only, ready for Build. Baseline: `main` at `4026f90` (verified identical to this branch's base).
This report adds no code, tests, dependencies or config changes. It does not supersede `TECHNICAL_DESIGN.md` (TD), `UI_DESIGN_HANDOFF.md` (UH) or `UI_COLOR_CONFIRMATION_DESIGN.md` (UCC). Where this report changes a contract from those documents, it says so explicitly, and Build updates them in the stage that ships the change.

It covers six improvements:

| # | Improvement | Section |
|---|---|---|
| 1 | The deletion Undo toast can only undo its own deletion | §2 |
| 2 | Quick Find: select, focus and zoom to a component | §3 |
| 3 | Color for a multi-selection, with a mixed state | §4 |
| 4 | Arrange: align, distribute, tidy layout (geometry only) | §5 |
| 5 | Local versions: snapshots, history and restore | §6 |
| 6 | Quality: Firefox/WebKit smoke tests, axe scans, Vite 8 code splitting | §7 |

§8 lists the waves, stages, file ownership and commits. §9 lists the risks and the decisions taken.

---

## 0. Principles that bind every item

- **P1 The canvas documents; it does not execute.** No feature may suggest execution order, data flow or runtime behavior. Arrange (§5) reads only geometry and never reads relationships, their direction, their type or their pins. Quick Find ranks by text, never by graph position.
- **P2 Semantic invariance.** Apart from the explicit edits a feature makes, relationships (type, source, target, direction, label, `visual` port pins), every ID and group membership (`memberComponentIds`) stay byte-identical. Group `bounds` are derived geometry (TD 6.5) and are recomputed by the existing `recomputeGroupBounds`.
- **P3 One change path.** Every content change is a `Command` through `store.dispatch` (TD 5.1). This gives undo, autosave, validation and `updatedAt` for free. New behavior adds a command only when no existing command can express it (one new command: `restoreDiagram`, §6.6).
- **P4 Non-destructive persistence.** The architecture records and their format (`ArchitectureFile`, schema v2, TD 8.2) are never rewritten by an upgrade. The JSON export format does not change.
- **P5 App-styled UI only.** Use native `<dialog>` through `ui/Dialog` / `ui/ConfirmDialog`, the app toast and the live region. No `alert`, `confirm` or `prompt` (UCC 2.6).
- **P6 Keyboard parity.** Every new action can be done with the keyboard, has an accessible name and is announced through `ui/LiveRegion` `announce()`.

---

## 1. Baseline findings (verified in code)

| Area | Fact | Where |
|---|---|---|
| History | Snapshot entries `{before, after, coalesceKey?, label}`, cap 200. Entries have **no identity**. | `src/history/history.ts:3-17` |
| Store | `dispatch` pushes one entry per changed command. `undo()` always pops the **top** entry. Rename, description and viewport are not undoable and survive undo (`restoreNonUndoableState`). | `src/editor/store.ts:47-58,104-135` |
| Undo toast bug | `deleteSelection` shows a toast whose action is `() => store.undo()`. If the user makes any other edit in the next 5 s, **Undo in the toast undoes that edit, not the deletion**. | `src/editor/actions.ts:120` |
| Toast lifetime | `ToastProvider` is mounted at the app root, above routing. A toast survives leaving the editor, so its Undo can call `undo()` on a disposed store whose autosave is already stopped. That change is lost silently. | `src/app/App.tsx:100`, `src/ui/Toast.tsx:80` (5 s default) |
| Selection | `store.selection` is the source of truth. The inspector selects without panning ("No automatic panning", TD 6.6). | TD 6.6 |
| Multi-selection inspector | Group, Remove from groups, Duplicate and Delete. No color. | `src/inspector/MultiSelectionInspector.tsx` |
| Color command | `setComponentAccent { ids: string[]; accent }` already takes many IDs. It is a no-op for unchanged components and has the label "Change color". | `src/domain/operations.ts:607`, `src/editor/commandLabels.ts` |
| Picker | 17 native radios plus "Type default". Single component only (`ids: [id]`). | `src/inspector/AccentPicker.tsx:53` |
| Move | `moveElements { componentPositions, groupDeltas }` moves components to absolute positions and recomputes the bounds of affected groups. `groupDeltas` moves only empty groups. Membership is untouched. | `src/domain/operations.ts:359-418` |
| Canvas API | `zoomIn`, `zoomOut`, `fitView`, `screenToFlowPosition`, `getViewportElement`, `getNodesBounds`, `getDiagramBounds`. There is no way to reveal one element. The viewport is persisted by `onMoveEnd → store.setViewport`. Zoom range is 0.2–2. | `src/canvas/canvasApi.ts`, `src/canvas/CanvasView.tsx:99-100,126-160,321` |
| Shortcuts | One `keydown` handler. It ignores everything while a `dialog[open]` exists. `Mod+Z` works in text fields. `Alt` and the other platform modifier are ignored. Single-key shortcuts (`C`, `Delete`, `Shift+1`) do not fire in editable focus. | `src/app/shortcuts.ts` |
| IndexedDB | DB `swarm-architecturer` v1, one store `architectures` (`keyPath: "architecture.id"`). `upgrade` only creates the store if it is missing. There are no `blocked` or `blocking` handlers. | `src/persistence/db.ts` |
| Repository | `remove(id)` deletes one record. The opportunistic migration rewrite already exists for older `schemaVersion`. | `src/persistence/repository.ts:126-143,243` |
| Autosave | Debounce 400 ms, max wait 2 s, one write in flight, `flush()`. | `src/persistence/autosave.ts` |
| IDs | `createId(prefix)` uses `crypto.randomUUID()`. Prefixes are `arch`, `cmp`, `rel`, `grp`. The app therefore already requires a secure context. | `src/domain/ids.ts` |
| Playwright | One project (`chromium`), tests run against `vite preview` on port 4173. `e2e/helpers.ts:101` `modifierFor(page)` derives Meta or Control from the page's platform, so it already works in other engines. Only Chromium browsers are installed locally (`~/Library/Caches/ms-playwright`). There is no CI config in the repo. | `playwright.config.ts` |
| Build | `npm run build` (Vite 8.3.5, Rolldown 1.2.15) emits `index-*.js` **671.28 kB (208.05 kB gzip)** and warns that it is larger than 500 kB. The only split is the lazy `MarkdownPreview` (117.5 kB). `@xyflow/react`, `html-to-image` and the editor all load on the library route. The production CSP is `script-src 'self'`. | measured 2026-10-22; `vite.config.ts` |
| Axe | Not installed. | `package.json` |

---

## 2. Safer deletion Undo toast

### 2.1 Goal

The toast's **Undo** reverses exactly the deletion it reports, or does nothing. It can never undo a later, unrelated edit. `Mod+Z` and the toolbar Undo keep their normal "undo the latest step" meaning.

### 2.2 Data contract: history entry identity

```ts
// src/history/history.ts
export interface HistoryEntry {
  id: number;              // NEW: unique within one editor session, assigned by the store
  before: Architecture;
  after: Architecture;
  coalesceKey?: string;
  label: string;
}
export function head(history: History): HistoryEntry | undefined; // NEW: past[past.length - 1]
```

- The store keeps a session counter `nextEntryId` and assigns `id` when it creates an entry. When coalescing merges an entry into the top entry, the merged entry keeps the **existing** id. A deletion has no `coalesceKey`, and `push` clears `openCoalesceKey` for key-less entries, so nothing can merge into a deletion entry.
- `undo`/`redo` move entries between `past` and `future` unchanged, so ids survive both.
- History is still never persisted (TD 5.2). The ids are only valid in memory, for one session.

```ts
// src/editor/storeTypes.ts
export interface EditorState { /* …existing… */ historyHeadId: number | null } // id of past's top entry
export type DispatchResult =
  | { ok: true; summary?: CommandResult["summary"]; entryId?: number } // set when an entry was created or merged
  | { ok: false; error: DomainError };
export interface EditorStore {
  /* …existing… */
  /** Undoes only if `entryId` is the top undo entry. Returns false and changes nothing otherwise. */
  undoEntry(entryId: number): boolean;
}
```

The placeholder store (`src/app/placeholders/editorStore.ts`) implements the same contract so the shell tests keep compiling.

### 2.3 Toast binding (`editor/actions.ts`)

New helper `showEntryUndoToast(store, feedback, entryId, message)`, used by `deleteSelection`. Later, Arrange "Tidy layout" (§5) and version restore (§6) reuse it:

1. `id = feedback.showToast(message, { action: { label: "Undo", onClick } , durationMs: 10_000 })`.
2. **Stale guard (subscription).** It subscribes to the store. On every change, if `state.historyHeadId !== entryId`, it calls `feedback.dismissToast(id)` and unsubscribes. This covers any later dispatch, a `Mod+Z` that already undid the deletion, a redo of something else, and a coalesced edit.
3. **Stale guard (click).** `onClick` calls `store.undoEntry(entryId)`. If that returns `true`, it announces "Undid the deletion." If it returns `false` (a race between render and click), nothing changes and it announces "Nothing was undone because the diagram changed after the deletion. Use Undo in the toolbar."
4. When the toast closes for any reason, the subscription is removed.

`ActionFeedback` (`src/app/services.ts`) gains `dismissToast(id: number): void`. `ToastController` already has it.

### 2.4 Session scoping (`app/EditorScreen.tsx`)

`EditorWorkspace` wraps `feedback.showToast` and records every toast id it opens. On unmount (leaving the editor, opening another architecture, or an import), it dismisses every recorded toast whose action is still pending. An Undo that targets a disposed store can therefore never be clicked.

### 2.5 Toast presentation (`ui/Toast.tsx`, `ui/base.css`)

- A toast **with an action** stays 10 s. A plain toast keeps the 5 s default.
- The timer **pauses** while the pointer is over the toast or focus is inside it, and resumes from the remaining time (WCAG 2.2.1 Timing Adjustable). `Mod+Z` stays the timing-independent alternative.
- Opening a toast never moves focus. The action button has the UH §9.1 focus ring.
- Message and announcement copy are unchanged ("Deleted 1 component and 3 relationships.").

This changes UCC §2.5, which said "out of scope: binding the toast to its history entry, pause on hover, longer durations". Build updates that section when this ships.

### 2.6 User-visible interactions

| Situation | Result |
|---|---|
| Confirm delete, then click **Undo** in the toast | The deletion is reversed in one step. The toast closes and the action is announced. |
| Confirm delete, then move a component (or type in the inspector), while the toast is still visible | The toast **disappears right away**. No Undo is offered that could undo the move. `Mod+Z` undoes the move, a second `Mod+Z` undoes the deletion. |
| Confirm delete, then press `Mod+Z` | The deletion is undone and the toast disappears (its entry is no longer the top entry). |
| Delete A, then delete B | Toast A disappears when B's entry is pushed. Toast B undoes only B. |
| Confirm delete, then rename the architecture or pan/zoom | The toast stays (these are not history entries). Undo restores the deletion, and the rename and viewport persist (existing `restoreNonUndoableState`). |
| Confirm delete, then click **Library** within 10 s | The toast is dismissed on unmount. No Undo appears on the library screen. |

### 2.7 Acceptance tests

| ID | Level | Test |
|---|---|---|
| UT1 | unit `history.test.ts` | Ids survive `undo` and `redo`. A coalesced merge keeps the first id. `head()` returns the top entry. |
| UT2 | unit `store.test.ts` | `dispatch` returns `entryId`. `historyHeadId` follows push/undo/redo. `undoEntry(id)` with id == head undoes; with a stale id it returns `false` and `revision` is unchanged. |
| UT3 | unit `actions.test.ts` | After `deleteSelection`, a following `moveElements` dispatch calls `dismissToast` exactly once. Calling the captured `onClick` after that changes nothing and announces the "Nothing was undone…" message. |
| UT4 | unit `Toast.test.tsx` | A toast with an action uses 10 s. Hover or focus pauses it and leaving resumes with the remaining time (fake timers). |
| UT5 | integration `App.integration.test.tsx` | Delete, then leave to the library: no toast with "Undo" is in the DOM. |
| UT6 | e2e `e2e/undo-toast.spec.ts` (new) | Add A and B. Delete A (confirm). Nudge B with an arrow key. Assert the toast is gone and B is at its moved position. Then delete B, click toast Undo, and assert B is back and A is still deleted. |

---

## 3. Quick Find

### 3.1 Shortcut decision

| Candidate | Verdict |
|---|---|
| `Mod+F` | Rejected. It overrides the browser's find-in-page, which users rely on for notes. |
| `Mod+P` | Rejected. It overrides print. |
| `Mod+K` | **Chosen (primary).** It is not reserved by Chromium, Firefox or WebKit for pages (unlike `Mod+T/W/N/Tab`), so `preventDefault()` works. It is the established command-palette convention and has no text-editing meaning in `input`/`textarea` (macOS Emacs kill-line is `Ctrl+K`, and `Mod` is `Cmd` on macOS). |
| `/` | **Chosen (secondary).** Only outside editable focus. `event.key === "/"` works on layouts where `/` needs Shift. |

Rules added to `app/shortcuts.ts` (TD 6.7 table):

- `Mod+K` (no Alt, no Shift, not the other platform modifier) opens Quick Find **even in editable focus**. A text field must not trap the user away from navigation; the pending inspector draft commits on blur, as it does today. `preventDefault()`.
- `/` (no modifiers) opens Quick Find only outside editable focus. `preventDefault()`.
- Both are ignored while any `dialog[open]` exists (existing rule). They are also ignored during IME composition (existing `isComposing` check).
- Toolbar: a **Find** button (search icon, tooltip "Find component (⌘K)" / "(Ctrl+K)") in the "History and view" group, after Fit to content.

### 3.2 Interaction

The dialog is a modal built on `ui/Dialog` (title "Find component"), with an inert background and focus kept inside.

| Step | Behavior |
|---|---|
| Open | Focus goes to the search field (`<input type="search">`, label "Component name"). The list shows all components sorted by name (max 50). |
| Type | Results update on every keystroke. Matching is case-insensitive and diacritic-insensitive (`normalize("NFD")` then strip `\p{M}`). It searches the name first, then the type label ("Tool"), then the group name. Rank: exact name match, then name prefix, then word-prefix in the name, then substring in the name, then type or group match. Ties sort by `localeCompare(name)`, then by id. |
| Each result | Shows the name, the type label and, for group members, "in {group name}", so duplicate names can be told apart. Matches are highlighted with `<mark>`, never by color alone. |
| Keyboard | `ArrowDown`/`ArrowUp` move the active option (wrapping). `PageDown`/`PageUp` move by 10. `Enter` chooses the active option (the first one by default). `Escape` closes without changing anything. `Home`/`End` stay with the text caret. |
| Pointer | Clicking a result chooses it. Hover only changes the visual highlight, never `aria-activedescendant`. |
| Count | A polite status line inside the dialog shows "{n} results", "No components match "{q}"" or "No components yet". It is debounced by 300 ms so typing is not read out on every key. When there are more than 50 matches it shows "Showing 50 of {n}. Keep typing to narrow the list." |
| Choose | (1) Close the dialog. (2) `store.setSelection({ componentIds: [id], relationshipIds: [], groupIds: [] })`. (3) `await canvasApi.revealComponent(id)`. (4) Focus the node's wrapper (`.react-flow__node[data-id="<id>"]`), so Delete, arrows and `C` act on it immediately. (5) Announce "Selected {name}." If the component no longer exists, the dialog stays open and announces "That component no longer exists." |
| Cancel | Escape or the close button. Focus goes back to the opener (the toolbar button or the previously focused element), or to the canvas (`[data-sa-canvas]`) if the opener is gone. |

**ARIA** (APG combobox with a listbox that is always shown): the input has `role="combobox"`, `aria-expanded` (true when there are results), `aria-controls={listboxId}`, `aria-autocomplete="list"` and `aria-activedescendant={optionId}`. The list has `role="listbox"` and an accessible name. Options have `role="option"`, a stable `id` (`${useId()}-opt-${index}`) and `aria-selected` on the active one. The active option scrolls into view (`block: "nearest"`).

### 3.3 Canvas contract (`canvas/canvasApi.ts`)

```ts
/** Centers the component and zooms to max(current, 1), clamped to [0.2, 2]. Resolves after the viewport settles. */
revealComponent(id: string): Promise<boolean>; // false if the node is unknown
```

The implementation in `CanvasView.tsx` computes the node's rect, then calls `flow.setCenter(cx, cy, { zoom, duration })`, where `duration` is 0 under `prefers-reduced-motion: reduce` and 200 ms otherwise, and awaits it. It then calls `store.setViewport(flow.getViewport())` explicitly, so persistence does not depend on whether `onMoveEnd` fires for programmatic moves (`setViewport` is idempotent). It never zooms **out**. The placeholder canvas (`app/placeholders/modules.tsx`) resolves `true` immediately.

This is a deliberate exception to TD 6.6 "No automatic panning" for an explicit find action. Inspector selection still does not pan.

### 3.4 Pure search module

`src/find/search.ts`: `searchComponents(architecture, query, limit = 50): { results: Array<{ component; groupName?; ranges: Array<[start, end]> }>; total: number }`. It is pure and uses no React and no graph data (P1).

### 3.5 Acceptance tests

| ID | Level | Test |
|---|---|---|
| QF1 | unit `search.test.ts` | Ranking order. Diacritics: "creme" finds "Crème". Type-label match. Group name shown for members. Limit and `total`. Relationships do not affect the order (shuffle `relationships`, same output). |
| QF2 | unit `shortcuts.test.ts` | `Mod+K` opens from a canvas target **and** from a focused `<input>`. `/` opens only from a non-editable target. Neither fires with `dialog[open]`, with Alt, or while composing. `Ctrl+K` on macOS does nothing. |
| QF3 | RTL `QuickFindDialog.test.tsx` | Combobox and listbox roles and attributes. Arrow keys move `aria-activedescendant`. Enter calls `onChoose(id)`. Escape calls `onClose`. The count status text. |
| QF4 | RTL `CanvasView.test.tsx` | `revealComponent` calls `setCenter` with the clamped zoom and duration 0 under reduced motion, then calls `setViewport`. |
| QF5 | e2e `e2e/quick-find.spec.ts` | Load the performance fixture (100 components) and zoom out. Press `ControlOrMeta+K`, type part of a name, press Enter. Assert the inspector shows that component, the node is focused and inside the viewport, and the zoom is ≥ 1. Press Delete and assert the confirmation dialog names that component. |
| QF6 | e2e axe (§7.3) | Quick Find open with results, and with no results: 0 violations. |

---

## 4. Color on a multi-selection with mixed state

### 4.1 Interaction (`inspector/MultiSelectionInspector.tsx`)

- When the selection contains **at least one component**, a "Color" section appears after "Selection", open by default. Its caption: "Applies to {n} selected components." When groups or relationships are also selected, it adds "Groups and relationships have no color."
- The same 18 radios as the single picker: "Type default" plus the 17 accents.
- **State**, computed over the selected components only:
  - All share the same `accent` value (including all `undefined`): that radio is checked. Caption "Color: {label}" or "Color: Type default".
  - Values differ: **no radio is checked** (mixed). Caption "Color: Mixed ({k} colors)", where "Type default" counts as one value. Native radios cannot be indeterminate, so the fieldset gets `aria-describedby` pointing at the caption. Screen readers then announce "Mixed" when the group is entered.
  - **Usage marks.** Every swatch that at least one selected component uses shows a small corner dot (decorative) plus visually hidden text "used by {m} of {n}". This shows which colors make up the mix, without relying on color (UH §9.3).
- The "Type default" swatch: if every selected component has the same type, it uses `typePaletteId` of that type (as today). If the types differ, it uses a neutral swatch (canvas fill, `--sa-color-border` outline, no `data-palette`) with the same "Type default" text.
- **Choosing** dispatches exactly one `setComponentAccent { ids: selectedComponentIds, accent }`, which is one undo entry labeled "Change color". Choosing the value that is already uniform is a no-op (existing operation behavior: no history entry, no save).
- **Keyboard.** With none checked, Tab enters the group on the first radio and arrow keys move and choose, as in the single picker. Each choice is its own history entry. Like the single picker, no coalescing (consistent; one `Mod+Z` per step).
- Announce "Changed color of {n} components to {label}." (the multi-selection has no node-level radio feedback like the single picker's).

### 4.2 Undo semantics

The history entry's `before` holds each component's **individual** previous `accent` (or its absence), because history is snapshot-based. One `Mod+Z` therefore brings back the exact mixed state, including absent `accent` keys. Redo re-applies the uniform color. Groups never get an `accent` (existing invariant, enforced by `setComponentAccent`, which only targets component IDs).

### 4.3 Component structure

Refactor `AccentPicker.tsx` into a presentational `AccentRadioGroup({ name, value: AccentId | undefined | "mixed", defaultPaletteId: PaletteId | null, usage?: ReadonlyMap<AccentId | "default", number>, total?: number, onChoose })`, plus the existing single-component `AccentPicker`, which becomes a thin wrapper. The CSS for the mixed caption, the usage dot and the neutral default swatch goes in `inspector.css`, using existing tokens only.

### 4.4 Acceptance tests

| ID | Level | Test |
|---|---|---|
| MC1 | RTL `MultiSelectionInspector.test.tsx` (new) | Two components with tomato and mint: no radio checked, caption "Mixed (2 colors)", usage marks on tomato and mint. Choose fern: one dispatch with both ids. `undo()` restores tomato and mint exactly (deep-equal component records, including absence of `accent`). |
| MC2 | RTL | Uniform `undefined` checks "Type default". Mixed types use the neutral default swatch. One component plus one relationship selected: the section applies to the one component. Only relationships and groups selected: no Color section. |
| MC3 | RTL `AccentPicker.test.tsx` | Single-component behavior unchanged (the existing tests pass unmodified). |
| MC4 | e2e `e2e/multi-color.spec.ts` (new) | Color two nodes differently, box-select both, choose a color: both nodes' `data-palette` change. Reload: the colors persist. `Mod+Z`: both original palettes come back. |
| MC5 | e2e axe (§7.3) | Multi-selection inspector in the mixed state: 0 violations. |

---

## 5. Arrange: align, distribute, tidy layout

### 5.1 Semantics (P1, P2)

Arrange changes **positions only**. It is computed from component and group rectangles; relationships are **not an input**. The pure functions' signatures take `components` and `groups` only, so the type system enforces this. Arrange never creates, removes or reorders relationships, never changes `direction` or `visual` pins, never changes IDs, sizes or array order, and never changes `memberComponentIds`. Edges re-route automatically, exactly as after a drag. The output is the existing `moveElements` command, so undo, validation, autosave and group-bounds recomputation are the ones already proven. Tidy layout is a **grid pack in reading order**, deliberately not a layered or left-to-right graph layout, so the result never looks like a pipeline or execution sequence. The UI copy says so: "Arranges positions only. Relationships and groups are unchanged."

### 5.2 Units

Units are built from the selection:

- each selected group is one rigid unit (its rect is `group.bounds`; its members move by one delta; an empty group moves through `groupDeltas`);
- each selected component that is not a member of a selected group is one unit;
- relationships in the selection are ignored.

A component unit whose group is **not** selected moves alone, and that group's bounds are recomputed (existing TD 6.5 behavior). Its membership is unchanged.

### 5.3 Operations (`src/domain/arrange.ts`, pure)

| Operation | Min units | Rule |
|---|---|---|
| Align left / centers / right | 2 | Target is the selection's union rect: left edge, horizontal center, or right edge. |
| Align top / middles / bottom | 2 | Same, vertically. |
| Distribute horizontally / vertically | 3 | Sort by center (ties by id). The first and last units stay fixed. Gaps between edges are equal: `(span − Σsize)/(n−1)`. If that gap is negative (overlapping units), fall back to equal **center** spacing. |
| Tidy layout | 2 units in the selection, or nothing selected with ≥ 2 top-level units (then the scope is the whole diagram) | (a) Inside each group in scope, pack the members in a grid: `cols = ceil(√n)`, 40 px gaps, cell size = largest member per column/row, member order by reading order. (b) Shelf-pack the top-level units in reading order: key `(round(centerY / 80), centerX, id)`, 64 px gaps, row width limit `max(widest unit, 1.6·√Σ(area))`. Anchor at the scope's current top-left. Units are never resized. |

All results are rounded to integer pixels. Every function returns `{ componentPositions, groupDeltas } | null`. It returns `null` when there are too few units or nothing would move. Rounding makes repeated calls idempotent: applying align twice is a no-op the second time.

### 5.4 Editor actions and UI

- `src/editor/arrange.ts`: `alignSelection(store, mode)`, `distributeSelection(store, axis)` and `tidyLayout(store)`. Each dispatches `moveElements` with a specific history `label` ("Align left", "Distribute horizontally", "Tidy layout", …) and returns `DispatchResult` plus a message for the caller.
- **Toolbar "Arrange" menu button** (`toolbar/ArrangeMenu.tsx`). It uses the same menu pattern as `ExportMenu` (`aria-haspopup="menu"`, roving focus, Escape closes and returns focus). Items in order: Align left, Align centers, Align right, separator, Align top, Align middles, Align bottom, separator, Distribute horizontally, Distribute vertically, separator, Tidy layout. Disabled items are not focusable and show a hint ("Select 2 or more", "Select 3 or more"), as in the existing "Nothing to export" hint.
- No new keyboard shortcuts. The current handler ignores Alt combinations, and Alt-based shortcuts conflict with macOS character input. The menu is fully keyboard-operable.
- Feedback: announce "Aligned {n} items left." / "Distributed {n} items." / "Tidied {n} items." Nothing changed: announce "Already arranged." and dispatch nothing. **Tidy layout** can move the whole diagram, so it also shows the entry-bound Undo toast from §2.3. Align and Distribute rely on `Mod+Z` (small, visible changes).
- A selection-scoped tidy may place units on top of unselected components. This is documented in the tooltip and undoable. Avoiding collisions with unselected content is out of scope.

### 5.5 Acceptance tests

| ID | Level | Test |
|---|---|---|
| AR1 | unit `arrange.test.ts` | **Invariance property** over randomized fixtures (seeded; including the lead-hunting fixture): for every operation, `strip(before)` deep-equals `strip(after)`, where `strip` removes `components[*].position` and `groups[*].bounds`. Relationships, including `visual`, are byte-equal (`JSON.stringify`), and `memberComponentIds` are equal. |
| AR2 | unit | **Relationship-blindness**: the output is identical when the relationships are deleted, reversed or retyped. |
| AR3 | unit | Expected coordinates for each align mode, distribute with equal gaps, the overlapping fallback, a selected group that moves rigidly, a member of an unselected group that moves alone, an empty group through `groupDeltas`, idempotence, and `null` for too few units. |
| AR4 | unit | Tidy: no two top-level units overlap; members stay inside their recomputed group bounds; deterministic for a fixed input. |
| AR5 | unit `editor/arrange.test.ts` | One history entry with the right label. A single `undo()` restores every position and group bound. |
| AR6 | RTL `ArrangeMenu.test.tsx` | Menu keyboard pattern. Enabled and disabled items by unit count. |
| AR7 | e2e `e2e/arrange.spec.ts` | Select three components, Align top: equal `y` in the inspector or DOM. Distribute horizontally: equal gaps (±1 px). Tidy with nothing selected, then click the toast Undo: positions restored. Exported JSON relationships are identical before and after (compare the `relationships` arrays). |
| AR8 | e2e axe | Arrange menu open: 0 violations. |

---

## 6. Local snapshots, version history and restore

### 6.1 Definitions

- A **version** is a stored snapshot of an architecture's **diagram**: `components`, `relationships` and `groups`. Name and description are library-level, non-undoable metadata (TD 5.2). They are kept in the snapshot payload for reference, but restore does not apply them (§6.6). Keeping them out of restore also keeps restore consistent with undo, which preserves them.
- **Diagram key**: `JSON.stringify` of `{ components, relationships, groups }` taken from `toArchitectureFile(architecture).architecture` (canonical key order, TD 3.7). It is used for deduplication.

### 6.2 IndexedDB upgrade (v1 → v2, additive only)

```ts
// src/persistence/db.ts
export const DATABASE_VERSION = 2;
export const SNAPSHOTS_STORE = "snapshots";

upgrade(db, oldVersion) {
  if (!db.objectStoreNames.contains(ARCHITECTURES_STORE)) {
    db.createObjectStore(ARCHITECTURES_STORE, { keyPath: "architecture.id" });   // fresh install only
  }
  if (oldVersion < 2 && !db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
    const snapshots = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
    snapshots.createIndex("byArchitectureCreated", ["architectureId", "createdAt"]);
  }
},
blocked() { /* see below */ }, blocking() { /* see below */ }, terminated() { /* storage lost */ }
```

**Why this is migration-safe.** The upgrade creates one new store and one index. It does not open a cursor on, read, rewrite or delete anything in `architectures`. The existing records and their format are unchanged, and the existing lazy `schemaVersion` rewrite in `repository.ts` keeps its current behavior. If the upgrade transaction fails, IndexedDB rolls the whole upgrade back and the DB stays at v1 with its data intact.

**Blocked upgrade** (another tab still runs the old v1 code, which has no `versionchange` handler, so its connection never closes):

- `blocked()` sets a repository-open status. `App` shows, instead of a blank screen: "Finishing an update. Close or reload other Swarm Architecturer tabs to continue." Opening resumes automatically once the old tab closes. This must **not** be reported as `StorageUnavailable`.
- From v2 on, every connection handles `blocking()` (a future v3 upgrade) by finishing pending transactions, calling `db.close()` and showing the banner "Swarm Architecturer was updated in another tab. Reload this tab to keep saving." Autosave then reports `error` rather than writing silently.

**No downgrade.** A v1 build cannot open a v2 database (it gets a `VersionError`, shown as storage unavailable). A rollback of the code must therefore keep `DATABASE_VERSION = 2` and simply not use the `snapshots` store. This is recorded as a release rule in §9.

### 6.3 Snapshot record

```ts
// src/persistence/snapshots.ts
export type SnapshotTrigger = "open" | "interval" | "leave" | "manual" | "pre-restore";
export type SnapshotClass = "auto" | "manual" | "recovery"; // open|interval|leave → auto; pre-restore → recovery

export interface SnapshotRecord {
  id: string;                 // createId("snap") → "snap_<uuid>"  (add "snap" to IdPrefix)
  architectureId: string;
  createdAt: string;          // ISO-8601 UTC; ties are broken by id
  trigger: SnapshotTrigger;
  fingerprint: string;        // FNV-1a 64-bit hex of the diagram key; equality is confirmed with the full key
  counts: { components: number; relationships: number; groups: number };
  file: ArchitectureFile;     // canonical toArchitectureFile() output at capture time (schemaVersion 2)
}

export interface SnapshotStore {
  /** Newest first. Damaged records are listed with status "damaged" and can't be restored. */
  list(architectureId: string): Promise<SnapshotListItem[]>;
  get(id: string): Promise<{ status: "ok"; record: SnapshotRecord } | { status: "damaged"; id: string } | undefined>;
  capture(file: ArchitectureFile, trigger: SnapshotTrigger): Promise<
    | { status: "created"; id: string }
    | { status: "unchanged"; id: string }        // id of the existing latest snapshot with the same diagram
    | { status: "skipped"; reason: "low-storage" }
  >;
}
```

Snapshots are parsed with `parseArchitectureFile` on read, so a future schema migration applies to them as it does to records. A snapshot that fails parsing is listed as "This version is damaged and can't be restored." It is never deleted automatically except by retention.

### 6.4 Triggers

The snapshot scheduler lives in `src/persistence/snapshotScheduler.ts` and is started per editor session next to autosave. It always captures **the persisted record** (`repository.get(id)`), never unsaved store state, so a version equals something that was actually saved.

| Trigger | When | Notes |
|---|---|---|
| `open` | After the editor session starts | Captures the starting point of every session. Deduplication makes it a no-op when nothing changed since the last version. |
| `interval` | On a save-status transition to `saved`, if `contentRevision` advanced since the last capture **and** at least 10 min have passed since the last capture in this session | At most one per 10 minutes of active editing. Viewport-only changes never qualify (they do not change `contentRevision`). |
| `leave` | After a successful `flush()` when leaving the editor (Library button, import, route change in teardown) | Fire-and-forget. Unload/tab close cannot reliably run async IndexedDB work, so it is not a trigger. The `open` and `interval` triggers cover that case. |
| `manual` | "Save version now" in the Versions dialog | Awaits `flush()` first. |
| `pre-restore` | Step 2 of restore (§6.6) | Required. Restore aborts if it fails. |

Auto captures (`open`, `interval`, `leave`) are skipped with `low-storage` when `navigator.storage.estimate()` reports usage above 80% of quota. This keeps snapshots from starving architecture saves. Manual and pre-restore captures are always attempted. Snapshot failures never change the autosave status. They are logged and shown as a notice in the Versions dialog.

### 6.5 Deduplication and bounded retention

Each `capture` is one `readwrite` transaction on `snapshots`, so concurrent tabs are serialized by IndexedDB:

1. Read the latest snapshot for `architectureId` (index `byArchitectureCreated`, `prev` cursor over `[id, ""]..[id, "￿"]`).
2. If its `fingerprint` and full diagram key equal the new one, return `unchanged` with its id and write nothing. This applies to **every** trigger, including manual and pre-restore.
3. Otherwise add the record, then prune per class, oldest first, never the record just added:
   - `auto`: keep the newest **30**, and delete auto snapshots older than **90 days**;
   - `manual`: keep the newest **20** (the dialog says so before the 21st is saved: "Saving removes the oldest saved version.");
   - `recovery`: keep the newest **10**.

The worst case per architecture is 60 snapshots. At the performance-fixture size (100 components, 150 relationships, about 100–150 kB of JSON) that is roughly 9 MB, which is bounded and well under typical quotas.

**Lifecycle.** `repository.remove(id)` deletes the record **and** its snapshots in one transaction over both stores, so there are no orphans. The library delete copy becomes: "This cannot be undone. Its saved versions are deleted too. Export it to JSON first if you want a backup." `duplicate` and import do not copy snapshots (new id, new history). JSON export and import are unchanged: versions are browser-local only.

### 6.6 Restore

**New command** (P3): `{ kind: "restoreDiagram"; components: Component[]; relationships: Relationship[]; groups: Group[] }`, with label "Restore version".

The operation replaces those three arrays, keeps `id`, `name`, `description`, `createdAt` and `canvas`, and runs `validateArchitecture` on the result. If there are issues it throws `DomainError("E_INVALID_RESTORE", …)` and nothing changes. It is undoable like any command.

**Flow** (Versions dialog → Restore… → confirmation):

| Step | Action | On failure |
|---|---|---|
| 0 | Confirmation `ConfirmDialog` (busy-capable, like the library). Title "Restore the version from {date, time}?" Description: "The diagram is replaced with this version ({counts}). Your current diagram is saved as a version first, so you can switch back. The name and description stay as they are." Confirm label "Restore", Cancel focused first, Escape cancels, backdrop does nothing (UCC CD1–CD9). | — |
| 1 | `await controller.flush()` | Inline dialog error: "Your latest changes could not be saved, so nothing was restored." |
| 2 | **Recovery point**: `capture(currentPersistedFile, "pre-restore")`. `unchanged` counts as success (the matching latest version already is the recovery point). | Inline error "A recovery version could not be saved, so nothing was restored." Nothing changes. |
| 3 | Load and parse the target snapshot. Dispatch `restoreDiagram`. | Inline error with the domain message. The recovery version stays (harmless). |
| 4 | Close the dialog. Clear the selection, `fitView()`, `flush()`. Show the entry-bound Undo toast (§2.3) "Restored the version from {time}." and announce it. Focus goes to the canvas. | — |

**Undo and restore semantics.**

- `Mod+Z` or the toast Undo right after a restore returns to the exact pre-restore diagram in one step. Redo re-applies it.
- The recovery version **outlives the session**. Even after leaving or reloading, the pre-restore diagram is in Versions, labeled "Before restore".
- Restoring never deletes versions. Restore is a new forward state, so a version list never loses entries because of a restore.
- If another tab has the same architecture open, the existing banner applies. Last write wins (TD 8.6). The recovery version protects the overwritten state.

### 6.7 Versions UI

- Toolbar **Versions** button (clock icon, tooltip "Versions"). It opens a modal `Dialog` titled "Versions of '{name}'".
- The header has a **Save version now** button. Results: "Version saved." / "No changes since the last version." / an inline error.
- The list (`<ol>`, newest first) shows per row: `<time datetime>`, with "Today 14:05", "Yesterday 09:12" or a localized date and time; the kind ("Automatic", "Saved", "Before restore"); the counts ("12 components · 9 relationships · 2 groups"); a "Current" badge when the diagram key equals the current saved diagram; and a **Restore…** button (accessible name "Restore the version from {date time}"), disabled on the Current row. Damaged rows show a message instead of the button.
- States: Loading ("Loading versions…"), Empty ("No versions yet. A version is saved when you open an architecture that changed, every 10 minutes while you edit, and when you leave the editor."), Error ("Versions could not be loaded." + Retry), and a low-storage notice.
- Footer note: "Versions are stored only in this browser. Up to 30 automatic, 20 saved and 10 before-restore versions are kept. Versions are not included in JSON export."
- No preview or diff in this version. That is a later option.

### 6.8 Acceptance tests

| ID | Level | Test |
|---|---|---|
| VS1 | unit `db.test.ts` (fake-indexeddb) | **Upgrade preserves data**: create a raw v1 DB with three records (one with an old `schemaVersion`) through raw `indexedDB.open(name, 1)`. Then `openDatabase()` gives version 2, the `snapshots` store and index exist, and every `architectures` value is deep-equal to what was written before. |
| VS2 | unit | **Blocked**: a v1 connection without `onversionchange` blocks; `blocked` is reported; after `close()` the open resolves. A v2 connection receiving `versionchange` calls `close()`. |
| VS3 | unit `snapshots.test.ts` | Same diagram returns `unchanged` (for any trigger). A viewport-only or name-only difference returns `unchanged`. Retention caps per class and the 90-day auto pruning (injected clock). Two concurrent `capture` calls of the same content create exactly one record. Damaged snapshot listing. |
| VS4 | unit `repository.test.ts` | `remove(id)` deletes the record and its snapshots atomically. Snapshots of other architectures are untouched. |
| VS5 | unit `operations.test.ts` | `restoreDiagram` keeps `id`, `name`, `description`, `createdAt` and `canvas`. An invalid payload is rejected with `E_INVALID_RESTORE` and the architecture is unchanged. One undo restores the previous diagram. |
| VS6 | unit `snapshotScheduler.test.ts` | `open` capture. Interval only after ≥ 10 min **and** a content change. A viewport change never triggers. `leave` after flush. Low storage skips auto but not manual. Capture failures never change `SaveController` status. |
| VS7 | RTL `VersionsDialog.test.tsx` | List rendering, Current badge, disabled Restore on Current, empty, loading, error and Retry states, and the confirmation copy. A failure in step 1, 2 or 3 leaves the store unchanged and shows an inline error. |
| VS8 | e2e `e2e/versions.spec.ts` | Create, add A, leave, reopen (version 1), add B, Save version now, delete A (confirm), open Versions, restore version 1. The diagram shows only A. Versions contains a "Before restore" entry whose counts match the pre-restore diagram (B only). Reload: still restored. Restore "Before restore": the diagram is B only again. Restore version 1 once more, then `Mod+Z`: the diagram returns to the pre-restore state in one step. |
| VS9 | e2e `e2e/versions-upgrade.spec.ts` | Seed a **v1** DB in the page (`page.evaluate` with raw IndexedDB before the app's first open, by navigating to a blank route on the same origin), then load the app. The library lists the seeded architecture unchanged and the editor opens it. |
| VS10 | e2e axe | Versions dialog (list and empty) and the restore confirmation: 0 violations. |

---

## 7. Quality: cross-browser, axe and bundle

### 7.1 Playwright Firefox and WebKit smoke

- `playwright.config.ts` projects:
  - `chromium`: all specs (unchanged);
  - `firefox` (`devices["Desktop Firefox"]`) and `webkit` (`devices["Desktop Safari"]`): `grep: /@smoke/`.
- The new `e2e/smoke.spec.ts`, with every test tagged `{ tag: "@smoke" }`, covers flows that exercise engine differences: IndexedDB persistence across reload, `BroadcastChannel`, native `<dialog>`, downloads, `FileReader` import, keyboard modifiers and React Flow pointer drags:
  1. Library: create an architecture, rename it, reload, and it persists.
  2. Editor: add three components, drag one, connect two through the Connect dialog, `Mod+Z`/redo, reload, and everything persists.
  3. Delete confirmation: Cancel keeps; Confirm deletes; the toast Undo restores (§2).
  4. Export JSON (download content parsed), then import it as a new architecture.
  5. Export PNG: the download has a PNG signature and non-zero dimensions. html-to-image has known engine differences. A WebKit or Firefox failure here is triaged as a product bug. It may only be marked `test.fixme` with a linked reason, approved by the coordinator, never skipped silently.
  6. After wave 3: Quick Find (`ControlOrMeta+K`), Arrange → Align top, Versions → Save version now.
- Modifiers: tests use `modifierFor(page)` (existing) or Playwright's `ControlOrMeta`, never a hard-coded `Meta`.
- Browser install is a documented prerequisite: `npx playwright install firefox webkit`. Only Chromium is installed locally today. The repo has no CI config, so this report adds none; a CI workflow is a separate, explicitly requested change.
- `npm run e2e` keeps running all projects. Add the scripts `e2e:smoke` (`playwright test --grep @smoke`) and `e2e:chromium`.

### 7.2 Axe

- devDependency `@axe-core/playwright`, pinned exactly in `package.json`. The version is chosen at implementation as the latest release compatible with `@playwright/test` 1.64.
- `e2e/axe.ts` helper `expectNoA11yViolations(page, { include?, exclude? })`: tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`. It fails on **any** violation and prints rule id, impact, target and help URL.
- `e2e/axe-exclusions.ts`: the only place an exclusion may live. Each entry has `{ rule, selector, reason, owner }`. It starts **empty**. Blanket rule disables are forbidden. A third-party React Flow finding gets a narrowly scoped exclusion only after it is shown to be outside app control.
- Scans run in Chromium (axe results are engine-independent for these rules) and also in the smoke projects for library and editor-with-selection, to catch engine-specific ARIA rendering issues.

**Core screens and dialogs scanned** (`e2e/a11y-axe.spec.ts`, wave 1). Each state is reached through the UI, then scanned:

| Screen or dialog | State |
|---|---|
| Library | empty; with three architectures; with the backup banner |
| Library dialogs | New architecture; Rename; Delete confirmation (open state). The busy and inline-error states can't be forced reliably against real IndexedDB in e2e, so RTL covers them. |
| Import error dialog | invalid file imported |
| Editor | empty canvas; components + relationships + group; component, relationship, group and multi-selection inspectors; save-failed state is RTL-only |
| Editor dialogs and overlays | Connect dialog; delete confirmation; ungroup confirmation; Export menu open; toast visible |

Wave 3 adds (`e2e/a11y-axe-v2.spec.ts`): Quick Find (results / no results), Arrange menu, Versions (list / empty), restore confirmation, and the multi-color mixed inspector (MC5).

### 7.3 Vite 8 code splitting (no threshold change)

Hard rule: `vite.config.ts` must **not** set `build.chunkSizeWarningLimit`. The 500 kB default stays, and the build must emit **zero** chunk-size warnings.

1. **Route split.** Load the editor route lazily. Move the editor-only wiring out of `defaultServices.ts` into a new `src/app/defaultModules.ts` (`CanvasProvider`, `CanvasView`, `Palette`, `Inspector`, `ConnectDialog`, plus the editor-only services `createEditorStore`, `startAutosave`, `exportPng`, `exportArchitectureMarkdown`, `actions`). `App` keeps its `services`/`modules` props for tests. When they are not injected, it renders a `React.lazy` `EditorRoute` that dynamically imports `./defaultModules` and `./EditorScreen`. The library route then never loads `@xyflow/react` or the canvas code. The services interface stays the same shape: editor-only members resolve from the lazy module, and library members (`openRepository`, `importArchitectureFile`, `exportArchitectureJson`, `exportRawJson`, tab sync, `requestPersistentStorage`) stay eager.
2. **Export-only dependency.** `io/exportPng.ts` loads `html-to-image` with `await import("html-to-image")` at export time. Its tests mock the dynamic module.
3. **Stable vendor chunks** through Rolldown (verified against the installed `rolldown` 1.2.15 typings: `output.codeSplitting.groups`; `manualChunks` and `advancedChunks` are deprecated):

   ```ts
   build: {
     manifest: true,
     rolldownOptions: {
       output: {
         codeSplitting: {
           groups: [
             { name: "react-vendor", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
             { name: "flow-vendor", test: /node_modules[\\/](@xyflow|d3-[^\\/]+|zustand|classcat)[\\/]/ },
             { name: "markdown-vendor", test: /node_modules[\\/](react-markdown|remark-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|unified|hast-[^\\/]+)[\\/]/ },
           ],
         },
       },
     },
   },
   ```

   The groups only name and share code. They must not pull editor or markdown vendors into the initial graph. The bundle check verifies this.
4. **Load-failure fallback.** If a lazy chunk fails (offline, or a deploy replaced the hashes), an error boundary around `EditorRoute` shows the existing `StorageUnavailable` panel pattern with the title "The editor could not be loaded", the text "Check your connection and reload the page.", and a "Reload" button (`location.reload()`). It must never show a blank screen.
5. **CSP.** Chunks are same-origin `<script type="module">`/`modulepreload`, so `script-src 'self'` still holds. The check asserts the built `index.html` contains no inline `<script>` without `src`.
6. **Budget check.** `scripts/check-bundle.mjs` (script `check:bundle`, run after `build`) reads `dist/.vite/manifest.json` and fails if:
   - any JS chunk is > 500 kB minified;
   - the **initial** JS (the entry plus its static imports) exceeds the budget. The budget is set in the script at implementation to the measured post-split value + 10%, and must be **≤ 156 kB gzip** (75% of today's 208 kB);
   - the initial graph contains a module from `@xyflow/react` or `html-to-image`;
   - `vite.config.ts` contains `chunkSizeWarningLimit`.

### 7.4 Acceptance tests

| ID | Test |
|---|---|
| QA1 | `npx playwright test --project=firefox --project=webkit` runs every `@smoke` test green (after `npx playwright install firefox webkit`). |
| QA2 | `npx playwright test --project=chromium` passes the full existing suite, including scenario J (no external requests, now with lazy chunks) and the performance spec. |
| QA3 | Every axe state in §7.2 reports 0 violations with an empty `axe-exclusions.ts`, or with entries that each carry a reason approved in review. |
| QA4 | `npm run build` prints no chunk-size warning. `npm run check:bundle` passes. The initial route excludes `@xyflow/react` and `html-to-image`. |
| QA5 | e2e: no `securitypolicyviolation` events (listener added in `smoke.spec.ts`) while the editor route loads. |
| QA6 | RTL: a rejected lazy import shows "The editor could not be loaded" with a working Reload button. |
| QA7 | `npm run typecheck`, `npm run lint` and `npm test` are green. |

---

## 8. Waves, stages, ownership and commits

### 8.1 Ownership rule

Within a wave, every file has **exactly one writing stage**. New files are owned by the stage that creates them. Shared shell files (`Toolbar.tsx`, `EditorScreen.tsx`, `shortcuts.ts`, `services.ts`, `defaultServices.ts`, `app.css`) are written in wave 1 only by the stage listed below, and in wave 3 only by the single integration stage. Workers may read any file but must not rely on unfinished sibling changes. Routing follows the user's policy: UI/UX stages go to `stage-ui` whatever their difficulty; otherwise difficulty 1–2 goes to `stage-easy`, 3–4 to `stage-standard` and 5 to `stage-expert`.

### 8.2 Wave 1: cores, in parallel (no shared writers)

| Stage | Outcome | Writes (exclusive) | Difficulty and worker |
|---|---|---|---|
| **S1 Undo toast binding** (§2) | Entry ids, `undoEntry`, `historyHeadId`, the bound toast, session-scoped dismissal, toast pause and 10 s | `src/history/history.ts`(+test), `src/editor/store.ts`(+test), `src/editor/storeTypes.ts`, `src/editor/actions.ts`(+test), `src/app/placeholders/editorStore.ts`, `src/app/placeholders/actions.ts`, `src/app/services.ts`, `src/app/EditorScreen.tsx`, `src/app/App.integration.test.tsx`, `src/ui/Toast.tsx`(+test), `src/ui/base.css`, `e2e/undo-toast.spec.ts` (new) | 3: store contract and race semantics. Includes toast UI, so **stage-ui** |
| **S2 Multi-selection color** (§4) | Mixed-state Color section | `src/inspector/AccentPicker.tsx`(+test), `src/inspector/MultiSelectionInspector.tsx`, `src/inspector/MultiSelectionInspector.test.tsx` (new), `src/inspector/inspector.css`, `e2e/multi-color.spec.ts` (new) | 2: an existing command. **stage-ui** |
| **S3 Snapshot persistence core** (§6.2–6.6, no UI) | DB v2 upgrade, `SnapshotStore`, cascade remove, blocked/blocking signals, the `restoreDiagram` command | `src/persistence/db.ts`, `src/persistence/db.test.ts` (new), `src/persistence/snapshots.ts`(+test, new), `src/persistence/repository.ts`(+test), `src/persistence/types.ts`, `src/domain/ids.ts`(+test), `src/domain/commands.ts`, `src/domain/operations.ts`(+test), `src/editor/commandLabels.ts` | 4: migration safety, transactions, concurrency. **stage-standard** |
| **S4 Arrange core** (§5.3, 5.4 actions) | Pure geometry and store actions | `src/domain/arrange.ts`(+test, new), `src/editor/arrange.ts`(+test, new) | 3: algorithms and invariance property tests. **stage-standard** |
| **S5 Quick Find search** (§3.4) | Pure ranking | `src/find/search.ts`(+test, new) | 2. **stage-easy** |
| **S6 Quality foundation** (§7) | Playwright projects and smoke, axe helper and core scans, route split, lazy html-to-image, vendor groups, bundle check, load-failure fallback | `playwright.config.ts`, `vite.config.ts`, `package.json`, `package-lock.json`, `scripts/check-bundle.mjs` (new), `e2e/helpers.ts`, `e2e/axe.ts`, `e2e/axe-exclusions.ts`, `e2e/a11y-axe.spec.ts`, `e2e/smoke.spec.ts` (all new except helpers), `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/defaultServices.ts`, `src/app/defaultModules.ts` (new), `src/app/EditorRoute.tsx` (new), `src/io/exportPng.ts`(+test) | 4: boot-path refactor and build config. **stage-standard**. The fallback reuses the existing `StorageUnavailable` markup verbatim; any new visual design goes to stage-ui |

Conflict checks:

- S1 owns `services.ts` (the `ActionFeedback` type) and S6 owns `defaultServices.ts` (wiring only). S6 passes `feedback` through unchanged, so it does not depend on S1's new member.
- S1 owns `EditorScreen.tsx`. S6 imports it lazily without editing it.
- S3 owns `operations.ts`/`commands.ts`. S4 only **reads** `moveElements` (an existing command).
- The resource reservations "npm install/lockfile" and "playwright browser install" belong to S6 alone. No other wave-1 stage may run `npm install`.
- E2E runs share port 4173 (`--strictPort`). The coordinator runs e2e validation **serially** per stage (or each worker uses `reuseExistingServer` against a coordinator-owned preview). Stages must not start competing preview servers.

Wave-1 gate (coordinator): merge all six, then run `typecheck`, `lint`, `test`, `build`, `check:bundle` and the full chromium e2e, plus the firefox/webkit smoke.

### 8.3 Wave 2: feature UIs, in parallel (after wave 1)

| Stage | Outcome | Writes (exclusive) | Depends on | Difficulty and worker |
|---|---|---|---|---|
| **S7 Quick Find UI + reveal** (§3.2–3.3) | `QuickFindDialog` (props: `open`, `onClose`, `onChoose(id)`) and `canvasApi.revealComponent` | `src/find/QuickFindDialog.tsx`(+test), `src/find/quickFind.css`, `src/canvas/canvasApi.ts`, `src/canvas/CanvasView.tsx`(+test), `src/app/placeholders/modules.tsx` | S5 | 3. **stage-ui** |
| **S8 Arrange menu** (§5.4) | `ArrangeMenu` (props: `selectionUnits`, `onAlign`, `onDistribute`, `onTidy`) | `src/toolbar/ArrangeMenu.tsx`(+test), `src/toolbar/toolbar.css`, `src/toolbar/glyphs.tsx` | S4 | 2. **stage-ui** |
| **S9a Snapshot scheduler** (§6.4) | `startSnapshotScheduler(store, controller, repository, snapshots, architectureId)` returning `{ captureNow(trigger), dispose() }` | `src/persistence/snapshotScheduler.ts`(+test, new) | S3 | 3. **stage-standard** |
| **S9b Versions dialog + library copy** (§6.7, §6.5) | `VersionsDialog` (props: `open`, `architecture`, `snapshots`, `onSaveNow`, `onRestore(id)`, `onClose`) incl. restore confirmation states; library delete copy | `src/versions/VersionsDialog.tsx`(+test), `src/versions/versions.css`, `src/ui/icons.tsx`, `src/library/LibraryScreen.tsx`, `src/library/LibraryScreen.test.tsx` | S3 | 3. **stage-ui** |

Wave-2 gate: unit and RTL suites green. The components are not reachable yet, so the e2e suite is unchanged and still green.

### 8.4 Wave 3: shell integration (single writer)

| Stage | Outcome | Writes (exclusive) | Difficulty and worker |
|---|---|---|---|
| **S10 Integrate Find, Arrange, Versions** | Toolbar Find, Arrange and Versions buttons. Shortcuts `Mod+K` and `/` (`ShortcutContext.openQuickFind`). `EditorScreen` owns the dialogs, the restore flow (§6.6 steps 0–4), the scheduler lifecycle (start next to autosave, `leave` capture after flush), Tidy and restore toasts through `showEntryUndoToast`, and the blocked/blocking banners in `App`. | `src/toolbar/Toolbar.tsx`(+test), `src/app/shortcuts.ts`(+test), `src/app/EditorScreen.tsx`, `src/app/services.ts`, `src/app/defaultServices.ts`, `src/app/defaultModules.ts`, `src/app/App.tsx`, `src/app/app.css`, `src/app/App.integration.test.tsx`, `e2e/quick-find.spec.ts`, `e2e/arrange.spec.ts`, `e2e/versions.spec.ts`, `e2e/versions-upgrade.spec.ts`, `e2e/a11y-axe-v2.spec.ts`, `e2e/smoke.spec.ts` | 4: cross-module UI wiring, async restore ordering. **stage-ui** |

S10 also updates `TECHNICAL_DESIGN.md` (5.2, 5.3, 6.6, 6.7, 7.6, 8.2, 8.3, 15) and `UI_COLOR_CONFIRMATION_DESIGN.md` §2.5 to the shipped contracts. It touches only the sections named here.

### 8.5 Wave 4: release gate (coordinator, no new features)

Run the full matrix: `typecheck`, `lint`, `test`, `build`, `check:bundle`, chromium full e2e, firefox/webkit `@smoke`, and all axe specs. Manual checks:

- open a profile that has v1 data in a real browser and confirm the data survives the upgrade;
- keep an old-version tab open during the upgrade and confirm the blocked message and the resume;
- VoiceOver/NVDA spot checks of Quick Find and the mixed color group.

### 8.6 Commit strategy (coordinator executes, one commit per validated stage)

| Commit | Content | Gate |
|---|---|---|
| `feat(editor): bind deletion Undo toast to its history entry` | S1 | unit + RTL + `undo-toast` e2e + existing delete e2e |
| `feat(inspector): set color on multi-selection with mixed state` | S2 | RTL + `multi-color` e2e |
| `feat(persistence): add versions store with non-destructive IndexedDB v2 upgrade` | S3 | unit (VS1–VS5) + full existing e2e (data paths) |
| `feat(domain): geometric align, distribute and tidy layout` | S4 | unit (AR1–AR5) |
| `feat(find): component search ranking` | S5 | unit |
| `build: split editor route and vendors; add Firefox/WebKit smoke and axe scans` | S6 | QA1–QA7 |
| `feat(find): Quick Find dialog and reveal on canvas` | S7 | RTL |
| `feat(toolbar): Arrange menu` | S8 | RTL |
| `feat(persistence): snapshot scheduler` | S9a | unit |
| `feat(versions): versions dialog and restore confirmation` | S9b | RTL |
| `feat(editor): integrate Quick Find, Arrange and Versions` (+ doc updates) | S10 | full matrix |

Every commit leaves the app working. Wave-2 components are unreachable until S10, and the DB v2 upgrade in S3 is additive and inert until S9a/S10 write snapshots.

---

## 9. Risks, release rules and decisions

| Risk | Mitigation |
|---|---|
| Old v1 tab blocks the v2 upgrade | `blocked()` message and auto-resume (§6.2). Never shown as "storage unavailable". |
| Rolling back to a v1 build after v2 shipped | **Release rule:** never decrease `DATABASE_VERSION`. A rollback ships with v2 kept and snapshot code disabled. |
| Snapshots consume quota and starve saves | 80% estimate guard for auto captures. Bounded retention (≤ 60 per architecture). Snapshot failures are isolated from autosave. |
| Two tabs restore or edit at the same time | IndexedDB transaction serialization plus dedupe inside the transaction. Recovery version before every restore. Existing tab-conflict banner. |
| `Mod+K` collides with a browser or extension shortcut | `/` alternative and the toolbar Find button. Shortcut covered by unit test and e2e in all three engines. |
| Tidy layout read as a flow diagram | Grid pack in reading order, relationship-blind by signature and by test (AR2), copy states "positions only". |
| html-to-image differences in Firefox/WebKit | Smoke test reports them. Fixes are product bugs; `fixme` only with coordinator approval. |
| Lazy chunk 404 after a redeploy | Error boundary with Reload (QA6). |
| React Flow third-party axe findings | Narrow, justified exclusions only (§7.2). |

**Decisions taken** (the defaults; none block Build):

1. Restore applies the diagram only (components, relationships, groups), not name or description. This is consistent with undo.
2. Retention is 30 auto, 20 manual and 10 recovery per architecture; auto expires after 90 days; the interval is 10 min.
3. The Quick Find shortcut is `Mod+K` (also in text fields) plus `/` (outside text fields).
4. An actionable toast lasts 10 s and pauses on hover or focus.
5. Arrange has no keyboard shortcuts in v2 (menu only).
6. Multi-color choices are not coalesced (one undo step per choice, as in the single picker).
7. The bundle budget is calibrated at implementation, capped at 156 kB gzip initial JS. The chunk warning limit is never raised.

**Unknowns to confirm during Build:**

- the exact `@axe-core/playwright` version;
- whether xyflow's `onMoveEnd` fires for `setCenter` (handled either way by the explicit `setViewport`);
- Firefox headless behavior for `navigator.storage.persist()` (fire-and-forget, already caught);
- the post-split chunk sizes.

---

## 10. Traceability

| Requirement from the brief | Where |
|---|---|
| Undo toast cannot undo an unrelated later edit | §2.2–2.6, UT3, UT6 |
| Quick Find selects, focuses and zooms; keyboard-safe shortcut; accessible results | §3.1–3.3, QF2–QF6 |
| Multi-selection color with mixed state | §4.1–4.2, MC1–MC5 |
| Auto-layout, align and distribute are geometric only; relationships, direction, pins, IDs and membership unchanged | §0 P1–P2, §5.1–5.3, AR1–AR2, AR7 |
| Non-destructive IndexedDB upgrade | §6.2, VS1, VS2, VS9 |
| Snapshot triggers and deduplication | §6.4–6.5, VS3, VS6 |
| Bounded retention | §6.5, VS3 |
| Restore confirmation and pre-restore recovery point | §6.6, VS5, VS7, VS8 |
| Firefox/WebKit smoke, axe on core screens and dialogs | §7.1–7.2, QA1, QA3 |
| Safe Vite 8 code splitting without raising the threshold | §7.3, QA4–QA6 |
| User-visible interactions, data contracts, acceptance tests, file ownership, waves | §2–§7 tables, §8 |
