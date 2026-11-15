@echo off
chcp 65001 >nul
call "%DOLPHIN_WINDOWS_VSDEVCMD%" -no_logo -arch=%DOLPHIN_WINDOWS_NATIVE_ARCH% -host_arch=%DOLPHIN_WINDOWS_NATIVE_ARCH%
if errorlevel 1 exit /b 1
echo DOLPHIN_WINDOWS_NATIVE_ENVIRONMENT
set
