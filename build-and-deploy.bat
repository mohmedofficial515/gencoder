@echo off
setlocal enabledelayedexpansion

:: ════════════════════════════════════════════════════════════════════
::  GenCoder — Build & Deploy Script
::
::  Usage:
::    build-and-deploy.bat           Quick build (extension JS only, ~5s)
::    build-and-deploy.bat --full    Full build  (extension + webview,  ~25s)
::    build-and-deploy.bat --protos  Proto regen + full build           (~35s)
:: ════════════════════════════════════════════════════════════════════

set SRC=c:\gencoder
set DST=C:\Users\MOHAMED AHMED\.antigravity\extensions\mohmedofficial515.gencoder-3.82.0

set MODE=quick
if "%1"=="--full"   set MODE=full
if "%1"=="--protos" set MODE=protos

:: ─── Colors via ANSI (works on Windows 10+) ─────────────────────────
set GRN=[32m
set YLW=[33m
set CYN=[36m
set RED=[31m
set RST=[0m
set BLD=[1m

echo.
echo %BLD%%CYN%══════════════════════════════════════════%RST%
echo %BLD%%CYN%  GenCoder Build ^& Deploy  [%MODE% mode]%RST%
echo %BLD%%CYN%══════════════════════════════════════════%RST%
echo.

cd /d %SRC%

:: ── Step 1: Regenerate Protos (only if --protos) ────────────────────
if "%MODE%"=="protos" (
    echo %YLW%[1/4]%RST% Regenerating proto types...
    call npm run protos >nul 2>&1
    if errorlevel 1 (
        echo %RED%FAILED: npm run protos%RST%
        goto :error
    )
    echo %GRN%      Proto types regenerated.%RST%
)

:: ── Step 2: Build webview UI (only if --full or --protos) ───────────
if "%MODE%"=="full"   goto :build_webview
if "%MODE%"=="protos" goto :build_webview
goto :build_ext

:build_webview
set /a step_ext=3
set /a step_copy=4
set /a total=4
if "%MODE%"=="protos" (
    set /a step_ext=3
    set /a step_copy=4
    set /a total=4
) else (
    set /a step_ext=2
    set /a step_copy=3
    set /a total=3
)
echo %YLW%[2/%total%]%RST% Building webview UI (this takes ~15s)...
cd /d %SRC%\webview-ui
call npm run build >nul 2>&1
if errorlevel 1 (
    echo %RED%FAILED: webview npm run build%RST%
    goto :error
)
echo %GRN%      Webview built.%RST%
cd /d %SRC%
goto :build_ext

:build_ext
:: Set step numbers for quick mode
if "%MODE%"=="quick" (
    set step_ext=1
    set step_copy=2
    set total=2
)
echo %YLW%[%step_ext%/%total%]%RST% Compiling extension TypeScript...
node esbuild.mjs >nul 2>&1
if errorlevel 1 (
    echo %RED%FAILED: node esbuild.mjs%RST%
    goto :error
)
echo %GRN%      Extension compiled.%RST%

:: ── Step Final: Copy to installed extension ──────────────────────────
echo %YLW%[%step_copy%/%total%]%RST% Deploying to Antigravity extension...

:: Always copy: extension backend JS
copy /Y "%SRC%\dist\extension.js" "%DST%\dist\extension.js" >nul
if errorlevel 1 ( echo %RED%FAILED: copy extension.js%RST% & goto :error )

:: Always copy: Chrome extension background script
copy /Y "%SRC%\extension\background.js" "%DST%\extension\background.js" >nul
if errorlevel 1 ( echo %RED%FAILED: copy background.js%RST% & goto :error )

:: Copy webview assets only when rebuilt
if "%MODE%"=="full"   goto :copy_webview
if "%MODE%"=="protos" goto :copy_webview
goto :done

:copy_webview
copy /Y "%SRC%\webview-ui\build\assets\index.js"  "%DST%\webview-ui\build\assets\index.js"  >nul
if errorlevel 1 ( echo %RED%FAILED: copy webview index.js%RST% & goto :error )
copy /Y "%SRC%\webview-ui\build\assets\index.css" "%DST%\webview-ui\build\assets\index.css" >nul
if errorlevel 1 ( echo %RED%FAILED: copy webview index.css%RST% & goto :error )

:done
echo %GRN%      Files deployed.%RST%
echo.
echo %BLD%%GRN%══════════════════════════════════════════%RST%
echo %BLD%%GRN%  Done! Reload Antigravity window to apply%RST%
echo %BLD%%GRN%  Ctrl+Shift+P → "Reload Window"%RST%
echo %BLD%%GRN%══════════════════════════════════════════%RST%
echo.
exit /b 0

:error
echo.
echo %BLD%%RED%══════════════════════════════════════════%RST%
echo %BLD%%RED%  BUILD FAILED — see error above%RST%
echo %BLD%%RED%══════════════════════════════════════════%RST%
echo.
exit /b 1
