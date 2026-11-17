# MountLab - copia los archivos CAD nuevos del repositorio GitHub a la carpeta de Google Drive del PC.
# Drive para escritorio se encarga de subirlos a la nube. No necesita claves: el repositorio es publico.
$ErrorActionPreference = 'Stop'
$Repo    = 'JLO8952/mountlab'
$Rama    = 'main'
$Destino = 'D:\Mi unidad\MountLab\biblioteca\archivos'
$Dir     = Join-Path $env:LOCALAPPDATA 'MountLab'
$Log     = Join-Path $Dir 'sincronizar.log'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $arbol = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/git/trees/$($Rama)?recursive=1" -Headers @{ 'User-Agent' = 'MountLab-sync' }
    $nuevos = 0
    foreach ($it in $arbol.tree) {
        if ($it.type -ne 'blob' -or -not $it.path.StartsWith('archivos/')) { continue }
        $rel = $it.path.Substring(9) -replace '/', '\'
        $dst = Join-Path $Destino $rel
        if (Test-Path -LiteralPath $dst) { continue }   # cada version tiene nombre propio: no se sobrescribe nada
        New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
        $url = "https://raw.githubusercontent.com/$Repo/$Rama/" + (($it.path -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
        Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing -Headers @{ 'User-Agent' = 'MountLab-sync' }
        $nuevos++
    }
    Add-Content -LiteralPath $Log -Value ("{0} OK: {1} archivo(s) nuevo(s)" -f (Get-Date -Format s), $nuevos)
} catch {
    Add-Content -LiteralPath $Log -Value ("{0} ERROR: {1}" -f (Get-Date -Format s), $_)
}
