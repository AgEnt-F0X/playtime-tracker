# 🎮 PlayTime Tracker

[![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-blue.svg)](https://microsoft.com/windows)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/electron-36.0-47848F.svg)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **A premium, lightweight, and private game activity and playtime tracker for Windows.**  
> Automatically detects running games, tracks active play sessions, pauses during idle/AFK states, and offers an ultra-low memory background mode.

---

## ✨ Features

- **🎯 Precision Active Window Tracking**:
  - Native Win32 C# polling engine (`tracker.exe`) detects foreground processes via `GetForegroundWindow` and `GetModuleFileNameEx`.
  - Zero heavy hooks, zero injected DLLs, safe and anti-cheat friendly.

- **💤 Intelligent AFK / Idle Detection**:
  - Tracks user input idle time using `GetLastInputInfo`.
  - Automatically pauses playtime when you step away from your keyboard or controller.
  - Manual AFK toggle via global hotkey (`Ctrl+Shift+F9`) or system tray menu.

- **🪟 Ultra-Low Memory Background Mode**:
  - When closing or minimizing the app window, the Electron renderer is completely unloaded to free system RAM.
  - Tracking continues silently in the background with negligible CPU and RAM overhead.
  - Re-opens instantly with a single click on the system tray icon.

- **🕹️ Automatic Library Discovery & Game Management**:
  - Scans and detects installed games from **Steam** and **Epic Games Launcher**.
  - Supports manual game adding with custom executable paths and automated cover art lookup.
  - Customizable cover art and game metadata.

- **📊 Comprehensive Session History & Analytics**:
  - View total hours played, daily breakdowns, and recent session logs.
  - Search and filter games by platform, status, and playtime.

- **🔒 100% Offline & Private**:
  - All data is stored locally in `%USERPROFILE%\.playtime-tracker\db.json`.
  - No external telemetry, accounts, or cloud dependencies required.

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Windows Desktop Environment                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
┌──────────────┐        ┌──────────────────┐        ┌─────────────────┐
│ tracker.exe  │        │     main.js      │        │    server.js    │
│  (C# Win32)  │───────▶│ (Electron Shell) │◀──────▶│ (Express Engine)│
│              │ stdout │                  │  HTTP  │                 │
│ • Foreground │ (JSON) │ • System Tray    │  3000  │ • Library Scan  │
│ • AFK detect │        │ • Global Hotkeys │        │ • Session Log   │
│ • Path Query │        │ • Window Manager │        │ • Local DB JSON │
└──────────────┘        └────────┬─────────┘        └────────┬────────┘
                                 │                           │
                                 └─────────────┬─────────────┘
                                               ▼
                                    ┌─────────────────────┐
                                    │    Renderer (Web)   │
                                    │  HTML5 / CSS3 / JS  │
                                    │ Sleek Dashboard UI  │
                                    └─────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Windows 10 / 11 (64-bit)**
- **Node.js** (v18 or newer)
- **.NET Framework 4.5+** (preinstalled on modern Windows)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AgEnt-F0X/playtime-tracker.git
   cd playtime-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch the application**:
   ```bash
   npm start
   ```

---

## 🖥️ Standalone Desktop Launcher & Shortcut

To compile the C# launcher and create a desktop shortcut:

1. Run the provided PowerShell script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\create_shortcut.ps1
   ```
2. A shortcut named **PlayTime Tracker** with a custom gamepad icon will be placed directly onto your Windows Desktop. Double-clicking it launches the tracker seamlessly.

### Manual Compilation (Optional)

If you modify `tracker.cs` or `launcher.cs`, you can recompile them using Microsoft .NET C# Compiler (`csc.exe`):

```powershell
$Csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

# Compile background tracker
& $Csc /target:exe /out:tracker.exe tracker.cs

# Compile GUI launcher
& $Csc /target:winexe /r:System.Windows.Forms.dll /out:PlayTimeTracker.exe launcher.cs
```

---

## ⌨️ Shortcuts & Controls

| Shortcut / Action | Function |
| :--- | :--- |
| **`Ctrl + Shift + F9`** | Toggle AFK status manually |
| **Click Tray Icon** | Open / Restore dashboard window |
| **Right-Click Tray Icon** | Access context menu (Resume, AFK, Show, Quit) |
| **Window Close (`X`)** | Minimizes and unloads renderer into system tray |

---

## 🗄️ Data Storage

PlayTime Tracker keeps all your statistics safe locally:
- **Location**: `C:\Users\<YourUser>\.playtime-tracker\db.json`
- **Data Saved**: Tracked games, session timestamps, accumulated playtime, dismissed apps, and user settings.
- Automatically persists every 30 seconds and cleanly on process exit.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
