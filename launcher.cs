using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("PlayTime Tracker")]
[assembly: AssemblyDescription("PlayTime Tracker - Premium Game Activity & Session Tracker")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("PlayTime Tracker")]
[assembly: AssemblyProduct("PlayTime Tracker")]
[assembly: AssemblyCopyright("Copyright © 2026")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]
[assembly: AssemblyInformationalVersion("1.1")]

class Program
{
    [STAThread]
    static void Main()
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string electronExe = Path.Combine(appDir, @"node_modules\electron\dist\electron.exe");
        
        if (!File.Exists(electronExe))
        {
            MessageBox.Show(
                "PlayTime Tracker could not find the Electron runtime.\n\nPlease make sure to run 'npm install' inside:\n" + appDir,
                "PlayTime Tracker - Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = electronExe;
        startInfo.Arguments = ".";
        startInfo.WorkingDirectory = appDir;
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = true;

        try
        {
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Failed to launch PlayTime Tracker:\n\n" + ex.Message,
                "PlayTime Tracker - Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
