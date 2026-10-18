# REA Studio 1.2 dependency review — 2026-10-18

This records observed packaging facts, not a complete legal assessment.

The accepted Windows package contains 172 installed npm manifest entries. All exact package/version pairs occur in the upstream runtime-notice inventory. The audit does not inspect embedded binary libraries or establish sufficiency of notices or source delivery.

Original release root-directory listings were checked using GitHub's API:

- [clean-git-ref release revision](https://api.github.com/repos/TheSavior/clean-git-ref/contents?ref=bf3c8afc8032bcdc6a53634c18b601dc6df478fb): 10 entries, no standalone LICENSE/COPYING/NOTICE filename.
- [minimisted release revision](https://api.github.com/repos/kt3k/minimisted/contents?ref=95fdfb8d6efb9546c1117854fe3a58105f6332ce): 9 entries, no standalone LICENSE/COPYING/NOTICE filename.
- [frida-node 17.23.2](https://api.github.com/repos/frida/frida-node/contents?ref=17.23.2): 21 entries, no standalone LICENSE/COPYING/NOTICE filename.

These checks confirm the recorded root-directory gaps, not absence of all attribution everywhere in the repositories. Keep upstream supplemental texts and gap statements unchanged. Do not invent copyright holders or treat a generic license template as recovered original attribution.

Native worker includes original Studio AGPL, Capstone, pefile, Python and PyInstaller COPYING notices. PyInstaller notice copies match the installed distribution SHA256 0598064c7d2718e38d7914a7d08343b2fa008e3beA9ebba2aa7a6ffa5900dd64 (case-insensitive hex). Packaging checks the five native notice files exist and are nonempty. Electron/Chromium and Node notices remain with their runtimes. Top-level THIRD_PARTY_NOTICES.md is now an explicit extra resource, preserving the overview outside app.asar.

Before public binary release: inspect actual embedded native addon/prebuilt components, prepare corresponding source/build material for the exact original-code revision and applicable dependencies, and record installer hashes. Known gaps remain open; clean-machine and upgrade acceptance remain pending. Local installer preparation may continue alongside this review, but do not claim distribution compliance is fully verified.
