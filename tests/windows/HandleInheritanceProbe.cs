using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

// Regression fixture: launch the native supervisor with an unrelated
// inheritable event, then ask its worker whether that event leaked through.
// This is a test program; it is not installed or executed by the daemon.
public static class HandleInheritanceProbe
{
    private const uint STARTF_USESTDHANDLES = 0x100;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public uint Length;
        public IntPtr SecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool Inherit;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string reserved, desktop, title;
        public uint x, y, xs, ys, xc, yc, fill, flags;
        public ushort show, reservedSize;
        public IntPtr reserved2, input, output, error;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr process, thread;
        public uint processId, threadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateEventW(ref SECURITY_ATTRIBUTES sa, bool manualReset, bool initialState, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetEvent(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessW(string app, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
        [MarshalAs(UnmanagedType.Bool)] bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFO startup,
        out PROCESS_INFORMATION info);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int kind);

    private static string Quote(string arg)
    {
        if (arg.IndexOf('"') >= 0) throw new ArgumentException("Fixture path must not contain quote characters");
        return "\"" + arg + "\"";
    }

    public static int Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "check")
        {
            IntPtr handle = new IntPtr(long.Parse(args[1], CultureInfo.InvariantCulture));
            File.WriteAllText(args[2], SetEvent(handle) ? "EXPOSED" : "FILTERED");
            return 0;
        }
        if (args.Length != 3 || args[0] != "launch") return 2;
        var sa = new SECURITY_ATTRIBUTES();
        sa.Length = (uint)Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
        sa.Inherit = true;
        IntPtr ambientEvent = CreateEventW(ref sa, true, false, null);
        if (ambientEvent == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateEventW");
        IntPtr process = IntPtr.Zero, thread = IntPtr.Zero;
        try
        {
            var startup = new STARTUPINFO();
            startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
            startup.flags = STARTF_USESTDHANDLES;
            startup.input = GetStdHandle(-10);
            startup.output = GetStdHandle(-11);
            startup.error = GetStdHandle(-12);
            string self = Assembly.GetExecutingAssembly().Location;
            var command = new StringBuilder(Quote(args[1]) + " 5000 " + Quote(self) + " check " +
                ambientEvent.ToInt64().ToString(CultureInfo.InvariantCulture) + " " + Quote(args[2]));
            PROCESS_INFORMATION pi;
            if (!CreateProcessW(args[1], command, IntPtr.Zero, IntPtr.Zero, true, CREATE_NO_WINDOW,
                IntPtr.Zero, Directory.GetCurrentDirectory(), ref startup, out pi))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcessW");
            process = pi.process;
            thread = pi.thread;
            uint wait = WaitForSingleObject(process, 15000);
            if (wait != WAIT_OBJECT_0)
            {
                TerminateProcess(process, 125);
                throw new InvalidOperationException("Supervisor failed to exit normally");
            }
            uint code;
            if (!GetExitCodeProcess(process, out code) || code != 0)
                throw new InvalidOperationException("Supervisor exited with failure: " + code);
            // The event itself confirms the inherited handle, not merely a
            // potentially reused numeric handle value in the worker.
            bool exposed = WaitForSingleObject(ambientEvent, 0) == WAIT_OBJECT_0;
            Console.WriteLine(exposed ? "AMBIENT_HANDLE_EXPOSED" : "AMBIENT_HANDLE_FILTERED");
            return exposed ? 1 : 0;
        }
        finally
        {
            if (thread != IntPtr.Zero) CloseHandle(thread);
            if (process != IntPtr.Zero) CloseHandle(process);
            CloseHandle(ambientEvent);
        }
    }
}
