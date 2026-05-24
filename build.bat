@echo off
REM build.bat — Windows batch packaging for Chrome, Firefox, and Edge
REM Output: dist\chrome\  dist\firefox\  dist\edge\  (unpacked folders)
REM         dist\*.zip                              (store-ready archives)
REM
REM Usage: build.bat [version]
REM        If version is omitted, reads from current manifest.json.

setlocal enabledelayedexpansion

set ROOT=%~dp0
set DIST=%ROOT%dist

REM Determine version
if not "%~1"=="" (
  set VERSION=%~1
) else (
  for /f "tokens=2 delims=: " %%a in ('findstr "\"version\"" "%ROOT%manifest.json"') do (
    set VERSION=%%~a
    goto :got_version
  )
  :got_version
  REM Strip quotes
  set VERSION=!VERSION:"=!
  REM Strip trailing comma
  set VERSION=!VERSION:,=!
)
echo Building version !VERSION! ...

REM Clean
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%DIST%"

REM Source folders to include
set SOURCES=background content icons lib options popup shared _locales

REM ── Chrome ──────────────────────────────────────────────────────
echo   [Chrome] packaging ...
set CHROME_DIR=%DIST%\chrome
mkdir "%CHROME_DIR%"
for %%s in (%SOURCES%) do xcopy /e /i /q "%ROOT%%%s" "%CHROME_DIR%\%%s" >nul
copy "%ROOT%manifest.json" "%CHROME_DIR%\manifest.json" >nul
powershell -Command "(Get-Content '%CHROME_DIR%\manifest.json') -replace '\"version\": \"[^\"]*\"', '\"version\": \"!VERSION!\"' | Set-Content '%CHROME_DIR%\manifest.json'"
powershell -Command "Compress-Archive -Path '%CHROME_DIR%\*' -DestinationPath '%DIST%\wechat-md-saver-chrome-!VERSION!.zip' -Force"
echo   [Chrome] done -- dist\wechat-md-saver-chrome-!VERSION!.zip

REM ── Firefox ─────────────────────────────────────────────────────
echo   [Firefox] packaging ...
set FF_DIR=%DIST%\firefox
mkdir "%FF_DIR%"
for %%s in (%SOURCES%) do xcopy /e /i /q "%ROOT%%%s" "%FF_DIR%\%%s" >nul
copy "%ROOT%manifest.firefox.json" "%FF_DIR%\manifest.json" >nul
powershell -Command "(Get-Content '%FF_DIR%\manifest.json') -replace '\"version\": \"[^\"]*\"', '\"version\": \"!VERSION!\"' | Set-Content '%FF_DIR%\manifest.json'"
powershell -Command "Compress-Archive -Path '%FF_DIR%\*' -DestinationPath '%DIST%\wechat-md-saver-firefox-!VERSION!.zip' -Force"
echo   [Firefox] done -- dist\wechat-md-saver-firefox-!VERSION!.zip

REM ── Edge ────────────────────────────────────────────────────────
echo   [Edge] packaging ...
set EDGE_DIR=%DIST%\edge
mkdir "%EDGE_DIR%"
for %%s in (%SOURCES%) do xcopy /e /i /q "%ROOT%%%s" "%EDGE_DIR%\%%s" >nul
copy "%ROOT%manifest.edge.json" "%EDGE_DIR%\manifest.json" >nul
powershell -Command "(Get-Content '%EDGE_DIR%\manifest.json') -replace '\"version\": \"[^\"]*\"', '\"version\": \"!VERSION!\"' | Set-Content '%EDGE_DIR%\manifest.json'"
powershell -Command "Compress-Archive -Path '%EDGE_DIR%\*' -DestinationPath '%DIST%\wechat-md-saver-edge-!VERSION!.zip' -Force"
echo   [Edge] done -- dist\wechat-md-saver-edge-!VERSION!.zip

echo.
echo All packages ready in %DIST%
echo.
echo To load in each browser:
echo   Chrome : chrome://extensions → 'Load unpacked' → dist\chrome\
echo   Firefox: about:debugging#/runtime/this-firefox → 'Load Temporary Add-on' → dist\firefox\manifest.json
echo   Edge   : edge://extensions → 'Load unpacked' → dist\edge\
