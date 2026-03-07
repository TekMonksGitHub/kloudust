@echo off
setlocal

set LOGIN=%1
set PW=%2
set HOST=%3
set HOSTKEY=%4
set PORT=%5
set FILE=%6

"%~dp0\plink.exe" -batch -C -l %LOGIN% -pw %PW% -hostkey %HOSTKEY% -m %FILE% -p %PORT% %HOST%

exit /b %errorlevel%