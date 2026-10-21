# Swarm Architecturer — Product Concept v1.1

**Status:** Revised concept (v1.1). This document makes small revisions to the v1.0 concept. It adds the audit fixes and does not change the product's scope.

## Changes in v1.1

The changes below make v1.0 clearer. They add no new scope.

| Area | v1.1 clarification |
|---|---|
| Product name | The product is named **Swarm Architecturer** throughout. |
| Groups | Groups are non-executable organizational containers, separate from component types. They cannot be relationship endpoints, cannot be nested, and a component can belong to at most one group in the MVP. Membership changes only through an explicit group/ungroup action or an explicit assignment to another group; moving a single component outside a group's visual boundary does not ungroup it, and the group's bounds update to keep enclosing all members. Moving a group moves all of its members. Deleting a group ungroups its members and keeps the components and their relationships. Membership is stored in one place only: `Group.memberComponentIds`. |
| Relationship direction | Arrows show which way the semantic relationship points. They do not show data flow or execution order. The source is the subject of the relation. Each relationship type is defined as directed or undirected (Section 5.4 and Section 12). The direction of predefined types is fixed by their type; only Generic relationships can change direction. |
| Orchestrator | An Orchestrator is a specialized Agent subtype (`type: "agent"`, `subtype: "orchestrator"`). It has the same schema as an Agent but its own visual style. |
| Associations | The agents, tools and resources linked to a component are derived from graph relationships. Component properties contain no second, manually edited relationship list. The inspector's list of a component's relationships is read-only; a relationship is edited in its own relationship inspector. |
| Tool / External System / Memory | Each type now has a clear definition. One real-world integration does not need to be modeled twice unless the distinction is useful. For Memory/Data Store, the storage kind (for example relational, vector or file) is separate from the access scope (shared or private). |
| Behavioral fields | All behavioral fields are lightweight and optional. Description, Purpose (why the component exists) and Role (its function in the architecture) are separate fields. Outputs and Failure Handling are optional structured text fields in the MVP scope for Agents and Orchestrators. |
| JSON import | An import creates a new architecture by default. The file is validated before anything is saved, and no existing architecture is overwritten silently. |
| Undo/redo | The operations that undo/redo covers are now listed (Section 9, M2). |
| Acceptance | Scenario J now means "no required external services". A lightweight, qualitative product-hypothesis check (Scenario K) has been added. It is not a release gate. |
| Phases | The delivery phases are mapped to the MVP requirements M1–M9. The MVP is complete only when M1–M9 are implemented, Scenarios A–J pass and the quality requirements are met. Scenario K is recorded separately to inform post-MVP planning. |

---

## 1. Executive Summary and Positioning

Swarm Architecturer is a lightweight web-based visual editor. People use it to design, organize and document AI-agent architectures and multi-agent behavioral systems.

It is a specialized, simplified diagramming tool in the spirit of draw.io or Excalidraw, built around the concepts of agent systems. It is **not**:

- an agent execution engine,
- a workflow automation platform,
- an orchestration framework,
- an AI-provider client.

Users place agent-oriented components on a canvas, connect them with typed relationships, and document responsibilities and behavioral rules. They then save the result. No code or configuration is required.

The product models these concepts:

- agents and orchestrators,
- groups and swarms of agents,
- tools,
- memory and data stores,
- external systems,
- behavioral rules and routing conditions,
- delegation and supervision.

Swarm Architecturer is local-first: it runs in the browser, stores data locally, and needs no account, backend or AI service.

## 2. Vision and Product Philosophy

The vision is to let people communicate both the **structure** and the **behavior** of an AI-agent system clearly, in one place.

Five principles guide the product:

1. **Simplicity first.** Users can be productive within minutes. No setup, no configuration, no learning curve beyond common diagramming conventions.
2. **Visual thinking.** The canvas is the main way users understand an architecture.
3. **Semantic specialization.** Components and relationships have agent-specific meaning. They are not generic shapes and lines.
4. **Documentation without complexity.** Behavior is described in plain structured text, not in code or a DSL.
5. **Progressive detail.** The canvas stays clean. Detail is shown when the user selects something.

**Division of responsibility:** The canvas shows structure: what exists and how the parts relate. The inspector holds behavior and detailed documentation: what each part does and under what conditions.

### Product hypotheses

The concept rests on three hypotheses. Scenario K in Section 16 checks them in a lightweight way.

- **H1. Semantic specialization helps understanding.** Typed agent components and relationships help people understand an agent architecture faster and more accurately than generic diagrams or prose alone.
- **H2. Structure on the canvas plus behavior in the inspector is enough.** Readers can answer the key questions about an architecture (Section 3) without an overloaded canvas.
- **H3. Lightweight and local-first is enough for individual use.** Individual developers and AI engineers can model a realistic architecture without accounts, backends or execution features.

## 3. Problem Statement

Today, AI-agent architectures are usually documented in pieces:

- **Textual documents** describe behavior but make structure hard to see.
- **Generic diagrams** (boxes and arrows) show structure but have no agent semantics and no place for behavior.
- **Code documentation** is tied to a particular framework and is hard for people who don't read code to follow.
- **Static charts** go out of date quickly and are hard to change.

As a result, teams struggle to share one clear picture of who does what, how work moves, and what happens when something fails.

