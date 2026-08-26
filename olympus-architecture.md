# Olympus — Greek Mythology Agent Architecture

> **A plugin-first AI agent harness. Build your own pantheon.**

A reference and design sketch for **Olympus**, an opinionated, modular AI agent harness inspired by Greek mythology and the plugin-first architecture of DeepSeek Harness. Olympus is intended as its own framework rather than a fork: it borrows the architectural idea that meaningful behavior should be composable and replaceable while developing its own APIs, conventions, and identity.

---

# 1. Greek Mythology: Brief Landscape

Greek mythology can be understood as a layered cosmos: primordial forces give rise to the Titans, the Titans precede the Olympian gods, and gods interact with heroes, monsters, spirits, artifacts, and distinct realms. This layered structure makes it particularly useful as a mental model for a modular agent system.

## 1.1 Primordial Beings — Foundations of Reality

The earliest entities and forces in the Greek cosmos.

| Figure | Domain / Idea |
|---|---|
| **Chaos** | Primordial void / unformed existence |
| **Gaia** | Earth / foundation |
| **Uranus** | Sky |
| **Tartarus** | Abyss / deepest realm |
| **Nyx** | Night |
| **Erebus** | Darkness |
| **Aether** | Upper light |
| **Hemera** | Day |
| **Eros** | Primordial desire / generative force |

These work well as metaphors for fundamental system concepts rather than ordinary agents.

## 1.2 Titans — The Old Order

The divine generation preceding the Olympians.

| Figure | Domain / Idea |
|---|---|
| **Cronus** | Titan ruler; later associated with time through conflation with Chronos |
| **Rhea** | Mother of major Olympians |
| **Oceanus** | World-encircling ocean |
| **Tethys** | Waters |
| **Hyperion** | Heavenly light |
| **Theia** | Sight / radiance |
| **Iapetus** | Father of Prometheus, Epimetheus, Atlas, etc. |
| **Themis** | Divine law, order, custom |
| **Mnemosyne** | Memory |
| **Coeus** | Inquiry / intellect |
| **Phoebe** | Prophecy / intellect |

Important Titan descendants include:

- **Prometheus** — foresight, fire, knowledge, humanity
- **Epimetheus** — hindsight
- **Atlas** — bears the heavens
- **Helios** — Sun
- **Selene** — Moon
- **Eos** — Dawn

## 1.3 Olympian Gods — The Main Pantheon

| Figure | Domain / Character |
|---|---|
| **Zeus** | Sky, thunder, authority, kingship |
| **Hera** | Marriage, queenship |
| **Poseidon** | Sea, storms, earthquakes |
| **Demeter** | Agriculture, harvest |
| **Athena** | Wisdom, strategy, crafts |
| **Apollo** | Prophecy, knowledge, music, healing, light |
| **Artemis** | Hunt, wilderness |
| **Ares** | War |
| **Aphrodite** | Love, beauty |
| **Hephaestus** | Forge, invention, craftsmanship |
| **Hermes** | Messages, travel, trade, boundary-crossing |
| **Dionysus** | Wine, theater, ecstasy, creativity |
| **Hestia** | Hearth, home |
| **Hades** | Underworld and the dead; a major god but generally not one of the Olympians |

Lists of the canonical Twelve Olympians vary, especially between Hestia and Dionysus.

## 1.4 Other Gods and Personifications

- **Nike** — victory
- **Nemesis** — retribution / balance
- **Tyche** — fortune / chance
- **Iris** — messenger / rainbow
- **Hecate** — magic / crossroads
- **Hypnos** — sleep
- **Thanatos** — death
- **Morpheus** — dreams
- **Eris** — discord
- **Pan** — wilderness
- **Asclepius** — medicine / healing
- **Harmonia** — harmony
- **Kratos** — strength / power

## 1.5 The Fates — Lifecycle and Destiny

The three **Moirai** govern the thread of life:

- **Clotho** — spins the thread
- **Lachesis** — measures the thread
- **Atropos** — cuts the thread

Their lifecycle metaphor maps naturally to creation, allocation, and termination.

## 1.6 The Muses — Knowledge and Creativity

The nine Muses are daughters of Zeus and Mnemosyne and represent specialized intellectual and creative domains.

- **Calliope** — epic poetry
- **Clio** — history
- **Erato** — lyric poetry
- **Euterpe** — music
- **Melpomene** — tragedy
- **Polyhymnia** — sacred poetry
- **Terpsichore** — dance
- **Thalia** — comedy
- **Urania** — astronomy

The general concept of a **Muse** works especially well for a specialized or user-created agent.

## 1.7 Heroes — Quest-Takers

- **Heracles** — strength; Twelve Labors
- **Odysseus** — cunning, adaptability, long journeys
- **Achilles** — exceptional warrior with a fatal vulnerability
- **Perseus** — slayer of Medusa
- **Theseus** — Minotaur and the Labyrinth
- **Jason** — leader of the Argonauts
- **Daedalus** — master inventor and craftsman
- **Icarus** — ambition and overreach
- **Atalanta** — hunter and racer
- **Orpheus** — musician and traveler to the Underworld

