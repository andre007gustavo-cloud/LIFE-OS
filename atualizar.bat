@echo off
REM ===================================================
REM  Life OS - envia atualizacoes para GitHub
REM  (a Vercel publica automaticamente apos o push)
REM
REM  1. Verifica se ha mudancas no repositorio
REM  2. Incrementa a versao de cache do service worker
REM     (sem isso, dispositivos com o PWA instalado
REM      continuam usando os arquivos antigos do cache)
REM  3. git add + commit + push, com checagem de erro
REM
REM  Uso:
REM    atualizar.bat                  -> mensagem padrao + pausa no final (duplo clique)
REM    atualizar.bat "minha mensagem" -> usa a mensagem e NAO pausa (automacao)
REM ===================================================

REM Sempre trabalha na pasta onde este .bat esta (o repositorio)
cd /D "%~dp0"

REM Mensagem de commit = argumentos passados; sem argumentos usa o padrao e pausa
REM no final (modo duplo-clique). Com argumentos, roda sem pausar (modo automacao).
set "MSG=%*"
if "%MSG%"=="" (
  set "MSG=Atualizacao Life OS"
  set "PAUSE_AT_END=1"
)

echo.
echo === Atualizando Life OS ===
echo.

REM 1. Ha mudancas para enviar?
git add .
git diff --cached --quiet
if not errorlevel 1 (
  echo Nenhuma alteracao para enviar.
  goto fim
)

REM 2. Incrementa a versao de cache do sw.js (forca os PWAs a baixar os arquivos novos)
echo Atualizando versao do cache do service worker...
powershell -NoProfile -Command "$v=Get-Date -Format yyyyMMdd-HHmmss; $L=Get-Content sw.js -Encoding UTF8; $L = $L -replace 'const CACHE_VERSION = .+', ('const CACHE_VERSION = ' + [char]39 + 'v' + $v + [char]39 + ';'); Set-Content sw.js $L -Encoding UTF8"
git add sw.js

REM 3. Commit e push
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo ERRO no commit. Verifique as mensagens acima.
  goto fim
)

git push
if errorlevel 1 (
  echo.
  echo ERRO no push. Verifique a conexao/credenciais e rode de novo.
  goto fim
)

echo.
echo === Pronto! Push enviado - a Vercel vai publicar automaticamente. ===

:fim
echo.
if defined PAUSE_AT_END pause
