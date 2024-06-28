Get-Process | Where-Object {
    $_.MainWindowTitle -like "*Google Chrome for Testing*" -or $_.Description -like "*Google Chrome for Testing*"
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force
}