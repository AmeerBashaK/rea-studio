# REA Studio independent analysis engine

Status: design with a first implementation milestone in progress. REA Studio 1.1.0 adds a Capstone/pefile-based native worker and native analysis workspace; see RELEASE-1.1.0.md for verified capabilities. The original C++/Zydis implementation below is a design alternative, not the shipped implementation. Decompilation and debugging remain later milestones.

## Objective

Make native Windows executable analysis work out of the box without an IDA license, Hopper license, Ghidra installation, subscription, account, or paid API. Reuse free open-source components where they solve foundational problems, and own the analysis pipeline and user experience. Initial target: native x86 and x64 Windows PE EXE/DLL files on an x64 Windows host.

This is an independent analysis backend, not a claim that a first release will equal every capability of IDA, Ghidra, a debugger, and a decompiler. These are different systems. Decompilation reconstructs plausible logic; it cannot reliably restore original names, comments, source formatting, or information discarded by compilation.

## Product architecture

```text
REA Studio desktop UI
  ├─ Project explorer / functions / strings / imports
  ├─ Assembly / hex / control-flow graph / evidence
  ├─ Renames, comments, bookmarks and navigation history
  └─ Optional pseudocode and debugger panes in later releases
                 |
Desktop analysis controller — versioned, bounded messages
                 |
  ├─ Studio Native worker: independent static analysis
  │    ├─ PE loader and address mapping
  │    ├─ Zydis instruction decoder
  │    ├─ Code discovery and control-flow analysis
  │    └─ References, symbols and function summaries
  ├─ Existing REA adapter: JavaScript, .NET and specialized tools
  └─ Future decompiler / debugger workers
                 |
Local project database + original input hash + user annotations
```

The native worker is a separate C++20 executable with Zydis linked into it. It is bundled in the Windows installer. The existing Electron UI calls the worker through the desktop main process, never directly from page JavaScript. REA remains available as an optional backend for its existing workflows; native disassembly must function when REA providers are unconfigured.

Zydis decodes x86/x64 instructions. It is not a ready-made decompiler or function-recovery engine. Those higher-level capabilities must be implemented and evaluated separately. Capstone is an alternative when additional processor architectures become a real requirement; using two decoders in production initially adds unnecessary complexity.

## First complete release: native disassembler

### File understanding

- Recognize PE32 and PE32+ and validate architecture, offsets, sizes and section mappings.
- Display entry point, sections, imports, exports, relocations, executable ranges and ASCII/UTF-16 strings.
- Keep file offsets, relative virtual addresses and virtual addresses as distinct typed values. Show which representation every address uses.
- Parse without loading the DLL or starting the EXE. Treat virtual zero-filled regions separately from bytes present in the file.
- Recognize managed PE files and route them to the .NET workflow rather than interpreting their metadata as native instructions.
- Detect unsupported or truncated structures and retain valid partial observations with explicit errors.

### Instruction and function analysis

- Start from documented entry points, exports and valid unwind-function ranges; record where each seed came from.
- Decode basic blocks through direct branches and fallthrough, with visited-address tracking and instruction-boundary checks.
- Follow direct calls as candidate function entries. Keep indirect calls unresolved until there is evidence for a target.
- Distinguish confirmed metadata boundaries from inferred function starts and speculative code/data interpretations.
- Build a control-flow graph for discovered functions and a separate graph of resolved calls. Tail calls, shared blocks and overlapping interpretations remain explicit.
- Recognize simple import-thunk and RIP-relative references; attach the exact supporting instruction and bytes.
- Offer manual disassembly at a chosen address separately from automatic reachable-code discovery.

### Analyst workspace

- Address navigation, assembly with original bytes, synchronized hex view and clickable direct targets.
- Functions, imports, exports and strings panes, with search and references.
- A graph view that loads one function at a time.
- User renames, comments, bookmarks and project persistence. Preserve generated names alongside analyst names.
- Read-only input files. A future patch editor must write an explicit new output, not silently alter the analyzed original.
- Export JSON and assembly text containing file identity, engine version, coverage and limitations.

## Local contract and project model

Requests carry protocol version, request ID, operation, input identity and bounded options. Initial operations: `open`, `inventory`, `disassemble`, `functions`, `references`, `graph`, `cancel`, and `close`. Results are paginated; progress and diagnostics are separate message types. Every request has one terminal result.