### Example

Consider a lead-discovery system with:

- an **orchestrator** that coordinates the process,
- a **discovery agent** that finds candidate leads,
- a **qualification agent** that checks whether leads fit,
- a **scoring agent** that ranks qualified leads,
- a **shared data store** for lead records,
- an **external search** capability used for discovery,
- a **CRM** that receives the final leads.

Someone reading this architecture should be able to answer:

1. Who coordinates the system?
2. What does each agent do?
3. What information is shared, and where?
4. Which tools are used, and by whom?
5. When does delegation or escalation happen?
6. Which external dependencies exist?
7. How does the system behave when something fails?

Swarm Architecturer should make these answers visible on the canvas or one selection away in the inspector.

## 4. Target Audience

**Primary users:**

- AI engineers
- software architects
- developers building agent systems
- AI teams documenting their systems

**Secondary users:**

- product managers
- researchers
- educators and students
- people experimenting with agent frameworks

**MVP focus:** The initial MVP is for **individual developers and AI engineers**. It has no real-time collaboration, no organization management and no enterprise functions.

## 5. Core Concept: Canvas, Properties and Relationships

### 5.1 Canvas

The canvas is a free-form workspace. Users can:

- place components anywhere,
- add, move and resize components (where resizing applies),
- connect components with typed relationships,
- group components,
- zoom and pan,
- select and edit components, relationships and groups,
- use context actions such as delete, group/ungroup and duplicate component.

The canvas does not force a sequence or layout. Positions communicate structure; they do not imply execution order.

### 5.2 Inspector (property panel)

When a component, relationship or group is selected, the inspector shows its details. For Agents and Orchestrators the inspector is organized into these sections:

| Section | Contents |
|---|---|
| **Identity** | Name, type (Agent or Orchestrator subtype), Description, Purpose, Role |
| **Responsibilities** | Responsibilities and tasks, boundaries (what it does *not* do) |
| **Behavior** | Activation, behavioral rules, delegation, outputs, failure handling |
| **Relationships** | A read-only list of incoming and outgoing relationships, derived from the graph (Section 5.5) |
| **Documentation** | Markdown notes and external links |

When a relationship is selected, the inspector shows the **relationship inspector**: its type, direction, label and description, which can be edited there.

Detailed text stays in the inspector, not inside nodes. Nodes show only the name, the type and an optional short description (Section 14).

**Description vs. Purpose vs. Role:** These are three separate, optional fields.

- **Description** is a short, one-line summary of what the component is. It can appear on the node and in lists.
- **Purpose** states *why* the agent exists: the need or goal it serves. It appears only in the inspector.
- **Role** states *what function* the agent performs in the architecture, for example "coordinator", "validator" or "lead scorer". It appears only in the inspector.

Every behavioral field is optional. An agent with only a name is valid.

### 5.3 Relationships as semantic documentation

Relationships document how components relate. They are **not** executable transitions, data pipes or control flow.

Rules for relationships:

- Relationships connect two **components**. Groups cannot be relationship endpoints (Section 6.6).
- Every relationship has a source, a target, a type, a direction mode (directed or undirected), and an optional label and description.

### 5.4 Relationship types and direction

**Arrow convention:** An arrow points from the **source** to the **target**. The source is the subject of the relation, so the relationship reads as "source *relation* target". The arrow describes the semantic relationship only. It does not describe data flow or execution order.

For example, *Discovery Agent → Reads From → Lead Store* means the agent reads from the store. Data moves from the store to the agent, but the arrow points from the reader to the resource.

| Relationship type | Direction | Source (subject) | Target | Reads as |
|---|---|---|---|---|
| **Delegates To** | Directed | Delegating component | Delegate | "Orchestrator delegates to Discovery Agent" |
| **Supervises** | Directed | Supervisor | Supervised component | "Orchestrator supervises Scoring Agent" |
| **Uses** | Directed | User of the capability (usually an agent) | Used component (usually a Tool) | "Discovery Agent uses Search Services" |
| **Reads From** | Directed | Reader | Resource being read | "Scoring Agent reads from Lead Store" |
| **Writes To** | Directed | Writer | Resource being written | "Discovery Agent writes to Lead Store" |
| **Shares Context With** | **Undirected** | — (order not meaningful) | — | "Validation Agent shares context with Scoring Agent" |
| **Reports To** | Directed | Reporting component | Recipient of reports | "Scoring Agent reports to Orchestrator" |
| **Hands Off To** | Directed | Component handing off | Component receiving the handoff | "Validation Agent hands off to Scoring Agent" |
| **Depends On** | Directed | Dependent | Dependency | "LHE Orchestrator depends on CRM" |
| **Generic (custom)** | Directed by default; may be set to undirected | Subject of the custom label | Object | "A *label* B" |

How direction appears on the canvas:

- A directed relationship has an arrowhead at the target.
- An undirected relationship has no arrowheads.
- The direction of the predefined types is fixed by their type. Predefined types offer no action to change the direction mode or to reverse the relationship.
- Only Generic relationships can change direction: the user can switch a Generic relationship between directed and undirected, and can reverse a directed Generic relationship, which swaps its source and target.
- For an undirected relationship, the stored source and target order means nothing. It must not be shown or interpreted as a direction.

