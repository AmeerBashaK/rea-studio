# REA Studio — product acceptance backlog

Goal: an installable Windows analysis workbench with useful capabilities available without mandatory paid subscriptions. Evaluate it with repeatable fixtures and real targets. Commercial-tool parity is a comparison to demonstrate feature by feature, not a release label.

## 1. Independent native preview — delivered in 1.1.0

Native x86/x64 PE loading, assembly, function candidates, direct references, imports/exports, strings, block successors, saved function names and notes. Acceptance evidence: engine test corpus, desktop tests, frozen-worker tests and `verification/native-benchmark.json`. Installer upgrade and installed native-workspace checks passed; see `verification/installer-1.1.0-verification.json`.

## 2. Scalable analysis projects — in progress

Development source now supports hash-checked focused decoding, parent-linked results, cancellation/restart, chunked storage, on-demand function loading, paginated references/candidates, connected graphs, back/forward navigation and persistent bookmarks. Independent-decoder and six compiler-generated fixture checks pass. Duplicate launches of the same profile restore the original window, preserving unsaved notes and keeping annotation writes in one process. These changes are not in installed 1.1.0. Full-file hashing/metadata parsing and initial worker-output buffering remain. Reference search now filters retained references for the selected function by address, symbol, kind or unresolved target before pagination. CPU and memory attribution are recorded; successful engine discovery is cached across reloads. Packaged acceptance tests and continued scalability investigation remain.

- Decode a requested address/function without repeating whole-image instruction discovery; full-file hashing and metadata parsing still occur. Verify the input hash matches the project before interpreting stored addresses.
- Persist versioned projects and paginate instructions/references instead of retaining increasingly large JSON graphs in renderer memory.
- Browse all retained seeds with explicit coverage; distinguish known seeds from analyzed functions. Allow users to expand coverage without hiding initial limits.
- Connected graph layout, navigation back/forward, bookmarks, and better reference search.
- Add compiler-generated fixtures and differential decoding checks against an independent decoder. Track correctness failures separately from coverage.

Acceptance: navigate outside the initial budget, cancel/restart work, reopen a project, detect input replacement, and export consistent observations without freezing the UI. Record large-file wall time, CPU and whole-process-family memory.

## 3. Free decompilation — development integration verified

Development source now provides Ghidra setup, selected-function pseudocode, cancellation/restart, input hash guards and saved provenance through a standalone worker. Real desktop acceptance passed with Ghidra12.1.4/Java25. Report browsing, instruction mapping and packaged/clean-machine acceptance remain pending. Installed1.1.0 does not include it.

Integrate a compatible free local decompiler, most practically Ghidra, with a transparent setup/status screen and explicit engine provenance. Keep independent assembly available when the decompiler is absent. Do not market third-party pseudocode as an independently implemented decompiler. Track setup compatibility per release and preserve the user's existing tool installations.

Acceptance: pseudocode for known arithmetic, loops, branches, call patterns and real Windows functions; instruction-to-pseudocode navigation; clear unsupported and timed-out outcomes. No cloud or paid subscription required for this capability. A custom decompiler remains optional research until its semantics have a tested supported subset.

## 4. Debugging — pending

Separate Windows launch/attach workflows, explicit running-state indicators, breakpoints, stepping, register/memory inspection and module maps. Preserve user-owned processes and detach semantics; do not apply static-analysis controls to live processes implicitly.

Acceptance: controlled fixture breakpoint/step/read-memory scenarios, clean detach, cancellation and crash handling. Kernel debugging and universal unpacking are not baseline requirements.

## 5. Comparison and extensibility — pending

Binary-version comparison based on verified function matching with ambiguity preserved; local scripting with documented boundaries; a stable analysis protocol for future engines. AI explanations are optional and must not replace evidence or introduce a mandatory paid API.

Acceptance: known changed/unchanged/moved functions, no silent pairing of ambiguous matches, reproducible exports, and versioned plugin compatibility checks.

## 6. Distribution and product readiness — pending

Versioned installers, upgrades and rollback; license inventory; clear app/engine versions; tested supported Windows configurations; crash/error diagnostics without automatic target-file uploads; accessibility and keyboard checks. Signing and external distribution need the user's business identity and release choices when the concrete build is ready.

Acceptance: clean-machine installation and upgrade tests with preserved projects, offline native analysis, accurate feature matrix, and documented limitations. No billing, accounts or marketing claims are needed to validate the engineering product first.
