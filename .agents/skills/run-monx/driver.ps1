# Driver for exercising the built MONx.exe (Tauri desktop app) from PowerShell.
# Each call is a separate process — state (the running app) lives in the OS,
# not in this script, so there's no REPL/tmux needed: just call the same
# process by name across invocations.
#
# Usage:
#   pwsh driver.ps1 launch [-Exe <path>]
#   pwsh driver.ps1 screenshot <out.png>
#   pwsh driver.ps1 openfile <path-to-folder-or-file>
#   pwsh driver.ps1 click <x> <y>          # coords relative to the app window's client area
#   pwsh driver.ps1 keys <sendkeys-string>  # e.g. "^o" for Ctrl+O, "{ESC}", "{ENTER}"
#   pwsh driver.ps1 rect                    # print the app window's screen rect
#   pwsh driver.ps1 close

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet("launch","screenshot","openfile","click","keys","rect","close")]
    [string]$Action,

    [Parameter(Position=1)]
    [string]$Arg1,

    [Parameter(Position=2)]
    [string]$Arg2,

    [string]$Exe = "$PSScriptRoot\..\..\..\src-tauri\target\release\monx-portable.exe"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ([System.Management.Automation.PSTypeName]"Native.Win32").Type) {
    Add-Type -Namespace Native -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
'@
}

function Get-MonxProcess {
    # monx-portable.exe (no installer) or monx.exe (installed/dev build) — either may be the live window
    $p = Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) { throw "MONx is not running (no window found). Run 'launch' first." }
    return $p
}

function Get-MonxRect {
    $p = Get-MonxProcess
    $rect = New-Object "Native.Win32+RECT"
    [Native.Win32]::GetWindowRect($p.MainWindowHandle, [ref]$rect) | Out-Null
    return $rect
}

function Focus-Monx {
    $p = Get-MonxProcess
    [Native.Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
    [Native.Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
}

switch ($Action) {
    "launch" {
        if (Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue) {
            Write-Output "already running"
            break
        }
        if (-not (Test-Path $Exe)) { throw "Exe not found: $Exe (build it first — see SKILL.md)" }
        Start-Process -FilePath $Exe
        Start-Sleep -Seconds 3
        Get-MonxProcess | Select-Object Id, ProcessName, MainWindowTitle
    }

    "rect" {
        $r = Get-MonxRect
        "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)"
    }

    "screenshot" {
        if (-not $Arg1) { throw "usage: screenshot <out.png>" }
        Focus-Monx
        $r = Get-MonxRect
        $w = $r.Right - $r.Left
        $h = $r.Bottom - $r.Top
        $bmp = New-Object System.Drawing.Bitmap $w, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
        $bmp.Save($Arg1, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
        Write-Output "saved $Arg1"
    }

    "openfile" {
        # Sends Ctrl+O to open the native picker, puts the given path into the
        # filename field, and confirms. Works for a folder or any file inside
        # it — MONx resolves the workspace folder itself.
        #
        # Two things this has to get right, both learned the hard way:
        #   * The native dialog can take ~3s to appear. Typing into a dialog
        #     that isn't up yet silently goes nowhere.
        #   * SendKeys drops characters on a long path (a 34-char path came out
        #     as "C:\Serv\Software\..."). Paste via the clipboard instead.
        # Both steps must happen inside this one invocation — a separate pwsh
        # process can't take the foreground back from the dialog.
        if (-not $Arg1) { throw "usage: openfile <path>" }
        Focus-Monx
        [System.Windows.Forms.SendKeys]::SendWait("^o")
        Start-Sleep -Seconds 3
        Set-Clipboard -Value $Arg1
        [System.Windows.Forms.SendKeys]::SendWait("^a")
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        Start-Sleep -Milliseconds 500
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        Start-Sleep -Seconds 4
        Write-Output "opened $Arg1"
    }

    "click" {
        if (-not $Arg1 -or -not $Arg2) { throw "usage: click <x> <y> (relative to app window)" }
        $r = Get-MonxRect
        Focus-Monx
        $x = $r.Left + [int]$Arg1
        $y = $r.Top + [int]$Arg2
        [Native.Win32]::SetCursorPos($x, $y) | Out-Null
        Start-Sleep -Milliseconds 200
        [Native.Win32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)  # left down
        [Native.Win32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)  # left up
        Start-Sleep -Milliseconds 300
        Write-Output "clicked $x,$y"
    }

    "keys" {
        if (-not $Arg1) { throw "usage: keys <sendkeys-string>" }
        Focus-Monx
        [System.Windows.Forms.SendKeys]::SendWait($Arg1)
        Start-Sleep -Milliseconds 300
        Write-Output "sent keys: $Arg1"
    }

    "close" {
        Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue | Stop-Process -Force
        Write-Output "closed"
    }
}