### 5.5 Derived associations

The tools an agent uses, the resources it reads or writes, the agents it delegates to and so on are **derived from the graph's relationships**. Component properties contain no second, manually edited list of associations.

- The component inspector's **Relationships** section is a **read-only** list of the selected component's incoming and outgoing relationships, grouped by type. The list itself does not create, edit or delete relationships.
- Selecting a relationship entry selects that relationship and opens its relationship inspector (Section 5.2). An entry can also be used to select the component at its other end.
- Edits made in the relationship inspector change the same relationship record the canvas shows. There is only one source of truth.

## 6. Component Types

Every component has a name, a type and an optional description and notes. The types and their type-specific fields are listed below. All type-specific fields are optional.

### 6.1 Agent

The fundamental participant: an autonomous actor that does work in the system.

Fields: Name, Description, Purpose, Role, Responsibilities, Boundaries, Activation, Behavioral Rules, Delegation, Outputs, Failure Handling, Notes/Documentation, External Links.

### 6.2 Orchestrator (Agent subtype)

A specialized Agent that coordinates other agents. It is responsible for delegation, routing, completion and escalation.

- It is stored as `type: "agent"` with `subtype: "orchestrator"`.
- It uses **exactly the same data schema and fields as an Agent**.
- It has a **distinct visual style**, so coordinating agents are easy to spot.
- A user can switch an Agent to the Orchestrator subtype, or back, without losing data.

### 6.3 Tool

An **invocable capability**, such as a function, API operation or service endpoint, that a component calls to get something done.

Fields: Description, Inputs, Outputs, Technical Reference (for example a link or identifier), Notes.

### 6.4 Memory / Data Store

An **information resource** that holds persistent or contextual information. It is passive, not autonomous. Examples include shared or private memory, a vector store, a relational database and file storage.

Fields: Description, Store Kind, Access Scope, Contents, Access Notes, Notes.

- **Store Kind** describes how the information is stored, for example memory, vector, relational, file or other.
- **Access Scope** describes who can access it: shared (several components) or private (one component).

The two are independent. For example, a shared lead store has Store Kind "relational" and Access Scope "shared".

### 6.5 External System

A platform, API, application or piece of infrastructure that lies **outside the boundary being modeled**. A CRM or third-party SaaS is a typical example.

Fields: Description, System Kind, Boundary/Ownership Notes, Reference Link, Notes.

**Choosing between Tool, Memory/Data Store and External System.** Pick the type that best communicates the component's role in the architecture:

- **Tool:** agents *invoke* it as a capability.
- **Memory/Data Store:** it matters mainly as a place information is *kept and accessed*.
- **External System:** it matters as a *separate system outside the modeled boundary*, such as a system of record.

One real-world integration does not need to be modeled as more than one component. Model it twice only when the distinction adds clarity. For example, a "CRM Upsert" Tool could Write To a "CRM" External System when the team wants to show both the capability and the system it reaches.

### 6.6 Agent Group / Swarm

A simple, named **organizational container** that groups related components visually and conceptually. A group is not a component type; it is a separate entity that contains components.

Groups have no execution model, no shared runtime and no nested sub-canvas. The MVP rules are:

- **Not a relationship endpoint.** Relationships connect components only. If a relationship applies to every member of a group, connect the relevant members, or describe it in the group's description.
- **No nesting.** A group cannot contain another group.
- **One membership per component.** A component belongs to at most one group.
- **Membership changes only explicitly.** A component joins or leaves a group only through an explicit group or ungroup action, or through explicit assignment to another group, which removes it from its current group. Deleting a component or a group also ends the membership (see below).
- **Position does not change membership.** Moving a single member outside the group's visual boundary does not ungroup it, and moving a non-member into the boundary does not add it. The group's bounds update so that they keep enclosing all members.
- **Moving a group moves its members.** All members move together, and their relative positions are preserved.
- **Deleting a group ungroups its members.** The member components and all their relationships remain unchanged.
- **Deleting a member** removes it from its group. The group remains, even if it becomes empty.
- **One source of truth.** Membership is stored only in `Group.memberComponentIds`. Components do not store a `groupId`.

Fields: Name, Description, Notes. Membership and visual bounds are managed on the canvas.

### 6.7 Decision / Routing Rule (optional)

An optional component that shows a **notable** condition or routing decision, such as escalation to a human or a choice between two agents. It is not meant to model every behavior, and it is not executable.

Fields: Condition (text), Outcomes (text), Notes.

This component is **not required for P0**. It is included in the MVP only if it costs little effort.

## 7. Behavioral Modeling

Behavior is described in **plain text, lists and Markdown only**. There is no DSL, no rules engine and no executable condition language.

The behavioral fields for Agents and Orchestrators are all optional and all structured text:

| Field | Meaning |
|---|---|
| **Purpose** | Why the agent exists: the need or goal it serves |
| **Role** | What function the agent performs in the architecture |
| **Responsibilities** | What the agent is responsible for (a list) |
| **Boundaries** | What the agent explicitly does not do |
| **Activation** | When or why the agent becomes active, for example a trigger, request or condition |
| **Behavioral Rules** | Guidelines and constraints on how the agent acts |
| **Delegation** | When and to whom the agent delegates or escalates, in prose. The formal links are relationships. |
| **Outputs** | What the agent produces |
| **Failure Handling** | How the agent behaves when something goes wrong: retries, fallbacks, escalation |

