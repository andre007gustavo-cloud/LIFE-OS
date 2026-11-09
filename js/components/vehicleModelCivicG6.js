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

  const { MODEL_URL, CM_PER_UNIT, SHADOW_PLANE_M } = Constants.VEHICLE.SCENE;
  const MATERIAL_ROLES = { paint: ['paint'], wheels: ['wheel_rim'], glass: ['glass_tinted', 'glass_tinted_side'] };
  const SUSPENDED_NODE = 'body';
  const ROLE_LABELS = { paint: 'a pintura', wheels: 'o aro das rodas', glass: 'os vidros' };

  let loaderPromise = null;
  // Arquivo com conteúdo que não serve (papel ou nó ausente): lembrado até recarregar a página, para não baixar e ler 4,4 MB à toa a cada visita.
  let contentError = null;

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
    return roles;
  }

  function pickSuspended(root) {
    const node = root.getObjectByName(SUSPENDED_NODE);
    if (!node) throw new Error(`O modelo do carro não tem o nó "${SUSPENDED_NODE}" (carroceria).`);
    return node;
  }

  /** Só erro do conteúdo do arquivo (papel ou nó ausente) é lembrado; o arquivo que não serve é liberado. */
  function describeContent(root) {
    try {
      return { root, ...pickRoles(root), suspended: pickSuspended(root), cmPerUnit: CM_PER_UNIT };
    } catch (error) {
      root.traverse(VehicleModelProcedural.disposeObject);
      contentError = error;
      throw error;
    }
  }

  /** A sombra é enfeite: se não der para desenhá-la (canvas indisponível), o carro sobe sem ela. */
  function addShadow(THREE, root) {
    try {
      root.add(VehicleModelProcedural.buildShadow(THREE, SHADOW_PLANE_M));
    } catch (error) {
      console.warn('[VehicleModelCivicG6] Sem a sombra sob o carro:', error);
    }
  }

  function describe(THREE, root) {
    const model = describeContent(root);
    addShadow(THREE, root);
    return model;
  }

  async function load(THREE) {
    if (contentError) throw contentError;
    const GLTFLoader = await loadGltfLoader();
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    return describe(THREE, gltf.scene);
  }

  return { id: 'civic-g6', load };
})();