Addresses are encoded as hexadecimal strings, not JavaScript numbers, to avoid losing 64-bit precision. Instructions include address, file offset when mapped, size, original bytes, mnemonic, structured operands and branch classification. Graph edges distinguish call, fallthrough, conditional branch and unresolved indirect transfer.

The project database records SHA-256, file size, architecture, image base, worker version and analysis options. Reopening a changed file creates a new analysis revision. Annotation transfer between revisions requires an explicit mapping; it is not silently applied by address alone. Input bytes are not embedded in exported reports by default beyond evidence slices selected for those reports.

All analysis artifacts identify whether a fact came directly from bytes, declared file metadata, a deterministic derivation, a heuristic, or a user annotation. A function list is a discovered set, not a claim that every function has been recovered.

## Decompiler: separate development stage

A useful decompiler requires much more than replacing assembly words with C syntax:

1. Lift supported instructions into an intermediate representation with precise register, flags, memory and integer-width semantics.
2. Build data flow and SSA form; recover stack variables and calling conventions for a documented subset.
3. Simplify expressions while preserving side effects, aliasing and arithmetic behavior.
4. Structure branches and loops where justified; preserve explicit jumps when restructuring is uncertain.
5. Emit C-like pseudocode linked back to instructions and unresolved operations.

The initial decompiler scope should be ordinary scalar arithmetic, comparisons, branches, loops and direct calls in small x64 functions. Complex C++ types, exceptions, SIMD, obfuscation and indirect dispatch are later work. Unsupported instructions must remain explicit; an AI-generated guess is not accepted as a recovered instruction semantic.

An optional bundled Ghidra backend could provide richer free decompilation sooner, but that is a distinct product choice. It would be subscription-free, yet not an independently implemented decompiler. The independent backend must remain usable without it.

## Debugger: separate execution mode

Static disassembly does not provide live registers, memory, stepping or runtime unpacking. A later Windows debugger worker can use the Windows debugging interfaces for explicit launch/attach, breakpoints, stepping, module tracking and register/memory views. The interface must visibly distinguish static inspection from a session that executes a target. Attach/detach and owned-process cleanup need their own tests.

Kernel debugging, protected processes and automatic unpacking are outside the initial debugger scope. A disassembler alone cannot generally recover code that is only decrypted during execution.

## Reliability and acceptance tests

- Compile fixtures with known functions, imports, branches, calls and optimization levels; compare decoded instruction lengths and operands against an independent decoder as a differential check.
- Verify branch arithmetic, image-base relocation, unmapped addresses, signed displacements, truncated instructions and overlapping sections with exact expected outputs.
- Fuzz the loader and message parser. Bound input-derived allocations, graph growth, recursion, worker memory and elapsed time. Keep the UI responsive and cancellation effective.
- Verify that malformed files produce usable errors, not a crashed desktop or fabricated complete results.
- Test target replacement during a run, project reopening, annotation persistence and installer use on a machine with no development tools.
- For a future decompiler, compare the supported lifted semantics against small controlled executable fixtures. Compilation of emitted pseudocode alone is not proof of equivalence.

Release acceptance for the first native engine: open a known x86 or x64 PE fixture, inspect sections/imports/strings, navigate decoded instructions, follow a resolved call, view a function graph, save a rename, reopen it, export evidence, and cancel a large analysis. The same sequence must work with no Ghidra, IDA or other native provider installed.

## Delivery order

1. PE loading and x86/x64 assembly, integrated into the existing desktop UI.
2. Function discovery, references, graph navigation and persistent analyst projects.
3. A tested decompiler subset, with clearly reported coverage.
4. A Windows debugger and broader instruction/format coverage.

Package an installer after each verified release. Do not advertise a decoder-only build as a complete decompiler, or a narrow decompiler as full IDA replacement. Establish time and memory baselines on fixed fixtures before promising performance.

## Sources and component choices

- [Zydis](https://github.com/zyantific/zydis): open-source x86/x64 decoding library and primary proposed decoder.
- [Capstone](https://www.capstone-engine.org/): alternative disassembly framework for later multi-architecture needs.
- [Ghidra](https://github.com/NationalSecurityAgency/ghidra): a free, open-source analysis suite, useful as an optional backend and independent comparison tool.
- [LIEF](https://lief.re/): a possible executable-format parsing alternative; this design does not depend on its commercial extended capabilities.
- Current integration boundary: `desktop/main.cjs` spawns REA through Node. Introduce an explicit backend controller alongside that path rather than masquerading as an existing REA provider.
