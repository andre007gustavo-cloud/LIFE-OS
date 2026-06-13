/**
 * ===================== APP BOOTSTRAP =====================
 * Fluxo:
 *  1. Inicializa tema
 *  2. Escuta estado de autenticação do Firebase
 *  3. Se logado → carrega dados da nuvem → inicializa o app → escuta mudanças
 *  4. Se não logado → mostra tela de login
 */

(function bootstrap() {

  Theme.init();
  Feedback.applyBodyClass(); // aplica a preferência de animações antes do login
  let appInitialized = false;

  // Indicador de sync na nav: o storage emite, a UI reage (sem acoplamento direto)
  Storage.onSyncStateChange(LoginScreen.setSyncState);

  // Expõe login/logout ANTES do auth check (o botão precisa disso)
  window.loginWithGoogle = LoginScreen.login;
  window.logoutUser      = LoginScreen.logout;

  // Escuta mudanças de autenticação
  FirebaseApp.onAuthChanged(async (user) => {
    if (user) {
      showLoading(true);

      // Carrega dados da nuvem
      const cloudData = await Storage.loadFromCloud();

      if (cloudData) {
        // Tem dados na nuvem → usa eles
        AppState.setDB(cloudData);
      } else {
        // Primeiro login → migra dados locais para a nuvem
        const localData = Storage.load();
        AppState.setDB(localData);
        await Storage.saveToCloud(localData);
      }

      LoginScreen.hide();
      showLoading(false);

      if (!appInitialized) {
        initializeApp();
        appInitialized = true;
      }

      LoginScreen.updateUserInfo();

      // Recomeço sem culpa: detecta a ausência ANTES de carimbar o acesso de hoje
      const comeback = ReviewService.detectComeback();
      ReviewService.stampActivity();

      // Seed de finanças só depois da detecção: o persist do seed carimba
      // lastActivity=hoje e mascararia a ausência se rodasse antes
      FinanceService._seedDefaults();

      if (comeback) {
        ComebackView.show(comeback.daysAway, renderActiveViews);
      } else {
        renderActiveViews();
      }

      // Escuta mudanças de outros dispositivos em tempo real
      Storage.listenForChanges((data) => {
        AppState.setDB(data);
        renderActiveViews();
      });

    } else {
      // Não logado
      Storage.stopListening();
      PomodoroService.reset(); // para o timer que continuaria rodando após logout
      NextUpBar.stop();        // limpa o setInterval da faixa
      appInitialized = false;
      LoginScreen.show();
    }
  });

  // ===== Inicialização do app (chamada uma vez) =====

  function initializeApp() {
    MobileSidebar.init();
    Modal.wireBackdropClicks();
    InboxCapture.init();
    CommandPalette.init();
    NextUpBar.init();
    NowView.init();
    PomodoroService.onComplete(onPomodoroComplete);

    // Close day-popover quando clica fora
    document.addEventListener('click', e => {
      if (e.target.closest('.month-day')) return;
      if (e.target.closest('.cal-popover')) return;
      // Clique dentro do date picker (ou nele aberto — o alvo pode se desanexar no re-render)
      if (e.target.closest('#date-popover')) return;
      if (document.getElementById('date-popover')?.classList.contains('open')) return;
      CalendarView.closeDayPopover();
    });

    // Registra views na navegação
    Navigation.register('dashboard', DashboardView.render);
    Navigation.register('tasks', () => {
      TasksView.renderSidebar();
      TasksView.filterAndRender();
    });
    Navigation.register('calendar', CalendarView.render);
    Navigation.register('finance', FinanceView.render);
    Navigation.register('areas', AreasView.render);
    Navigation.register('habits', HabitsView.render);
    Navigation.register('review', ReviewView.render);
    Navigation.register('now', NowView.render);

    // Expõe funções globais para onclick inline
    exposeGlobals();
  }

  function renderActiveViews() {
    DashboardView.render();
    CalendarView.render();
    if (document.getElementById('view-tasks').classList.contains('active')) {
      TasksView.renderSidebar();
      TasksView.filterAndRender();
    }
    if (document.getElementById('view-finance').classList.contains('active')) {
      FinanceView.render();
    }
    if (document.getElementById('view-areas').classList.contains('active')) {
      AreasView.render();
    }
    if (document.getElementById('view-habits').classList.contains('active')) {
      HabitsView.render();
    }
    if (document.getElementById('view-review').classList.contains('active')) {
      ReviewView.render();
    }
    if (document.getElementById('view-now').classList.contains('active')) {
      NowView.render();
    }
    NextUpBar.render();
  }

  function showLoading(show) {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  /** Fase 8: feedback ao fim de cada ciclo do pomodoro */
  function onPomodoroComplete(finishedMode) {
    if (finishedMode === 'work') {
      const breakMin = Math.round(PomodoroService.getState().total / 60);
      Feedback.celebrate('medium');
      Feedback.toast(`Foco concluído. Pausa de ${breakMin} min`, 'success');
    } else {
      Feedback.toast('Volta ao trabalho', 'info'); // fim de pausa não é vitória
    }
  }

  /** Fase 8: celebra a conclusão; o pulso segura o re-render por só 180ms */
  function celebrateTaskDone(task, checkbox) {
    const level = TaskService.completionLevel(task);
    Feedback.celebrate(level);
    if (level === 'large') Feedback.toast('Dia limpo. Bom trabalho.', 'success');
    if (checkbox && Feedback.animationsOn()) {
      checkbox.classList.add('checked');
      Feedback.pulse(checkbox);
      setTimeout(Navigation.renderAll, Constants.FEEDBACK.PULSE_MS);
    } else {
      Navigation.renderAll();
    }
  }

  // ===== Expõe globals para onclick="..." inline =====

  function exposeGlobals() {

    // --- Navigation & UI shell ---
    window.showView         = Navigation.showView;
    window.toggleTheme      = Theme.toggle;
    window.openModal        = Modal.open;
    window.closeModal       = Modal.close;
    window.openMobileSidebar  = MobileSidebar.open;
    window.closeMobileSidebar = MobileSidebar.close;
    window.openSettingsModal  = SettingsModal.open;
    window.SettingsModal      = SettingsModal;

    // --- Login/Logout ---
    window.loginWithGoogle  = LoginScreen.login;
    window.logoutUser       = LoginScreen.logout;

    // --- Inbox (captura GTD + card do dashboard) ---
    window.inboxToggleCapture = InboxCapture.toggle;
    window.inboxCaptureSave   = InboxCapture.save;
    window.inboxCaptureKey    = InboxCapture.keyHandler;
    window.inboxStartVoice    = InboxCapture.startVoice;
    window.inboxToTask        = DashboardView.inboxToTask;
    window.inboxEditStart     = DashboardView.inboxEditStart;
    window.inboxEditSave      = DashboardView.inboxEditSave;
    window.inboxEditCancel    = DashboardView.inboxEditCancel;
    window.inboxEditKey       = DashboardView.inboxEditKey;
    window.inboxDelete        = DashboardView.inboxDelete;

    // --- Dashboard ---
    window.dashOpenDay        = DashboardView.openDay;
    window.dashToggleHardMode = DashboardView.toggleHardMode;
    window.dashHardExpand     = DashboardView.hardExpand;

    // --- Habits ---
    window.HabitsView         = HabitsView;

    // --- Review / Comeback (Fase 6) ---
    window.ReviewView         = ReviewView;
    window.ComebackView       = ComebackView;

    // --- Modo Agora / Faixa de próximo compromisso (Fase 7) ---
    window.NowView            = NowView;
    window.NextUpBar          = NextUpBar;

    // --- Quick add universal (FAB, dashboard, projeto, paleta) ---
    window.quickAdd            = (opts) => QuickAddPopover.open(opts);
    window.QuickAddPopover     = QuickAddPopover;

    // --- Tasks (legacy modal + actions) ---
    window.openTaskModal       = TaskModal.open;
    window.saveTask            = TaskModal.save;
    window.updateProjectSelect = TaskModal.updateProjectSelect;
    window.deleteTask          = id => {
      if (!confirm('Excluir tarefa?')) return;
      TaskService.remove(id);
      Navigation.renderAll();
    };
    window.toggleTask          = id => {
      const task = TaskService.getById(id);
      const completing = task && Utils.isTaskOpen(task);
      TaskService.toggle(id);
      if (completing) {
        celebrateTaskDone(task, window.event?.target?.closest?.('.tt-check'));
      } else {
        Navigation.renderAll();
      }
    };

    // --- TickTick task layout ---
    window.ttSetList            = TasksView.setList;
    window.ttOpenQuick          = TasksView.openQuick;
    window.ttCloseQuick         = TasksView.closeQuick;
    window.ttQuickSave          = TasksView.quickSave;
    window.ttQuickKey           = TasksView.quickKeyHandler;
    window.ttQuickPreview       = TasksView.quickPreview;
    window.ttqOpenSchedule      = TasksView.openSchedule;
    window.ttqCyclePriority     = TasksView.quickCyclePriority;

    // --- Date/Duration popover ---
    window.dpTab                = DatePopover.setTab;
    window.dpNav                = DatePopover.navMonth;
    window.dpPickDay            = DatePopover.pickDay;
    window.dpSetTime            = DatePopover.setTime;
    window.dpSetDurDate         = DatePopover.setDurDate;
    window.dpToggleAllDay       = DatePopover.toggleAllDay;
    window.dpSetRepeat          = DatePopover.setRepeat;
    window.dpClear              = DatePopover.clear;
    window.dpApply              = DatePopover.apply;
    window.ttCyclePri           = TasksView.cyclePri;
    window.ttDupTaskById        = TasksView.duplicateById;
    window.ttHardExpand         = TasksView.hardExpand;

    // --- Task detail panel ---
    window.ttOpenDetail         = TaskDetail.open;
    window.ttCloseDetail        = TaskDetail.close;
    window.ttSaveField          = TaskDetail.saveField;
    window.ttSaveArea           = TaskDetail.saveArea;
    window.ttSaveDetailName     = TaskDetail.saveName;
    window.ttDetailToggle       = TaskDetail.toggleStatus;
    window.ttDetailCyclePri     = TaskDetail.cyclePriority;
    window.ttDetailPickDate     = TaskDetail.pickDate;
    window.ttPersistNotes       = TaskDetail.persistNotes;
    window.ttNotesPaste         = TaskDetail.notesPaste;
    window.ttNotesDrop          = TaskDetail.notesDrop;
    window.ttNotesAttach        = TaskDetail.notesAttach;
    window.ttDupTask            = TaskDetail.duplicateAndOpen;
    window.ttDeleteFromDetail   = TaskDetail.deleteAndClose;
    window.ttAddSub             = TaskDetail.addSub;
    window.ttToggleSub          = TaskDetail.toggleSub;
    window.ttRenameSub          = TaskDetail.renameSub;
    window.ttDeleteSub          = TaskDetail.deleteSub;

    // --- Pomodoro ---
    window.pomoSetMode = PomodoroUI.setMode;
    window.pomoToggle  = PomodoroUI.toggle;
    window.pomoReset   = PomodoroUI.reset;

    // --- Areas ---
    window.openAreaModal    = AreaModal.open;
    window.saveArea         = AreaModal.save;
    window.deleteArea       = AreaModal.remove;
    window.addProjectField  = AreaModal.addProjectField;
    window.selectColor      = AreaModal.selectColor;

    // --- Finance ---
    window.openFinModal     = FinanceModal.open;
    window.saveFinEntry     = FinanceModal.save;
    window.setFinType       = FinanceModal.setType;
    window.FinanceModal     = FinanceModal;
    window.FinanceQuickAdd  = FinanceQuickAdd;

    // --- Projects ---
    window.openNewProjectModal = ProjectModal.open;
    window.saveNewProject      = ProjectModal.save;
    window.openEditProject     = ProjectModal.open;
    window.deleteProject       = ProjectModal.remove;
    window.npSelectColor       = ProjectModal.selectColor;
    window.openProject         = AreasView.openProject;
    window.setProjTab          = AreasView.setProjTab;
    window.pSaveField          = AreasView.saveField;
    window.searchProjects      = AreasView.searchProjects;
    window.renderProjectList   = AreasView.renderProjectList;
    window.addTaskToProject    = AreasView.addTaskToCurrent;

    // --- Calendar ---
    window.openCalendar      = CalendarView.enter;
    window.setCalView        = CalendarView.setView;
    window.calNavigate       = CalendarView.navigate;
    window.calGoToday        = CalendarView.goToday;
    window.toggleCalFilter   = CalendarView.toggleFilterPanel;
    window.clearCalFilters   = CalendarView.clearFilters;
    window.toggleCalArea     = CalendarView.toggleArea;
    window.setCalProjFilter  = CalendarView.setProjectFilter;
    window.calDayPopover     = CalendarView.showDayPopover;
    window.closeDayPopover   = CalendarView.closeDayPopover;
    window.popCyclePri       = CalendarView.popCyclePri;
    window.popKeyDown        = CalendarView.popKeyDown;
    window.popSaveTask       = CalendarView.popSaveTask;
    window.popOpenFull       = CalendarView.popOpenFull;
    window.popOpenDate       = CalendarView.popOpenDate;
    window.popToggleAreaMenu = CalendarView.popToggleAreaMenu;
    window.popPickArea       = CalendarView.popPickArea;
    window.popParseInput     = CalendarView.popParseInput;
    window.calCreateTask     = CalendarView.createTask;
    window.miniCalNav        = CalendarView.miniCalNav;
    window.miniCalSelect     = CalendarView.miniCalSelect;

    // --- Note editor ---
    window.openNote            = NoteEditor.open;
    window.closeNoteOverlay    = NoteEditor.close;
    window.saveCurrentNote     = NoteEditor.save;
    window.deleteNote          = NoteEditor.remove;
    window.noteCmd             = NoteEditor.cmd;
    window.noteInsertImages    = NoteEditor.insertFromFiles;
    window.noteHandlePaste     = NoteEditor.handlePaste;
    window.noteHandleDrop      = NoteEditor.handleDrop;
    window.noteOverlayClick    = NoteEditor.handleOverlayClick;

    // --- Files ---
    window.handleFileSelect = FileHandler.handleSelect;
    window.handleFileDrop   = FileHandler.handleDrop;
    window.openFile         = FileHandler.open;
    window.downloadFile     = FileHandler.download;
    window.deleteFile       = FileHandler.remove;

    // --- Modules (para uso inline) ---
    window.AppState         = AppState;
    window.CalendarView     = CalendarView;
    window.AreasView        = AreasView;
    window.TasksView        = TasksView;
    window.DashboardView    = DashboardView;
    window.FinanceView      = FinanceView;
    window.TaskDetail       = TaskDetail;
    window.TaskModal        = TaskModal;
    window.NoteEditor       = NoteEditor;
    window.ImageResize      = ImageResize;
    window.FileHandler      = FileHandler;
  }
})();
