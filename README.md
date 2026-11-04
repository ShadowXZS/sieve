
Here is the revised, professionally polished **README.md**. It seamlessly integrates your new perspective—acknowledging services like Dodo Payments, sharing candid reflections on vibe coding and output quality, and reframing the journey into an authentic, developer-first open-source release.

---

# 🔍 SIEVE: Multi-Channel PPC Search Term Leakage Hunter

### Universal Client-Side PPC Audit Engine & Waste Elimination Architecture

**Version:** 1.0.0 (Project Completed & Concluded)

**License:** GNU Affero General Public License v3.0 (AGPL-3.0)

**Repository:** [https://github.com/ShadowXZS/sieve](https://github.com/ShadowXZS/sieve)

---

## 🌍 The Story: Why This Project is 100% Free

Sieve started during an intense, grueling 16-hour sprint. My original plan was simple: build a specialized, high-utility tool, sell it to support my journey of learning to code, and use modern merchant-of-record platforms to handle payments and billing.

Early on, I ran headfirst into the friction of international merchant verification and cross-border payment compliance. While later research revealed viable merchant-of-record alternatives catering to builders in India (such as **Dodo Payments**), stepping back to evaluate the finished product shifted my perspective entirely:

1. **Product Maturity & Polish:** Looking critically at elements like the vector PDF exports and overall UX, I felt the tool—while fast and functionally complete—wasn't at the uncompromising commercial polish level I’d demand of a paid enterprise SaaS.
2. **The "Vibe Coding" Realization:** The entire architecture was brought to life via prompt engineering and "vibe coding." After 16 straight hours, I realized that moving code blocks from prompt to editor hadn't taught me deep, fundamental software engineering—it taught me how to orchestrate AI output at high speed.

Charging for something built this way felt premature. My actual goal is to truly learn software engineering, understand architectural depth from first principles, and tackle serious technical challenges.

Until then, I'm using the superpower of fast AI orchestration to build, experiment, and ship functional tools directly to the community for free. **Enjoy the free software—more open tools are on the way.**

If Sieve saves your ad spend, a **Star ⭐️ on GitHub** is the best currency to support the journey.

---

## 📋 Executive Summary

Digital advertising across Google Ads, Amazon PPC, and Microsoft Advertising has shifted toward automated bidding algorithms and broad-match matching models. While automation scales ad distribution, it frequently allocates significant marketing capital to zero-intent search queries, irrelevant keyword variations, and automated campaign cannibalization.

Historically, identifying and isolating this budget leakage required media buyers to download massive, multi-megabyte Search Term Reports, manually manipulate spreadsheets, write ad-hoc lookup formulas, and risk sharing confidential client spend data with third-party cloud SaaS vendors.

**Sieve** is a client-side search term audit and waste-elimination application. Operating on modern WebAssembly and local-first architecture, Sieve ingests up to 600 MB of raw search term data, decomposes queries into constituent n-grams, identifies non-converting click sinks, and formats negative keyword exclusions in under two seconds.

Processing runs entirely inside the user's browser: **no servers, no account logins, no cloud tracking, and zero data leakage**.

---

## 🎯 The Strategic Problem: Budget Leakage in Automated PPC

Modern PPC campaigns face three structural efficiency challenges:

1. **The Broad-Match Query Explosion:** Automated campaigns bid on thousands of query variations. While some queries generate revenue, many consume budget without producing conversions.
2. **The Fragmented Long-Tail Trap:** Thousands of unique search terms receive only 1 or 2 clicks. Individually, these clicks appear negligible ($3 to $5 each); collectively, they often represent 30% to 50% of total account ad spend with zero conversions. Standard spreadsheet filters fail to detect the root terms shared across these fragmented variants.
3. **The Cannibalization Risk of Negative Keywords:** When media buyers attempt to add negative keywords to stop waste, an overly broad exclusion can accidentally suppress profitable, high-converting search queries, reducing overall account revenue.

---

## 🏗️ Architectural Pillars: How Sieve Solves This

### 1. In-Browser WebAssembly Compute

Instead of uploading search term files to remote servers, Sieve uses a high-performance Rust WebAssembly engine running on the user's computer. The engine reads file byte streams directly into browser memory, running multi-token n-gram aggregation (unigrams, bigrams, trigrams) across hundreds of thousands of rows in milliseconds.

### 2. Zero-Loss "Safe List" Conflict Guard

Before any term is recommended as a negative keyword, Sieve builds an inverted index of all search queries that have historically generated conversions. If a flagged non-converting token also appears inside a profitable converting phrase, the system protects that pathway. Sieve automatically restricts the negative keyword syntax to exact bracket exclusions (`[exact query]`), preventing search path cannibalization.

### 3. Chronological Operational Workflow

The user interface presents data in a logical, chronological sequence designed for media buyers:

* **Phase 1: Ingestion** — Drag-and-drop search term reports (Google Ads, Amazon PPC, Microsoft Ads) up to 600 MB with automatic dialect, header, and currency detection (`$`, `₹`, `€`, `¥`, `£`).
* **Phase 2: Threshold Calibration** — Dynamic sliders allow immediate recalculation of minimum spend, maximum conversions, minimum clicks, and target CPA without reprocessing the underlying dataset.
* **Phase 3: Executive Analytics Dashboard** — A color-coded financial breakdown organizing spend into:
* **Identified Waste (Rose):** Capital spent on zero-intent queries and severe CPA drag.
* **Safe-List Protected (Emerald):** Revenue and conversion volume shielded by the conflict guard.
* **High-Risk Exploratory (Amber):** High-CPC queries that have not yet reached statistical significance.
* **Reallocation Yield (Indigo):** Projected conversion gains if wasted funds are reallocated to verified converting keywords.
* **Phase 4: Detailed Exploration Grid** — A virtualized keyword data grid supporting instant sorting, exact-match overrides, one-click clipboard formatting for Google Ads Editor, and local DuckDB SQL queries.

### 4. Executive Vector PDF Reporting

Sieve generates client audit reports client-side using browser vector engines. The resulting one-page and multi-page audit decks provide clear visualizations of audited spend, eliminated waste, and capital efficiency projections, formatted with customizable branding and multi-currency support.

---

## 🔒 Privacy & Security: Complete Local Isolation

Because media buyers handle confidential financial figures, client cost structures, and competitive keyword strategies, Sieve operates under a strict zero-telemetry architecture:

* **100% Client-Side Execution:** The application dispatches zero HTTP requests containing user data.
* **Air-Gapped Operation:** Sieve functions without an active internet connection once the static application bundle is loaded.
* **Client-Side Encrypted Backups:** Historical audit logs and delta records are stored locally via IndexedDB (Dexie.js), with optional AES-GCM-256 encrypted backups (`.sievevault`) managed entirely by the user.

---

## 📦 Project Status: Concluded & Complete

Sieve is a completed open-source application. Every planned architectural capability—from 600 MB chunked streaming and multi-currency parsing to Bayesian confidence scoring, conflict protection, DuckDB SQL querying, and vector PDF audit generation—has been implemented and verified.

The software is provided free of artificial limits, tracking, or commercial gating under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