Principles:

- **Structure and behavior are separate.** Relationships on the canvas show structure. Behavioral fields explain conduct. For example, the Delegation field may explain *when* to delegate, while Delegates To relationships show *to whom*.
- **Not every execution path needs to be modeled.** Users document what matters for understanding.
- **No state machine is required.** Behavior descriptions are not validated or executed.

## 8. User Experience

### 8.1 Screens

**Library (home)**

- Lists the user's architectures.
- Actions: create, open, rename, delete (with confirmation), duplicate and import from JSON.
- An import creates a new architecture (Section 12.5).

**Editor**

- **Left:** component library, with click-to-add or drag-to-canvas.
- **Center:** canvas.
- **Right:** inspector for the current selection.
- The side panels can be collapsed where that is useful.

**Toolbar (in the editor)**

- architecture name (editable),
- save status (for example Saved, Saving or Save failed),
- undo and redo,
- zoom in, zoom out and fit to content,
- export (JSON and image),
- import (creates a new architecture; it never replaces the open one),
- basic actions (for example delete selection, group or ungroup).

### 8.2 Primary user journey

1. Create a new architecture, or open an existing one.
2. Add an orchestrator, agents and resources (tools, memory and external systems).
3. Connect them with typed relationships.
4. Document purpose, responsibilities and behavior in the inspector.
5. Group related components.
6. The work is saved automatically and locally.
7. Export to JSON or an image, and reopen the architecture later.

### 8.3 Interaction principles

The editor supports click-to-add or drag-to-add, select, move, connect, edit, delete, zoom and pan.

Interactions must be predictable:

- Deleting a component also deletes its relationships, and the user sees it happen.
- Destructive library actions require confirmation.
- Canvas edits can be undone (Section 9, M2).

## 9. MVP Scope (P0)

**M1 — Architecture management.** Create, open, rename, delete and duplicate architectures. Architectures persist across sessions in the same browser.

**M2 — Canvas basics.** Add, select, move, connect and delete components and relationships. Zoom, pan and fit to content. Undo and redo cover these operations:

- **Covered** (within the open architecture):
  - adding, deleting, moving and resizing components;
  - edits to component, relationship and group properties, where consecutive typing in one field counts as one step;
  - creating, deleting and retyping relationships, and, for Generic relationships only, switching between directed and undirected and reversing them;
  - creating, renaming, moving and deleting groups, and adding, removing or reassigning group members;
  - duplicating a component.
- **Not covered:**
  - selection changes,
  - zoom and pan,
  - library-level actions (create, rename, delete or duplicate an architecture),
  - JSON import,
  - exports.

  Library deletions are protected by confirmation instead of undo.
- History applies only to the current session and the open architecture. It is not persisted and starts empty when an architecture is opened.

**M3 — Component types and groups.** The component types are Agent (including the Orchestrator subtype), Tool, Memory/Data Store and External System. Decision/Routing Rule is an optional component type, included only if it costs little effort. Groups are also required, but a Group is a separate container entity (Section 6.6 and M6), not a `ComponentType`.

**M4 — Properties.**

- All components have common fields: name, description and notes.
- Each type has its own optional fields (Section 6).
- Agents and Orchestrators have the structured behavioral fields from Section 7, including Outputs and Failure Handling.

**M5 — Relationships.**

- Each relationship has a source, a target, a type, a directed/undirected mode set by the type's rules (Section 5.4), and an optional label and description.
- Deleting a component also deletes every relationship that would be left invalid.
- Groups cannot be relationship endpoints.

**M6 — Grouping.** Simple named groups that follow the rules in Section 6.6: no nesting, at most one group per component, membership changes only through explicit group/ungroup or assignment to another group, moving a member outside the boundary does not ungroup it and the bounds update to enclose all members, members move with the group, and deleting a group ungroups its members. Groups have no execution semantics.

**M7 — Local persistence.**

- Saving is automatic and local to the browser. No account is needed.
- Saved data covers component positions and properties, relationships, groups and their membership, and, where practical, view state such as the viewport.

**M8 — Import and export.**

- Native JSON export and import. JSON serves as backup, as a portable and version-controllable file, and as a format for sharing and future integrations.
- Import validates the file first and creates a new architecture (Section 12.5).
- Image export is required, preferably as PNG. SVG is desirable but can be deferred.

**M9 — Visual clarity.**

- Each component type has a clearly distinct appearance, and the Orchestrator differs visually from an Agent.
- Labels and relationships are legible, and directed relationships are easy to tell apart from undirected ones.
- Selection and group states are clear.

## 10. Post-MVP Extensions

These are candidates for later versions. They are **not** part of the MVP.

- **Templates:** supervisor/worker, hierarchical, research swarm, planner/executor, sequential delegation, shared memory.
- **Richer metadata:** input/output contracts, model provider, permissions, retry policies, human approval points, error escalation, prompt references, constraints.
- **Markdown:** import, linking, export and automatically generated documentation. There is no initial sync.
- **Navigation and views:** search, focus, filtering, collapsing and multiple views.
- **Cloud, accounts, collaboration and history:** only after the product has been validated.
- **Framework integrations** (for example LangGraph, CrewAI, AutoGen or custom frameworks). These cover import and export of architecture descriptions only. They do not imply runtime execution, monitoring or code generation.

