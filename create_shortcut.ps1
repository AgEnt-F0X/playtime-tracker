$AppDir = $PSScriptRoot
if (-not $AppDir) {
    $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $AppDir) {
    $AppDir = (Get-Location).Path
}

$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$LauncherCs = Join-Path $AppDir "launcher.cs"
$LauncherExe = Join-Path $AppDir "PlayTimeTracker.exe"

# 1. Compile launcher
Write-Host "Compiling launcher..."
& $CscPath /target:winexe /r:System.Windows.Forms.dll /out:$LauncherExe $LauncherCs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to compile launcher"
    exit $LASTEXITCODE
}
Write-Host "Launcher compiled successfully at $LauncherExe"

# 2. Create Desktop Shortcut
Write-Host "Creating Desktop Shortcut..."
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$ShortcutPath = Join-Path $DesktopPath "PlayTime Tracker.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherExe
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = "PlayTime Tracker - Premium Desktop Game Tracker"

# Set a nice icon (imageres.dll index 27 is the gamepad/controller icon)
$IconPath = "C:\Windows\System32\imageres.dll"
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = "$IconPath, 27"
} else {
    $Shortcut.IconLocation = "C:\Windows\System32\shell32.dll, 172"
}

$Shortcut.Save()
Write-Host "Shortcut created successfully at $ShortcutPath"