Heroes are particularly useful as a metaphor for temporary workers that are given a quest, perform it, and return a result.

## 1.8 Monsters and Creatures

- **Hydra** — many-headed monster; problems that multiply
- **Minotaur** — monster hidden within the Labyrinth
- **Medusa / Gorgons** — dangerous entities requiring special handling
- **Cerberus** — guardian of the Underworld
- **Chimera** — hybrid monster
- **Sirens** — alluring danger
- **Scylla and Charybdis** — competing dangers / bad tradeoffs
- **Cyclopes** — giant craftsmen
- **Typhon** — catastrophic primordial monster
- **Pegasus** — winged horse
- **Sphinx** — riddles / challenges

Monsters can provide vocabulary for failure modes, adversarial conditions, and pathological system states rather than ordinary components.

## 1.9 Groups

- **Argonauts** — Jason's expedition crew
- **Muses** — specialized creative/intellectual figures
- **Moirai / Fates** — destiny and lifecycle
- **Erinyes / Furies** — vengeance
- **Charites / Graces** — beauty and charm
- **Horae** — seasons and order
- **Nymphs** — nature spirits
- **Cyclopes** — craftsmen

## 1.10 Places and Realms

| Place | Meaning |
|---|---|
| **Olympus** | Seat of the gods |
| **Underworld / Hades** | Realm of the dead |
| **Tartarus** | Deep abyss and prison |
| **Elysium** | Blessed afterlife |
| **Asphodel Meadows** | Realm of ordinary dead |
| **Styx** | Underworld river associated with binding oaths |
| **Lethe** | River of forgetfulness |
| **Delphi** | Home of Apollo's famous oracle |
| **Crete / Labyrinth** | Setting of Theseus and the Minotaur |
| **Ithaca** | Home of Odysseus |
| **Troy** | Trojan War |

## 1.11 Famous Objects and Symbols

- **Aegis** — protection associated with Zeus and Athena
- **Ariadne's Thread** — navigation through the Labyrinth
- **Golden Fleece** — prized objective of Jason's quest
- **Pandora's Jar** — container whose opening releases evils; popularly called Pandora's Box
- **Caduceus** — staff associated with Hermes
- **Poseidon's Trident**
- **Zeus's Thunderbolt**
- **Helm of Hades** — invisibility
- **Winged Sandals of Hermes**
- **Hephaestus's Forge**
- **Ambrosia and Nectar** — food and drink of the gods

## 1.12 Famous Stories and Concepts

- Titanomachy
- Prometheus stealing fire
- Pandora
- Twelve Labors of Heracles
- Theseus and the Labyrinth
- Perseus and Medusa
- Jason and the Golden Fleece
- Trojan War
- The Odyssey
- Judgment of Paris
- Orpheus and Eurydice
- Daedalus and Icarus
- Sisyphus
- Narcissus and Echo
- King Midas

Many have become broadly understood metaphors: **Achilles' heel, Sisyphean task, Trojan horse, Pandora's box, Midas touch, odyssey, labyrinth, muse, nemesis**.

---

# 2. Olympus: A Plugin-First Greek Mythology Agent

## 2.1 Design Goal

Build an opinionated AI agent framework with two complementary ideas:

1. **DeepSeek-Harness-inspired modularity:** nearly every meaningful behavior is supplied by a plugin rather than being permanently embedded in the core.
2. **Greek mythology as the design language:** mythological names communicate the purpose and relationships of those plugins.

The mythology should help explain the architecture rather than merely decorate it.

The central architectural principle is:

> **Everything is a plugin.**

And the corresponding design maxim is:

> **Every god can be dethroned.**
>
> **Olympus provides composition; the Pantheon provides behavior.**

Even the default agent loop, model layer, tools, memory, policy, sandbox, observability, session system, subagent orchestration, and user interfaces should be replaceable. The Greek mythology is a design language layered over explicit technical contracts—not a reason to make the API cryptic.

No default model provider, agent loop, memory implementation, tool system, sandbox, UI, or specialized agent should be indispensable.

---

## 2.2 Olympus — The Minimal Plugin Runtime

**Olympus** is the small, stable kernel on which everything else is mounted.

Olympus should primarily provide:

- plugin discovery and loading
- plugin lifecycle
- service/capability registry
- dependency injection or shared context
- events
- configuration
- dependency resolution
- extension points
- basic error handling

Olympus should know as little as possible about what an "AI agent" actually is. **Olympus is the platform/kernel; it is not Athena and it is not the Pantheon.**

Conceptually:

```text
                         OLYMPUS
                    Minimal Plugin Kernel
                           │
            services • events • lifecycle
                           │
                        PANTHEON
                     Loaded Plugins
```

A minimal plugin contract might resemble:

```ts
interface Plugin {
  name: string
  requires?: Capability[]
  provides?: Capability[]

  setup(ctx: OlympusContext): void | Promise<void>
  teardown?(): void | Promise<void>
}
```

