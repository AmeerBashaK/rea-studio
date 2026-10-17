# REA Studio

A community-oriented Windows reverse-engineering workspace with a local x86/x64 disassembler, an IDE-style desktop interface, and optional REA workflows. Everyone is welcome to use, test, report problems, and contribute improvements.

**Early development preview, not an IDA Pro replacement.** Native analysis currently covers Windows PE files, with conservative function discovery, assembly, references, strings, block cards, and saved function names and notes. Decompilation, debugging, large-project storage, and connected graph layouts remain unfinished. Analysis defaults to 256 function candidates; results explicitly report limits.

Our native analysis needs no paid subscription, IDA, or Ghidra. Optional upstream REA workflows can require separate tools or providers.

## License and community intent

Original REA Studio code is licensed under **GNU AGPL version 3 only (`AGPL-3.0-only`)**, with no alternative MIT license. See [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md).

The intent is to keep shared improvements available to their users. Companies receive the same AGPL rights and obligations as everyone else. Distributed covered derivatives must provide corresponding source under the AGPL; modified versions used over a network must offer corresponding source to their remote users. Private internal changes are not automatically subject to a public-publication requirement.

Third-party components retain their own licenses. Upstream REA is MIT-licensed and is included as a pinned submodule, not relicensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Try the native engine

On Windows, install Git and Python 3.12, then run from PowerShell:

```powershell
git clone --recurse-submodules https://github.com/AmeerBashaK/rea-studio.git
cd rea-studio
py -3.12 -m venv native-engine/.venv
native-engine/.venv/Scripts/python.exe -m pip install -r native-engine/requirements.txt
native-engine/.venv/Scripts/python.exe native-engine/engine.py 'C:\path\sample.exe'
```

The native worker reads the target as bytes; it does not execute it. Its output is JSON. Use your own binaries or the generated test fixtures; do not submit confidential binaries in issues.

## Test and develop

```powershell
cd native-engine
.venv/Scripts/python.exe -m unittest test_engine -v
cd ..
```

For the desktop interface, install Node.js 24.19 or another version supported by upstream REA, build the native worker, and install/build the pinned upstream source:

```powershell
./native-engine/build.ps1
cd rea
npm ci
npm run build
cd ../desktop
npm ci
node node_modules/electron/install.js
npm start
```

The development desktop currently expects Node at `C:\Program Files\nodejs\node.exe`. Upstream native-provider workflows may need additional setup. See [desktop/README.md](desktop/README.md) and [native-engine/README.md](native-engine/README.md) for details.

## Packaging status

This repository publishes source and build scripts. The previous local Windows 1.1.0 installer predates this AGPL publication and is not uploaded as an AGPL release. A public installer will follow verification of the packaging, corresponding-source distribution, and bundled dependency notices. Packaging currently also requires the resource staging described in the desktop README; a fully automated clean-checkout installer build is still work in progress.

## Help improve it

Read [CONTRIBUTING.md](CONTRIBUTING.md). Report reproducible failures, improve documentation, add tests, or work on the [roadmap](PRODUCT-ROADMAP.md). No paid account is required to use the native engine. Performance and correctness claims should include reproducible evidence; existing tests do not establish parity with commercial tools.


## English explanations and local AI tools (development source)

The assembly table includes a plain-English instruction glossary. Evidence leaf fields include explanatory notes. **Export explained JSON** creates `rea-explained/1`: original `evidence` plus an `explained` copy with `_rea_explanation` and `_rea_fields` entries. JSON remains valid; ordinary raw export is unchanged. This is a limited offline glossary, not source-code translation or recovery of program intent. Unsupported instructions and unknown fields are explicitly described as unknown/context-dependent. Explained export currently reconstructs the saved result in memory.

The **AI tools** tab saves up to 20 local CLI profiles: name, absolute `.exe` path, and an argument array. Use a tool’s non-interactive mode that reads the prompt from stdin and exits. For Node-based CLIs select `node.exe` with the CLI script path as the first argument. Install/authenticate using the provider’s normal process first; REA does not install tools or store API keys. Only the entered prompt is supplied; selected native function evidence can be appended explicitly. Target content is marked untrusted data, but this is not a sandbox or a guarantee against prompt injection.

Each launch shows the executable/arguments and requires Run tool confirmation. The CLI runs with the user’s Windows permissions in a dedicated `agent-work` directory, may change files or contact its provider, and retains its own approval behavior. No automatic approval flags are inserted. Output is capped at 2 MB; runtime at five minutes; Stop terminates the launched process tree. Interactive terminal sessions and automatic CLI discovery are not supported. Agent output is displayed as unverified text, separately from saved evidence. Provider subscriptions/charges, if any, remain the user’s choice.

Validation: local controlled stdin/output CLI, cancellation, restart, spawn failure, output limits, profile persistence, explained JSON and native workflow regression. Individual commercial AI providers have not been certified by these tests.


Instruction glossary v2 names operands for common data movement, arithmetic, stack operations and control transfers. Supported conditional branches describe their actual flag/register test; they do not assume a preceding comparison or infer a business rule. Memory reads and address calculation are distinguished. These are partial explanations rather than a complete semantics engine (width-dependent effects and exceptional behavior are not exhaustively modeled). Reference: [Intel instruction-set manuals](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html).


In Source preview, select text and choose **Explain selected lines with AI**. REA expands the selection to whole lines, preserves original line numbers and prepares a prompt in AI tools requesting a section summary and explanation of every line. Review it and click Run agent to send it to your configured CLI. Nothing runs or sends automatically. The selected snippet is limited to 20,000 characters; this does not limit binary input size. AI explanations remain unverified and are not merged into the original evidence/export automatically.
