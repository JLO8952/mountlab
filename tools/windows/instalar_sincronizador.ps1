# MountLab - instala el sincronizador de archivos CAD (se ejecuta una sola vez).
# Uso: clic derecho > "Ejecutar con PowerShell", o:
#   powershell -ExecutionPolicy Bypass -File "D:\Mi unidad\MountLab\MountLab_App_GitHub\tools\windows\instalar_sincronizador.ps1"
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'MountLab'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sincronizar_archivos.ps1') -Destination $Dir -Force
$script = Join-Path $Dir 'sincronizar_archivos.ps1'

$accion  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$cada10  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'MountLab - sincronizar archivos CAD' -Action $accion -Trigger @($cada10, $alEntrar) -Settings $ajustes `
    -Description 'Baja de GitHub (JLO8952/mountlab) los DXF/STEP nuevos a D:\Mi unidad\MountLab\biblioteca\archivos' -Force | Out-Null

Write-Host 'Tarea programada creada: "MountLab - sincronizar archivos CAD" (cada 10 min y al iniciar sesion).' -ForegroundColor Green
Write-Host 'Primera sincronizacion...'
& $script
Get-Content (Join-Path $Dir 'sincronizar.log') -Tail 1
Write-Host 'Listo. Puedes cerrar esta ventana.' -ForegroundColor Green
