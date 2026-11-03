@echo off
REM run.bat - Inicializador do OmniArc no Windows (10/11)
cd /d "%~dp0"

IF EXIST ".venv\Scripts\python.exe" (
    SET "PYTHON=.venv\Scripts\python.exe"
) ELSE (
    SET "PYTHON=python"
)

SET "PYTHONPATH=%~dp0"
"%PYTHON%" "%~dp0main.py" %*
