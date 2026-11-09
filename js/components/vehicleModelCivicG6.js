/**
 * ===================== VEHICLE MODEL (CIVIC G6) =====================
 * Modelo 3D real do carro (arquivo glTF binário em /models, passa pelo cache de
 * assets do service worker). Mesmo contrato do modelo procedural:
 *   { id, async load(THREE) -> { root, paint[], wheels[], glass[], suspended, cmPerUnit } }
 * O arquivo já vem na convenção do app: metros, frente em +X, teto em +Y, direita
 * em +Z, rodas em y = 0. Os materiais que a aparência muda são achados pelo nome
 * (papel); os demais ficam como vieram. Licença CC BY-NC 4.0: o crédito aparece na
 * Garagem (Constants.VEHICLE.MODEL_CREDIT). A sombra sob o carro vem do modelo procedural.
 */

const VehicleModelCivicG6 = (() => {

  const { MODEL_URL, CM_PER_UNIT } = Constants.VEHICLE.SCENE;
  const MATERIAL_ROLES = { paint: ['paint'], wheels: ['wheel_rim'], glass: ['glass_tinted', 'glass_tinted_side'] };
  const SUSPENDED_NODE = 'body';
  const SHADOW_PLANE_M = [5.4, 3.1];
  // Sem mapa de ambiente, metal puro (metalness 1) só reflete as luzes e o aro fica escuro: o teto deixa a cor escolhida aparecer.
  const RIM_MAX_METALNESS = 0.5;
  const ROLE_LABELS = { paint: 'a pintura', wheels: 'o aro das rodas', glass: 'os vidros' };

  let loaderPromise = null;

  /** Import memoizado; se a biblioteca não baixa, a próxima chamada tenta de novo. */
  function loadGltfLoader() {
    loaderPromise ??= import('three/addons/loaders/GLTFLoader.js')
      .then(module => module.GLTFLoader)
      .catch(error => {
        loaderPromise = null;
        throw error;
      });
    return loaderPromise;
  }

  function collectMaterials(root) {
    const byName = new Map();
    root.traverse(object => {
      [].concat(object.material || []).forEach(material => byName.set(material.name, material));
    });
    return byName;
  }

  /** Materiais de cada papel; o vidro precisa ser transparente e não escrever profundidade. */
  function pickRoles(root) {
    const byName = collectMaterials(root);
    const roles = {};
    Object.entries(MATERIAL_ROLES).forEach(([role, names]) => {
      roles[role] = names.map(name => byName.get(name)).filter(Boolean);
      if (!roles[role].length) throw new Error(`O modelo do carro não tem ${ROLE_LABELS[role]} (material ${names.join(' ou ')}).`);
    });
    roles.glass.forEach(material => {
      material.transparent = true;
      material.depthWrite = false;
    });
    roles.wheels.forEach(material => { material.metalness = Math.min(material.metalness, RIM_MAX_METALNESS); });
    return roles;
  }

  function pickSuspended(root) {
    const node = root.getObjectByName(SUSPENDED_NODE);
    if (!node) throw new Error(`O modelo do carro não tem o nó "${SUSPENDED_NODE}" (carroceria).`);
    return node;
  }

  /** Arquivo que não serve: solta a memória dele antes de repassar o erro. */
  function disposeScene(root) {
    root.traverse(object => {
      object.geometry?.dispose();
      [].concat(object.material || []).forEach(material => material.dispose());
    });
  }

  function describe(THREE, root) {
    try {
      const model = { root, ...pickRoles(root), suspended: pickSuspended(root), cmPerUnit: CM_PER_UNIT };
      root.add(VehicleModelProcedural.buildShadow(THREE, SHADOW_PLANE_M));
      return model;
    } catch (error) {
      disposeScene(root);
      throw error;
    }
  }

  async function load(THREE) {
    const GLTFLoader = await loadGltfLoader();
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    return describe(THREE, gltf.scene);
  }

  return { id: 'civic-g6', load };
})();
