@echo off
REM ===================================================
REM  Life OS - sincroniza com o GitHub e envia atualizacoes
REM  (a Vercel publica automaticamente apos o push)
REM
REM  0. git pull --rebase (traz o que foi enviado de outro lugar)
REM  1. Verifica se ha mudancas ou commits locais ainda nao enviados
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
REM As aspas sao removidas e o teste usa "defined": comparar "%MSG%" quebrava o
REM .bat quando a mensagem vinha entre aspas ou tinha espacos/parenteses.
set "MSG=%*"
if defined MSG set "MSG=%MSG:"=%"
if not defined MSG (
  set "MSG=Atualizacao Life OS"
  set "PAUSE_AT_END=1"
)

echo.
echo === Atualizando Life OS ===
echo.

REM 0. Baixa o que foi enviado ao GitHub de outro lugar. Roda ANTES de mexer no
REM sw.js: se rodasse depois do commit, o CACHE_VERSION alterado nas duas maquinas
REM daria conflito toda vez. --autostash guarda e reaplica as alteracoes locais.
echo Baixando atualizacoes do GitHub...
git pull --rebase --autostash
if errorlevel 1 (
  git rebase --abort >nul 2>&1
  echo.
  echo ERRO ao baixar do GitHub - conexao ou conflito. Nada foi enviado.
  echo Verifique as mensagens acima e rode de novo.
  goto fim
)
echo.

REM 1. Ha mudancas para enviar? Arquivos alterados OU commits locais que ainda
REM nao foram para o GitHub (ex.: commit feito a mao antes de rodar este .bat)
git add .
git diff --cached --quiet
if errorlevel 1 goto enviar

set "AHEAD=0"
for /f %%n in ('git rev-list --count "@{u}..HEAD" 2^>nul') do set "AHEAD=%%n"
if "%AHEAD%"=="0" (
  echo Nenhuma alteracao para enviar.
  goto fim
)
echo %AHEAD% commit(s) local(is) ainda nao enviado(s) ao GitHub.

:enviar

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
