@echo off
REM ===================================================
REM  Life OS - atualizar repositorio GitHub Pages
REM  Copia a pasta refatorada inteira (HTML + CSS + JS)
REM ===================================================

REM Ajuste os caminhos abaixo para os seus
set ORIGEM=%USERPROFILE%\Downloads\life-os
set DESTINO=%USERPROFILE%\Documents\GitHub\LIFE-OS

echo.
echo === Atualizando Life OS ===
echo.

REM 1. Remove os arquivos antigos (CSS/JS) do repositorio
echo Limpando arquivos antigos...
if exist "%DESTINO%\css" rmdir /S /Q "%DESTINO%\css"
if exist "%DESTINO%\js"  rmdir /S /Q "%DESTINO%\js"

REM 2. Copia a estrutura nova
echo Copiando arquivos novos...
xcopy "%ORIGEM%\index.html" "%DESTINO%\" /Y
xcopy "%ORIGEM%\css"        "%DESTINO%\css\" /E /I /Y
xcopy "%ORIGEM%\js"         "%DESTINO%\js\"  /E /I /Y

REM 3. Git push
cd /D "%DESTINO%"
git add .
git commit -m "Atualizacao Life OS"
git push

echo.
echo === Pronto! ===
pause
