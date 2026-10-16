# REA Studio

A Windows desktop workspace with the independent Studio Native analysis engine and REA 6.5.0 workflows. Version 1.1.0 adds built-in PE x86/x64 assembly, function candidates, references, block graphs and saved analyst notes. This is not an official upstream REA GUI.

## Using the app

Open a folder for JavaScript applications, or a file for binary and artifact inspection. Choose a workflow and run it. Select files in the explorer for read-only source previews. Completed runs are retained under `%APPDATA%/REA Studio/analyses`. The evidence tab provides expandable JSON and filtering; Export JSON saves the complete engine output.

The command console accepts REA commands and quoted paths without invoking a shell. Enter a command and use Help for its supported arguments. Interactive setup, global updates and uninstall are excluded from this console; use the original REA CLI for those actions. Deep native analysis requires a separately configured provider. Source preview is read-only; this app is an investigation workspace, not a source-code editor or an AI chat client.

The desktop app bundles its own Node runtime, REA package, production dependencies, Windows native control addon and standalone Studio Native worker. Neither Node nor Python needs to be installed by the user. Optional external tools (Ghidra, IDA, Android tools, browsers, etc.) are not bundled. Targets remain local unless a user explicitly invokes a command with network or runtime side effects. Native projects and annotations are stored under `%APPDATA%/REA Studio/projects`, keyed by the binary SHA-256.

## Build

`npm ci`, followed by `node node_modules/electron/install.js`, installs development dependencies. `npm run package` creates `../release/REA Studio-win32-x64`. Packaging expects `../desktop-resources/engine` (REA production package and dependencies) and `../desktop-resources/runtime` (node.exe and LICENSE).

`node smoke-test.cjs` runs the desktop interaction checks. Set `REA_TEST_EXE` to test a packaged executable. Screenshots and exported test evidence go into `../verification`.

After verifying the app, build the installer with `npx electron-builder --prepackaged "../release/REA Studio-win32-x64" --win nsis --x64 --config installer.json --publish never`. The setup EXE is written to `../installers`. The installer is unsigned and includes an uninstaller; user analysis history is retained on uninstall.

## Limits

Source previews are limited to 1 MB, explorer listings to 400 entries, recent history to 50 runs, and captured output to 32 MB per run. The evidence tree displays bounded portions of large arrays; exported JSON retains the complete captured output. The Stop button terminates the command process tree; results show a stopped status. Engine errors remain visible, including provider prerequisites and partial evidence.

## Verification

Automated checks cover startup, file selection, explorer, source preview, real JavaScript analysis, Windows EXE artifact inspection, .NET metadata inspection, evidence filtering, JSON export, command help, invalid commands, missing-target error handling, cancellation, and saved history after reload. External native providers and every advanced REA command are not covered by those checks. The Linux-only ELF layout command remains in the advanced console, with its platform restriction reported by the engine.

## License

REA is MIT-licensed; its license and third-party notices are included in `resources/engine`. Electron licenses are included beside the executable; Node's license is in `resources/runtime`. Original REA Studio wrapper code is AGPL-3.0-only; see LICENSE and ../LICENSING.md. Third-party components retain their own licenses.

## Focused analysis (development source)

Enter a hexadecimal virtual address in the native workspace and choose **Analyze address**. The worker rechecks the original file hash and decodes one candidate. It creates a separate saved result with an **Open original analysis** link; previous evidence and notes remain intact. This can inspect executable bytes not retained in the first scan. It does not prove the address is a function boundary.

The focused result does not rescan strings. The installed 1.1.0 app does not include this feature yet. Large-project paging and combined revision browsing remain unfinished.

Choose **Show all discovered candidates** to browse the retained seed inventory, including entries not decoded in the current result. Lists display 100 entries per page and support search. Selecting an undecoded candidate fills the address field; Analyze address performs the explicit decode. Pagination limits visible rows, not the in-memory result or on-disk project size.

`node focused-smoke-test.cjs` uses a separate test profile and copied fixture to verify changed-file rejection, cancellation of the real worker, restart, original-result preservation, candidate selection, and reload. It requires the generated `verification/native-x64.exe` fixture and a rebuilt native worker. Test artifacts are saved under an ignored `verification/focused-*` directory.

## Result storage (development source)

New native results use a versioned manifest, one file per function, and reference chunks of 200 entries. The manifest is published after its parts are written, and raw stdout is not stored a second time alongside native evidence. Existing JSON-only history remains readable without rewriting it. Focused parent links and hash-keyed notes are preserved.

The main process exposes bounded function-summary, instruction, and reference pages (maximum 200 rows per request). Instruction paging currently reads one bounded function record; it does not load every function. Native exports stream the stored parts and replace the destination only after successful completion. The renderer now receives compact summaries, loads one bounded function at a time (up to the engine limit of 2,048 instructions), and pages related references in groups of 200. Evidence view explicitly shows a summary; Export JSON retains all evidence. Initial worker output is still buffered, and legacy files are parsed whole in the main process. Whole-app memory and larger analysis limits still require measurement.

Run `node --test result-store.test.cjs` to check old/new history, cross-chunk pages, export equality, incomplete records, invalid requests, and failed-export preservation. The test output directory `../verification` must exist.


On the local kernel32.dll sample (256 candidates, 9,907 instructions), the serialized full result was 3,630,431 bytes, versus a 738,879-byte summary and a 4,466-byte first-function response. These measure serialized payload size, not peak process memory or overall analysis speed. Results remain partial and capped.

## Larger-input desktop baseline

`node large-native-smoke-test.cjs` analyzes the installed Node executable in a separate profile, navigates the third candidate page, loads the last function, opens graph/reference views, returns to the first function, reloads history, and checks a full export. It runs `native-engine/sample_process_memory.py` to sample only that Electron process tree. Python 3.12 in the native-engine virtual environment and the rebuilt worker are prerequisites.

One local run on the 92,825,416-byte Node executable retained 256 candidates and 10,003 instructions. Analysis completion took 1,525 ms from the test's file-open action. Across 61 samples, the maximum observed sum was 814,641,152 bytes working set and 703,619,072 bytes private memory, with up to seven processes. Sampling requests a 100 ms interval and begins after Electron launches; it can miss short-lived processes and exact peaks. Shared pages can be counted multiple times in summed working sets. This is one development-build baseline with uncontrolled caches, not a before/after comparison or a claim of whole-binary recovery. Results are saved under ignored `verification/large-native-*` folders.
