# Ghidra pseudocode worker prototype

Status: extraction script drafted; real Ghidra compilation/execution and desktop integration are pending. This folder is not bundled into the app yet. No end-to-end decompilation claim.

StudioDecompile.java is intended as a headless post-script after static import and analysis in a new disposable Ghidra project. Arguments: hexadecimal function entry address, output JSON path. It requests one exact function, applies a 30-second decompiler call budget, returns at most 2 MiB pseudocode, records Ghidra version and imported executable SHA256, and disposes the decompiler. The enclosing launcher still needs a whole-job timeout, cancellation/process-tree cleanup, isolated project paths, input-copy hash verification and cleanup. Never execute the target program.

result.py checks output size, schema, engine provenance, expected input hash and exact function address, outcome status and code size. Failure statuses cannot carry code. These are structural checks, not proof that reconstructed pseudocode is correct. Unit tests use synthetic reports only: python -B -m unittest discover -s decompiler -v.

Research references: [DecompInterface](https://ghidra.re/ghidra_docs/api/ghidra/app/decompiler/DecompInterface.html), [DecompileResults](https://ghidra.re/ghidra_docs/api/ghidra/app/decompiler/DecompileResults.html), checked2026-10-18. Existing MIT upstream REA bridge/launcher was inspected for integration choices; it remains unchanged. Studio script is original AGPL-3.0-only material.

Next acceptance: locate or obtain an official compatible Ghidra release in a project-owned tool directory, compile/run script, test arithmetic, branches, loops and calls on compiler fixtures, test invalid addresses and hash mismatch, then build bounded launcher and UI. Java25 was found locally; no Ghidra install found in the limited standard user/download/program directories checked. No global tool settings changed.


verify_fixture.py is a development acceptance runner using an explicit Java executable and Ghidra Utility.jar entry point. It copies a fixture into a unique test directory, verifies the copy hash, applies a 90-second analysis budget and 180-second whole-job timeout, then validates one output per supplied function address. Projects are disposable; logs/reports are retained. Its launch compatibility is pending the first live run. It is not the production launcher or a sandbox; no target executable is run.
