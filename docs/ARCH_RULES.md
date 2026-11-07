# Sieve Architecture & Domain Rules (Clean Architecture & Topology)

## 1. Architectural Philosophy & Foundations

Sieve is built under the principles of **Clean Architecture** (Robert C. Martin) and **Working Effectively with Legacy Code** (Michael Feathers). The system enforces:
- **Strict Inward Dependency Rule**: Source code dependencies point inward toward higher-level policies and core domain entities.
- **Zero-Dependency Domain Boundaries**: Domain calculations, data transformers, and utilities must never import presentation components, UI frameworks, or concrete I/O drivers.
- **Air-Gapped & Local-First Execution**: 100% of analytical computation, PII scrubbing, cryptographic attestation, and reporting runs entirely client-side in the browser. Zero telemetry or user data exfiltration.
- **Strict Type Purity**: Zero use of `any`, unvalidated type assertions, or loose type escapes.

---

## 2. Directory Topology & Canonical Domain Map

```
src/
├── analytics/         # Infrastructure: DuckDB-Wasm and Apache Arrow IPC bridge
├── components/        # Presentation: React UI components organized by domain
│   ├── analytics/     # Canonical: Deep diagnostic analytics & slide-overs (PowerQueryDrawer)
│   ├── badges/        # Atomic: Domain status badges (CollisionBadge)
│   ├── brand/         # Atomic: Brand header, logos, and header navigation
│   ├── dashboard/     # Composite: Top-level executive dashboards and integrated views
│   ├── dropzone/      # Ingestion: File dropzones, drag-and-drop parsing feedback
│   ├── export/        # Modals: Exclusion rule export and negative keyword modals
│   ├── feedback/      # Overlays: Processing spinners and progress indicators
│   ├── grid/          # Virtualized: High-density keyword data grid and row renderers
│   ├── hud/           # Telemetry: Worker processing HUD and performance monitors
│   ├── kpi/           # Canonical: Executive financial KPI widgets & elasticity probes
│   ├── layout/        # Structural: App shell and grid container wrappers
│   ├── privacy/       # Security UI: Privacy modals, air-gap badges, and vault UI
│   ├── reports/       # PDF UI: Report configuration modals and previewers
│   └── sliders/       # Controls: Live threshold calibration sliders
├── config/            # Environment: Frozen constants and environment configuration
├── crypto/            # Security: Client-side PII scrubber, SHA-256 hash, vault, air-gap attestation
├── formatters/        # Domain: Pure script, syntax, and clipboard formatters
├── presets/           # Domain: Pre-configured dictionaries and keyword taxonomies
├── reports/           # Application/Infra: Vector PDF synthesis (OnePager, ForensicDeck)
├── state/             # Application: Zustand reactive global store (useSieveStore)
├── storage/           # Infrastructure: Dexie.js (IndexedDB) persistence and repositories
├── styles/            # Presentation: Design system theme and styling
├── sync/              # Infrastructure: File System Access API & local vault synchronization
├── utils/             # Domain Utilities: Math engines, CSV parsing, currency math, logger
└── workers/           # Infrastructure: Web Worker protocol and thread pool
```

### Canonical Component Domain Allocations

1. **`src/components/kpi/` (Canonical Home for KPI Widgets)**
   - `SummaryDashboard.tsx`: 4-column balanced executive financial overview.
   - `SpendWaterfallBar.tsx`: Proportional 4-tier spend waterfall visual breakdown.
   - `BidElasticityProbe.tsx`: Optimal Bid Ceiling and converting vs. non-converting median delta probe.
   - *Duplicate copies formerly in `src/components/dashboard/` are deprecated and eliminated.*

2. **`src/components/analytics/` (Canonical Home for Analytics & Querying)**
   - `PowerQueryDrawer.tsx`: In-browser DuckDB-Wasm SQL query drawer with Apache Arrow IPC.
   - `LongTailBleedCard.tsx`: Fragmented long-tail spend audit card.
   - `DilutionAuditCard.tsx`: Match-type dilution and CPC inflation audit card.
   - *Duplicate re-exports formerly in `src/components/dashboard/` are deprecated and eliminated.*

