# Third-party components

The root AGPL grant applies to original REA Studio material, not to these components.

| Component | Role | License / source |
| --- | --- | --- |
| REA, morluto | Optional analysis workflows; pinned submodule | MIT; [upstream](https://github.com/morluto/rea), see `rea/LICENSE` and its third-party notices |
| Capstone 5.0.9 | Instruction decoding | BSD-style terms; license shipped in the installed package and copied by `native-engine/build.ps1` |
| pefile 2024.8.26 | PE parsing | MIT; license shipped in the installed package and copied by the native build |
| Python | Native worker runtime | Python license and bundled third-party notices; copied by the native build |
| PyInstaller | Native worker packaging | GPL with bootloader exception; see the installed distribution's notices |
| Electron | Desktop runtime | MIT plus bundled Chromium and other third-party notices |
| Node.js | Packaged REA runtime | Node.js license and bundled third-party notices |

Dependency versions are recorded in `desktop/package-lock.json`, `native-engine/requirements.txt`, and the pinned upstream repository. Their individual licenses remain applicable. This table is an overview, not a substitute for the full notices of every transitive dependency.

Public binary releases must include the original license files and required source/notices for bundled components. Do not assume that the root AGPL license replaces dependency obligations or retroactively changes upstream licenses.
