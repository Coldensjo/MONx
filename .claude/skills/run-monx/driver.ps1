# Driver for exercising the built MONx.exe (Tauri desktop app) from PowerShell.
# Each call is a separate process — state (the running app) lives in the OS,
# not in this script, so there's no REPL/tmux needed: just call the same
# process by name across invocations.
#
# Element lookup goes through UI Automation, which reaches inside the WebView2
# and exposes every button/field by its accessible name — so `clickname` and
# `elements` work without pixel coordinates. UIA's first query into a WebView2
# returns nothing (Chromium builds its accessibility tree lazily, only once
# something asks); Get-MonxElements retries for that reason.
#
# Usage:
#   pwsh driver.ps1 start [<workspace-folder>]   # launch + open a workspace, ready to test
#   pwsh driver.ps1 launch [-Exe <path>]
#   pwsh driver.ps1 open [<workspace-folder>]    # open a workspace in the running app
#   pwsh driver.ps1 elements [<name-filter>]     # list UIA elements (names + rects)
#   pwsh driver.ps1 clickname <name-substring>   # invoke a button/element by name
#   pwsh driver.ps1 screenshot <out.png>
#   pwsh driver.ps1 click <x> <y>          # coords relative to the app window
#   pwsh driver.ps1 keys <sendkeys-string>  # e.g. "^o" for Ctrl+O, "{ESC}", "{ENTER}"
#   pwsh driver.ps1 rect                    # print the app window's screen rect
#   pwsh driver.ps1 close

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet("start","launch","open","elements","clickname","screenshot","click","keys","rect","close")]
    [string]$Action,

    [Parameter(Position=1)]
    [string]$Arg1,

    [Parameter(Position=2)]
    [string]$Arg2,

    [string]$Exe = "$PSScriptRoot\..\..\..\src-tauri\target\release\monx-portable.exe",

    # The in-repo fixture workspace: monsters/, items/, client/, spells/.
    [string]$Fixture = (Resolve-Path "$PSScriptRoot\..\..\..\assets" -ErrorAction SilentlyContinue),

    # Fill the four slots through the folder pickers instead of taking the
    # one-click Recent shortcut (that shortcut only exists after a first open).
    [switch]$Slots
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ([System.Management.Automation.PSTypeName]"Native.Win32").Type) {
    Add-Type -Namespace Native -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder buf, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
'@
}

function Get-MonxProcess {
    # monx-portable.exe (no installer) or monx.exe (installed/dev build) — either may be the live window
    $p = Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) { throw "MONx is not running (no window found). Run 'launch' or 'start' first." }
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

# ---------- UI Automation ----------

function Get-MonxElements {
    param([int]$TimeoutSec = 10)
    $p = Get-MonxProcess
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::IsControlElementProperty, $true)
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button)
    # The WebView2 only materialises its accessibility tree once something asks
    # for it: the first pass comes back empty and the next few return bare Panes
    # with no DOM under them. Poll until real controls show up.
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        $els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond).Count -gt 0) { return $els }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)
    return $els
}

