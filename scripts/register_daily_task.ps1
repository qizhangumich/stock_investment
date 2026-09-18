# Registers a Windows Scheduled Task that runs the daily evolution cycle
# every weekday at 18:30 local time (after US market close + data availability).
# Run this script once from an elevated or normal PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\register_daily_task.ps1

$projectDir = Split-Path -Parent $PSScriptRoot

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$projectDir\scripts\daily_evolve_and_publish.ps1`"" `
    -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 18:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName "AlphaEvolve TSLA Daily Evolution" `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "AlphaEvolve Investment Lab: update TSLA data, evolve strategies, write daily report, push to GitHub, deploy to Vercel" -Force

Write-Host "Task registered. It will run weekdays at 18:30. Test it now with:"
Write-Host '  Start-ScheduledTask -TaskName "AlphaEvolve TSLA Daily Evolution"'
