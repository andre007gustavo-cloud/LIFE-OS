# LIFE OS — Regras do projeto

Princípios gerais: SOLID e Clean Code, aplicados conforme as regras concretas abaixo.

## Arquitetura (NUNCA violar)
- Vanilla JS, sem build, sem frameworks. Módulos IIFE: config → core → services → ui → components → views → app.js
- Services NUNCA tocam o DOM. Views NUNCA acessam Storage direto (sempre via service)
- core/ não depende de nenhuma outra camada; funções puras sempre que possível
- Estado central em js/core/state.js; persistência via Repository pattern em js/core/storage.js (localStorage + Firestore)
- Constantes sempre em js/config/constants.js, nunca números mágicos espalhados

### Exceções conhecidas (não "corrigir" sem combinar)
- js/core/storage.js mostra um toast de erro de sync (`_notifySyncError`) — único ponto de DOM no core, intencional
- js/pwa.js usa localStorage direto para as chaves próprias dos banners de instalação (não são dados do app)
- js/components/feedback.js usa localStorage direto para as preferências de feedback (por dispositivo, nunca sincronizam)
- js/components/loginScreen.js chama Storage.stopListening() no logout (fluxo de autenticação)

## Checklist obrigatório ao criar/renomear QUALQUER arquivo
1. Adicionar `<script>` no index.html na camada correta (a ordem importa: config → core → services → ui → components → views → app.js → pwa.js; dentro do core: constants → utils → firebase → storage → state)
2. Adicionar o caminho no array PRECACHE do sw.js
3. CACHE_VERSION do sw.js: o atualizar.bat já incrementa automaticamente a cada publicação — só incrementar manualmente se publicar por outro caminho

## Segurança e qualidade
- TODA interpolação de dado do usuário em innerHTML usa Utils.escapeHtml / Utils.escapeAttr
- Datas: SEMPRE usar Utils.today/tomorrow/addDays e Utils.parseISO/toISO (parse local) — NUNCA toISOString() para extrair data, NUNCA new Date("YYYY-MM-DD") direto (interpreta como UTC; o app roda em UTC-3)
- IDs com Utils.uid() (crypto.randomUUID)
- NUNCA usar eval; NUNCA handler inline (onclick="...") interpolando dado de usuário (interpolar IDs gerados por Utils.uid é aceito — padrão atual do projeto)

## Clean Code (regras verificáveis)
- Funções com no máximo ~30 linhas e UMA responsabilidade; se precisar de "e" para descrever o que faz, dividir
- Nomes descritivos em inglês no código (renderTaskList, não rtl); textos da interface em pt-BR
- Código repetido em 3+ lugares → extrair para Utils ou para o service da entidade
- Não criar abstrações "para o futuro": resolver o problema de hoje (YAGNI). Não adicionar camadas, interfaces ou configurações que nenhuma feature atual usa
- Comentários só quando o PORQUÊ não é óbvio; nunca comentar o óbvio

## Workflow
- Uma feature/fase por vez. Ao terminar: listar arquivos alterados + instruções de como testar. Aguardar aprovação antes de continuar
- Nunca refatorar código fora do escopo da tarefa pedida sem avisar antes
- Antes de mudanças grandes, fazer commit do estado atual (atualizar.bat faz commit + push + bump do cache)
- Sem Node na máquina: para testar lógica JS, usar Edge headless (`msedge --headless --dump-dom` com uma página de teste temporária; apagar o arquivo antes de commitar)
