
# 🔍 SIEVE: Client-Side PPC Search Term Leakage Hunter

> **⚠️ CRITICAL NOTICE: PROJECT CONCLUDED / ARCHIVAL STATE**
> **DO NOT USE OUTPUTS FOR LIVE FINANCIAL DECISIONS OR PRODUCTION PPC CAMPAIGNS.**
> While the interface and core pipelines demonstrate what is possible with client-side WebAssembly, **the calculations, reconciliations, and outputs from this tool are not verified for production accuracy**. Use this repository strictly as an educational case study and architectural reference for in-browser data processing.

---

* **Live Demo:** [sieveql.vercel.app](https://sieveql.vercel.app/)
* **Repository:** [github.com/ShadowXZS/sieve](https://github.com/ShadowXZS/sieve)
* **License:** GNU Affero General Public License v3.0 (AGPL-3.0)
* **Status:** Concluded & Archived (Will Be Converted to Private Repository)

---

## 🛑 Post-Mortem & Developer Reflection: The Reality of "Vibe Coding"

After putting roughly 32 hours into this project, I ran headfirst into architectural walls that made one thing clear: **prompt-driven development breaks down when building complex, mathematically deterministic software.**

I am stepping away from Sieve entirely. I am keeping this code as a personal post-mortem and an enduring reminder of why I will not trust AI systems to build core engineering logic.

### 1. The Illusion of Delegation

Apart from formatting markdown tables or drafting regex boilerplate, delegating actual architecture to an LLM is not software engineering. It turned out to be an exercise in watching YouTube in another tab while an automated script cheerfully generated four thousand lines of technical debt.

Prompt-driven development here felt like commissioning a blindfolded painter: the model has read every book on art theory, knows every classical brush technique, and talks endlessly about composition. But the moment the brush touches the canvas, it cannot actually see where the paint lands. When the pigment bleeds across the frame (a memory leak) or runs straight off the canvas onto the floor (a call stack overflow), it simply smiles and keeps applying strokes with 100% statistical confidence until you tap it on the shoulder to describe the disaster.

AI builders have genuinely mastered the visual exterior—it generates slick dark-mode cards, glowing badges, and immaculate button borders. But a beautiful interface is completely useless when the engine underneath is pure architectural spaghetti. 

That is not the kind of software engineer I dream of becoming.

### 2. Prompting English Is Not Systems Engineering

Orchestrating LLMs at high velocity creates a convincing illusion of productivity. You prompt, the compiler passes, and features appear. But relying on an LLM to interpret context, state invariants, and data lifecycles without a human verifying every byte is not engineering.

AI is not "smart." It is simply exceptional at pretending to work while generating more debugging work behind the scenes.

### 3. The "Whack-A-Mole" Architectural Trap

As an application matures toward production, AI-driven development tends to collapse under system complexity:

* Fixing an out-of-memory error silently starves a downstream state store.
* Fixing the store creates race conditions in the Web Worker.
* Fixing the worker breaks the calculation layer and mathematical parity.

You end up patching patches until the architecture turns into an unmaintainable maze of localized hotfixes.

### 4. The Hard Reality of Distribution

Coming into this, I bought into the common illusion that simply building a functioning product (or what I initially assumed was a good product) would naturally bring users.

I quickly realized two truths:

1. This tool was very far from a truly good, production-grade product.
2. Even if a product works, **distribution is the entire battle**. Code sitting in a repository or deployed on a domain does nothing on its own without deliberate distribution channels.

### Final Conclusion

Initially, I blamed my own lack of contextual understanding. But after exhaustively meta-prompting, refactoring, and restructuring the system across multiple iterations, the reality became obvious: AI tools can build fast prototypes, but they do not replace the deliberate, verified systems engineering required for production-grade software.

Once I wrap up this phase of my learning journey, this repository will be set to **Private**. It will remain preserved privately to remind me never to outsource true understanding to an algorithm.

---

## 📋 What Sieve Explores Conceptually

Sieve was designed to investigate whether massive paid search term audits (from Google Ads, Amazon PPC, and Microsoft Advertising) could be processed entirely within a user's web browser without sending confidential client ad spend to third-party cloud servers.

### The Problem It Attempted to Solve

* **The Broad-Match Query Explosion:** Automated bidding models routinely distribute budget into irrelevant search queries.
* **The Fragmented Long-Tail Trap:** Zero-conversion queries receiving only 1–2 clicks often hide root-token waste that standard spreadsheet filters overlook.
* **Negative Keyword Cannibalization:** Indiscriminate negative keyword lists risk suppressing terms that drive conversions.

---

## 🏗️ The Theoretical Architecture

The codebase stands as a reference prototype for client-side, zero-server pipelines:

* **In-Browser WebAssembly Compute:** A Rust-based WebAssembly engine designed to parse byte streams directly in browser memory to compute tokenized n-grams (unigrams, bigrams).
* **Zero-Loss "Safe List" Conflict Guard:** An inverted index intended to cross-reference proposed negative exclusions against known converting queries, falling back to exact-match bracket locks (`[exact query]`).
* **Columnar DuckDB-WASM Storage:** Bypassing standard JavaScript object allocation by staging data in Apache Arrow record batches to query via local SQL.
* **Decoupled Viewport Grid:** Virtualized rendering intended to maintain responsive interface frames regardless of dataset row count.
* **Client-Side Vector PDF Engine:** In-browser document generation attempting to produce executive summaries and multi-page forensic audits directly from client memory.

---

## 🔒 Privacy Architecture

Sieve was built with zero data-egress principles:

* **100% Client-Side:** No search term data, financial figures, or campaign structures ever leave your browser.
* **Zero Telemetry:** No cloud storage, tracking databases, or analytics services.
* **Local Persistence:** Metadata and historical audit ledgers are scoped strictly to the local browser context via IndexedDB.

---

## ⚠️ Final Disclaimer

This software is provided **"as is"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the author be liable for any ad spend loss, account disruption, or commercial damages arising from the use of this code or its generated outputs.

If you are an engineer looking into Rust-WASM streaming, DuckDB-WASM integration, or in-browser vector rendering, feel free to inspect the repository before it is archived.
