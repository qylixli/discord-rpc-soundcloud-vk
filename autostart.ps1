# Helper for install.bat / uninstall.bat (autostart + stopping the background program).
# Kept ASCII-only on purpose; paths with any characters (e.g. Cyrillic) are handled by PowerShell itself.
param([Parameter(Mandatory = $true)][ValidateSet('install', 'remove', 'stop')][string]$Action)

$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'discord-rpc-soundcloud-vk.lnk'
# files left by older versions (a .vbs that stored the path as text and broke on non-ASCII paths)
$old = @(
    (Join-Path $startup 'discord-rpc-soundcloud-vk.vbs'),
    (Join-Path $startup 'soundcloud-discord-rpc.vbs')
)

function Stop-Rpc {
    # Our program listens on 127.0.0.1:47612; stop only a node.exe that owns that port.
    Get-NetTCPConnection -LocalPort 47612 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force }
    }
}

function Remove-Autostart {
    foreach ($f in ($old + $lnk)) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}

switch ($Action) {
    'stop' { Stop-Rpc }
    'remove' { Stop-Rpc; Remove-Autostart }
    'install' {
        Stop-Rpc
        Remove-Autostart
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
        $s.TargetPath = 'wscript.exe'
        $s.Arguments = '"' + (Join-Path $dir 'run-hidden.vbs') + '"'
        $s.WorkingDirectory = $dir
        $s.Save()
    }
}