The exact API can evolve, but the important idea is that plugins communicate through explicit capabilities and events rather than reaching deeply into one another's internals.

---

## 2.3 Pantheon — The Loaded Plugin Graph

The **Pantheon** is the composed set of plugins currently mounted into Olympus. In other words: **Olympus is the host; the Pantheon is the running composition; Athena is merely the default orchestrator within that composition.**

For example:

```text
Pantheon: coder

Athena       orchestration/default
Delphi       models/openrouter
Hermes       tools/core
Hephaestus   coding/default
Artemis      discovery/default
Mnemosyne    memory/sqlite
Themis       policy/default
Aegis        security/local
Argus        telemetry/default
Ariadne      sessions/sqlite
Tartarus     sandbox/docker
```

A Pantheon can therefore define an entire agent personality and architecture without modifying Olympus.

Useful built-in configurations could include:

```text
pantheon/minimal
pantheon/coder
pantheon/researcher
pantheon/autonomous
pantheon/safe
```

Users should be able to replace individual members:

```yaml
pantheon: coder

replace:
  delphi: anthropic
  mnemosyne: postgres
  tartarus: firecracker
```

---

## 2.4 Project Identity and Naming

The working project name is **Olympus**. The naming hierarchy should stay consistent:

| Term | Project Meaning |
|---|---|
| **Olympus** | The framework and minimal plugin kernel |
| **Pantheon** | A composed/loaded set of plugins |
| **Athena** | The default opinionated agent loop/orchestrator |
| **Gods / Titans** | Persistent services, capabilities, or major plugin families |
| **Heroes** | Ephemeral workers/subagents sent to do bounded work |
| **Muses** | User-created or narrowly specialized agents/capabilities |
| **Quest** | A goal-driven objective |
| **Expedition** | Coordinated multi-agent execution |

This distinction keeps the project extensible: replacing Athena does not mean replacing Olympus, and changing a Pantheon does not require modifying the kernel.

### Public description

> **A plugin-first AI agent harness. Build your own pantheon.**

### Architectural influence

DeepSeek Harness is an architectural influence, particularly its plugin-first composition model. Olympus should **study and adapt the ideas rather than mirror or fork the implementation**. The goal is to preserve the useful property that core behaviors are replaceable while allowing Olympus to evolve its own plugin API, type system, runtime model, package ecosystem, and conventions.

---

# 3. Mythology-to-Architecture Mapping

## 3.1 Athena — Default Agent Loop / Orchestrator

**Myth:** wisdom, strategy, deliberate warfare, crafts.

**Architecture:** the default opinionated orchestration plugin.

Athena can:

- receive objectives
- interpret user intent
- construct working context
- consult models
- choose tools
- delegate work
- inspect results
- iterate until a quest is complete

Crucially, **Athena is not Olympus**. She is merely the default agent loop mounted into it.

Alternative loops could replace her entirely:

```text
athena/default
athena/fast
athena/deep
athena/autonomous
community/react
community/planner-executor
```

---

## 3.2 Delphi — Models and Oracles

**Myth:** Delphi was the site of Apollo's famous oracle.

**Architecture:** model/provider abstraction and model-routing layer.

```text
Delphi
├── OpenAI
├── Anthropic
├── OpenRouter
├── Google
├── DeepSeek
└── Local
```

Athena should not need to know which provider is answering. She simply **consults Delphi**.

Possible strategies:

```text
delphi/direct
delphi/router
delphi/ensemble
delphi/fallback
```

This is also where a provider abstraction such as `pi-ai` could potentially live: beneath Delphi rather than leaking provider-specific concerns into the rest of the system.

---

## 3.3 Hermes — Tools, APIs, and Communication

**Myth:** messenger, traveler, trader, and boundary-crosser between worlds.

**Architecture:** external interaction and tool capability layer.

```text
Hermes
├── shell
├── filesystem
├── git
├── GitHub
├── browser
├── MCP
├── database
├── Docker
├── Cloudflare
└── remote agents
```

Each capability should ideally be independently mountable rather than requiring one monolithic Hermes implementation.

Hermes is how the reasoning system reaches the outside world.

---

## 3.4 Hephaestus — Software Engineering / The Forge

**Myth:** divine craftsman, inventor, and smith.

**Architecture:** opinionated software-engineering capability bundle or specialist.

```text
Hephaestus
├── code editing
├── patches
├── diagnostics
├── builds
├── tests
├── linting
├── refactoring
└── repository analysis
```

Distinguish the actor from the environment:

- **Hephaestus** — coding specialist/capability bundle
- **Forge** — build/artifact environment

The Forge can produce code, patches, binaries, packages, containers, and other artifacts.

---

## 3.5 Artemis — Search and Discovery

**Myth:** goddess of the hunt and wilderness.

**Architecture:** exploration and discovery capabilities.

```text
Artemis
├── ripgrep
├── filesystem discovery
├── AST search
├── repository exploration
├── documentation search
└── web search
```

Artemis "hunts" for the information Athena or another agent needs.

---

## 3.6 Apollo — Evaluation and Diagnostics