## 11. Non-Goals

Swarm Architecturer will **not**:

- execute agents,
- call LLMs or AI providers,
- run or simulate workflows,
- provide executable conditions or a programming environment,
- offer runtime debugging or observability,
- support real-time collaboration (in the MVP),
- require enterprise features, authentication or cloud services,
- schedule jobs,
- execute prompts,
- provide a marketplace,
- implement complex version control (JSON files can be versioned externally).

Swarm Architecturer complements orchestration frameworks. It does not replace them.

## 12. Data Model

The domain model does **not depend on the canvas library**. Canvas-specific state is either mapped to the domain model or kept in clearly separated visual metadata.

### 12.1 Entities

**Architecture**

```ts
interface ArchitectureFile {
  schemaVersion: 1;                 // file format version (independent of this concept's v1.1)
  architecture: Architecture;
}

interface Architecture {
  id: string;
  name: string;
  description?: string;
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
  components: Component[];
  relationships: Relationship[];
  groups: Group[];
  canvas?: { viewport?: { x: number; y: number; zoom: number } };
}
```

**Component**

```ts
type ComponentType = "agent" | "tool" | "memory" | "external_system" | "decision";

interface Component {
  id: string;
  type: ComponentType;
  subtype?: "orchestrator";         // only valid when type === "agent"
  name: string;                     // required
  description?: string;             // short summary; may appear on the node
  notes?: string;                   // Markdown
  links?: { label?: string; url: string }[];
  position: { x: number; y: number };
  size?: { width: number; height: number };   // only where resizing applies
  properties?: Record<string, string>;        // type-specific optional fields (Section 6)
  behavior?: AgentBehavior;                   // only for type === "agent" (incl. orchestrator)
}

interface AgentBehavior {           // all optional, structured text (Section 7)
  purpose?: string;                 // why the agent exists
  role?: string;                    // what function it performs
  responsibilities?: string[];
  boundaries?: string[];
  activation?: string;
  rules?: string[];
  delegation?: string;
  outputs?: string;
  failureHandling?: string;
}
```

Components have **no** `groupId` field and **no** association lists. Membership lives in `Group` and associations live in `Relationship`.

For Memory/Data Store components, `properties` uses `storeKind` (for example `"memory"`, `"vector"`, `"relational"`, `"file"`, `"other"`) and `accessScope` (`"shared"` or `"private"`) as two separate keys (Section 6.4).

**Relationship**

```ts
type RelationshipType =
  | "delegates_to" | "supervises" | "uses" | "reads_from" | "writes_to"
  | "shares_context_with" | "reports_to" | "hands_off_to" | "depends_on"
  | "generic";

interface Relationship {
  id: string;
  type: RelationshipType;
  sourceId: string;                 // component ID; the subject of the relation
  targetId: string;                 // component ID
  direction: "directed" | "undirected";
  label?: string;                   // required in practice for "generic" to be meaningful
  description?: string;
  visual?: Record<string, unknown>; // e.g. routing/waypoints; optional
}
```

Direction rules:

| Type | Allowed `direction` |
|---|---|
| `delegates_to`, `supervises`, `uses`, `reads_from`, `writes_to`, `reports_to`, `hands_off_to`, `depends_on` | `"directed"` only |
| `shares_context_with` | `"undirected"` only |
| `generic` | `"directed"` (default) or `"undirected"` |

**Group**

```ts
interface Group {
  id: string;
  name: string;
  description?: string;
  notes?: string;
  memberComponentIds: string[];     // the single source of truth for membership
  bounds: { x: number; y: number; width: number; height: number };  // visual bounds
}
```

Groups are serialized as separate entities. `bounds` is visual metadata. It must enclose all of the group's members and is updated when members move or the group moves. Bounds never determine membership: a member moved outside the previous bounds stays a member, and the bounds grow to enclose it.

### 12.2 Validation rules

Validation runs on import and before saving. The following are rejected or prevented:

- **Duplicate IDs** across components, relationships and groups within one architecture.
- **Dangling relationships:** a `sourceId` or `targetId` that does not refer to an existing component. This includes references to group IDs.
- **Invalid direction** for a relationship type (see the direction rules table).
- **Invalid subtype:** `subtype` set on a non-agent component, or set to an unknown value.
- **Invalid group membership:**
  - a member ID that does not refer to an existing component,
  - a component that appears in more than one group,
  - a group ID used as a member (no nesting).
- **Malformed files:** invalid JSON, missing required fields or wrong field types.
- **Unsupported schema version:** the import is rejected with a clear message.
- **Unsaved changes:** the user is warned if pending or failed saves would be lost, for example when closing the tab while a save has failed.

### 12.3 Versioning

`schemaVersion` versions the file format, starting at `1`. It is separate from the version of this document. Future format changes increase `schemaVersion` and ship with migrations for older versions.

### 12.4 JSON example

