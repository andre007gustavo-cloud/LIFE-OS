/**
 * ===================== AREA SERVICE =====================
 * Manages Areas (top-level life categories: Trabalho, Pessoal, etc).
 * Legacy: each area also holds a list of projects (kept for compatibility with task selector).
 */

const AreaService = (() => {

  function getAll() {
    return AppState.getDB().areas;
  }

  function getById(id) {
    return AppState.getDB().areas.find(a => a.id === id);
  }

  function create({ name, icon, color, projects = [] }) {
    const area = { id: Utils.uid(), name, icon, color, projects };
    AppState.getDB().areas.push(area);
    AppState.persist();
    return area;
  }

  function update(id, patch, newProjects = []) {
    const areas = AppState.getDB().areas;
    const idx = areas.findIndex(a => a.id === id);
    if (idx === -1) return null;
    const existing = areas[idx];
    const mergedProjects = [
      ...(existing.projects || []),
      ...newProjects.filter(p => !(existing.projects || []).some(ep => ep.name === p.name))
    ];
    areas[idx] = { ...existing, ...patch, projects: mergedProjects };
    AppState.persist();
    return areas[idx];
  }

  function remove(id) {
    AppState.getDB().areas = AppState.getDB().areas.filter(a => a.id !== id);
    AppState.persist();
  }

  // ===== Legacy nested projects (inside area.projects) =====

  function addNestedProject(areaId, projectData) {
    const area = getById(areaId);
    if (!area) return null;
    const project = {
      id: Utils.uid(),
      name: projectData.name,
      status: projectData.status || 'ativo',
      desc: projectData.desc || ''
    };
    area.projects.push(project);
    AppState.persist();
    return project;
  }

  function findAreaByNestedProjectId(projectId) {
    return getAll().find(a => (a.projects || []).some(p => p.id === projectId));
  }

  return {
    getAll, getById, create, update, remove,
    addNestedProject, findAreaByNestedProjectId
  };
})();
