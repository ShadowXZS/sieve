# SIEVE Architecture Rules & Dependency Boundary Contracts

## 1. Architectural Foundations

SIEVE is engineered under the strict principles of **Clean Architecture** (Robert C. Martin), **Domain-Driven Design** (Eric Evans), and **Designing Data-Intensive Applications** (Martin Kleppmann):
- **Strict Inward Dependency Rule**: Source code dependencies point inward exclusively toward high-level domain policies.
- **Zero-Dependency Domain Core**: The domain core (`src/domain/*`) has zero external framework or runtime dependencies.
- **Air-Gapped & Local-First Execution**: 100% of analytical computation, cryptographic attestation, and reporting runs client-side in-browser. Zero telemetry or data exfiltration.
- **Strict Type Purity**: Zero use of `any`, untyped maps, or loose type escapes. Discriminated unions and nominal branded types guarantee type soundness.

---

## 2. Layer Topology & Architectural Hierarchy

```
[Presentation Shell]
  │ (React Components: kpi, analytics, grid, dropzone, layout; Styles)
  ▼
[Application Layer]
  │ (Workers: protocol, pool; State: useSieveStore; Reports: PDF synthesis)
  ▼
[Adapters & Computation Engines]
  │ (Analytics: DuckDB-Wasm, Arrow bridge; Storage: Dexie; Crypto: PII scrubber, hash; Utils)
  ▼
[Domain Core (Enterprise Business Rules)]
  ├── Ports (Contracts): src/domain/ports/* (INgramTokenizerPort, IMatchDilutionPort, etc.)
  └── Types (Entities/Value Objects): src/domain/types/* (CurrencyMicros, SearchTermRecord, etc.)
```

### Exact Layer Boundaries & Import Constraints

1. **Presentation Shell (`src/components/`, `src/styles/`)**:
   - May import from Application Layer, Adapters, and Domain Types.
   - Must NEVER be imported by Application, Adapters, or Domain modules.
2. **Application Layer (`src/workers/`, `src/state/`, `src/reports/`)**:
   - Manages Web Worker orchestration, IPC serialization, and global reactive state.
   - May import from Adapters and Domain Core (`types`, `ports`).
   - Must NEVER import Presentation components or UI templates.
3. **Adapters & Engines (`src/analytics/`, `src/storage/`, `src/crypto/`, `src/utils/`)**:
   - Implement inbound/outbound ports (`src/domain/ports/*`).
   - Bridge DuckDB-Wasm, Apache Arrow IPC, WebAssembly linear memory, and Dexie IndexedDB.
   - May import Domain Core (`types`, `ports`). Must NEVER import Presentation or Application state.
4. **Domain Core (`src/domain/types/`, `src/domain/ports/`)**:
   - Inbound and outbound contracts: `INgramTokenizerPort`, `IMatchDilutionPort`, `IConversionShieldPort`, `IEconometricEnginePort`, `IAnalyticalDatabasePort`.
   - **Dependency Invariant**: `src/domain/ports/*` depends ONLY on `src/domain/types/*`.
   - FORBIDDEN in Domain: React, DOM, DuckDB, Apache Arrow concrete classes, or browser I/O drivers.

---

## 3. Permanent Architectural Invariants (Strictly Forbidden)

### Rule A: Floating-Point Currency Forbidden
- All monetary amounts (spend, CPC, CPA, revenue, waste) must use integer micro-units (`CurrencyMicros` branded `bigint`).
- 1,000,000 micros = $1.00. Eliminates IEEE-754 precision drift across financial calculations.

### Rule B: Unmasked Stopwords in Broad Negatives Forbidden
- Syntactic stopwords (e.g., "the", "and", "in", "for") must be masked before generating broad negative keyword rules.
- Deploying unmasked stopwords as broad negatives destroys entire campaign traffic pools.

### Rule C: UI-Layer Financial Calculations Forbidden
- Presentation components must never compute financial KPIs, CVR, CPA drag, elasticity zones, or dilution yields.
- All calculations must occur within domain engines/ports or background worker threads.

### Rule D: Cross-Boundary Coupling & Thread Serialization Invariants
- Zero `any` and zero untyped maps (`Record<string, any>`). All interfaces must be strictly typed.
- Multi-threaded worker communication transferring tabular datasets must enforce zero-copy `ArrayBuffer` / `Uint8Array` transferable semantics (Arrow IPC streams). Raw JavaScript object arrays must never cross worker thread boundaries.

---

## 4. Domain Port Specifications (`src/domain/ports/*`)

| Port Interface | File Location | Core Contract & Responsibilities |
|---|---|---|
| `INgramTokenizerPort` | `src/domain/ports/tokenizer_port.ts` | Decomposes search terms into n-grams, classifies semantic intent, applies stopword masks, and computes Wilson score confidence bounds. |
| `IMatchDilutionPort` | `src/domain/ports/dilution_port.ts` | Compares query match types (Exact vs. Broad/Phrase), detects hijacked clicks, calculates CPC inflation ratios, and estimates lost budget. |
| `IConversionShieldPort` | `src/domain/ports/shield_port.ts` | Registers safe-list converting terms, evaluates collision risks, enforces Exact Bracket-Lock fallbacks, and emits qualified negative candidates. |
| `IEconometricEnginePort` | `src/domain/ports/econometric_port.ts` | Computes break-even bid ceilings (CVR x Target CPA), maps elasticity spectrums, and calculates convex reallocation yields damped by gamma (0.70 - 0.85). |
| `IAnalyticalDatabasePort` | `src/domain/ports/database_port.ts` | Abstract contract for in-browser SQL querying, virtual table registration (`search_terms`, `token_matrix`, `safe_list`), and parameterized diagnostic presets. |

---

## 5. Worker IPC Protocol (`src/workers/protocol.ts`)

- **Discriminated Unions**: All commands (`WorkerCommand`) and responses (`WorkerResponse`) are tagged unions with discriminant properties `type`.
- **Zero-Copy Transfer Lists**: ArrayBuffers backing CSV chunks, WASM linear memory, and Apache Arrow IPC record batches are passed via `postMessage(message, [buffer])` transfer lists, eliminating structured clone latency.

---

## 6. Error Handling Taxonomy

| Error Category | Domain / Source | Typical Cause | Handling & Fallback Strategy |
|---|---|---|---|
| `SchemaValidationError` | `src/utils/csvParser.ts` | Missing headers or corrupted CSV | Present non-destructive upload error banner in UI |
| `WorkerExecutionError` | `src/workers/protocol.ts` | Thread panic or memory allocation failure | Reset worker slot without crashing main thread |
| `DuckDBExecutionError` | `src/analytics/` | SQL syntax error or invalid column reference | Parse error and display styled alert in diagnostic drawer |
| `PersistenceError` | `src/storage/` | IndexedDB quota exceeded | Degrade gracefully to in-memory session state |
| `AttestationFailure` | `src/crypto/attestation.ts` | SHA-256 hash mismatch or tampered audit report | Invalidate attestation badge; flag verification failure |