function Find-MonxElement {
    param([string]$Name, [int]$TimeoutSec = 10)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        foreach ($e in Get-MonxElements) {
            if ($e.Current.Name -like "*$Name*") { return $e }
        }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Invoke-MonxElement {
    param([string]$Name, [int]$TimeoutSec = 10)
    $el = Find-MonxElement -Name $Name -TimeoutSec $TimeoutSec
    if (-not $el) { throw "No element matching '$Name' (run 'elements' to see what's there)" }
    try {
        $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    } catch {
        # Not every element exposes InvokePattern — fall back to a real click
        # on the middle of its bounding rectangle.
        $r = $el.Current.BoundingRectangle
        Focus-Monx
        [Native.Win32]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)) | Out-Null
        Start-Sleep -Milliseconds 150
        [Native.Win32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [Native.Win32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 400
    return $el.Current.Name
}

# ---------- Native folder picker ----------

function Get-FileDialogHandle {
    # The Tauri folder picker is a native IFileDialog: a top-level "#32770"
    # window owned by the app's process. Two things make it awkward to find:
    # UI Automation never lists it under the desktop root, and FindWindowEx
    # doesn't match its class either — only a full EnumWindows walk sees it.
    # Its title is localised ("Välj mapp" on a Swedish Windows), so match on
    # class + owning process instead.
    $script:dlgPids = @(Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
    $script:dlgHandle = [IntPtr]::Zero
    $cb = [Native.Win32+EnumWindowsProc] {
        param($h, $l)
        if ($script:dlgHandle -ne [IntPtr]::Zero) { return $true }
        $owner = [uint32]0
        [Native.Win32]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
        if (($script:dlgPids -contains $owner) -and [Native.Win32]::IsWindowVisible($h)) {
            $buf = New-Object System.Text.StringBuilder 64
            [Native.Win32]::GetClassName($h, $buf, 64) | Out-Null
            if ($buf.ToString() -eq "#32770") { $script:dlgHandle = $h }
        }
        return $true
    }
    [Native.Win32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return $script:dlgHandle
}

function Wait-FileDialog {
    # Waiting for the dialog beats sleeping a fixed few seconds: typing into a
    # dialog that isn't up yet silently goes nowhere.
    param([int]$TimeoutSec = 20)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        $h = Get-FileDialogHandle
        if ($h -ne [IntPtr]::Zero) {
            [Native.Win32]::SetForegroundWindow($h) | Out-Null
            Start-Sleep -Milliseconds 500
            return $h
        }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    throw "Folder picker never appeared"
}

function Close-StrayDialog {
    # A dialog left open from an aborted run swallows every later keystroke,
    # and an aborted run can leave more than one stacked up.
    for ($i = 0; $i -lt 5; $i++) {
        $h = Get-FileDialogHandle
        if ($h -eq [IntPtr]::Zero) { return }
        [Native.Win32]::SetForegroundWindow($h) | Out-Null
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
        Start-Sleep -Milliseconds 600
    }
}

function Set-DialogPath {
    # SendKeys drops characters on a long path (a 34-char path came out as
    # "C:\Serv\Software\..."), so paste via the clipboard instead. Must happen
    # in the same pwsh invocation that opened the dialog — a separate process
    # can't take the foreground back from it.
    param([string]$Path)
    Set-Clipboard -Value $Path
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    # In a folder picker, the first Enter can just navigate into the pasted
    # path rather than accept it; press again if the dialog is still up.
    $deadline = (Get-Date).AddSeconds(8)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if ((Get-FileDialogHandle) -eq [IntPtr]::Zero) { return }
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    }
    throw "Folder picker did not accept '$Path'"
}

function Set-Slot {
    param([string]$SlotName, [string]$Path)
    Focus-Monx
    Invoke-MonxElement -Name $SlotName | Out-Null
    Wait-FileDialog | Out-Null
    Set-DialogPath -Path $Path
}

function Test-WorkspaceOpen {
    # The landing screen is the only place with an "Open workspace" button;
    # once it's gone (and the tree is warm enough to prove it) a workspace is
    # loaded. A cold/blank tree counts as "not open" so callers keep waiting.
    $els = Get-MonxElements
    $warm = $false
    foreach ($e in $els) {
        if ($e.Current.Name -like "Open workspace*") { return $false }
        if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) { $warm = $true }
    }
    return $warm
}

function Resolve-WorkspaceFolders {
    # Accepts either the fixture layout (monsters/ items/ client/ spells/) or a
    # server data root (monster/ items/ + a sibling client folder), and returns
    # the three-or-four folders the landing screen wants.
    param([string]$Root)
    if (-not (Test-Path $Root)) { throw "Workspace folder not found: $Root" }
    $root = (Resolve-Path $Root).Path
    $monsters = @("monsters","monster") | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
    $items    = Join-Path $root "items"
    $spells   = Join-Path $root "spells"
    $client   = @("client","Tibia") | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $client) {
        # Server layout: the client folder is a sibling of data/, not a child.
        $client = Get-ChildItem -Path (Split-Path $root -Parent) -Directory -ErrorAction SilentlyContinue |
            Where-Object { (Get-ChildItem $_.FullName -Filter *.dat -File -EA SilentlyContinue) -and (Get-ChildItem $_.FullName -Filter *.spr -File -EA SilentlyContinue) } |
            Select-Object -First 1 -ExpandProperty FullName
    }
    # Only the monsters folder is required. Canary and BlackTek ship no
    # items.otb and Nostalrius no client, so demanding either here would make
    # those corpora undrivable when the app itself opens them fine.
    if (-not $monsters) { throw "No monsters/ or monster/ folder under $root" }
    return [pscustomobject]@{
        Monsters = $monsters
        Items    = (Test-Path $items) ? $items : $null
        Client   = $client
        Spells   = (Test-Path $spells) ? $spells : $null
    }
}

function Open-Workspace {
    param([string]$Root)
    $w = Resolve-WorkspaceFolders -Root $Root
    Close-StrayDialog
    Focus-Monx
    if (Test-WorkspaceOpen) { Write-Output "workspace already open"; return }

    # A matching Recent row is one click instead of four dialogs — try it first.
    $recent = if ($Slots) { $null } else { Find-MonxElement -Name $w.Monsters -TimeoutSec 3 }
    if ($recent -and $recent.Current.Name -notlike "*folder*") {
        Invoke-MonxElement -Name $w.Monsters | Out-Null
    } else {
        Set-Slot -SlotName "Monsters folder" -Path $w.Monsters
        if ($w.Items)  { Set-Slot -SlotName "Items folder"  -Path $w.Items }
        if ($w.Client) { Set-Slot -SlotName "Client folder" -Path $w.Client }
        if ($w.Spells) { Set-Slot -SlotName "Spells folder" -Path $w.Spells }
        Invoke-MonxElement -Name "Open workspace" | Out-Null
    }

    # Loading the whole corpus (383 monsters + items.otb + .dat/.spr) takes a
    # few seconds; wait for the landing screen to go away rather than guessing.
    $deadline = (Get-Date).AddSeconds(60)
    do {
        if (Test-WorkspaceOpen) { Write-Output "workspace open: $($w.Monsters)"; return }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)
    throw "Workspace did not open within 60s (screenshot to see why)"
}

function Start-Monx {
    if (Get-Process -Name "monx-portable","monx" -ErrorAction SilentlyContinue) {
        Write-Output "already running"
        return
    }
    if (-not (Test-Path $Exe)) { throw "Exe not found: $Exe (build it first: bun run tauri:build:portable)" }
    Start-Process -FilePath $Exe
    Start-Sleep -Seconds 3
    Get-MonxProcess | Select-Object Id, ProcessName, MainWindowTitle | Out-String | Write-Output
}

switch ($Action) {
    "start" {
        # One command from nothing to a loaded test environment.
        $root = if ($Arg1) { $Arg1 } else { $Fixture }
        Start-Monx
        Open-Workspace -Root $root
    }

    "launch" { Start-Monx }

    "open" {
        $root = if ($Arg1) { $Arg1 } else { $Fixture }
        Open-Workspace -Root $root
    }

    "elements" {
        # Coordinates are printed window-relative, so they can be fed straight
        # back to `click <x> <y>`.
        $win = Get-MonxRect
        foreach ($e in Get-MonxElements) {
            $n = $e.Current.Name
            if (-not $n) { continue }
            if ($Arg1 -and $n -notlike "*$Arg1*") { continue }
            $r = $e.Current.BoundingRectangle
            # Offscreen/virtualized elements report NaN rects — show them anyway.
            $cx = if ([double]::IsNaN($r.X)) { "-" } else { [int]($r.X + $r.Width / 2) - $win.Left }
            $cy = if ([double]::IsNaN($r.Y)) { "-" } else { [int]($r.Y + $r.Height / 2) - $win.Top }
            "{0,-12} {1,-6} {2,-6} {3}" -f $e.Current.ControlType.ProgrammaticName.Replace("ControlType.",""), $cx, $cy, $n
        }
    }

    "clickname" {
        if (-not $Arg1) { throw "usage: clickname <name-substring>" }
        Focus-Monx
        $name = Invoke-MonxElement -Name $Arg1
        Write-Output "clicked: $name"
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
