/**
 * ===================== APP BOOTSTRAP =====================
 * Wires every module together on startup:
 *  1. Initialize theme and mobile UI
 *  2. Register views with the Navigation module
 *  3. Expose function aliases on window so inline onclick="..." attributes work
 *  4. Render the initial views
 *
 * No business logic here — only wiring.
 */

(function bootstrap() {

  // ===== 1. Initialize subsystems =====
  Theme.init();
  MobileSidebar.init();
  Modal.wireBackdropClicks();

  // Close day-popover when clicking outside it
  document.addEventListener('click', e => {
    if (e.target.closest('.month-day')) return;
    if (e.target.closest('.cal-popover')) return;
    CalendarView.closeDayPopover();
  });

  // ===== 2. Register views with the Navigation module =====
  Navigation.register('dashboard', DashboardView.render);
  Navigation.register('tasks', () => {
    TasksView.renderSidebar();
    TasksView.filterAndRender();
  });
  Navigation.register('calendar', CalendarView.render);
  Navigation.register('finance', FinanceView.render);
  Navigation.register('areas', AreasView.render);

  // ===== 3. Expose globals for inline onclick handlers =====

  // --- Navigation & UI shell ---
  window.showView         = Navigation.showView;
  window.toggleTheme      = Theme.toggle;
  window.openModal        = Modal.open;
  window.closeModal       = Modal.close;
  window.openMobileSidebar  = MobileSidebar.open;
  window.closeMobileSidebar = MobileSidebar.close;

  // --- Tasks (legacy modal + actions used across views) ---
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
  window.ttqUpdateDate        = TasksView.quickUpdateDate;
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

  // --- Convenience ---
  window.AppState         = AppState;     // used by inline `AppState.ui.calDate=…`
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

  // ===== 4. Initial render =====
  DashboardView.render();
  CalendarView.render();
})();
