# Studio Native 0.1 â€” measured preview

A subscription-free static Windows PE analysis worker, independent of REA's Ghidra/IDA providers. Supports native x86 and x64 EXE/DLL inputs. Built with Capstone 5.0.9 and pefile 2024.8.26; the distributable includes its Python runtime and does not require Python on the user's PC.

## Implemented

- Validated raw section mappings, architecture, image base and entry point.
- Imports, exports, ASCII/UTF-16 strings and x64 runtime-function seeds.
- Recursive instruction discovery, direct calls and branches, basic blocks and operand-derived references, including IAT import labels.
- Hexadecimal address strings preserve 64-bit values across the desktop boundary.
- Explicit unresolved indirect targets and analysis-budget reporting.
- Independent CLI: `studio-native.exe "C:\path\app.exe"` returns JSON; progress uses stderr.

## Coverage

All results are conservative and partial. Function candidates are not a complete source-function inventory. Jump tables, C++ types, exception edges, packed or self-modifying code, indirect-call resolution, and decompilation are not implemented. Managed PE files are rejected with a route to the .NET workflow. Input executables are read as bytes, never loaded or run.

Limits: 128 MB input, 96 sections, 8,192 function seeds, 4,096 imports/exports, 2,000 strings, 2,048 instructions per function. Default discovery: 256 candidates, 20,000 total instructions, 30 seconds. CLI budgets can be raised to 512 candidates, 40,000 instructions and 60 seconds. The desktop enforces a 90-second worker timeout and 32 MB output cap. Boundaries that stop recovery are reported, not represented as absence.

## Reproduce

Create `.venv` using Python 3.12, install `requirements.txt`, and run `build.ps1`. It runs 15 tests and packages the worker into `../desktop-resources/studio-native`, including runtime and licenses. The tests include 60 seeded header mutations; they are a regression corpus, not exhaustive fuzzing.

`benchmark.py` measures three fresh-worker invocations per target and writes `../verification/native-benchmark.json`. OS caches are not controlled. The report separates worker analysis time, worker CPU time, peak worker working set and end-to-end process time. It does not measure the Electron UI process family or compare against commercial engines.

Desktop tests: `node desktop/native-smoke-test.cjs` from the workspace root (or `node native-smoke-test.cjs` from `desktop`). Known fixture files in `verification` are generated from `test_engine.fixture` and must exist first.

## Next engineering priorities

On-demand function analysis and paged project storage; fuller metadata-based seed recovery; differential decoder testing; reproducible compiler-generated corpora; a structured graph layout; a separately tested decompilation backend and explicit debugger subsystem. These remain work, not shipped capabilities.

## License

Original Studio Native code is AGPL-3.0-only. See LICENSE and ../LICENSING.md. Dependencies retain their original licenses.

## Focused analysis (source development)

The Python worker accepts `--address HEX_VIRTUAL_ADDRESS --expected-sha256 ORIGINAL_HASH` to decode one candidate beyond the initial discovery budget. Obtain the hash from the original result's `subject.sha256`. A changed file, missing hash, or address outside executable file-backed bytes is rejected. The requested address is a candidate, not a proven function boundary.

Focused results identify their scope and skip string scanning. Calls produce references and seeds without decoding additional functions. The bounded `seeds` inventory reports whether each candidate was analyzed in this run. The full file is still read and hashed, and PE metadata is parsed; this is not a persistent cache.

The development desktop exposes these additions through Analyze address and has been tested against a rebuilt worker. The installed 1.1.0 application has not been upgraded. All 20 source regression tests pass, including focused x86/x64 decoding, input replacement, hash and mapping validation, and call-following boundaries.

## Independent decoder checks

Install `requirements-test.txt` in the development virtual environment and run `python -m unittest test_engine test_differential -v` from this directory. The test-only iced-x86 1.21.0 dependency independently checks decoded instruction boundaries, direct branch/call targets, unresolved indirect targets, return successors, and emitted IP-relative memory references. It is not used by the production worker.

The differential suite covers the x86/x64 call fixtures, 80 deterministic arithmetic/short-branch programs (880 instructions), indirect/IP-relative examples, and retained instructions from Windows kernel32.dll when available. The Windows case is explicitly skipped on other hosts. CI installs the test dependency and runs both suites. Reference: [iced-x86 Python package and API examples](https://pypi.org/project/iced-x86/).

Agreement between two decoders does not establish complete function recovery, execution semantics, or resistance to obfuscation. The corpus is not exhaustive. Compiler-generated optimization variants are covered by the separate optional suite below.

## Compiler-generated corpus

Install `requirements-corpus.txt` to add the pinned development-only Zig/Clang 0.13.0 toolchain, then run `python -m unittest test_compiler_corpus -v`. The suite compiles `corpus/control_flow.c` for Windows x86 and x64 using the MSVC ABI at `-O0`, `-O2`, and `-Os`. It does not execute the outputs. Each build retains compiler version, complete flags, source hash and output hash under ignored `verification/compiler-*` directories. A separate CI job runs this suite.

Checks cover recovery of six known exported entries (arithmetic, branches/calls, loop, switch, indirect callback, entry), independent decoding of retained instructions, and unresolved indirect control flow. These fixtures do not establish semantic equivalence or complete optimized-code recovery. The compiler is never bundled with the application.

This corpus exposed Capstone 5's truncated UD0/UD1 trap decoding. Studio Native now stops those paths and records decode failures rather than emitting an incorrect boundary or following trap operand bytes as instructions. UD0/UD1 remain unsupported, not silently repaired. The full local native suite comprises 29 tests when corpus dependencies are installed.


### Desktop resource attribution

Run `node desktop/large-native-smoke-test.cjs` from the repository root for an isolated-profile large-input/navigation/reload/export check. The Windows sampler records process-tree totals plus per-process sampled working set/private bytes and kernel+user CPU deltas. CPU identities include process creation time to avoid combining reused PIDs. CPU deltas cover only first-to-last observation of each process: startup, final work and short-lived children can be missed. They are not CPU utilization or exact whole-session CPU totals. Per-process memory maxima occur at different times and must not be added as a simultaneous peak. Tree working sets can double-count shared pages. Reports under `verification/large-native-*` include the target hash; sampling starts after Electron launch and caches are uncontrolled.