**Myth:** prophecy, knowledge, healing, light.

**Architecture:** evaluation, verification, diagnostics, and quality analysis.

Potential responsibilities:

- evaluate proposed solutions
- run or interpret tests
- diagnose failures
- review generated code
- score outputs
- provide second opinions
- surface uncertainty

Apollo can act as a critic/evaluator without being responsible for primary orchestration.

---

## 3.7 Prometheus — Planning and Foresight

**Myth:** foresight, fire, knowledge, advancement of humanity.

**Architecture:** optional planning and anticipation layer.

Prometheus can:

- decompose objectives
- anticipate dependencies
- identify risks
- estimate required resources
- propose execution plans
- reconsider plans as conditions change

Athena can use Prometheus without requiring every agent loop to use explicit planning.

---

## 3.8 Mnemosyne — Persistent Memory

**Myth:** personification/Titan of memory.

**Architecture:** memory capability interface.

```text
Mnemosyne
├── ephemeral
├── filesystem
├── SQLite
├── Postgres
├── vector store
└── graph memory
```

A generic interface might expose concepts such as:

```text
remember
recall
search
update
forget
```

The agent should depend on a memory capability rather than a particular database.

---

## 3.9 Lethe — Forgetting and Memory Pruning

**Myth:** river of forgetfulness.

**Architecture:** retention, pruning, expiration, and forgetting policies.

Mnemosyne answers:

> What can we remember and recall?

Lethe answers:

> What should we stop remembering?

Separating the two makes memory lifecycle policy independently replaceable.

---

## 3.10 Themis — Policy and Rules

**Myth:** divine law, order, custom, and justice.

**Architecture:** policy engine.

Themis decides questions such as:

- Is this tool allowed?
- Does this action require user approval?
- May this agent access the network?
- May this plugin read secrets?
- Can a subagent spawn another subagent?
- Which resources may a plugin access?

Themis defines what **should be permitted**.

---

## 3.11 Aegis — Security and Enforcement

**Myth:** protective object associated especially with Zeus and Athena.

**Architecture:** security boundary and enforcement mechanisms.

Aegis can implement:

- filesystem permissions
- network restrictions
- credential boundaries
- process restrictions
- tool permissions
- capability isolation
- secret handling

The distinction is:

```text
Athena decides what she wants to do
             ↓
Themis determines whether policy permits it
             ↓
Aegis technically enforces the boundary
             ↓
Hermes performs the external action
```

---

## 3.12 Tartarus — Sandbox

**Myth:** deepest abyss and prison.

**Architecture:** isolated execution environment.

Possible implementations:

```text
Tartarus
├── local process
├── Docker
├── Podman
├── Firecracker
├── remote VM
└── cloud sandbox
```

A tool should request sandboxed execution without needing to know which Tartarus implementation provides it.

---

## 3.13 Argus — Observability

**Myth:** Argus Panoptes, the many-eyed watcher.

**Architecture:** telemetry, monitoring, inspection, and observability.

Olympus and its plugins should emit structured events such as:

```text
quest.started
oracle.called
tool.invoked
memory.recalled
agent.spawned
permission.requested
artifact.created
quest.completed
```

Argus subscribes to those events and can feed:

- CLI/TUI status
- structured logs
- OpenTelemetry
- traces
- metrics
- debugging interfaces
- dashboards

This keeps observability separate from execution logic.

---

## 3.14 Ariadne and the Thread — Sessions and Execution History

**Myth:** Ariadne gives Theseus the thread that lets him navigate the Labyrinth and find his way back.

**Architecture:** persistent session/event history and execution tracing.

A **Thread** can contain:

- user objectives
- model interactions
- tool calls
- tool results
- decisions
- spawned workers
- errors
- artifacts
- checkpoints

Possible operations:

```text
thread inspect
thread replay
thread branch
thread rewind
```

Ariadne makes complex execution navigable rather than opaque.

---

## 3.15 The Labyrinth — Complex Problem Space

**Myth:** the maze containing the Minotaur.

**Architecture:** a complex space the agent must navigate.

Depending on context, a Labyrinth could represent:

- a repository
- codebase
- dependency graph
- task graph
- knowledge graph
- search space
- debugging problem

Ariadne's Thread provides the trace through that Labyrinth.

---

## 3.16 Heroes and Argonauts — Ephemeral Workers / Subagents

A useful conceptual distinction is:

> **Gods are persistent system capabilities. Heroes are temporary agents sent on quests.**

Potential hero archetypes include:

| Hero | Worker Style |
|---|---|
| **Odysseus** | Adaptive general problem solving |
| **Heracles** | Heavy execution / bounded labor |
| **Theseus** | Navigation through complex systems |
| **Perseus** | Precise targeted problem solving |
| **Daedalus** | Architecture and invention |
| **Atalanta** | Fast search and exploration |
| **Jason** | Coordination of a team |

The **Argonauts** provide a natural metaphor for a cooperating team of workers.

```text
                     Quest
                       │
                 Expedition
                       │
                     Argo
                  /    |    \
             Argonaut Argonaut Argonaut
```

