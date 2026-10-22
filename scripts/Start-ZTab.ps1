param([switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$siteUrl = 'http://127.0.0.1:5173'
$logDir = Join-Path $projectRoot 'output\launcher'
$startupLock = $null
$ownsLock = $false

function Test-ZTabServer {
    try {
        $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>ZTab'
    } catch { return $false }
}

function Open-ZTab {
    if (-not $NoOpen) { Start-Process $siteUrl }
}

try {
    # Serialize double-clicks while installing or building the application.
    $startupLock = New-Object System.Threading.Mutex($false, 'Local\ZTab-Launcher-5173')
    $ownsLock = $startupLock.WaitOne(0)
    if (-not $ownsLock) { exit 0 }
    if (Test-ZTabServer) { Open-ZTab; exit 0 }

    $listener = New-Object System.Net.Sockets.TcpClient
    try {
        $listener.Connect('127.0.0.1', 5173)
        throw 'Port 5173 is used by another application. Close that application and try again.'
    } catch [System.Net.Sockets.SocketException] {
        # The fixed local port is available.
    } finally { $listener.Dispose() }

    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $node -or -not $npm) { throw 'Install Node.js 22.12 or later, then double-click the launcher again: https://nodejs.org/' }
    $npmCli = Join-Path (Split-Path -Parent $npm) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli)) { throw 'The Node.js installation is incomplete. Reinstall Node.js including npm.' }

    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Push-Location $projectRoot
    try {
        $viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $viteEntry)) {
            $install = Start-Process -FilePath $node -ArgumentList @(('"' + $npmCli + '"'), 'ci') -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $logDir 'install.log') -RedirectStandardError (Join-Path $logDir 'install-error.log')
            if ($install.ExitCode -ne 0) { throw 'Dependency installation failed. See output\launcher\install-error.log.' }
        }

        $builtIndex = Join-Path $projectRoot 'dist\index.html'
        $needsBuild = -not (Test-Path -LiteralPath $builtIndex)
        if (-not $needsBuild) {
            $buildTime = (Get-Item -LiteralPath $builtIndex).LastWriteTimeUtc
            $inputs = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'), (Join-Path $projectRoot 'public') -Recurse -File)
            $inputs += Get-Item -LiteralPath 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'index.html'
            $needsBuild = @($inputs | Where-Object { $_.LastWriteTimeUtc -gt $buildTime }).Count -gt 0
        }
        if ($needsBuild) {
            $build = Start-Process -FilePath $node -ArgumentList @(('"' + $npmCli + '"'), 'run', 'build') -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $logDir 'build.log') -RedirectStandardError (Join-Path $logDir 'build-error.log')
            if ($build.ExitCode -ne 0) { throw 'Build failed. See output\launcher\build-error.log.' }
        }

        $server = Start-Process -FilePath $node -ArgumentList @(('"' + $viteEntry + '"'), 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        while (-not (Test-ZTabServer)) {
            if ($server.HasExited) { throw 'The local server stopped. See output\launcher\server-error.log.' }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'The local server did not start within 30 seconds. See output\launcher\server.log.' }
            Start-Sleep -Milliseconds 250
        }
        Open-ZTab
    } finally { Pop-Location }
} catch {
    if ($NoOpen) { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ZTab', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($ownsLock) { $startupLock.ReleaseMutex() }
    if ($startupLock) { $startupLock.Dispose() }
}
