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
  let appInitialized = false;

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
      renderActiveViews();

      // Escuta mudanças de outros dispositivos em tempo real
      Storage.listenForChanges((data) => {
        AppState.setDB(data);
        renderActiveViews();
      });

    } else {
      // Não logado
      Storage.stopListening();
      PomodoroService.reset(); // para o timer que continuaria rodando após logout
      appInitialized = false;
      LoginScreen.show();
    }
  });

  // ===== Inicialização do app (chamada uma vez) =====

  function initializeApp() {
    MobileSidebar.init();
    Modal.wireBackdropClicks();

    // Close day-popover quando clica fora
    document.addEventListener('click', e => {
      if (e.target.closest('.month-day')) return;
      if (e.target.closest('.cal-popover')) return;
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
  }

  function showLoading(show) {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = show ? 'flex' : 'none';
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

    // --- Login/Logout ---
    window.loginWithGoogle  = LoginScreen.login;
    window.logoutUser       = LoginScreen.logout;

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
      TaskService.toggle(id);
      Navigation.renderAll();
    };

    // --- TickTick task layout ---
    window.ttSetList            = TasksView.setList;
    window.ttOpenQuick          = TasksView.openQuick;
    window.ttCloseQuick         = TasksView.closeQuick;
    window.ttQuickSave          = TasksView.quickSave;
    window.ttQuickKey           = TasksView.quickKeyHandler;
    window.ttqPickDate          = TasksView.quickPickDate;
    window.ttqPickTime          = TasksView.quickPickTime;
    window.ttqUpdateDate        = TasksView.quickUpdateDate;
    window.ttqUpdateTime        = TasksView.quickUpdateTime;
    window.ttqCyclePriority     = TasksView.quickCyclePriority;
    window.ttCyclePri           = TasksView.cyclePri;
    window.ttDupTaskById        = TasksView.duplicateById;

    // --- Task detail panel ---
    window.ttOpenDetail         = TaskDetail.open;
    window.ttCloseDetail        = TaskDetail.close;
    window.ttSaveField          = TaskDetail.saveField;
    window.ttSaveDetailName     = TaskDetail.saveName;
    window.ttDupTask            = TaskDetail.duplicateAndOpen;
    window.ttDeleteFromDetail   = TaskDetail.deleteAndClose;
    window.ttTagKey             = TaskDetail.tagKeyHandler;
    window.ttRemoveTag          = TaskDetail.removeTag;
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
    window.setFinTab        = FinanceView.setTab;
    window.deleteFinEntry   = FinanceView.deleteEntry;

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
