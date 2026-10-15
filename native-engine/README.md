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