Possible terminology:

- **Hero** — individual ephemeral worker
- **Argonaut** — worker participating in a coordinated team
- **Argo** — shared execution/team environment
- **Expedition** — coordinated multi-agent operation

---

## 3.17 Muses — User-Created Specialists

**Myth:** specialized sources of creative and intellectual inspiration.

**Architecture:** user-defined or narrowly specialized agents.

Examples might include:

```text
muse/reviewer
muse/documentation
muse/security
muse/database
muse/frontend
muse/research
```

The mythology provides named Muses if useful, but the broader concept is more important:

> A Muse is a specialist added to the Pantheon for a particular domain.

---

## 3.18 The Fates — Scheduling and Lifecycle

The Moirai map neatly to lifecycle management:

```text
Clotho      → create / spawn
Lachesis    → allocate / schedule / manage
Atropos     → stop / terminate
```

Collectively, the **Fates** could implement task scheduling, worker lifecycle, resource budgets, deadlines, and cancellation.

---

# 4. Work Vocabulary

Greek heroic stories provide useful levels of work without requiring obscure terminology.

| Term | Meaning in the Framework |
|---|---|
| **Task** | Small operation |
| **Labor** | Difficult but bounded unit of work |
| **Quest** | Goal-driven multi-step objective |
| **Expedition** | Coordinated multi-agent undertaking |
| **Odyssey** | Long-running, complex workflow |

A **Golden Fleece** could optionally represent a particularly valuable target or final objective, although this should probably remain flavor rather than a core technical term.

---

# 5. Failure and Risk Vocabulary

Monsters are best used sparingly as memorable names for recognizable failure patterns.

| Myth | System Metaphor |
|---|---|
| **Hydra** | Fixing one issue creates several others |
| **Trojan Horse** | Malicious or deceptive input/artifact |
| **Sirens** | Attractive but distracting or incorrect approach |
| **Scylla & Charybdis** | Tradeoff between two undesirable options |
| **Minotaur** | Deeply buried central problem |
| **Chimera** | Incompatible components awkwardly combined |
| **Cerberus** | Strong access-control gate |
| **Typhon** | Catastrophic/system-wide failure |

These should enrich diagnostics without replacing precise technical error messages.

---

# 6. Example Overall Architecture

```text
                              OLYMPUS
                         Minimal Plugin Kernel
                               │
                  services • events • lifecycle
                               │
        ┌──────────────────────┼───────────────────────┐
        │                      │                       │
        ▼                      ▼                       ▼

    ATHENA                  DELPHI                  HERMES
 Agent / Orchestrator      Models / Oracles        Tools / I/O
        │                      │                       │
        │                      │                       │
        ├─────────────┬────────┴──────────┬────────────┤
        │             │                   │            │
        ▼             ▼                   ▼            ▼
   PROMETHEUS      MNEMOSYNE           THEMIS        AEGIS
    Planning          Memory             Policy       Security
                        │
                      LETHE
                  Memory Pruning

        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              ▼
   HEPHAESTUS                                      ARTEMIS
 Coding / Building                              Search / Discovery
        │
      FORGE

                            QUEST
                              │
                         EXPEDITION
                              │
                            ARGO
                         /    |    \
                    Argonaut Argonaut Argonaut

       ARGUS                                      ARIADNE
 Observability / Watcher                     Sessions / Threads
       ▲                                             │
       │                                             ▼
       └──────────── Olympus Event Bus ───────── LABYRINTH

                         TARTARUS
                   Sandboxed Execution
```

---

# 7. Example Plugin Composition

A coding-oriented Pantheon might look conceptually like:

```yaml
pantheon: coder

plugins:
  orchestrator: athena/default
  oracle: delphi/openrouter
  tools:
    - hermes/filesystem
    - hermes/shell
    - hermes/git
  engineering: hephaestus/default
  discovery: artemis/default
  evaluation: apollo/default
  planning: prometheus/default
  memory: mnemosyne/sqlite
  forgetting: lethe/default
  policy: themis/default
  security: aegis/default
  sessions: ariadne/sqlite
  telemetry: argus/default
  sandbox: tartarus/docker
```

Another user could keep the same framework but replace major architectural choices:

```yaml
pantheon: custom

plugins:
  orchestrator: community/planner-executor
  oracle: delphi/anthropic
  memory: mnemosyne/postgres
  policy: themis/strict
  sandbox: tartarus/firecracker
  ui: community/web-ui
```

Olympus itself remains unchanged.

---

# 8. Interfaces Should Also Be Plugins

The agent should not be synonymous with its TUI.

The same Pantheon should ideally be usable through multiple interface plugins:

```text
Olympus
├── CLI
├── TUI
├── Web
├── API
├── Headless / CI
└── IDE integration
```

This allows one configured agent system to run interactively, in automation, inside an editor, or behind an API without rebuilding the core architecture.

---

# 9. Core Design Principles

## 9.1 Everything Is a Plugin

Treat plugin composition as the default architectural mechanism rather than an extension system bolted onto a monolithic agent. A feature should live in the kernel only when it is genuinely required to load, connect, govern, or lifecycle-manage plugins.

