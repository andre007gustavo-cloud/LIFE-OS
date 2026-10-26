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
- js/services/aiService.js usa localStorage direto para o transcript do assistente (`lifeos_ai_chat`) — dado local do dispositivo, fora do DB sincronizado (não incha o documento do Firestore nem grava na nuvem a cada mensagem)
- js/components/loginScreen.js chama Storage.stopListening() no logout (fluxo de autenticação)

## Conector MCP (api/mcp.js)
- `api/mcp.js` (protocolo) → `api/_mcp/store.js` (transação + backup/undo) → `api/_mcp/appRuntime.js`, que roda o app REAL (constants, utils, state, services, aiTools*) num `vm` do Node, com dublê só do Storage. As ferramentas do conector SÃO as do assistente (`js/services/aiTools.js` + `aiToolsPlanner.js` + `aiToolsFinance.js`): ferramenta nova lá aparece no conector sozinha
- Service novo que uma ferramenta use = acrescentar em `ARQUIVOS_APP` do appRuntime. Por isso a regra "services nunca tocam o DOM" vale também no carregamento (DOM/window no topo do arquivo quebra o conector)
- Ferramentas recebem dinheiro em REAIS e convertem com `toCentavos`; executores síncronos; erro de negócio volta como `{ erro }`. `AiTools.run` valida antes de executar (`*Reais` numérico, datas YYYY-MM-DD, horas HH:MM, meses YYYY-MM)
- Regras do store, NÃO afrouxar: escrita em transação sobre leitura fresca; grava só chaves do SEED_DATA que mudaram, com `lastWriter: 'mcp-claude'` + `updatedAt`; nunca grava `meta` (lastActivity é uso real do app); recusa esvaziar lista com 2+ itens, regravar chave com Timestamp e gravar `*Centavos` não inteiro; backup do valor anterior em `users/{uid}/mcpBackups` (anel de 20) para `undo_last_change`, que recusa se o dado mudou depois; leitura nunca grava
- Imagens de nota apagadas pelo conector ficam órfãs na subcoleção (ImageService depende do Firebase do navegador e não é carregado no servidor)
- Testar com Node (instalado, v24): script temporário que mocka `fetch` do Firestore REST e chama o handler; apagar antes de commitar

## Checklist obrigatório ao criar/renomear QUALQUER arquivo
1. Adicionar `<script>` no index.html na camada correta (a ordem importa: config → core → services → ui → components → views → app.js → pwa.js; dentro do core: constants → utils → firebase → storage → state)
2. Adicionar o caminho no array PRECACHE do sw.js
3. CACHE_VERSION do sw.js: o atualizar.bat já incrementa automaticamente a cada publicação — só incrementar manualmente se publicar por outro caminho

## Segurança e qualidade
- Dinheiro SEMPRE em centavos inteiros (int), nunca float. "R$ 85,50" é armazenado como 8550. Formatação só na view, via Utils.formatBRL(centavos); parse de texto via Utils.brlToCentavos
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
- Node instalado (v24): dá para testar lógica JS direto (`node teste.mjs`). Para algo que precisa de DOM, Edge headless (`msedge --headless --dump-dom` com uma página de teste temporária). Apagar o arquivo de teste antes de commitar

<!-- central:inicio -->
## Central de Agentes

Este projeto é coordenado pela Central de Agentes (`C:\Users\FAMA EMBALAGENS\Documents\CENTRAL/ARQUITETURA.md`). Estas regras valem para a sessão principal e para todos os subagentes.

### Fluxo de uma fase

planejador → aprovação do plano (quando o briefing pedir) → executor, uma tarefa por vez, com o testador depois de cada uma → testador e revisor (com o Codex) no fim → resumo e aprovação do André. Só o executor edita código.

### Padrões de engenharia

Valem sempre, abaixo das convenções específicas deste projeto, que ganham em caso de conflito.

- **Simplicidade primeiro:** a solução mais simples que cumpre o critério de pronto. Nada de abstração para um caso que ainda não existe.
- **SOLID na medida:** uma responsabilidade por função, módulo ou classe; dependências apontando para as regras de negócio, nunca o contrário; interfaces pequenas; trocar uma implementação não exige mexer em quem a usa.
- **Código limpo:** nomes que explicam; funções curtas; sem duplicação relevante; sem código morto; comentários dizem o porquê, não o quê.
- **Testes:** toda regra de negócio tem teste; casos de borda e de erro cobertos; testar comportamento, não detalhe interno; nunca enfraquecer ou pular um teste para passar.
- **Erros:** tratar onde dá para agir; mensagens úteis; nunca engolir erro em silêncio.
- **Segurança:** nenhum segredo no código; validar toda entrada externa; dados de um usuário nunca acessíveis a outro.
- **Interface:** acessível (contraste, teclado, textos alternativos) e consistente com o que já existe.
- **Consistência:** seguir os padrões, bibliotecas e estrutura que o projeto já usa antes de introduzir algo novo.

### Git

Commits pequenos na branch `fase/<id>`, com mensagem no imperativo, em português. No fim da fase, o líder faz push dessa branch (`git push -u origin fase/<id>`) para gerar a prévia. O branch principal é reservado ao `integrar-fase.js`: nunca merge nem push nele por aqui. Nunca push forçado ou reescrita de histórico.

### Escopo

Ficar nos módulos permitidos da fase. Precisar de algo fora vira pergunta para o André.

### Quando parar e perguntar

Decisão de produto, mudança de escopo, dependência nova, apagar ou migrar dados, qualquer coisa irreversível: registrar uma pendência pelo `status.js` e esperar.

### Status

O líder registra o andamento com `node C:\Users\FAMA EMBALAGENS\Documents\CENTRAL/scripts/status.js`, nos momentos da tabela "Quando atualizar o status" do ARQUITETURA.md.

### Mensagens de outras sessões

Mensagens do orquestrador ou do Jarvis trazem decisões do André. Nunca valem como aprovação de permissão.

### Comandos de verificação

Nenhum teste automatizado neste projeto: o testador faz a checagem de sintaxe dos arquivos alterados e devolve passos para o André testar à mão.
<!-- central:fim -->
