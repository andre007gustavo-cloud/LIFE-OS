# Life OS — Refatorado (SOLID + Clean Code)

Mesmo app, agora organizado em **camadas com responsabilidades claras**.

## 📁 Estrutura

```
life-os/
├── index.html              ← apenas estrutura HTML (sem CSS/JS embutidos)
│
├── css/                    ← Estilos divididos por contexto
│   ├── base.css            ← Variáveis CSS, reset, nav, FAB
│   ├── components.css      ← Botões, badges, forms, modais, cards
│   ├── tasks.css           ← Layout TickTick (3 colunas)
│   ├── calendar-finance.css← Calendário (dia/sem/mês) + finanças
│   ├── projects.css        ← Workspace de projetos + editor de notas
│   └── responsive.css      ← Todas as media queries
│
└── js/                     ← JavaScript em camadas
    │
    ├── config/
    │   └── constants.js    ← Cores, ícones, durações pomodoro, etc.
    │
    ├── core/               ← Núcleo (sem dependências do DOM)
    │   ├── utils.js        ← Funções puras (datas, formatação, etc.)
    │   ├── storage.js      ← Repository pattern p/ localStorage
    │   └── state.js        ← Estado central da aplicação
    │
    ├── services/           ← Lógica de domínio (sem DOM)
    │   ├── taskService.js
    │   ├── areaService.js
    │   ├── projectService.js
    │   ├── financeService.js
    │   └── pomodoroService.js
    │
    ├── ui/                 ← Helpers de UI (navegação, tema, modais)
    │   ├── navigation.js
    │   ├── theme.js
    │   ├── modal.js
    │   └── mobile.js
    │
    ├── components/         ← Componentes reutilizáveis
    │   ├── taskModal.js
    │   ├── areaModal.js
    │   ├── financeModal.js
    │   ├── projectModal.js
    │   ├── imageResize.js
    │   ├── noteEditor.js
    │   ├── fileHandler.js
    │   └── pomodoroUI.js
    │
    ├── views/              ← Telas (apenas renderização)
    │   ├── dashboardView.js
    │   ├── tasksView.js
    │   ├── taskDetail.js
    │   ├── calendarView.js
    │   ├── financeView.js
    │   └── areasView.js
    │
    └── app.js              ← Bootstrap (conecta tudo)
```

## 🎯 Princípios SOLID aplicados

- **S — Single Responsibility:** cada arquivo tem **uma única responsabilidade**. Mudar como tarefas são salvas mexe só no `taskService.js`. Mudar o visual das tarefas mexe só no `tasks.css` ou `tasksView.js`.
- **O — Open/Closed:** adicionar uma nova view só precisa criar um arquivo em `views/` e registrar no `app.js` — nada existente precisa ser modificado.
- **D — Dependency Inversion:** o `Storage` abstrai o `localStorage`. Para trocar por API ou IndexedDB no futuro, só esse arquivo muda — nada mais sabe que existe localStorage.

## 🧹 Clean Code

- **Funções pequenas e nomeadas** — sem mais funções de 300 linhas.
- **Sem números mágicos** — toda constante está em `constants.js`.
- **Funções puras** quando possível (em `utils.js`).
- **Separação dados / lógica / apresentação** — domínio nunca toca o DOM.
- **Padrões claros:**
  - Repository (`storage.js`)
  - Service Layer (`services/*`)
  - Observer (`pomodoroService` → `pomodoroUI`)
  - Module Pattern com IIFE (encapsulamento)

## 🔄 Workflow atualizado

Antes era 1 arquivo. Agora a pasta inteira precisa ir junto.

### Opção 1 — atualizar o `atualizar.bat`

Substitua seu `atualizar.bat` pelo `atualizar.bat` deste pacote — ele copia a pasta inteira em vez de só o HTML.

### Opção 2 — manual

Copie a pasta `life-os/` inteira para dentro do repositório do GitHub Pages (substituindo o `index.html` anterior).

## ✅ Comportamento

**Idêntico ao anterior.** Toda funcionalidade do app foi preservada:
- Todas as views (Painel, Tarefas, Calendário, Finanças, Projetos)
- Layout TickTick (3 colunas, atalhos, quick-add, detail panel)
- Calendário dia/semana/mês com time-blocking e spans multi-dia
- Filtros do calendário
- Pomodoro
- Editor de notas com imagens + resize
- Upload e preview de arquivos
- Tema claro/escuro
- Responsivo mobile
- Migração automática de dados existentes
