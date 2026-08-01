@echo off
REM ============================================================
REM start-server.bat — Demarrage du serveur SONABHY Portail
REM Lance XAMPP (MySQL + Apache) puis le backend via PM2.
REM
REM Usage manuel (double-clic)      : start-server.bat
REM Usage automatique (planificateur): start-server.bat /auto
REM   -> pas de pause finale, sortie journalisee dans start-server.log
REM ============================================================

REM ── Configuration : ajuster ces deux chemins si besoin ───────
set XAMPP_DIR=C:\xampp
set PM2_PROCESS_NAME=portail_sonabhy
set LOGFILE=%~dp0start-server.log

if /I "%~1"=="/auto" goto :auto
goto :run

:auto
REM Mode automatique : tout rediriger vers le journal, pas d'attente de touche
call :run >> "%LOGFILE%" 2>&1
exit /b 0

:run
echo.
echo [%date% %time%] === Demarrage du serveur SONABHY Portail ===

echo.
echo === Demarrage de XAMPP (MySQL + Apache) ===
call "%XAMPP_DIR%\mysql_start.bat"
call "%XAMPP_DIR%\apache_start.bat"

echo.
echo === Attente du demarrage de MySQL (5s) ===
timeout /t 5 /nobreak >nul

echo.
echo === Demarrage du backend via PM2 (%PM2_PROCESS_NAME%) ===
pm2 restart %PM2_PROCESS_NAME%
if errorlevel 1 (
    echo Process introuvable dans PM2 - tentative de restauration complete
    pm2 resurrect
)

echo.
echo === Statut PM2 ===
pm2 list

echo.
echo [%date% %time%] Termine.

if /I "%~1"=="/auto" goto :eof
echo Fermez cette fenetre quand vous avez verifie le statut ci-dessus.
pause
