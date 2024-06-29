# Check for elevated privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires running as an administrator." -ForegroundColor Red
    #exit 1
}

# Function to forcefully kill processes by PID using WMI if Stop-Process fails
function ForceKill-Process {
    param (
        [int]$ProcessId
    )
    try {
        $process = Get-WmiObject Win32_Process -Filter "ProcessId=$ProcessId"
        if ($process) {
            $process.Terminate() | Out-Null
            Write-Host "Process $ProcessId terminated using WMI." -ForegroundColor Green
        } else {
            Write-Host "Process $ProcessId not found for WMI termination." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Failed to terminate process $ProcessId using WMI: $_" -ForegroundColor Red
    }
}

# Get all "Google Chrome for Testing" processes
$chromeProcesses = Get-Process | Where-Object {
    $_.Name -eq "chrome" -and $_.Description -like "*Google Chrome for Testing*"
}

foreach ($process in $chromeProcesses) {
    try {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
        Write-Host "Process $($process.Id) terminated successfully." -ForegroundColor Green
    } catch {
        Write-Host "Failed to terminate process $($process.Id) using Stop-Process: $_" -ForegroundColor Red
        ForceKill-Process -ProcessId $process.Id
    }
}