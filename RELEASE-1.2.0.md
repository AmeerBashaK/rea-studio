# REA Studio 1.2.0 — packaged acceptance

The Windows x64 app package passed seven local acceptance suites. A local unsigned1.2.0 test installer has been built and its payload checked. Installation/upgrade and clean-machine verification remain pending; the installed app remains1.1.0.

## Changes since 1.1.0

- Hash-checked focused native analysis with separate saved results and parent links.
- Chunked native result storage, on-demand function loading and paged references/candidates.
- Connected graphs, Back/Forward navigation, persistent bookmarks and reference search.
- One instance per profile to protect project notes; cached engine discovery on reload.
- No fixed native input-file size cap. Files are still read into memory; memory and analysis budgets constrain practical sizes.
- Compiler-generated and independent-decoder verification; unsupported UD0/UD1 paths stop with explicit decode failures.

## Local packaged verification

All five suites passed against `release/REA Studio-win32-x64/REA Studio.exe` with isolated profiles: native workspace, focused safety/bookmarks, single instance, large-input navigation/export, and legacy workflows. These tests use bundled runtime/worker resources on the development PC, not a clean machine.

Large-input run: 92,825,416-byte Node executable, 256 retained function candidates and 10003 instructions, 1513ms open-to-result. Process-family sampler recorded 43 samples, 657354752-byte working-set and 560156672-byte private-byte sampled peaks, and 4625ms observed CPU across startup, analysis, navigation, reload and export. Sampling can miss peaks/short processes; shared working-set pages may be counted repeatedly. This is not a controlled performance comparison.

## Limits

Windows PE x86/x64 static analysis only. Recovery remains bounded and incomplete; indirect targets can remain unresolved. Reference search covers retained references related to the selected function. Full initial worker output is buffered. Local Ghidra pseudocode is available after selecting external Ghidra/Java tools; reconstructed types and return values may be wrong. No debugger, binary comparison, or commercial-tool parity claim. AGPL-3.0-only applies to original code; third-party components retain their licenses.


## Assistance package refresh — 2026-10-18

Rebuilt Windows x64 package includes offline operand explanations, explained evidence JSON, configurable local CLI profiles, Claude setup preset, selected-source prompts and validated line-explanation export. All six packaged suites passed: native, focused, single-instance, large-input, legacy and assistance. The first three passed before a session interruption; the remaining three were rerun to recover reliable final output. Assistance now supports REA_TEST_EXE. Tests use local fixtures, not authenticated AI providers.

Latest large-input run: same 92,825,416-byte input, 256 functions, 10003 instructions, 1986ms open-to-result; 114 samples, sampled working-set peak 596127744 bytes and private peak 525856768 bytes, observed CPU 6281.25ms. Sampling limitations above still apply; no controlled speed comparison. Installer licensing inventory and clean-machine/upgrade acceptance remain pending. Installed app is unchanged.


## Decompiler package and installer — 2026-10-18

Rebuilt from desktop integration source186efa3 with the standalone decompiler worker. All seven packaged suites passed: native, focused safety, single instance, large-input navigation/export, legacy, assistance and real-Ghidra decompiler. The last verifies setup persistence, selected-function membership, cancellation/restart, saved pseudocode provenance and input replacement rejection. External Ghidra12.1.4 and Java25 were selected; neither tool is bundled. Python runtime is included with the worker.

Latest92,825,416-byte native fixture:256functions/10003instructions,1501ms open-to-result,40samples,648265728-byte working-set/566751232-byte private sampled peaks,3921.875ms observedCPU. Prior sampling caveats apply; not a controlled performance comparison.

Local installer:REA-Studio-Setup-1.2.0-x64.exe,213502105bytes,SHA256 ff4feace816852d906db74eac712f2e928b8d807e4cf5c46ce19c7840b43ff22. Authenticode statusNotSigned. Extracted nested payload archive passed7-Zip integrity verification; selected app.asar/worker/Java-script/root-notice hashes matched the tested package. This does not verify installation, upgrade or shortcuts. Evidence verification/installer-1.2-payload/verification.json. Existing installation unchanged; source/attribution review gaps remain documented separately.
