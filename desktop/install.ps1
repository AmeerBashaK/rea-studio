# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference = 'Stop'
$bundle = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\release\REA Studio-win32-x64'))
$destination = Join-Path $env:LOCALAPPDATA 'Programs\REA Studio'
if (-not (Test-Path -LiteralPath (Join-Path $bundle 'REA Studio.exe'))) { throw 'Build the desktop app before installing.' }
if (Test-Path -LiteralPath $destination) { throw "An installation already exists at $destination. No files were overwritten." }
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -Path (Join-Path $bundle '*') -Destination $destination -Recurse
$exe = Join-Path $destination 'REA Studio.exe'
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $linkPath = Join-Path $folder 'REA Studio.lnk'
    if (Test-Path -LiteralPath $linkPath) { throw "A shortcut already exists at $linkPath. It was not overwritten." }
    $shortcut = $shell.CreateShortcut($linkPath)
    $shortcut.TargetPath = $exe
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Description = 'Local reverse-engineering workspace powered by REA'
    $shortcut.Save()
}
[PSCustomObject]@{Executable=$exe;Desktop=(Join-Path ([Environment]::GetFolderPath('Desktop')) 'REA Studio.lnk');StartMenu=(Join-Path ([Environment]::GetFolderPath('Programs')) 'REA Studio.lnk')} | ConvertTo-Json