## 9.2 Everything Important Is Replaceable

Model providers, agent loops, tools, memory, policy, security, sandboxes, session storage, telemetry, interfaces, and subagent orchestration should all be replaceable implementations behind stable capabilities.

## 9.3 Olympus Is Small

The kernel should provide composition rather than accumulate agent features.

## 9.4 Plugins Communicate Through Capabilities and Events

Avoid tight coupling between concrete implementations. Athena should request capabilities such as model inference, memory, tools, and sandbox execution rather than importing a specific implementation directly.

## 9.5 Opinionated Defaults, Unopinionated Foundations

The project can ship a highly opinionated default Pantheon while leaving the underlying architecture modular.

A user should be able to install the project and immediately receive a coherent experience, but advanced users should be able to replace almost every choice.

## 9.6 Mythology Must Improve Understanding

Use mythological names where the mapping is memorable and useful:

- Mnemosyne → memory
- Hermes → external communication/tools
- Aegis → protection
- Argus → observation
- Ariadne's Thread → tracing
- Tartarus → isolation

Avoid forcing obscure mythology onto concepts where a normal technical term is clearer.

## 9.7 Technical Clarity Comes Before Theme

The mythology should make the architecture easier to remember, not require users to study mythology before using the framework. Public APIs, schemas, error messages, and documentation should pair thematic names with obvious technical meanings. Precise technical diagnostics should never be replaced by flavor text.

## 9.8 Gods Are Capabilities; Heroes Do Work

A useful conceptual distinction:

- **Olympus** — runtime
- **Pantheon** — loaded plugin composition
- **Gods/Titans** — persistent system capabilities
- **Muses** — specialized/custom capabilities or agents
- **Heroes** — ephemeral workers
- **Argonauts** — cooperating workers
- **Quest** — objective
- **Expedition** — multi-agent execution
- **Thread** — execution/session history
- **Tartarus** — isolated execution

---

# 10. One-Sentence Mental Model

> **Olympus is a tiny plugin runtime in which a configurable Pantheon of gods provides the agent's capabilities; Athena orchestrates quests, Delphi supplies intelligence, Hermes connects tools, Mnemosyne remembers, Themis and Aegis govern and protect execution, Argus watches, Ariadne records the path, Tartarus isolates dangerous work, and Heroes or Argonauts can be dispatched as temporary workers — with every one of these components replaceable by plugins.**

---

# Proposed Technical Architecture & Stack

> **Status:** Initial implementation recommendations, not permanent architectural requirements.
>
> Olympus should remain plugin-first: implementations can be replaced as the project evolves.

## Technology Baseline

| Area | Initial choice | Rationale |
|---|---|---|
| Primary language/runtime | **TypeScript + Node.js 22+** | Strong async/plugin ecosystem, excellent CLI/MCP/SDK support |
| Monorepo | **pnpm workspaces + Turborepo** | Clean package boundaries and efficient builds |
| Plugin runtime | **Custom lightweight Olympus kernel** | Preserve the DeepSeek Harness/Cordis-inspired composition model without coupling Olympus to Cordis |
| Runtime contracts | **TypeScript + Zod** | Static types plus runtime validation at plugin boundaries |
| Events | **Typed in-process event bus** | Loose coupling between plugins and observability |
| Plugin distribution | **npm packages** | Natural distribution mechanism for a TypeScript ecosystem |
| CLI | **Commander.js or Citty** | Mature, simple CLI foundation |
| TUI | **Ink** | React-style terminal UI with reusable components |
| Web UI | **React + Vite** | Lightweight interactive frontend without requiring SSR |
| HTTP/API | **Hono** | Small TypeScript-first server layer |
| External process protocol | **JSON-RPC** initially | Simple boundary for SDKs, subprocesses and remote runtimes |
| Local persistence | **SQLite** | Durable, local-first and operationally simple |
| Database layer | **Drizzle** | Lightweight typed queries and migrations |
| Observability | **OpenTelemetry** | Vendor-neutral tracing, metrics and logging |
| Testing | **Vitest** | Fast TypeScript-native testing |
| Lint/format | **Biome** | Fast unified formatting and linting |
| Documentation | **VitePress or Starlight** | Strong technical documentation experience |
| Releases | **Changesets** | Well suited to a multi-package monorepo |

## Olympus Kernel

Olympus itself should remain deliberately small.

Its initial responsibilities should be limited to concepts such as:

- plugin registration and lifecycle
- service registration and discovery
- dependency declarations
- typed events
- configuration
- capability discovery
- cleanup/disposal
- composition of a Pantheon

A minimal conceptual API might look like:

```ts
interface OlympusPlugin {
  name: string
  setup(ctx: OlympusContext): void | Promise<void>
}

interface OlympusContext {
  provide<T>(key: ServiceKey<T>, service: T): Disposable
  use<T>(key: ServiceKey<T>): T

  on<E extends OlympusEvent>(
    event: E,
    handler: Handler<E>
  ): Disposable

  emit<E extends OlympusEvent>(
    event: E,
    payload: Payload<E>
  ): Promise<void>
}
```

