# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    & .\.venv\Scripts\python.exe -m unittest test_engine -v
    if($LASTEXITCODE -ne 0){throw 'Engine tests failed.'}
    & .\.venv\Scripts\python.exe -m PyInstaller --noconfirm --onedir --name studio-native --distpath ../desktop-resources --workpath build --specpath . --collect-all capstone engine.py
    if($LASTEXITCODE -ne 0){throw 'Native worker packaging failed.'}
    $output=Join-Path $PSScriptRoot '..\desktop-resources\studio-native'
    Copy-Item (Join-Path $PSScriptRoot 'LICENSE') (Join-Path $output 'STUDIO-NATIVE-LICENSE.txt')
    Copy-Item '.venv\Lib\site-packages\capstone-5.0.9.dist-info\LICENSE.TXT' (Join-Path $output 'CAPSTONE-LICENSE.txt')
    Copy-Item '.venv\Lib\site-packages\pefile-2024.8.26.dist-info\LICENSE' (Join-Path $output 'PEFILE-LICENSE.txt')
    $pyinstallerNotice=& .\.venv\Scripts\python.exe -c 'from importlib.metadata import distribution; d=distribution("pyinstaller"); print(d.locate_file(next(p for p in d.files if str(p).endswith("licenses/COPYING.txt"))))'
    if($LASTEXITCODE -ne 0){throw 'PyInstaller license lookup failed.'}
    Copy-Item -LiteralPath $pyinstallerNotice -Destination (Join-Path $output 'PYINSTALLER-COPYING.txt')
    $pythonBase=& .\.venv\Scripts\python.exe -c 'import sys; print(sys.base_prefix)'
    Copy-Item (Join-Path $pythonBase 'LICENSE.txt') (Join-Path $output 'PYTHON-LICENSE.txt')
} finally { Pop-Location }
