# 🔍 SIEVE: Client-Side PPC Search Term Leakage Hunter & Econometric Audit Engine

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript: 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React: 18 / 19 Shell](https://img.shields.io/badge/React-18%20%2F%2019-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Engine: DuckDB-WASM](https://img.shields.io/badge/Engine-DuckDB--WASM-FFF000.svg?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![Privacy: 0 B Egress](https://img.shields.io/badge/Privacy-0%20B%20Egress-success.svg)](https://github.com/ShadowXZS/sieve)

> ### ⚠️ Development Transparency & Local-Compute Notice
> **This application's core codebase and local analytics pipelines were synthesized using advanced Meta-Prompting engineering workflows. The application itself runs completely deterministically inside your browser.**
>
> **Please use the data as a reference and not make financial decisions based on it.**
>
> **Zero-Cloud Privacy Guarantee:** Because the resulting engine is entirely local-first, no AI models process your data at runtime. Your raw marketing files, cost metrics, and search queries stay strictly inside your browser's WebAssembly memory. There is zero data egress, zero external telemetry, and zero cloud tracking.

---

* **Live Demo:** [sieveql-beta.vercel](https://sieveql-beta.vercel.app/)
* **Repository:** [github.com/ShadowXZS/sieve](https://github.com/ShadowXZS/sieve)
* **License:** GNU Affero General Public License v3.0 (AGPL-3.0)

---
# Sieve — Project Post-Mortem

> **Project Status:** Archived / Discontinued  
> **Development Time:** ~5 Days  
> **Core Focus:** Client-side Google Ads audit engine and PPC negative keyword calculation

After five days of attempting to build **Sieve**—a client-side tool intended to analyze multi-megabyte Google Ads search query reports—I had to face a hard reality: **I tried to use prompt-driven development to bypass the hard work of learning software engineering, and it fundamentally broke down.**

I am archiving this repository instead of launching it. This document is not a critique of what AI cannot do in the abstract, but a candid, technical account of where my approach failed, why my verification broke down, and why I realized that there are no genuine shortcuts to understanding the craft yourself.

---

## The Build Objective vs. The Reality

My initial plan was naive: assemble a working micro-SaaS using LLMs, market it to generate revenue, and use that income to finance my journey into learning computer science properly. 

I fell into the trap of believing that if I could describe product requirements clearly, the model could handle the actual architecture. What followed was five days of mounting technical debt and cognitive exhaustion. I ended up caught in an ironic loop:

> I tried to build software to earn the privilege of learning how to code, only to realize that knowing how to code was the only way this software could have ever been built reliably in the first place.

---

## Technical Breakdown: Where and Why the System Broke

### 1. The Rule-Setting Trap: Treating Prompts as Architecture
When early builds produced erratic logic, my first instinct was to add more guardrails. I tried to follow best practices for prompt constraints:
- Assigned strict, specialized personas (e.g., Senior PPC Director for business logic, Systems Architect for runtime constraints).
- Implemented explicit negative rules: never drop near-variant keywords silently, preserve exact decimal representations for currency, and avoid unvalidated type coercions.
- Enforced modular boundaries, instructing the model to use isolated functional pipelines and explicit TypeScript interfaces.

**Where I went wrong:** I mistook prompt instructions for structural invariants. In a real system, invariants are enforced by compilers, typecheckers, and memory limits. In an LLM, an instruction is merely a set of tokens competing for attention. 

As the codebase expanded across multiple files and context windows grew, the model quietly made compromises to generate working code. It bypassed interfaces to silence compile errors, swallowed malformed rows to prevent thread crashes, and dropped tokens to satisfy token budgets. Because I didn't know the underlying system well enough, I couldn't see these subtle erosions until the end calculations were already compromised.

### 2. The Verification Blind Spot: Automated Tests Without Human Comprehension
To bring discipline to the build, I adopted a Test-Driven Development (TDD) approach. I instructed the model to write automated unit and integration tests before generating feature implementations.

The test suite ran and returned all green checkmarks (`100% Tests Passing`). The dashboard loaded, calculations appeared instantly, and everything looked functional.

**The actual failure:** The test suite was an echo chamber. 
- When the model misinterpreted how phrase-match near-variants or punctuation stripping should work, it authored unit tests asserting that the **incorrect result was the expected result**.
- Because I lacked the fundamental coding skills to independently audit the test files, inspect mock edge cases, or verify mathematical boundaries, I trusted the green test runner blindly.
- **The Lesson:** An automated test is only as trustworthy as the engineer auditing its assertions. Letting the same probabilistic system generate both the logic and the verification created a closed feedback loop where hallucinations were rubber-stamped as passed tests.

### 3. The Multi-Agent Pitfall: Error Mutation Over Convergence
To resolve calculation inconsistencies, I attempted an adversarial verification pipeline using two different models:
- **Model A (The Builder):** Tasked with generating the client-side parsing routines, Web Worker message passing, and calculation layer.
- **Model B (The Auditor):** Given the domain rules of Google Ads PPC mechanics to evaluate Model A's outputs.

The workflow operated in three stages:
1. **Initial Audit:** Model B analyzed v1's outputs (suggested negative keywords and wasted spend totals) and accurately identified dropped search tokens and faulty match-type logic.
2. **The Patch:** I fed Model B's critique back to Model A to refactor the pipeline into v2.
3. **The Second Audit:** I extracted fresh calculation runs from v2 and returned them to Model B, expecting a clean bill of health.

**The Result:** The errors did not resolve; they mutated.

```
[Fix Keyword Parsing] ────> Introduces silent currency serialization bugs
                                      │
                                      ▼
[Fix Currency Parsing] ───> Causes unhandled Web Worker buffer drops
                                      │
                                      ▼
[Fix Web Worker Pipeline] ─> Reintroduces the original keyword matching bug
```

I fell into an established trap in AI orchestration: without a deterministic, external ground-truth oracle, asking one probabilistic model to audit another does not converge on mathematical truth. It merely shuffles errors across the codebase.

### 4. Compounding State & Concurrency Failures
When I tested the engine on real-world datasets—a 50,000-row Google Ads search terms CSV—the client-side browser runtime began to collapse:
- **Heap Exhaustion:** The parser ran out of memory on large CSV buffers. The model’s patch prevented the crash by chunking arrays, but silently starved the downstream state store of essential rows.
- **Race Conditions:** Offloading work to Web Workers created unsynchronized message passing. Rows were dropped between worker threads without explicit error logs.
- **Precision Drift:** Vanilla JavaScript floating-point arithmetic was applied across currency summations, leading to cumulative calculation drift across tens of thousands of rows.

Because every patch was generated in response to an immediate symptom rather than a holistic understanding of the system's memory lifecycle, the codebase devolved into an unmaintainable web of localized hotfixes.

---

## The Cognitive Tax: The Reality of "Vibe Coding"

The most exhausting part of the process was not the technical debugging, but the sheer mental friction of working through natural language as an intermediary:

$$\text{Intent} \longrightarrow \text{Ambiguous English Prompt} \longrightarrow \text{Probabilistic Code} \longrightarrow \text{Forensic Analysis} \longrightarrow \text{Re-Prompting}$$

When you write code directly, you build and hold a mental model of the state machine, memory flow, and failure points in your own head. 

By having an AI generate thousands of lines across multiple files, I never built that mental map. I spent hours reading foreign code that I technically "owned" but didn't understand, trying to reverse-engineer why a specific variable was missing or why a worker thread was hanging. 

I realized that if you have to spend 45 minutes crafting an airtight prompt specifying every invariant, data boundary, and type contract, **you have already done the conceptual work of programming.** Forcing an LLM to translate that specification into code—only to spend hours forensically auditing the output—didn't save time. It just created cognitive fatigue.

---

## The Parity Paradox: Why I Am Walking Away

Sieve looks like a finished, production-grade product. The interface is clean, the dark mode is polished, the interactions feel fast, and the dashboard lights up with metrics when you drop in a CSV.

Yet as the person responsible for it, **I cannot guarantee that the numbers it produces are mathematically accurate down to the cent.**

In a performance marketing tool, reporting numbers with an unknown margin of error is unacceptable. If an audit suggests cutting a keyword based on incorrect ad-spend aggregation or flawed match-type classification, it can waste thousands of dollars of real client budget. 

Releasing software simply because the interface looks convincing—while privately knowing you cannot vouch for the underlying arithmetic—is irresponsible. If I cannot verify the math myself, I have no business putting it into users' hands.

---

## Personal Takeaway & Next Steps

This project was a humbling and necessary wake-up call. 

I went in hoping that modern AI tools had reached a point where intent and product vision could substitute for technical depth. I came out realizing that AI can be a powerful assistant for someone who already understands systems architecture, but it cannot be a substitute for foundational competence. 

You cannot manage what you cannot evaluate. You cannot verify what you do not understand.

I am archiving this repository as a personal reminder of this lesson. My focus is shifting away from rapid prototyping with prompt orchestration and toward the foundational path I should have started with: studying data structures, computer architecture, and writing deterministic code from the ground up.

---

## 1. Executive Summary & Zero-Egress Privacy Model

### The PPC Auditing Dilemma
Modern enterprise search engine advertising (Google Ads, Amazon PPC, Microsoft Advertising) generates massive search term reports containing tens to hundreds of thousands of customer queries. Within these datasets lie critical inefficiencies: broad-match query bleed, high-frequency zero-conversion queries, and subtle match-type cannibalization. 

Traditional audit tools require uploading raw search term reports, financial cost figures, average CPCs, and revenue metrics to third-party cloud servers. For corporate advertisers, agencies, and enterprise brands, this introduces severe compliance, legal, and confidentiality risks:
* **Exfiltration of proprietary business economics:** Margins, target CPA thresholds, conversion rates, and revenue.
* **Competitor exposure:** Strategic keyword targets and brand positioning intelligence.
* **PII leakage:** Unintended customer personal data (phone numbers, addresses, transaction IDs) entered by users into search boxes and captured in query strings.

### The Zero-Egress Privacy Model (0 B Outbound Data Transfer)
**SIEVE** solves this dilemma through an air-gapped, zero-server architecture. All ingestion, normalization, token matrix computations, relational SQL querying, and vector PDF report synthesis execute **100% client-side** inside the user's web browser:

* **0 B Outbound Data Transfer:** Under no circumstances does search term data, financial figures, or analytical metadata leave your device.
* **Active Network Interception (`PrivacyMonitor`):** At application startup, the runtime actively monitors and traps outbound network interfaces (`window.fetch`, `XMLHttpRequest.prototype.open`, `XMLHttpRequest.prototype.send`, `navigator.sendBeacon`, and `window.WebSocket`). Any attempted unauthorized egress is immediately blocked.
* **Deterministic Cryptographic Attestation:** Upon completing an audit, the client engine computes an in-memory SHA-256 certificate (`ZeroLeakAttestation`). The certificate attests with a cryptographic signature that exactly 0 bytes were transmitted over the network during the entire session.
* **Client-Side PII Scrubber:** Includes a deterministic regex and Luhn-checksum-verified PII scrubber that redacts credit card numbers, Social Security Numbers, emails, phone numbers, IP addresses, and authorization credentials before export or vector PDF rendering.
* **Local-First Persistence:** Historical audit sessions and exclusion fingerprint ledgers are persisted strictly within the browser's local sandbox via Dexie.js (IndexedDB).

---

## 2. Core Capabilities & Analytical Engines

SIEVE features five domain engines designed according to Clean Architecture principles, running in headless isolation with zero UI or framework dependencies:

```mermaid
flowchart TD
    RawCSV["Raw PPC Export (CSV/TSV)"] --> Ingestion["Streaming Worker Parser"]
    Ingestion --> Normalization["Micro-Currency Normalization (CurrencyMicros)"]
    Normalization --> Engine1["N-Gram Tokenizer Engine"]
    Normalization --> Engine2["Conversion Shield Engine"]
    Normalization --> Engine3["Econometric Reallocation Engine"]
    Normalization --> Engine4["Match Dilution Engine"]
    Normalization --> Engine5["DuckDB-WASM SQL Engine"]

    Engine1 --> SubClick["Sub-Click Waste Rollup & Wilson Scoring"]
    Engine2 --> Collision["Inverted Index Trie & Exact Bracket-Locks"]
    Engine3 --> Elasticity["Convex Reallocation & Bid Ceilings"]
    Engine4 --> Dilution["Hijacked Clicks & Inflation Ratios"]
    Engine5 --> PowerQuery["Vectorized Columnar SQL (Power Query)"]

    SubClick --> Output["Clean Exclusions, Dashboards & Vector PDF Reports"]
    Collision --> Output
    Elasticity --> Output
    Dilution --> Output
    PowerQuery --> Output
```

### 1. N-Gram Tokenization & Stopword Filtering (`NgramTokenizerEngine`)
Search terms are decomposed into unigrams ($N=1$) and bigrams ($N=2$) to expose aggregate token-level underperformance across multiple queries.
* **Stopword Masking:** Standard syntactic stopwords (`the`, `and`, `in`, `for`, `with`, `to`, `at`, `from`, etc.) are actively masked during negative candidate generation. Deploying unmasked stopwords as broad negative keywords causes catastrophic traffic collapse across valid converting campaigns.
* **Intent Classification:** Classifies extracted tokens into four distinct semantic tiers: `COMMERCIAL`, `INFORMATIONAL`, `EMPLOYMENT`, and `BRAND`.
* **Wilson Score Binomial Confidence Interval:** Calculates lower and upper binomial confidence bounds on conversion rates ($p$) at confidence level $z = 1.96$ ($95\%$ confidence):
  $$\hat{p} \pm \frac{z}{1 + \frac{z^2}{n}} \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}$$
  Tokens with statistically confirmed upper bounds of zero conversion rate are prioritized for exclusion, eliminating false positives from low-sample query volume.

### 2. Sub-Click Waste Rollup
A chronic vulnerability in enterprise paid search is the "fragmented long tail": hundreds or thousands of distinct search queries that each receive only 1 or 2 clicks and zero conversions.
* Standard spreadsheet filters often filter for terms with $\ge 5$ or $\ge 10$ clicks, completely missing this dispersed spend.
* SIEVE aggregates all sub-click queries by their root n-gram stems, revealing that a single irrelevant root token (e.g., `free`, `torrent`, `salary`, `manual`) is quietly bleeding thousands of dollars across fragmented variations.

### 3. Safe-List Collision Shielding & Exact Bracket-Lock (`ConversionShieldEngine`)
Negative keyword expansion carries a catastrophic risk: accidentally blocking terms that drive revenue.
* **Safe-List Ingestion:** Any search query with historical conversions ($> 0$) or verified revenue is immutably enrolled into the active Safe List.
* **Prefix Trie & Inverted Token Index:** Collision detection executes in $O(M)$ time using an in-memory prefix trie and token hash map.
* **Exact Bracket-Lock Fallback:** If a candidate negative term conflicts with a converting query (e.g., blocking `red running shoes` when `running shoes` is a top converter), SIEVE rejects broad or phrase match exclusions and enforces an **Exact Match Bracket-Lock** (`[red running shoes]`). Converting traffic pools remain fully shielded.

### 4. Econometric Capital Reallocation (`EconometricEngine`)
Rather than simply displaying wasted spend, SIEVE models how recovered capital can be reinvested into profitable segments using micro-economic principles:
* **Break-Even Bid Ceilings:** Calculates optimal maximum CPC ceilings per AdGroup based on historical Conversion Rate (CVR) and Target Cost-Per-Acquisition (Target CPA):
  $$\text{Bid Ceiling} = \text{CVR} \times \text{Target CPA}$$
* **Convex Capital Reallocation (Cobb-Douglas Damping):** Reallocating recovered waste into top-performing auctions does not yield linear returns due to auction saturation and diminishing marginal efficiency. Yield is damped using an elasticity exponent $\gamma \in [0.70, 0.85]$ (default $\gamma = 0.75$):
  $$\Delta \text{Conversions} = \left(\frac{\text{Recovered Waste}}{\text{Target CPA}}\right)^\gamma$$
* **Four-Tier Spend Waterfall:** Dynamically classifies search spend into:
  1. *Profitable Core:* Operating below optimal bid ceilings with positive margin.
  2. *Diminishing Return:* Operating between optimal bid ceiling and break-even boundary ($150\%$ of ceiling).
  3. *Dead Zone:* Operating well above break-even with unsustainable CPA drag.
  4. *Pure Waste:* Zero-conversion spend meeting exclusion thresholds.

### 5. Match Dilution & Cannibalization Analysis (`MatchDilutionEngine`)
Google Ads and Microsoft Advertising broad/phrase match expansion often forces search queries into high-cost loose match types even when the exact keyword exists in the account.
* **Hijacked Click Detection:** Matches queries delivered under Broad or Phrase match against existing Exact match benchmarks.
* **CPC Inflation Calculation:** Computes the exact monetary premium paid to ad networks due to match-type dilution:
  $$\text{Budget Lost} = \text{Hijacked Clicks} \times (\text{CPC}_{\text{Broad}} - \text{CPC}_{\text{Exact}})$$
* **Severity Tiers:** Categorized by inflation ratio ($\text{CPC}_{\text{Broad}} / \text{CPC}_{\text{Exact}}$): Negligible ($< 1.10\times$), Moderate ($1.10\times - 1.30\times$), Severe ($1.30\times - 1.75\times$), and Critical ($> 1.75\times$).

### 6. Native In-Browser DuckDB-WASM SQL (Power Query)
SIEVE packages a full vectorized analytical SQL database directly into browser memory via DuckDB-WASM:
* **Vectorized Columnar Execution:** Queries execute directly against Apache Arrow record batches with sub-25ms latency on datasets exceeding 100,000 rows.
* **Interactive SQL Terminal:** The slide-out Power Query drawer allows media buyers and analysts to write arbitrary SQL queries against their dataset in real time.
* **Built-In Diagnostic Presets:** Pre-parameterized queries for instant forensic insights:
  * *Top Spenders:* High-spend search terms ranked with calculated CPCs.
  * *Zero-Conversion Waste:* High-click non-converting terms meeting custom spend thresholds.
  * *Campaign Rollups:* Aggregated impressions, clicks, spend, conversions, CPC, and CPA by campaign.
  * *Auction Collisions:* Cross-adgroup query cannibalization where multiple ad groups compete for the same query.

---

## 3. Inside-Out Technical Architecture (Clean Architecture)

SIEVE follows **Clean Architecture** (Robert C. Martin), **Domain-Driven Design** (Eric Evans), and **Designing Data-Intensive Applications** (Martin Kleppmann).

```
[Presentation Shell]
  │ (React 18/19 Components: KPI, Analytics, Virtual Grid, Dropzone, Power Query)
  ▼
[Application Layer]
  │ (SieveWorkerPool: 2-16 Threads, IPC Protocol, Transferables, useSieveStore, PDF Synthesis)
  ▼
[Adapters & Engines]
  │ (DuckDB-Wasm Engine, Apache Arrow Bridge, Dexie.js Storage, Network Interceptor, PII Scrubber)
  ▼
[Domain Core (Enterprise Business Rules)]
  ├── Ports (Contracts): INgramTokenizerPort, IMatchDilutionPort, IConversionShieldPort, etc.
  └── Types (Entities/Value Objects): CurrencyMicros (bigint), SearchTermRecord, SafeListTerm, etc.
```

### The Inward Dependency Rule & Invariants
1. **Zero-Dependency Domain Core (`src/domain/*`):** The domain logic has zero external dependencies—no React, no DOM, no DuckDB, and no external libraries. Pure, deterministic TypeScript.
2. **Integer Micro-Currency Invariant (`CurrencyMicros`):** Floating-point numbers (`0.1 + 0.2 = 0.30000000000000004`) are strictly forbidden for monetary amounts. Spend, revenue, CPC, and CPA are stored and computed as branded integer micro-units (`CurrencyMicros` typed as `bigint`), where:
   $$\$1.00 = 1{,}000{,}000 \text{ micros}$$
   This completely prevents IEEE-754 precision drift across complex multi-stage rollups.
3. **Multi-Threaded Worker Pool (`SieveWorkerPool`):**
   * Hardware-concurrency aware: scales dynamically from 2 to 16 Web Workers (`navigator.hardwareConcurrency`).
   * Zero-copy transfer list serialization: CSV chunks, Arrow IPC streams, and ArrayBuffers are dispatched using Transferable ArrayBuffer semantics (`postMessage(msg, [buffer])`), eliminating structured clone overhead.
   * Background reactive filtering: Slider threshold adjustments recompute across 100,000+ records in under 10ms.
4. **Virtual Viewport Grid:** Table rendering uses `@tanstack/react-virtual` to enforce a strict DOM node ceiling ($\le 120$ elements), ensuring silky-smooth 60 FPS scrolling regardless of file row count.
5. **Client-Side Vector PDF Engine (`@react-pdf/renderer`):**
   * Synthesizes multi-page corporate forensic audit decks and executive one-pagers directly in browser memory.
   * Renders native vector shapes, typography, and charts with zero rasterization artifacts.
   * Auto-releases object URLs upon download to prevent memory leaks.

### Core Technology Stack

| Component | Technology | Role & Purpose |
|---|---|---|
| **Language & Typing** | TypeScript 5 (Strict) | Compile-time type purity, branded nominal types, zero `any` |
| **Presentation Framework** | React 18 / 19 | Reactive UI, state reconciliation, headless accessibility |
| **Styling & Design Tokens** | Tailwind CSS 4 | Zero runtime CSS overhead, accessible dark mode palette |
| **Relational Analytics** | DuckDB-WASM | In-browser vectorized SQL query execution |
| **In-Memory Tabular IPC** | Apache Arrow (v21) | Zero-copy columnar data interchange across workers |
| **Concurrency Orchestration** | Web Workers (2–16 cores) | Multi-threaded CPU parallelization with Transferables |
| **Local Persistence** | Dexie.js (IndexedDB) | Air-gapped local session storage and audit history |
| **Document Synthesis** | `@react-pdf/renderer` | Client-side vector PDF generation (Executive Decks) |
| **Cryptographic Security** | Web Crypto API (SHA-256) | Zero-egress attestation certificates and rule hashing |
| **Data Grid Virtualization** | `@tanstack/react-virtual` | High-frequency windowing with bounded DOM node count |

---

## 4. Supported Ad Platforms & Ingestion

SIEVE includes a multi-platform ingestion parser (`platform_detector.ts` and `search_term_parser.ts`) that auto-detects advertising platform formats, file encodings, and delimiters:

```mermaid
flowchart LR
    File[Uploaded Report] --> Sniff[Delimiter Sniffer]
    Sniff --> Header[Header Detector]
    Header -->|Google Headers| GAds[Google Ads Parser]
    Header -->|Amazon Headers| APPC[Amazon PPC Parser]
    Header -->|Microsoft Headers| MSAds[Microsoft Ads Parser]
    GAds --> Norm[Normalized SearchTermRecord]
    APPC --> Norm
    MSAds --> Norm
```

### Supported Formats & Recognized Schemas

* **Google Ads (Search Query Performance Report):**
  * Auto-detects standard CSV and tab-delimited exports.
  * Maps fields: `Search term`, `Match type`, `Campaign`, `Ad group`, `Impressions`, `Clicks`, `Cost` / `Spend`, `Conversions`, `Cost / conv.` (CPA), `Conv. value` (Revenue).
* **Amazon Advertising (Sponsored Products Search Term Report / Bulk):**
  * Handles multi-line metadata headers before table data.
  * Maps fields: `Customer Search Term`, `Targeting`, `Match Type`, `Campaign Name`, `Ad Group Name`, `Impressions`, `Clicks`, `Spend`, `7 Day Total Orders (#)` (Conversions), `7 Day Total Sales ($)` (Revenue), `Total Advertising Cost of Sales (ACOS)`, `Total Return on Advertising Spend (ROAS)`.
* **Microsoft Advertising / Bing Ads (Search Term Performance Report):**
  * Maps fields: `Search term`, `Bid match type`, `Delivered match type`, `Campaign name`, `Ad group name`, `Impressions`, `Clicks`, `Spend` / `Amount spent`, `Conversions`, `Revenue`.
* **Delimiter & Currency Auto-Detection:** Automatically detects comma (`,`) or tab (`\t`) delimiters within the first 8 KB sample, and sniffs currency symbols (`$`, `€`, `£`, `¥`, `₹`) to standardize on micro-currency integers.

---

## 5. DuckDB Analytical Relational Schema

When a report is ingested, SIEVE populates virtual columnar relational tables inside DuckDB-WASM:

### 1. `search_terms` Table
The granular performance record for every unique search term auction:
```sql
CREATE TABLE search_terms (
  query VARCHAR,             -- Raw customer search query
  campaign VARCHAR,          -- Campaign name
  adgroup VARCHAR,           -- Ad group name
  match_type VARCHAR,        -- Delivered match type (EXACT, PHRASE, BROAD)
  impressions UBIGINT,       -- Total impression volume
  clicks UBIGINT,            -- Total click count
  spend_micros UBIGINT,      -- Total cost in integer micros ($1.00 = 1,000,000)
  conversions DOUBLE,        -- Attributed conversion count
  revenue_micros UBIGINT,    -- Conversion revenue in integer micros
  cpc_micros UBIGINT,        -- Average cost per click in integer micros
  is_safe BOOLEAN            -- Whether term is protected by Conversion Shield
);
```

### 2. `token_matrix` Table
Aggregated n-gram tokens with statistical confidence metrics:
```sql
CREATE TABLE token_matrix (
  token_text VARCHAR,            -- Extracted n-gram token string
  occurrences UBIGINT,           -- Number of unique search terms containing token
  total_clicks UBIGINT,          -- Cumulative click volume
  total_spend_micros UBIGINT,    -- Cumulative spend in integer micros
  conversions DOUBLE,            -- Cumulative conversions
  wilson_upper_bound DOUBLE      -- 95% Wilson score binomial upper bound
);
```

### 3. `safe_list` Table
High-converting queries permanently shielded from negative exclusions:
```sql
CREATE TABLE safe_list (
  term VARCHAR,              -- Converting query text
  conversions DOUBLE,        -- Total conversion volume
  revenue_micros UBIGINT,    -- Total secured revenue in integer micros
  created_at UBIGINT         -- Ingestion timestamp in epoch milliseconds
);
```

### Parameterized Diagnostic Presets
Users can execute pre-configured forensic queries via the Power Query drawer:
* **Top Spenders:** `SELECT query, campaign, clicks, spend_micros, conversions, cpc_micros FROM search_terms ORDER BY spend_micros DESC LIMIT 50;`
* **Zero-Conversion Waste:** `SELECT query, clicks, spend_micros, cpc_micros FROM search_terms WHERE conversions = 0 AND clicks >= 5 ORDER BY spend_micros DESC;`
* **Campaign Rollup:** `SELECT campaign, count(distinct query) AS queries, sum(spend_micros) AS spend, sum(conversions) AS convs FROM search_terms GROUP BY campaign ORDER BY spend DESC;`
* **Auction Collisions:** Highlights search terms triggered across multiple campaigns or ad groups simultaneously.

---

## 6. Local Compute & Privacy Guarantees

SIEVE was constructed around non-negotiable data isolation principles:

```
┌────────────────────────────────────────────────────────┐
│                   YOUR WEB BROWSER                     │
│                                                        │
│  ┌───────────────┐     Zero-Copy      ┌─────────────┐  │
│  │ CSV Ingestion │ ──────────────────► │ WebAssembly │  │
│  └───────────────┘   ArrayBuffers     │ Linear Mem  │  │
│                                       └──────┬──────┘  │
│  ┌───────────────┐     Arrow IPC             │         │
│  │ DuckDB-WASM   │ ◄─────────────────────────┘         │
│  └───────┬───────┘                                     │
│          ▼                                             │
│  ┌───────────────┐     In-Memory      ┌─────────────┐  │
│  │  Vector PDF   │ ◄───────────────── │ Scrubber &  │  │
│  │  Synthesis    │                    │ Attestation │  │
│  └───────────────┘                    └─────────────┘  │
└────────────────────────────────────────────────────────┘
                           │
                    ❌ NO NETWORK ❌
                           │
                           ▼
                  [The Public Internet]
                  (0 Bytes Transferred)
```

1. **Air-Gapped Operation:** All computations run locally in linear WebAssembly memory and JavaScript worker threads. The app functions completely without internet connectivity once loaded.
2. **Deterministic Network Interceptor (`src/crypto/network_interceptor.ts`):** Monkeypatches all outbound networking APIs at boot time. Outbound transfer counter remains strictly `0 B`.
3. **Cryptographic Attestation (`src/crypto/attestation.ts`):** Produces a verifiable JSON attestation certificate hashable via Web Crypto API SHA-256. Any mock or data leak invalidates the attestation.
4. **Client-Side PII Masking:** All exported negative keyword rules, CSV files, and PDF forensic audits pass through the in-browser PII scrubber, sanitizing sensitive user entries.
5. **No Third-Party Telemetry:** Zero Google Analytics, zero tracking pixels, zero CDN scripts, and zero remote font queries.

---

## 7. Getting Started & Local Development

### Prerequisites
* **Node.js:** `v20.x` or higher
* **Package Manager:** `pnpm` (v9+) or `npm`
* *(Optional)* **Rust Toolchain & wasm-pack:** Required only if recompiling the core Rust WASM pipeline in `crates/sieve_core`. Pre-built WASM binaries are included in `Public/`.

### Installation
Clone the repository and install dependencies using `pnpm`:

```bash
# Clone the repository
git clone https://github.com/ShadowXZS/sieve.git
cd sieve

# Install exact dependencies
pnpm install
```

### Local Development Server
Start the Vite local development server with Hot Module Replacement (HMR):

```bash
pnpm run dev
```

The application will be accessible at `http://localhost:5173`.

### Type Checking & Boundary Verification
Run TypeScript strict type checking without emitting build artifacts:

```bash
npx tsc --noEmit
```

Run architectural boundary and code linting:

```bash
pnpm run lint
```

### Running Test Suites
Execute the automated test suites covering Rust WASM, Node domain logic, and React components:

```bash
# Run all unit tests (Domain engines, DuckDB Arrow bridge, PII scrubber, Attestation)
pnpm run test:unit

# Run all UI component integration tests (File dropzone, Virtual grid, Dashboard)
pnpm run test:components

# Run complete test harness
pnpm test
```

### Production Build
Compile the WebAssembly module, typecheck, and build the production bundle:

```bash
pnpm run build
```

Preview the production build locally:

```bash
pnpm run preview
```

---

## 8. Architectural Rules & Contribution Guidelines

All changes must adhere to the system invariants documented in `docs/ARCH_RULES.md` and `.antigravity/rules/antigravityrules.md`:
* **Strict Inward Dependency Rule:** Presentation components must never be imported by application state, workers, adapters, or domain modules.
* **Domain Port Immutability:** Contracts in `src/domain/ports/*` and `src/domain/types/*` are strictly governed.
* **No Primitive Obsession:** Use branded types (`CurrencyMicros`, `QueryString`, `TokenString`) rather than loose numbers or strings.
* **Zero Floating-Point Currency:** All monetary logic must execute using integer micro-units (`bigint`).
* **Clean Architecture File Ceiling:** Source files must not exceed 250 lines of code.

---

## 9. Legal & Disclaimer

This software is provided **"as is"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the authors or copyright holders be liable for any ad spend losses, account suspensions, or financial damages arising from the use of this software. Always review generated negative keyword candidates prior to applying them in live advertising accounts.
