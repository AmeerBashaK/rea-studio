# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    $workerPython=Join-Path $PSScriptRoot '../native-engine/.venv/Scripts/python.exe'
    & $workerPython -B -m unittest discover -s . -v
    if($LASTEXITCODE -ne 0){throw 'Decompiler tests failed.'}
    & $workerPython -m PyInstaller --noconfirm --onedir --name studio-decompiler --distpath ../desktop-resources --workpath build --specpath . --add-data "$PSScriptRoot/StudioDecompile.java;." worker.py
    if($LASTEXITCODE -ne 0){throw 'Decompiler packaging failed.'}
    $workerOutput=Join-Path $PSScriptRoot '../desktop-resources/studio-decompiler'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../LICENSE') -Destination (Join-Path $workerOutput 'STUDIO-DECOMPILER-LICENSE.txt')
    $pyinstallerNotice=& $workerPython -c 'from importlib.metadata import distribution; d=distribution("pyinstaller"); print(d.locate_file(next(p for p in d.files if str(p).endswith("licenses/COPYING.txt"))))'
    if($LASTEXITCODE -ne 0){throw 'PyInstaller notice lookup failed.'}
    Copy-Item -LiteralPath $pyinstallerNotice -Destination (Join-Path $workerOutput 'PYINSTALLER-COPYING.txt')
    $pythonBase=& $workerPython -c 'import sys; print(sys.base_prefix)'
    if($LASTEXITCODE -ne 0){throw 'Python notice lookup failed.'}
    Copy-Item -LiteralPath (Join-Path $pythonBase 'LICENSE.txt') -Destination (Join-Path $workerOutput 'PYTHON-LICENSE.txt')
} finally { Pop-Location }
