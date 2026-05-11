@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   GenCoder - Build and Package Script
echo ============================================================
echo.

:: Check Node.js
where node >nul 2>&1
if not %errorlevel% == 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node.js %%v

:: Check npm
where npm >nul 2>&1
if not %errorlevel% == 0 (
    echo [ERROR] npm not found.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo [OK] npm %%v
echo.

:: ---- Step 1: Install dependencies if missing ----
echo [1/5] Checking dependencies...

set DEPS_MISSING=0
if not exist "node_modules" set DEPS_MISSING=1
if not exist "webview-ui\node_modules" set DEPS_MISSING=1
if not exist "cli\node_modules" set DEPS_MISSING=1

if %DEPS_MISSING% == 1 (
    echo       Dependencies missing. Installing...
    call npm run install:all
    if not %errorlevel% == 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies already present.
)
echo.

:: ---- Step 2: Build Protobuf files ----
echo [2/5] Building Protobuf files...
call npm run protos
if not %errorlevel% == 0 (
    echo [ERROR] Failed to build Protobuf files.
    pause
    exit /b 1
)
echo [OK] Protobuf files built.
echo.

:: ---- Step 3: Type check ----
echo [3/5] Type checking (TypeScript)...
call npx tsc --noEmit
if not %errorlevel% == 0 (
    echo [WARNING] TypeScript errors found in root - continuing...
) else (
    echo [OK] Root: no type errors.
)

cd webview-ui
call npx tsc --noEmit
if not %errorlevel% == 0 (
    echo [WARNING] TypeScript errors in webview-ui - continuing...
) else (
    echo [OK] webview-ui: no type errors.
)
cd ..
echo.

:: ---- Step 4: Auto-fix code issues ----
echo [4/5] Auto-fixing code issues (biome)...
call npx biome check --no-errors-on-unmatched --files-ignore-unknown=true --write --diagnostic-level=error >nul 2>&1
echo [OK] Auto-fix applied.
echo.

:: ---- Step 5: Build and package VSIX ----
echo [5/5] Building and packaging VSIX...

echo       Building webview-ui...
cd webview-ui
call npm run build
if not %errorlevel% == 0 (
    echo [ERROR] webview-ui build failed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] webview-ui built.

echo       Building extension (production)...
call node esbuild.mjs --production
if not %errorlevel% == 0 (
    echo [ERROR] Extension build failed.
    pause
    exit /b 1
)
echo [OK] Extension built.

echo       Packaging VSIX...
if not exist "dist" mkdir dist
set VSIX_OUT=dist\gencoder.vsix
call npx vsce package --allow-package-secrets sendgrid --out "%VSIX_OUT%"
if not %errorlevel% == 0 (
    echo [ERROR] VSIX packaging failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS!
echo   VSIX file: %VSIX_OUT%
echo.
echo   To install in VS Code:
echo   code --install-extension "%VSIX_OUT%"
echo ============================================================
echo.

set /p INSTALL_NOW="Install extension in VS Code now? (y/n): "
if /i "%INSTALL_NOW%" == "y" (
    code --install-extension "%VSIX_OUT%"
    if not %errorlevel% == 0 (
        echo [ERROR] Install failed. Make sure VS Code is in PATH.
    ) else (
        echo [OK] Installed. Reload VS Code to activate the extension.
    )
)

pause
endlocal