```json
{
  "schemaVersion": 1,
  "architecture": {
    "id": "arch_lhe",
    "name": "Lead Hunting Engine",
    "description": "Multi-agent system for discovering, validating and scoring sales leads.",
    "createdAt": "2026-10-20T09:00:00Z",
    "updatedAt": "2026-10-20T09:30:00Z",
    "components": [
      {
        "id": "cmp_orchestrator",
        "type": "agent",
        "subtype": "orchestrator",
        "name": "LHE Orchestrator",
        "description": "Coordinates the lead pipeline.",
        "position": { "x": 400, "y": 80 },
        "behavior": {
          "purpose": "Ensures every lead search ends in a complete, scored batch without manual coordination.",
          "role": "Coordinator: delegates discovery, validation and scoring, and decides when a lead batch is complete.",
          "responsibilities": ["Assign discovery tasks", "Route leads to validation", "Escalate stalled batches"],
          "activation": "Starts when a new lead-search request is received.",
          "delegation": "Delegates discovery first; delegates validation once candidates exist.",
          "outputs": "A completed, scored lead batch.",
          "failureHandling": "If an agent fails twice, escalate the batch to a human operator."
        }
      },
      {
        "id": "cmp_discovery",
        "type": "agent",
        "name": "Discovery Agent",
        "description": "Finds candidate leads.",
        "position": { "x": 200, "y": 280 },
        "behavior": {
          "purpose": "Supplies the pipeline with candidate companies that match the target profile.",
          "role": "Searcher: runs searches and records raw candidates.",
          "responsibilities": ["Run searches", "Record raw candidates"],
          "boundaries": ["Does not judge lead quality"],
          "activation": "When delegated a search task by the orchestrator.",
          "outputs": "Raw candidate records in the lead store.",
          "failureHandling": "Report empty or failed searches to the orchestrator."
        }
      },
      {
        "id": "cmp_validation",
        "type": "agent",
        "name": "Validation Agent",
        "description": "Checks candidate fit.",
        "position": { "x": 440, "y": 280 }
      },
      {
        "id": "cmp_lead_store",
        "type": "memory",
        "name": "Shared Lead Store",
        "description": "Lead records shared across agents.",
        "position": { "x": 320, "y": 480 },
        "properties": { "storeKind": "relational", "accessScope": "shared" }
      }
    ],
    "relationships": [
      {
        "id": "rel_1",
        "type": "delegates_to",
        "sourceId": "cmp_orchestrator",
        "targetId": "cmp_discovery",
        "direction": "directed",
        "label": "search tasks"
      },
      {
        "id": "rel_2",
        "type": "writes_to",
        "sourceId": "cmp_discovery",
        "targetId": "cmp_lead_store",
        "direction": "directed"
      },
      {
        "id": "rel_3",
        "type": "reads_from",
        "sourceId": "cmp_validation",
        "targetId": "cmp_lead_store",
        "direction": "directed"
      },
      {
        "id": "rel_4",
        "type": "shares_context_with",
        "sourceId": "cmp_discovery",
        "targetId": "cmp_validation",
        "direction": "undirected",
        "description": "Share the current target profile."
      }
    ],
    "groups": [
      {
        "id": "grp_pipeline",
        "name": "Lead Processing Swarm",
        "memberComponentIds": ["cmp_discovery", "cmp_validation"],
        "bounds": { "x": 160, "y": 240, "width": 480, "height": 140 }
      }
    ],
    "canvas": { "viewport": { "x": 0, "y": 0, "zoom": 1 } }
  }
}
```

Notes on the example:

- The Orchestrator is an Agent with `subtype: "orchestrator"`.
- `reads_from` points from the reader (Validation Agent) to the resource (Lead Store), even though data moves the other way.
- `shares_context_with` is undirected.
- `purpose` (why the agent exists) and `role` (its function) are separate fields.
- The Shared Lead Store's storage kind (`storeKind: "relational"`) and access scope (`accessScope: "shared"`) are separate properties.
- Group membership appears only in `memberComponentIds`.

### 12.5 Import behavior

Import works as follows:

1. **The whole file is validated before anything is saved.** If validation fails, nothing is saved, and the user sees understandable errors (for example "Relationship rel_3 references unknown component cmp_x").
2. **A valid import creates a new architecture** in the library, and that architecture opens. Import never overwrites an existing architecture silently.
3. **IDs are preserved.** Component, relationship and group IDs are kept, because they are scoped to the architecture. The architecture ID is kept unless it collides with an existing architecture. In that case the import gets a new architecture ID, and its name may be marked (for example "Lead Hunting Engine (imported)").
4. **Replacement is not in the MVP.** Replacing an existing architecture from a file is not part of the MVP. If it is ever offered, it requires an explicit, confirmed user action.
5. **Imported files are untrusted input.** Text is rendered safely; for example, Markdown is sanitized and no scripts run.

## 13. Technical Direction

These are suggestions to be confirmed during technical planning:

- **Stack:** React, Vite and TypeScript.
- **Canvas library:** Compare **tldraw** and **React Flow** on:
  - custom nodes,
  - typed and directed or undirected connections,
  - grouping and moving members as a group,
  - serialization,
  - persistence integration,
  - licensing,
  - maintenance.