3. **`src/components/dashboard/` (Composite Orchestration Views)**
   - `ExecutiveDashboard.tsx`: Top-level composite executive grid container.
   - `AnalyticalDrawer.tsx`: Diagnostic drawer unifying long-tail and dilution tabs.
   - `LongTailDilutionProbe.tsx`: Dual-column diagnostic probe container.

4. **`src/crypto/` (Canonical Home for Cryptography & Privacy)**
   - `pii_scrubber.ts`: Consolidated client-side PII scrubbing engine (Luhn validation, regex matchers, batch processing, and configurable placeholders).
   - `attestation.ts`: Cryptographic air-gap proof generator and verifier.
   - `privacy_monitor.ts`: Zero-leak network interception and session digest generator.
   - `hash.ts`: Deterministic Web Crypto SHA-256 primitives.
   - `vault.ts`: AES-GCM-256 backup archive serialization.
   - *Duplicate module `src/sanitizer/pii_scrubber.ts` has been pruned and consolidated into `src/crypto/pii_scrubber.ts`.*

---

## 3. Layer Boundaries & Import Direction Rules

The system follows a strict 4-tier Clean Architecture model:

```
[Presentation Layer]
  │ (React Components: kpi, analytics, grid, dropzone, layout)
  ▼
[Application Layer]
  │ (Store: useSieveStore, PDF Synthesis: reports, Worker Pool: workers/pool)
  ▼
[Domain Layer]
  │ (Utils: executiveAnalytics, currency, csvParser; Formatters; Presets)
  ▼
[Infrastructure Layer]
  (IndexedDB / Dexie: storage, Web Crypto: crypto, WASM Core: sieve_core, DuckDB: analytics)
```

### Non-Negotiable Invariants

1. **Unidirectional Dependency Flow**:
   - Presentation layer components may import from Application, Domain, and Infrastructure.
   - Application layer modules (stores, worker pools) may import from Domain and Infrastructure.
   - Domain layer modules (utilities, formatters, presets) must NEVER import from Presentation or Application.
   - Pure utilities (`src/utils/*`, `src/formatters/*`) must have ZERO component dependencies.

2. **Contract Immutability**:
   - Cross-boundary interfaces (e.g., worker protocol payloads, store state slices, domain models) are strictly typed.
   - No untyped data bags (`Record<string, any>`) or loose `any` escapes are permitted.

3. **Single Canonical Location**:
   - Every domain entity, utility function, and UI component must have exactly ONE canonical location in `src/`.
   - Pass-through re-exports across parallel domains (e.g., re-exporting a KPI component from `dashboard/` when it belongs in `kpi/`) are architectural drift and are strictly forbidden.

---

## 4. Error Handling Taxonomy

Errors across Sieve are classified into explicit, typed categories with deterministic presentation:

| Error Category | Domain / Source | Typical Cause | Handling & Fallback Strategy |
|---|---|---|---|
| `SchemaValidationError` | `src/utils/csvParser.ts` | Missing required headers or corrupted CSV preamble | Notify via store alert state; present non-destructive upload error banner in UI |
| `WasmEnginePanic` | `src/workers/sieve.worker.ts` | Invalid byte buffer or WASM linear memory allocation failure | Worker error boundary catches exception; resets worker instance without crashing main thread |
| `DuckDBExecutionError` | `src/components/analytics/PowerQueryDrawer.tsx` | SQL syntax error, catalog binder error, or invalid column reference | Parse via `formatDuckDBError`; display titled alert banner inside drawer with syntax highlight |
| `PersistenceError` | `src/storage/` | IndexedDB quota exceeded or storage blocked | Log warning; degrade gracefully to in-memory non-persisted session state |
| `AttestationFailure` | `src/crypto/attestation.ts` | SHA-256 hash mismatch or tampered audit report | Invalidate attestation badge; flag verification failure in privacy modal |
