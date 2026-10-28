using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Reflection;

[assembly: AssemblyTitle("PlayTime Tracker Native Monitor")]
[assembly: AssemblyDescription("PlayTime Tracker Foreground & AFK Monitor")]
[assembly: AssemblyCompany("PlayTime Tracker")]
[assembly: AssemblyProduct("PlayTime Tracker")]
[assembly: AssemblyCopyright("Copyright © 2026")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]
[assembly: AssemblyInformationalVersion("1.1")]

class ActiveTracker {
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    [DllImport("psapi.dll")]
    static extern uint GetModuleFileNameEx(IntPtr hProcess, IntPtr hModule, StringBuilder lpFilename, int nSize);

    // AFK Detection
    [DllImport("user32.dll")]
    static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    static extern uint GetTickCount();

    [StructLayout(LayoutKind.Sequential)]
    struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    const uint PROCESS_QUERY_INFORMATION = 0x0400;
    const uint PROCESS_VM_READ = 0x0010;

    static uint GetIdleTimeMs() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (GetLastInputInfo(ref lii)) {
            return GetTickCount() - lii.dwTime;
        }
        return 0;
    }

    static string GetProcessPath(uint pid) {
        IntPtr hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProcess != IntPtr.Zero) {
            StringBuilder sb = new StringBuilder(1024);
            if (GetModuleFileNameEx(hProcess, IntPtr.Zero, sb, sb.Capacity) > 0) {
                CloseHandle(hProcess);
                return sb.ToString();
            }
            CloseHandle(hProcess);
        }
        
        try {
            using (Process p = Process.GetProcessById((int)pid)) {
                return p.MainModule.FileName;
            }
        } catch {
            return "";
        }
    }

    static void Main() {
        IntPtr lastHwnd = IntPtr.Zero;
        string lastProcessName = "";
        
        while (true) {
            try {
                IntPtr hwnd = GetForegroundWindow();
                uint pid = 0;
                if (hwnd != IntPtr.Zero) {
                    GetWindowThreadProcessId(hwnd, out pid);
                }

                uint idleMs = GetIdleTimeMs();

                // Report on window change OR periodically (every second) for idle tracking
                if (pid > 0) {
                    string processName = "";
                    string path = "";
                    string title = "";

                    try {
                        using (Process p = Process.GetProcessById((int)pid)) {
                            processName = p.ProcessName;
                        }
                    } catch {}

                    bool windowChanged = (hwnd != lastHwnd);
                    
                    if (windowChanged) {
                        lastHwnd = hwnd;
                        lastProcessName = processName;
                        path = GetProcessPath(pid);

                        StringBuilder titleBuilder = new StringBuilder(512);
                        GetWindowText(hwnd, titleBuilder, titleBuilder.Capacity);
                        title = titleBuilder.ToString();
                    }

                    // Always output: includes idleMs for AFK detection
                    string json = string.Format(
                        "{{\"pid\":{0},\"processName\":\"{1}\",\"title\":\"{2}\",\"path\":\"{3}\",\"idleMs\":{4},\"windowChanged\":{5}}}",
                        pid,
                        EscapeJson(windowChanged ? processName : lastProcessName),
                        EscapeJson(title),
                        EscapeJson(path),
                        idleMs,
                        windowChanged ? "true" : "false"
                    );
                    Console.WriteLine(json);
                }
            } catch (Exception) {
                // Ignore errors and keep running
            }
            Thread.Sleep(1000); // Poll every second
        }
    }

    static string EscapeJson(string str) {
        if (string.IsNullOrEmpty(str)) return "";
        return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
    }
}
