# build.ps1 — Package the extension for Chrome, Firefox, and Edge
# Output: dist/chrome/  dist/firefox/  dist/edge/  (unpacked folders)
#          dist/*.zip                              (store-ready archives)
#
# Usage: .\build.ps1 [-Version "2.1.0"]

param([string]$Version)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $Root "dist"

# Determine version
if (-not $Version) {
  $srcJson = Get-Content (Join-Path $Root "manifest.json") -Raw
  if ($srcJson -match '"version":\s*"([^"]+)"') {
    $Version = $Matches[1]
  } else {
    Write-Error "Cannot determine version from manifest.json"
    exit 1
  }
}
Write-Host "Building version $Version ..."

# Clean
if (Test-Path $Dist) { Remove-Item -Recurse -Force $Dist }
New-Item -ItemType Directory -Path $Dist | Out-Null

$Sources = @("background", "content", "icons", "lib", "options", "popup", "shared", "_locales", "offscreen")

function Update-ManifestVersion($dir, $srcManifest) {
  Copy-Item (Join-Path $Root $srcManifest) (Join-Path $dir "manifest.json")
  $json = Get-Content (Join-Path $dir "manifest.json") -Raw -Encoding UTF8
  # Replace the version field preserving formatting
  $json = $json -replace '("version"\s*:\s*)"[^"]*"', ('${1}"' + $Version + '"')
  [System.IO.File]::WriteAllText((Join-Path $dir "manifest.json"), $json, [System.Text.UTF8Encoding]::new($false))
}

# ── Chrome ──────────────────────────────────────────────────────
Write-Host "  [Chrome] packaging ..."
$chromeDir = Join-Path $Dist "chrome"
New-Item -ItemType Directory -Path $chromeDir | Out-Null
foreach ($s in $Sources) {
  Copy-Item -Recurse (Join-Path $Root $s) (Join-Path $chromeDir $s)
}
Update-ManifestVersion $chromeDir "manifest.json"
Compress-Archive -Path "$chromeDir\*" -DestinationPath (Join-Path $Dist "wechat-md-saver-chrome-$Version.zip") -Force
Write-Host "  [Chrome] done -> dist\wechat-md-saver-chrome-$Version.zip"

# ── Firefox ─────────────────────────────────────────────────────
Write-Host "  [Firefox] packaging ..."
$ffDir = Join-Path $Dist "firefox"
New-Item -ItemType Directory -Path $ffDir | Out-Null
foreach ($s in $Sources) {
  Copy-Item -Recurse (Join-Path $Root $s) (Join-Path $ffDir $s)
}
Update-ManifestVersion $ffDir "manifest.firefox.json"
Compress-Archive -Path "$ffDir\*" -DestinationPath (Join-Path $Dist "wechat-md-saver-firefox-$Version.zip") -Force
Write-Host "  [Firefox] done -> dist\wechat-md-saver-firefox-$Version.zip"

# ── Edge ──────────────────────────────────────────────────────
Write-Host "  [Edge] packaging ..."
$edgeDir = Join-Path $Dist "edge"
New-Item -ItemType Directory -Path $edgeDir | Out-Null
foreach ($s in $Sources) {
  Copy-Item -Recurse (Join-Path $Root $s) (Join-Path $edgeDir $s)
}
Update-ManifestVersion $edgeDir "manifest.edge.json"
Compress-Archive -Path "$edgeDir\*" -DestinationPath (Join-Path $Dist "wechat-md-saver-edge-$Version.zip") -Force
Write-Host "  [Edge] done -> dist\wechat-md-saver-edge-$Version.zip"

Write-Host ""
Write-Host "All packages ready in $Dist"
Write-Host ""
Write-Host "To load in each browser:"
Write-Host "  Chrome : chrome://extensions -> 'Load unpacked' -> dist\chrome\"
Write-Host "  Firefox: about:debugging#/runtime/this-firefox -> 'Load Temporary Add-on' -> dist\firefox\manifest.json"
Write-Host "  Edge   : edge://extensions -> 'Load unpacked' -> dist\edge\"
