# REA Studio 1.1.0 — native analysis preview

The app now includes its own static x86/x64 Windows PE analysis backend. Native disassembly does not require Ghidra, IDA, a subscription or a separately installed runtime.

Open an EXE or DLL and select **Native disassembly**. The **Native workspace** shows assembly, original instruction bytes, function candidates, block successors, references, imports, strings and sections. Click direct targets or enter a virtual address to navigate retained instructions. Function renames and notes are saved by the input's SHA-256 identity and survive restarting the app.

The existing JavaScript, artifact and .NET workflows remain available through REA. Deep analysis through external providers remains separate. The native engine is a preview: it has no pseudocode decompiler or debugger yet, and its bounded analysis does not recover every function.

## Validation and baseline

- 15 native-engine regression tests passed, including x86/x64 fixtures, calls/branches, imported-function references, unmapped virtual tails, malformed input, budgets and 60 deterministic header mutations.
- Desktop native-workspace test passed: selection, real bundled-worker analysis, assembly, graphs, references, strings/sections, target navigation, persisted notes and history reload.
- Existing desktop regression test passed after correcting a test that read source-preview content before its asynchronous file read finished.
- Three sequential fresh-worker runs measured a median 138 ms for a 1 KB x64 fixture, 138 ms for the x86 fixture, 414 ms for the local `kernel32.dll`, and 1,067 ms for the 92,825,416-byte Node executable.
- The real-binary runs retained 256 function candidates each: 9,907 instructions in `kernel32.dll` and 10,003 in Node. These are bounded inventories, not complete-recovery or decompilation-quality scores. Timings are this PC's measurements, with uncontrolled OS caches.
- Peak worker working set was approximately 154–173 MiB across these runs. Desktop UI memory is not included; this is a baseline to improve, not a whole-application memory claim.
- Both the native-workspace and existing-workflow suites also passed against the packaged 1.1.0 EXE, including the bundled worker.
- The installer upgrade exited successfully. The installed app passed native-workspace checks; Windows reports version 1.1.0, shortcut targets are correct, and installed app bytes match the tested package. Installer verification is recorded in `verification/installer-1.1.0-verification.json`.

Raw measurements: `verification/native-benchmark.json`. Engine details and limits: `native-engine/README.md`. Desktop implementation: `desktop/`. Native worker source: `native-engine/engine.py`.

Public business readiness still requires broader real-world evaluation, release signing, update/rollback design, license inventory review, and a defined product support policy. This release is a functional engineering milestone rather than a claim of commercial-tool parity.
