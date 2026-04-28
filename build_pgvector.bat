@echo off
:: Run this from an ELEVATED (Admin) standard Command Prompt.
:: It sets up the VS C++ environment then builds and installs pgvector.

echo === Setting up VS C++ Build environment ===
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 (
    echo ERROR: vcvars64.bat not found. Make sure VS 2022 Build Tools installed correctly.
    pause
    exit /b 1
)

echo.
echo === Building pgvector ===
set "PGROOT=C:\Program Files\PostgreSQL\16"
cd /d "C:\Users\kasui\Documents\Ai-Warehouse\pgvector_src"

nmake /F Makefile.win
if errorlevel 1 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)

echo.
echo === Installing pgvector into PostgreSQL ===
nmake /F Makefile.win install
if errorlevel 1 (
    echo ERROR: Install failed. Make sure you ran this as Administrator.
    pause
    exit /b 1
)

echo.
echo === SUCCESS! pgvector installed. ===
echo Now restart PostgreSQL service and run:
echo   python manage.py migrate
pause
