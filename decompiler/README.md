# Ghidra pseudocode worker prototype

Status: script compiled and extracted pseudocode using official Ghidra12.1.4 on six compiler-built PE fixtures. Desktop integration remains pending; this folder is not bundled into the app.

StudioDecompile.java is intended as a headless post-script after static import and analysis in a new disposable Ghidra project. Arguments: hexadecimal function entry address, output JSON path. It requests one exact function, applies a 30-second decompiler call budget, returns at most 2 MiB pseudocode, records Ghidra version and imported executable SHA256, and disposes the decompiler. The enclosing launcher still needs a whole-job timeout, cancellation/process-tree cleanup, isolated project paths, input-copy hash verification and cleanup. Never execute the target program.

result.py checks output size, schema, engine provenance, expected input hash and exact function address, outcome status and code size. Failure statuses cannot carry code. These are structural checks, not proof that reconstructed pseudocode is correct. Unit tests use synthetic reports only: python -B -m unittest discover -s decompiler -v.

Research references: [DecompInterface](https://ghidra.re/ghidra_docs/api/ghidra/app/decompiler/DecompInterface.html), [DecompileResults](https://ghidra.re/ghidra_docs/api/ghidra/app/decompiler/DecompileResults.html), checked2026-10-18. Existing MIT upstream REA bridge/launcher was inspected for integration choices; it remains unchanged. Studio script is original AGPL-3.0-only material.

Next acceptance: locate or obtain an official compatible Ghidra release in a project-owned tool directory, compile/run script, test arithmetic, branches, loops and calls on compiler fixtures, test invalid addresses and hash mismatch, then build bounded launcher and UI. Java25 was found locally; no Ghidra install found in the limited standard user/download/program directories checked. No global tool settings changed.


verify_fixture.py is a development acceptance runner using an explicit Java executable and Ghidra Utility.jar entry point. It copies a fixture into a unique test directory, verifies the copy hash, applies a 90-second analysis budget and 180-second whole-job timeout, then validates one output per supplied function address. Projects are disposable; logs/reports are retained. Launch verified on this Windows host with Ghidra12.1.4 and AdoptiumJava25; other combinations remain unverified. It is not the production launcher or a sandbox; no target executable is run.


## Live acceptance — 2026-10-18

Official archive ghidra_12.1.4_PUBLIC_20260921.zip (569649598 bytes) matched GitHub release SHA256 ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db. Workspace-local extraction only; not redistributed in installer.

All six existing compiler corpus builds (x86/x64,O0/O2/Os) returned24 complete pseudocode results and6 explicit no-function outcomes at0x1. Input copies/original hashes and requested function addresses matched. Wrong-hash reports were rejected. PDB processing was skipped in inspected logs. Source patterns include arithmetic, branch/call choice, loop and indirect call. Success proves extraction and protocol operation, not semantic equivalence. Inspected arithmetic/choice operations match fixture patterns; optimized loop code is substantially transformed. Some choose/indirect prototypes incorrectly infer void rather than the source return type. Unknown types, warning comments and errors must remain visible.

Startup repair: use Ghidra LaunchSupport -vmargs rather than omitting its required class loader. Windows AppData/cache settings also need explicit per-run overrides; user.home alone is insufficient. First failed startup accessed default user Ghidra logging/cache locations; subsequent successful runs use isolated config/cache directories. Existing user files were not removed. Actual process cancellation/timeouts and output overflow still need live acceptance; budgets in code alone do not count as verified behavior.
