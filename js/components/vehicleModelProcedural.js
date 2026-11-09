/**
 * ===================== VEHICLE MODEL (PROCEDURAL) =====================
 * Sedan de referência (~4,45 x 1,70 x 1,38 m) montado só com formas simples do
 * three.js: nenhum arquivo de modelo para baixar. Unidade = metro, frente em +X,
 * chão em y = 0. Um modelo glTF pode entrar depois com o mesmo contrato:
 *   { id, async load(THREE) -> { root, paint[], wheels[], glass[], suspended, cmPerUnit } }
 * paint/wheels/glass são listas de materiais; suspended é o grupo que sobe e desce
 * com a altura de rodagem (carroceria, vidros e faróis; as rodas ficam fora).
 *
 * As medidas e cores abaixo são dados do modelo (não configuração do app): ficam
 * aqui, nomeadas, e não em Constants.
 */

const VehicleModelProcedural = (() => {

  const { CM_PER_UNIT } = Constants.VEHICLE.SCENE;
  const { DEFAULT_PAINT, DEFAULT_WHEELS } = Constants.VEHICLE.VISUAL;
  const HALF_TURN = Math.PI;
  const QUARTER_TURN = Math.PI / 2;

  // ===== Medidas =====

  const WHEEL = {
    radius: 0.29, width: 0.215, rimRadius: 0.2, axleX: 1.35, trackZ: 0.76, archRadius: 0.36, archSegments: 28,
    tireSegments: 32, rimSegments: 28, rimOverhang: 0.01, faceOffset: 0.006,
    lipTube: 0.02, lipTubeSegments: 8, spokeCount: 5, spokeLength: 1.9, spokeThickness: 0.045, spokeDepth: 0.02
  };
  const SIDE_Z = 0.852;
  const BEVEL_SIZE_RATIO = 0.6;
  const BEVEL_SEGMENTS = 5;

  // Perfis laterais [x, y] em metros; a extrusão alarga cada perfil pelo chanfro.
  const BODY_PROFILE = [[-2.15, 0.3], [-2.17, 0.42], [-2.15, 0.82], [-1.85, 0.9], [-1.15, 0.92], [-0.3, 0.93],
    [0.45, 0.91], [1.5, 0.83], [2.05, 0.7], [2.17, 0.56], [2.16, 0.4], [2.1, 0.3], [1.7, 0.25], [-1.7, 0.25]];
  const CABIN_PROFILE = [[-1.5, 0.92], [-1.0, 1.3], [0.05, 1.33], [0.8, 0.92]];
  const GLASS_PROFILE = [[-1.52, 0.9], [-1.02, 1.29], [0.05, 1.32], [0.82, 0.9]];
  // Janelas laterais vazadas na carcaça da cabine (porta da frente e de trás); o vidro aparece por trás.
  const SIDE_WINDOWS = [[[0, 1], [0, 1.27], [0.06, 1.27], [0.55, 1]], [[-0.12, 1], [-0.12, 1.27], [-0.92, 1.27], [-1.29, 1]]];
  const SHELL_PARTS = [
    { profile: BODY_PROFILE, width: 1.7, bevel: 0.1, material: 'paint' },
    { profile: CABIN_PROFILE, width: 1.42, bevel: 0.05, material: 'paint', holes: SIDE_WINDOWS },
    { profile: GLASS_PROFILE, width: 1.3, bevel: 0.03, material: 'glass' }
  ];

  // Detalhes espelhados nos dois lados (z positivo; o espelho multiplica z por -1) e detalhes centrais.
  const DOOR_GAP = { xs: [0.75, -0.05, -0.95], y: 0.6, size: [0.012, 0.5, 0.008] };
  const MIRRORED_DETAILS = [
    { size: [0.12, 0.09, 0.36], material: 'headlight', position: [2.13, 0.68, 0.58] },
    { size: [0.08, 0.1, 0.38], material: 'taillight', position: [-2.14, 0.8, 0.6] },
    { size: [0.12, 0.08, 0.18], material: 'paint', position: [0.55, 0.98, 0.9] },
    ...DOOR_GAP.xs.map(x => ({ size: DOOR_GAP.size, material: 'dark', position: [x, DOOR_GAP.y, SIDE_Z] }))
  ];
  const CENTER_DETAILS = [
    { size: [0.06, 0.11, 0.72], material: 'dark', position: [2.19, 0.56, 0] },
    { size: [0.05, 0.1, 1.0], material: 'dark', position: [2.18, 0.37, 0] },
    { size: [0.02, 0.12, 0.4], material: 'plate', position: [2.215, 0.42, 0] },
    { size: [0.02, 0.12, 0.4], material: 'plate', position: [-2.19, 0.55, 0] }
  ];

  // Sombra falsa: textura radial em canvas num plano logo acima do chão.
  const SHADOW = {
    texturePx: 128, innerRadiusPx: 4, centerColor: 'rgba(0,0,0,0.55)', edgeColor: 'rgba(0,0,0,0)',
    planeSize: [5.6, 2.9], lift: 0.003
  };

  // ===== Materiais =====

  const COLORS = {
    glass: '#16212b', rubber: '#141518', dark: '#0b0c0e', rim: '#23262b',
    headlight: '#f4f1e6', headlightGlow: '#fff4cc', taillight: '#8a0f14', taillightGlow: '#d4141c', plate: '#e8e8e8'
  };

  function makeMaterials(T) {
    return {
      paint: new T.MeshPhysicalMaterial({ color: DEFAULT_PAINT, metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      glass: new T.MeshStandardMaterial({ color: COLORS.glass, metalness: 0.3, roughness: 0.12, transparent: true, opacity: 0.6 }),
      wheel: new T.MeshStandardMaterial({ color: DEFAULT_WHEELS, metalness: 0.7, roughness: 0.35 }),
      rubber: new T.MeshStandardMaterial({ color: COLORS.rubber, roughness: 0.9 }),
      dark: new T.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.7 }),
      rim: new T.MeshStandardMaterial({ color: COLORS.rim, metalness: 0.4, roughness: 0.6 }),
      headlight: new T.MeshStandardMaterial({ color: COLORS.headlight, emissive: COLORS.headlightGlow, emissiveIntensity: 0.55 }),
      taillight: new T.MeshStandardMaterial({ color: COLORS.taillight, emissive: COLORS.taillightGlow, emissiveIntensity: 0.5 }),
      plate: new T.MeshStandardMaterial({ color: COLORS.plate, roughness: 0.6 })
    };
  }

  // ===== Montagem =====

  function part(T, geometry, material, [x, y, z], rotation = [0, 0, 0]) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(...rotation);
    return mesh;
  }

  function extrudeProfile(T, profile, { width, bevel, holes = [] }) {
    const toPoints = points => points.map(([x, y]) => new T.Vector2(x, y));
    const shape = new T.Shape(toPoints(profile));
    holes.forEach(hole => shape.holes.push(new T.Path(toPoints(hole))));
    const depth = width - 2 * bevel;
    const geometry = new T.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * BEVEL_SIZE_RATIO,
      bevelSegments: BEVEL_SEGMENTS, curveSegments: 1
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  function buildShell(T, mats) {
    const group = new T.Group();
    SHELL_PARTS.forEach(({ material, ...shape }) => group.add(new T.Mesh(extrudeProfile(T, shape.profile, shape), mats[material])));
    return group;
  }

  /** Faróis, lanternas, grade, placas, retrovisores e frestas das portas. */
  function buildDetails(T, mats) {
    const group = new T.Group();
    const box = ({ size, material, position }, mirror = 1) => {
      const [x, y, z] = position;
      group.add(part(T, new T.BoxGeometry(...size), mats[material], [x, y, z * mirror]));
    };
    [-1, 1].forEach(side => MIRRORED_DETAILS.forEach(detail => box(detail, side)));
    CENTER_DETAILS.forEach(detail => box(detail));
    return group;
  }

  /** Meia-lua preta no contorno do paralama, para a roda parecer encaixada na carroceria. */
  function buildArch(T, mats, side, x) {
    const arch = new T.Mesh(new T.CircleGeometry(WHEEL.archRadius, WHEEL.archSegments, 0, HALF_TURN), mats.dark);
    arch.position.set(x, WHEEL.radius, side * SIDE_Z);
    arch.rotation.y = side > 0 ? 0 : HALF_TURN;
    return arch;
  }

  function buildWheel(T, mats, side) {
    const wheel = new T.Group();
    const toAxle = [QUARTER_TURN, 0, 0];
    const face = [0, 0, WHEEL.width / 2 + WHEEL.faceOffset];
    wheel.add(part(T, new T.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, WHEEL.tireSegments), mats.rubber, [0, 0, 0], toAxle));
    wheel.add(part(T, new T.CylinderGeometry(WHEEL.rimRadius, WHEEL.rimRadius, WHEEL.width + WHEEL.rimOverhang, WHEEL.rimSegments), mats.rim, [0, 0, 0], toAxle));
    wheel.add(part(T, new T.TorusGeometry(WHEEL.rimRadius, WHEEL.lipTube, WHEEL.lipTubeSegments, WHEEL.rimSegments), mats.wheel, face));
    for (let i = 0; i < WHEEL.spokeCount; i++) {
      const angle = (i * HALF_TURN) / WHEEL.spokeCount;
      const size = [WHEEL.rimRadius * WHEEL.spokeLength, WHEEL.spokeThickness, WHEEL.spokeDepth];
      wheel.add(part(T, new T.BoxGeometry(...size), mats.wheel, face, [0, 0, angle]));
    }
    wheel.rotation.y = side > 0 ? 0 : HALF_TURN;
    return wheel;
  }

  /** Mancha escura em degradê sob o carro: sombra falsa, sem custo de sombra em tempo real. Também usada pelo modelo real. */
  function buildShadow(T, planeSize = SHADOW.planeSize) {
    const { texturePx: size, innerRadiusPx } = SHADOW;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, innerRadiusPx, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, SHADOW.centerColor);
    gradient.addColorStop(1, SHADOW.edgeColor);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const material = new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
    return part(T, new T.PlaneGeometry(...planeSize), material, [0, SHADOW.lift, 0], [-QUARTER_TURN, 0, 0]);
  }

  function buildWheels(T, mats, suspended, root) {
    [-1, 1].forEach(side => [WHEEL.axleX, -WHEEL.axleX].forEach(x => {
      suspended.add(buildArch(T, mats, side, x));
      const wheel = buildWheel(T, mats, side);
      wheel.position.set(x, WHEEL.radius, side * WHEEL.trackZ);
      root.add(wheel);
    }));
  }

  async function load(T) {
    const mats = makeMaterials(T);
    const root = new T.Group();
    const suspended = new T.Group();
    suspended.add(buildShell(T, mats), buildDetails(T, mats));
    buildWheels(T, mats, suspended, root);
    root.add(suspended, buildShadow(T));
    return { root, paint: [mats.paint], wheels: [mats.wheel], glass: [mats.glass], suspended, cmPerUnit: CM_PER_UNIT };
  }

  return { id: 'civic-sedan-procedural', load, buildShadow };
})();