More sophisticated concepts—hot reload, scoped effects, complex dependency injection, dynamic plugin replacement, and richer lifecycle semantics—should be added only when real use cases justify them.

**Olympus provides composition. The Pantheon provides behavior.**

## Proposed Package Layout

```text
olympus/
├── packages/
│   ├── core/                 # Olympus plugin kernel
│   ├── sdk/                  # Public SDK and types
│   ├── protocol/             # Wire / JSON-RPC contracts
│   ├── cli/
│   │
│   ├── athena/               # Default agent-loop contract/implementation
│   ├── delphi/               # Model/inference abstraction
│   ├── hermes/               # Tool/capability abstraction
│   ├── mnemosyne/            # Memory abstraction
│   ├── ariadne/              # Sessions / execution history
│   ├── argus/                # Observability
│   ├── themis/               # Policy
│   ├── aegis/                # Permission/security enforcement
│   └── tartarus/             # Sandbox abstraction
│
├── plugins/
│   ├── delphi-openai/
│   ├── delphi-anthropic/
│   ├── delphi-openrouter/
│   ├── hermes-shell/
│   ├── hermes-filesystem/
│   ├── hermes-git/
│   ├── mnemosyne-sqlite/
│   └── tartarus-docker/
│
├── apps/
│   ├── tui/
│   ├── web/
│   └── headless/
│
├── pantheons/
│   ├── minimal/
│   ├── coder/
│   └── researcher/
│
└── examples/
```

This layout is illustrative rather than fixed. Package boundaries should follow actual plugin contracts as they emerge.

## Delphi — Models and Inference

Delphi should define a small provider-neutral inference contract.

Provider implementations remain plugins:

```text
Delphi
├── OpenAI
├── Anthropic
├── OpenRouter
├── Google
├── DeepSeek
└── Local
```

Athena should never need to know which provider is being used.

A Delphi plugin might expose a contract conceptually similar to:

```ts
interface Oracle {
  generate(request: ModelRequest): AsyncIterable<ModelEvent>
}
```

Model routing, ensembles, fallback strategies and provider-specific behavior can themselves become plugins.

## Hermes — Tools and MCP

Hermes should expose capabilities rather than hard-code individual tools.

Examples:

```text
Hermes
├── shell
├── filesystem
├── git
├── GitHub
├── browser
├── MCP
├── Docker
├── databases
└── cloud providers
```

The official Model Context Protocol TypeScript SDK is a natural foundation for MCP integrations.

A Pantheon should be able to load only the Hermes capabilities it needs.

## Mnemosyne and Lethe — Memory

Mnemosyne defines the memory contract.

Initial implementation:

```text
Mnemosyne
└── SQLite + Drizzle
```

Future implementations might include:

```text
Mnemosyne
├── ephemeral
├── filesystem
├── PostgreSQL
├── vector database
└── graph database
```

**Mnemosyne** owns remembering and recall.

**Lethe** represents memory retention, pruning and forgetting policy.

Vector search should not be mandatory infrastructure in Olympus core.

## Ariadne — Sessions and Execution History

Ariadne should maintain a durable, inspectable history of execution.

An initial implementation can use SQLite or an append-oriented event log containing:

```text
Thread
├── objectives
├── model events
├── tool calls
├── tool results
├── decisions
├── subagent events
├── approvals
└── artifacts
```

This should eventually enable operations such as:

```text
thread inspect
thread replay
thread branch
```

Ariadne should be designed around replayability and observability rather than treating a conversation transcript as the only source of state.

## Argus — Observability

Olympus and its plugins should emit structured events.

Examples:

```text
quest.started
oracle.called
tool.invoked
memory.recalled
hero.spawned
permission.requested
artifact.created
quest.completed
```

Argus subscribes to those events.

OpenTelemetry is the preferred initial interoperability layer so Olympus is not tied to a particular observability vendor.

## Themis and Aegis — Policy and Enforcement

Keep policy decisions separate from enforcement.

### Themis

Determines what should be permitted:

- tool permissions
- network policy
- filesystem policy
- credential access
- approval requirements
- subagent permissions

### Aegis

Enforces those decisions:

- capability restrictions
- filesystem boundaries
- process restrictions
- network restrictions
- secret boundaries
- tool-level permission enforcement

Conceptually:

```text
Athena
   │
   ▼
Themis
"May this happen?"
   │
   ▼
Aegis
"Enforce the decision."
   │
   ▼
Hermes
Execute
```

## Tartarus — Sandboxing

Tartarus should be an abstraction rather than a specific sandbox technology.

Start with:

```text
Tartarus
├── local subprocess
└── Docker
```

Possible future implementations:

```text
Tartarus
├── Podman
├── Firecracker
├── remote VM
├── cloud sandbox
└── third-party sandbox provider
```

Agent logic should not depend on which implementation is mounted.

## User Interfaces

The UI should not be the harness.

The same Pantheon should be usable through multiple interfaces:

