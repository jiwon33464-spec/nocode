$targetPath = "C:\Users\화해글로벌\Downloads\p-desktop\p-desktop\release"

Get-Process | Where-Object { $_.Path -ne $null } | ForEach-Object {
    $processName = $_.ProcessName
    $processId = $_.Id
    $processPath = $_.Path

    if ($processPath -like "*$targetPath*" -or $processPath -like "*release*") {
        Write-Output "Process: $processName (PID: $processId)"
        Write-Output "Path: $processPath"
        Write-Output "---"
    }
}

Write-Output "`nSearching for processes that might have handles to files in release folder..."
Write-Output "This is commonly caused by:"
Write-Output "1. Windows Explorer (explorer.exe)"
Write-Output "2. Antivirus software"
Write-Output "3. Backup software"
Write-Output "4. Indexing service (SearchIndexer.exe)"