- **Styling:** Tailwind CSS is suggested. The final visual design is owned by the design agents.
- **Local storage:** Evaluate IndexedDB against localStorage, considering capacity, reliability and asynchronous writes.
- **No backend.**
- **Module separation:** The domain model, canvas, inspector, and persistence/import-export are separate modules. The domain model can be used without the canvas library.
- **Undo/redo:** Implement it as operations on the domain model, independent of the canvas library, so that coverage matches Section 9, M2.

## 14. Visual and Interaction Direction

- The tool looks professional, modern and technical, and keeps cognitive load low. It aims for simplicity and clarity.
- The canvas is the focal point. The tool does not look like an enterprise dashboard.
- Clear visual distinctions:
  - **Orchestrators**, which are styled distinctly from regular Agents even though they share the Agent schema,
  - **Agents**,
  - **Tools**,
  - **Memory/Data Stores**,
  - **External Systems**, which are styled as being outside the modeled boundary,
  - **Groups**, which appear as containers, clearly not as components.
- Relationships stay readable even in dense diagrams.
  - Directed relationships show an arrowhead at the target. Undirected relationships show none.
  - The relationship type or custom label can be read.
- A node shows only its name, its type and an optional short description. Everything else is in the inspector.

## 15. Example: Lead Hunting Engine

| Component | Type |
|---|---|
| LHE Orchestrator | Agent (Orchestrator subtype) |
| Discovery Agent | Agent |
| Validation Agent | Agent |
| Scoring Agent | Agent |
| Shared Lead Store | Memory/Data Store |
| Search Services | Tool (a search capability the Discovery Agent invokes) |
| CRM | External System (outside the agent orchestration layer) |

Simplified diagram (arrows show the semantic relationship, from subject to object):

```
                    [LHE Orchestrator]
          delegates to /    |  delegates to     \ delegates to
                      v     v                    v
   ┌──── Lead Processing Swarm (group) ─────────────────────┐
   │ [Discovery Agent]   [Validation Agent]   [Scoring Agent]│
   └──────────────────────────────────────────────────────────┘
   Discovery Agent ──uses──────────> [Search Services]
   Discovery Agent ──writes to─────> [Shared Lead Store]
   Validation Agent ─reads from────> [Shared Lead Store]
   Scoring Agent ───reads from─────> [Shared Lead Store]
   Scoring Agent ───reports to─────> LHE Orchestrator
   LHE Orchestrator ─depends on────> [CRM]   (outside the modeled boundary)
```

The diagram shows the architecture, not the execution order. Relationships run to individual agents, not to the group, because groups are not relationship endpoints.

Selecting a node shows its purpose, role, responsibilities, behavior and a read-only list of its derived relationships. Selecting a relationship, on the canvas or in that list, opens its relationship inspector with its type, direction and description. The CRM is modeled as an External System because it sits outside the agent orchestration layer. It is not duplicated as a Tool, because the distinction would add no clarity here.

## 16. Acceptance Scenarios

**A. Create an architecture.** The user creates a new, named, empty architecture, and it appears in the library.

**B. Build the structure.**

- The user adds an Orchestrator, several Agents, a Tool and a Memory/Data Store, and moves them freely.
- The Orchestrator looks clearly different from a regular Agent.

**C. Document behavior.**

- The user edits an agent's Description, Purpose, Role, Responsibilities, Activation, Behavioral Rules, Delegation, Outputs and Failure Handling.
- All fields are optional, and the values persist.

**D. Create typed relationships.**

- The user creates a directed Delegates To relationship from the Orchestrator to an Agent. The arrow points to the delegate.
- The user creates a Reads From relationship. The arrow points from the reader to the resource.
- The user creates a Shares Context With relationship, which is shown without arrowheads.
- The selected agent's inspector lists these relationships in a read-only list, derived from the graph. Selecting one opens its relationship inspector, and an edit there is shown on the canvas.
- Predefined relationship types offer no direction change or reverse action. A Generic relationship can be switched between directed and undirected, and reversed when directed.

**E. Group components.**

- The user creates a group from selected agents and moves the group. All members move together.
- Explicitly assigning a member that already belongs to another group moves it to the new group; it is never in two groups.
- Dragging a single member outside the group's visual boundary keeps it in the group, and the group's bounds update to enclose it.
- After a reload, group membership and positions are restored.
- Deleting the group leaves the members and their relationships intact.
- A group cannot be chosen as a relationship endpoint.

**F. Restore local data.** The user closes the browser and reopens the app. All architectures, components, properties, relationships, groups and (where practical) the view are restored without an account.

**G. Round-trip JSON.**

- The user exports an architecture to JSON and imports the file again. Import creates a new architecture in the library, and no existing architecture is changed.
- The imported architecture keeps all component, relationship and group IDs, properties, positions, relationships and their direction modes, and group membership.
- An invalid file, such as one with a dangling relationship or a duplicate group membership, is rejected with an understandable message, and nothing is saved.

**H. Export an image.** The user exports a readable image (PNG) of the diagram, including groups and relationship labels.

**I. Edit, delete and undo.**

- Deleting a component also deletes its relationships and removes it from its group.
- Undo restores the component, its relationships and its group membership. Redo deletes them again.
- All operations listed as covered in M2 can be undone and redone reliably.

**J. No required external services.** The complete core workflow (Scenarios A–I) works with no authentication, no AI service, no backend and no other external service. Data is not sent anywhere unexpectedly.

