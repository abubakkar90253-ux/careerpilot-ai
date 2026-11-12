@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" (
  echo Visual Studio Installer was not found. Install Visual Studio 2022 Build Tools with Desktop development with C++.
  exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSINSTALL=%%i"
if not defined VSINSTALL (
  echo Visual Studio C++ Build Tools were not found. Install the Desktop development with C++ workload.
  exit /b 1
)

call "%VSINSTALL%\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64
if errorlevel 1 exit /b 1

set "PATH=%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%PATH%"
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=%VCToolsInstallDir%bin\Hostx64\x64\link.exe"
set "PAPERCLIP_HOME=%USERPROFILE%\.paperclip-paperclip-master"
set "npm_config_script_shell=C:\Program Files\Git\bin\bash.exe"

if not exist "%CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER%" (
  echo The Visual Studio MSVC linker was not found at "%CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER%".
  exit /b 1
)

if not exist "%npm_config_script_shell%" (
  echo Git Bash was not found at "%npm_config_script_shell%".
  echo Install Git for Windows and try again.
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.11 or newer is required. Install Node.js and try again.
  exit /b 1
)

for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  if %%a LSS 24 (
    echo Node.js 24.11 or newer is required. Install Node.js and try again.
    exit /b 1
  )
  if %%a EQU 24 if %%b LSS 11 (
    echo Node.js 24.11 or newer is required. Install Node.js and try again.
    exit /b 1
  )
)

where rustc.exe >nul 2>nul
if errorlevel 1 (
  echo Rust is required to build the Paperclip Runner. Install Rust and try again.
  exit /b 1
)

where link.exe >nul 2>nul
if errorlevel 1 (
  echo The Visual Studio MSVC linker was not found. Repair the Desktop development with C++ workload.
  exit /b 1
)

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  call npm install --global pnpm@9.15.4
  if errorlevel 1 exit /b 1
)

cd /d "%REPO_ROOT%"
call pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1

call pnpm dev
