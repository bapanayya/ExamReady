@echo off
title ExamReady - Competitive Exam Image & Document Studio
echo ===================================================
echo   ExamReady - Desktop Studio Launcher (100%% Offline)
echo ===================================================
echo.
echo Launching ExamReady Desktop Application...

:: Set absolute path to index.html
set "APP_FILE=%~dp0index.html"

:: Check for Microsoft Edge (Standard on Windows 10 and 11)
set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_EXE%" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

:: Check for Google Chrome
set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

:: Launch in native standalone window mode
if exist "%EDGE_EXE%" (
    start "" "%EDGE_EXE%" --app="file:///%APP_FILE%"
    exit /b 0
)

if exist "%CHROME_EXE%" (
    start "" "%CHROME_EXE%" --app="file:///%APP_FILE%"
    exit /b 0
)

:: Fallback to default browser
start "" "%APP_FILE%"
exit /b 0