**K. Product hypothesis check (lightweight, qualitative).** This check is done with a small number of target users (Section 4) after the functionality is complete.

1. **Understanding (H1, H2).** Participants get the Lead Hunting Engine architecture in the app, with no verbal explanation, and try to answer the seven questions in Section 3 using only the canvas and inspector.
2. **Modeling (H3).** Participants model a small architecture of their own without help, and explain where they put structure and where they put behavior.
3. **Recording results.** Findings are written down briefly: answers, confusion points, and any missing capability that participants named.

Scenario K checks the product hypotheses and does not test a feature. It has no fixed pass threshold and is **not a release gate**: MVP completion depends only on the criteria in Section 17. Its results are recorded separately and inform post-MVP planning; if they suggest a hypothesis does not hold, the product team revises the concept before starting post-MVP work.

## 17. Delivery Phases

The phases are delivery milestones. They do not permit leaving any required MVP behavior out of the final release.

| Phase | Focus | MVP requirements addressed |
|---|---|---|
| **1. Foundation** | Project scaffold, canvas, basic nodes and connections, zoom/pan/fit, and undo/redo on the domain model for canvas operations | M2 (first version), M3 (basic nodes), M5 (basic connections) |
| **2. Semantics** | All component types including the Orchestrator subtype, the inspector with behavioral fields, typed relationships with direction rules, derived relationship view, grouping rules, domain validation, and undo/redo extended to property, relationship and group edits | M2 (complete), M3, M4, M5, M6, M9 (first version) |
| **3. Persistence and portability** | Library screen, automatic local persistence and restore, JSON import/export with validate-before-save import, and PNG image export | M1, M7, M8 |
| **4. Polish and acceptance** | Visual polish, accessibility, error handling, performance testing, and Scenarios A–J | M9 (complete) and quality requirements (Section 18) |

**The MVP is complete only when:**

- all of M1–M9 are implemented,
- Scenarios A–J pass,
- the quality requirements in Section 18 are met.

Scenario K is not a completion criterion. It is carried out after the functionality is complete, and its results are recorded separately to inform post-MVP planning (Section 16).

## 18. Quality Requirements

- **Performance.**
  - Typical diagrams have dozens of components and relationships.
  - A realistic performance target for diagrams of that size is established. At that target, selecting, moving, panning and zooming stay responsive.
- **Data safety.**
  - Autosave shows clear feedback (Saved, Saving or Save failed).
  - The app warns users that clearing browser site data can erase their locally stored architectures, and recommends JSON export as a backup.
  - Import never overwrites data silently.
- **Accessibility.**
  - Forms are accessible and have labels.
  - Text is legible and contrast is sufficient.
  - Selection is clearly indicated.
  - Common keyboard actions are supported: delete, undo/redo, deselect (Escape), and basic navigation in forms and panels.
- **Portability.** Domain data is stored in the documented JSON format and does not depend on the canvas library.
- **Dependencies.** Canvas basics come from an existing library. Additional dependencies are avoided unless they clearly add value.
- **Security and privacy.**
  - No secrets or credentials are needed or stored.
  - No data is sent anywhere unexpectedly.
  - Imported files are treated as untrusted input: they are validated, and text is rendered safely.

## 19. Guardrails

- Do not overengineer.
- Do not execute agents or anything else.
- Do not add a backend, or a dependency on any agent framework.
- Do not overload the canvas; detail belongs in the inspector.
- Do not build a workflow engine, executable conditions or a state machine.
- Do not trade usability for feature breadth.
- Do not require cloud services or accounts.
- Do not implement speculative features beyond this concept.
- Preserve the portability of the data format and leave room to extend it later.

## 20. Planning Deliverables

The next planning step should produce:

1. **Technical architecture:**
   - modules: domain, canvas, inspector, persistence, import/export, history;
   - how the canvas is integrated;
   - the persistence approach;
   - data flow between modules.
2. **Schema specification:** based on Section 12, including validation rules, error messages, and the versioning and migration approach.
3. **Detailed interactions:**
   - creating, connecting and grouping;
   - direction handling: fixed direction for predefined types, and switching Generic relationships between directed and undirected and reversing directed Generic relationships;
   - deletion cascades;
   - undo/redo coverage;
   - import flow;
   - error behavior.
4. **UX handoff:**
   - screens, components, flows and states (empty, loading, error, save status);
   - information hierarchy.

   Design agents own the visual styling.
5. **Incremental implementation plan:** follows the phases in Section 17 and includes tests, risks and completion criteria.
6. **Explicit decisions**, each with its rationale:
   - canvas library,
   - storage (IndexedDB or localStorage),
   - serialization,
   - how grouping is implemented (including moving members as a group and keeping bounds up to date),
   - image export method,
   - state management and the undo/redo model,
   - licensing.

## 21. Final Definition and Guiding Principle

Swarm Architecturer is a simple, specialized web application. People use it to design and document the structure and behavior of AI-agent architectures. It does not execute or orchestrate those architectures. It is lightweight, local-first and non-executable, and it is built so that users can understand a multi-agent system at a glance and in detail on demand.

> **Design the agents. Define their behavior. Visualize the architecture.**