```text
Olympus
├── CLI
├── TUI
├── Web
├── API
├── headless / CI
└── future IDE integrations
```

Initial recommendations:

- **CLI:** Commander.js or Citty
- **TUI:** Ink
- **Web:** React + Vite
- **API:** Hono

These interfaces should consume Olympus services rather than contain agent behavior themselves.

## Language Boundaries

### TypeScript First

Use TypeScript throughout the initial Olympus implementation unless another language provides a concrete advantage.

Benefits include:

- one plugin ecosystem
- shared types
- easier contribution
- simpler packaging
- less IPC
- easier debugging
- strong Node.js tooling integration

### Python

Python should initially live across an explicit plugin/process boundary.

Potential uses:

- data science tools
- Python-native agent integrations
- ML libraries
- user-authored Python tools

Hermes or Tartarus can launch/manage Python runtimes without making Python part of Olympus core.

### Rust

Rust should be introduced only where it solves a demonstrated systems problem, potentially:

- process supervision
- PTY handling
- sandbox launchers
- filesystem watching
- performance-critical utilities
- native/single-binary distribution

Avoid a TypeScript/Rust split merely for architectural aesthetics.

## Plugin Distribution

The initial plugin ecosystem should use npm packages.

Conceptually:

```text
@olympus/core
@olympus/athena
@olympus/delphi
@olympus/hermes
@olympus/mnemosyne

@olympus/delphi-openai
@olympus/delphi-anthropic
@olympus/hermes-git
@olympus/hermes-shell
@olympus/mnemosyne-sqlite
```

Community packages could follow the same plugin contract without requiring inclusion in the main repository.

## Pantheon Profiles

A Pantheon is a composition, not a hard-coded product mode.

Example:

```yaml
pantheon: coder

plugins:
  - athena
  - delphi
  - hermes
  - hephaestus
  - artemis
  - mnemosyne
  - ariadne
  - argus
  - themis
  - aegis
  - tartarus
```

Different compositions could ship as defaults:

```text
pantheon/minimal
pantheon/coder
pantheon/researcher
pantheon/autonomous
pantheon/safe
```

Users should be able to replace any implementation without modifying Olympus core.

---

# v0 Implementation Plan

The long-term architecture is intentionally broad. The first implementation should be much smaller.

## Phase 1 — Olympus Kernel

Build only:

1. plugin interface
2. plugin loader
3. service registry
4. typed event system
5. lifecycle/disposal
6. configuration
7. minimal CLI

Success criterion:

> Multiple independently developed plugins can compose without knowing about one another directly.

## Phase 2 — Minimal Agent Pantheon

Implement the smallest useful agent:

```text
Olympus
├── Athena
├── Delphi
│   └── one model provider
├── Hermes
│   ├── filesystem
│   └── shell
├── Ariadne
└── CLI
```

This should be capable of receiving a coding objective, calling a model, invoking tools and maintaining a session.

## Phase 3 — Safety and Persistence

Add:

```text
Mnemosyne
Themis
Aegis
Tartarus
```

Start with SQLite memory and local/Docker execution.

## Phase 4 — Developer Experience

Add:

```text
TUI
plugin discovery
Pantheon profiles
configuration validation
developer SDK
plugin templates
```

## Phase 5 — Multi-Agent Architecture

Only after the single-agent plugin model is stable, introduce:

```text
Heroes
Argonauts
Expeditions
delegation
parallel execution
agent-to-agent communication
```

This avoids designing a complicated multi-agent framework before the fundamental plugin contracts are proven.

## Phase 6 — Ecosystem

Then expand toward:

- third-party plugins
- additional Delphi providers
- additional Tartarus backends
- remote runtimes
- web interface
- IDE integrations
- richer Argus observability
- plugin marketplace/registry if demand exists

---

# Implementation Principles

The technical architecture should preserve the same principles as the conceptual architecture.

### 1. Everything is a plugin

Agent loops, models, tools, memory, policy, sandboxes, observability and interfaces should be replaceable wherever practical.

### 2. Every god can be dethroned

No named Olympus component should become an accidental privileged implementation.

### 3. Keep Olympus small

Complexity belongs in plugins unless it is genuinely required for plugin composition itself.

### 4. Contracts over implementations

Core packages should define capabilities and contracts. Plugins provide implementations.

### 5. Local-first by default

A useful Olympus installation should not require distributed infrastructure.

### 6. Explicit boundaries

Model calls, tool execution, sandboxing, memory and external runtimes should cross well-defined interfaces.

### 7. Replayability matters

Agent execution should produce inspectable structured history through Ariadne and observable events through Argus.

### 8. Mythology explains architecture

Greek terminology should reinforce the mental model, never obscure technical meaning.

### 9. Start simple

Do not recreate all of Cordis or DeepSeek Harness before Olympus has demonstrated which abstractions it actually needs.

### 10. Architecture is replaceable too

The stack described here is a strong v0 starting point—not dogma.

**Olympus should be designed so that its own early technical choices can evolve without requiring the Pantheon to collapse.**
