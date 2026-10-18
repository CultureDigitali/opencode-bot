using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// Native Windows supervisor. Windows 10+ atomically assigns the new child
// to a kill-on-close job at CreateProcess time via STARTUPINFOEX.
// A separately terminated supervisor cannot strand an unassigned suspended child.
public static class JobRunner
{
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    private const int PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x0002000D;
    private const int PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x00020002;
    private const uint STARTF_USESTDHANDLES = 0x100;
    private const uint KILL_ON_JOB_CLOSE = 0x2000;
    private const uint WAIT_TIMEOUT = 258;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint DUPLICATE_SAME_ACCESS = 2;
    private const int JobObjectExtendedLimitInformation = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BASIC_LIMITS
    {
        public long PerProcessTimeLimit, PerJobTimeLimit;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct EXTENDED_LIMITS
    {
        public BASIC_LIMITS Basic;
        public IO_COUNTERS Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
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
    private struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr AttributeList;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr process, thread;
        public uint processId, threadId;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(IntPtr job, int info, IntPtr details, uint length);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessW(string application, StringBuilder commandLine, IntPtr pSecurity, IntPtr tSecurity,
        [MarshalAs(UnmanagedType.Bool)]bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFOEX startup, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr attributes, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UpdateProcThreadAttribute(IntPtr attributes, uint flags, IntPtr attribute, IntPtr value,
        IntPtr valueSize, IntPtr previousValue, IntPtr returnSize);
    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr attributes);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DuplicateHandle(IntPtr fromProcess, IntPtr source, IntPtr toProcess, out IntPtr target,
        uint access, [MarshalAs(UnmanagedType.Bool)] bool inheritable, uint options);

    private static void Must(bool ok, string operation)
    {
        if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    private static string Quote(string argument)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in argument)
        {
            if (c == '\\') { ++slashes; continue; }
            if (c == '"')
            {
                result.Append('\\', slashes * 2 + 1);
                result.Append('"');
                slashes = 0;
                continue;
            }
            result.Append('\\', slashes);
            slashes = 0;
            result.Append(c);
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    private static IntPtr InheritableStdHandle(int kind)
    {
        IntPtr source = GetStdHandle(kind);
        if (source == IntPtr.Zero || source == new IntPtr(-1)) return IntPtr.Zero;
        IntPtr copied;
        Must(DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), out copied, 0, true, DUPLICATE_SAME_ACCESS),
            "DuplicateHandle");
        return copied;
    }

    private static int Execute(string executable, List<string> arguments, string cwd, uint timeout)
    {
        IntPtr job = IntPtr.Zero, process = IntPtr.Zero, thread = IntPtr.Zero;
        IntPtr stdin = IntPtr.Zero, stdout = IntPtr.Zero, stderr = IntPtr.Zero;
        IntPtr attributeList = IntPtr.Zero, jobHandleList = IntPtr.Zero, stdHandleList = IntPtr.Zero;
        bool attributeListInitialized = false;
        try
        {
            job = CreateJobObjectW(IntPtr.Zero, null);
            Must(job != IntPtr.Zero, "CreateJobObjectW");
            var limits = new EXTENDED_LIMITS();
            limits.Basic.Flags = KILL_ON_JOB_CLOSE;
            int length = Marshal.SizeOf(typeof(EXTENDED_LIMITS));
            IntPtr ptr = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(limits, ptr, false);
                Must(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ptr, (uint)length), "SetInformationJobObject");
            }
            finally { Marshal.FreeHGlobal(ptr); }

            stdin = InheritableStdHandle(-10);
            stdout = InheritableStdHandle(-11);
            stderr = InheritableStdHandle(-12);
            if (stdout == IntPtr.Zero || stderr == IntPtr.Zero) throw new InvalidOperationException("No stdout/stderr handles");
            // The job-list attribute binds the new process in the same kernel
            // operation that creates it. A separate AssignProcessToJobObject
            // call has a fatal orphan window if the supervisor is killed.
            // Limit inheritance to the stdio duplicates even if a parent
            // accidentally left unrelated handles inheritable.
            var allowedHandles = new List<IntPtr>();
            if (stdin != IntPtr.Zero) allowedHandles.Add(stdin);
            allowedHandles.Add(stdout);
            allowedHandles.Add(stderr);
            IntPtr attributeBytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref attributeBytes);
            if (attributeBytes == IntPtr.Zero) throw new InvalidOperationException("Process attribute sizing failed");
            attributeList = Marshal.AllocHGlobal(attributeBytes);
            Must(InitializeProcThreadAttributeList(attributeList, 2, 0, ref attributeBytes), "InitializeProcThreadAttributeList");
            attributeListInitialized = true;
            jobHandleList = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(jobHandleList, job);
            Must(UpdateProcThreadAttribute(attributeList, 0, new IntPtr(PROC_THREAD_ATTRIBUTE_JOB_LIST), jobHandleList,
                new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute(JOB_LIST)");
            stdHandleList = Marshal.AllocHGlobal(allowedHandles.Count * IntPtr.Size);
            for (int i = 0; i < allowedHandles.Count; i++)
                Marshal.WriteIntPtr(stdHandleList, i * IntPtr.Size, allowedHandles[i]);
            Must(UpdateProcThreadAttribute(attributeList, 0, new IntPtr(PROC_THREAD_ATTRIBUTE_HANDLE_LIST), stdHandleList,
                new IntPtr(allowedHandles.Count * IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute(HANDLE_LIST)");
            var startup = new STARTUPINFOEX();
            startup.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
            startup.StartupInfo.flags = STARTF_USESTDHANDLES;
            startup.StartupInfo.input = stdin;
            startup.StartupInfo.output = stdout;
            startup.StartupInfo.error = stderr;
            startup.AttributeList = attributeList;
            var parts = new List<string>();
            parts.Add(executable);
            parts.AddRange(arguments);
            string raw = string.Join(" ", parts.ConvertAll(Quote).ToArray());
            if (raw.Length >= 32760) throw new InvalidOperationException("Command line exceeds Windows limit");
            var command = new StringBuilder(raw);
            PROCESS_INFORMATION pi;
            Must(CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT,
                IntPtr.Zero, cwd, ref startup, out pi), "CreateProcessW");
            process = pi.process;
            thread = pi.thread;
            CloseHandle(thread);
            thread = IntPtr.Zero;
            uint result = WaitForSingleObject(process, timeout);
            if (result != WAIT_OBJECT_0 && result != WAIT_TIMEOUT) throw new InvalidOperationException("Process wait failed");
            uint code = 125;
            if (result == WAIT_OBJECT_0) Must(GetExitCodeProcess(process, out code), "GetExitCodeProcess");
            // Kill remaining descendants before signalling completion.
            Must(TerminateJobObject(job, result == WAIT_TIMEOUT ? 124U : 0U), "TerminateJobObject");
            if (result == WAIT_TIMEOUT)
            {
                Console.Error.WriteLine("OCB_JOB_TIMEOUT");
                return 124;
            }
            return code < 124 ? (int)code : 125;
        }
        finally
        {
            // The child was assigned to the job atomically during creation;
            // closing the job fails closed even if this supervisor is killed.
            if (attributeListInitialized) DeleteProcThreadAttributeList(attributeList);
            if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
            if (jobHandleList != IntPtr.Zero) Marshal.FreeHGlobal(jobHandleList);
            if (stdHandleList != IntPtr.Zero) Marshal.FreeHGlobal(stdHandleList);
            if (thread != IntPtr.Zero) CloseHandle(thread);
            if (process != IntPtr.Zero) CloseHandle(process);
            if (stdin != IntPtr.Zero) CloseHandle(stdin);
            if (stdout != IntPtr.Zero) CloseHandle(stdout);
            if (stderr != IntPtr.Zero) CloseHandle(stderr);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length < 2) throw new ArgumentException("Expected timeout and executable");
            uint timeout;
            if (!uint.TryParse(args[0], out timeout) || timeout == 0 || timeout > 3600000) throw new ArgumentException("Invalid timeout");
            string executable = args[1];
            if (!Path.IsPathRooted(executable) || !File.Exists(executable)) throw new ArgumentException("Expected absolute executable path");
            var arguments = new List<string>();
            for (int i=2;i<args.Length;i++) arguments.Add(args[i]);
            return Execute(executable, arguments, Directory.GetCurrentDirectory(), timeout);
        }
        catch(Exception ex)
        {
            Console.Error.WriteLine("OCB_JOB_ERROR: " + ex.GetType().Name + ": " + ex.Message);
            return 125;
        }
    }
}
