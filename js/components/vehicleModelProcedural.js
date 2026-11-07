/**
 * ===================== VEHICLE MODEL (PROCEDURAL) =====================
 * Sedan de referência (~4,45 x 1,70 x 1,38 m) montado só com formas simples do
 * three.js: nenhum arquivo de modelo para baixar. Unidade = metro, frente em +X,
 * chão em y = 0. Um modelo glTF pode entrar depois com o mesmo contrato:
 *   { id, async load(THREE) -> { root, paint[], wheels[], glass[], suspended, cmPerUnit } }
 * paint/wheels/glass são listas de materiais; suspended é o grupo que sobe e desce
 * com a altura de rodagem (carroceria, vidros e faróis; as rodas ficam fora).
 */

const VehicleModelProcedural = (() => {

  const { CM_PER_UNIT } = Constants.VEHICLE.SCENE;
  const { DEFAULT_PAINT, DEFAULT_WHEELS } = Constants.VEHICLE.VISUAL;
  const WHEEL = { radius: 0.29, width: 0.215, rimRadius: 0.2, axleX: 1.35, trackZ: 0.76, archRadius: 0.36 };
  const SIDE_Z = 0.852;
  const SPOKES = 10;

  // Perfis laterais [x, y] em metros; a extrusão alarga cada perfil pelo chanfro.
  const BODY_PROFILE = [[-2.15, 0.3], [-2.17, 0.42], [-2.15, 0.82], [-1.85, 0.9], [-1.15, 0.92], [-0.3, 0.93],
    [0.45, 0.91], [1.5, 0.83], [2.05, 0.7], [2.17, 0.56], [2.16, 0.4], [2.1, 0.3], [1.7, 0.25], [-1.7, 0.25]];
  const CABIN_PROFILE = [[-1.5, 0.92], [-1.0, 1.3], [0.05, 1.33], [0.8, 0.92]];
  const GLASS_PROFILE = [[-1.52, 0.9], [-1.02, 1.29], [0.05, 1.32], [0.82, 0.9]];
  // Janelas laterais vazadas na carcaça da cabine (porta da frente e de trás); o vidro aparece por trás.
  const SIDE_WINDOWS = [[[0, 1], [0, 1.27], [0.06, 1.27], [0.55, 1]], [[-0.12, 1], [-0.12, 1.27], [-0.92, 1.27], [-1.29, 1]]];

  function makeMaterials(T) {
    return {
      paint: new T.MeshPhysicalMaterial({ color: DEFAULT_PAINT, metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      glass: new T.MeshStandardMaterial({ color: '#16212b', metalness: 0.3, roughness: 0.12, transparent: true, opacity: 0.6 }),
      wheel: new T.MeshStandardMaterial({ color: DEFAULT_WHEELS, metalness: 0.7, roughness: 0.35 }),
      rubber: new T.MeshStandardMaterial({ color: '#141518', roughness: 0.9 }),
      dark: new T.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.7 }),
      rim: new T.MeshStandardMaterial({ color: '#23262b', metalness: 0.4, roughness: 0.6 }),
      headlight: new T.MeshStandardMaterial({ color: '#f4f1e6', emissive: '#fff4cc', emissiveIntensity: 0.55 }),
      taillight: new T.MeshStandardMaterial({ color: '#8a0f14', emissive: '#d4141c', emissiveIntensity: 0.5 }),
      plate: new T.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.6 })
    };
  }

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
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 5, curveSegments: 1
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  function buildShell(T, mats) {
    const group = new T.Group();
    group.add(new T.Mesh(extrudeProfile(T, BODY_PROFILE, { width: 1.7, bevel: 0.1 }), mats.paint));
    group.add(new T.Mesh(extrudeProfile(T, CABIN_PROFILE, { width: 1.42, bevel: 0.05, holes: SIDE_WINDOWS }), mats.paint));
    group.add(new T.Mesh(extrudeProfile(T, GLASS_PROFILE, { width: 1.3, bevel: 0.03 }), mats.glass));
    return group;
  }

  /** Faróis, lanternas, grade, placas, retrovisores e frestas das portas, espelhados nos dois lados. */
  function buildDetails(T, mats) {
    const group = new T.Group();
    [-1, 1].forEach(side => {
      group.add(part(T, new T.BoxGeometry(0.12, 0.09, 0.36), mats.headlight, [2.13, 0.68, side * 0.58]));
      group.add(part(T, new T.BoxGeometry(0.08, 0.1, 0.38), mats.taillight, [-2.14, 0.8, side * 0.6]));
      group.add(part(T, new T.BoxGeometry(0.12, 0.08, 0.18), mats.paint, [0.55, 0.98, side * 0.9]));
      [0.75, -0.05, -0.95].forEach(x => group.add(part(T, new T.BoxGeometry(0.012, 0.5, 0.008), mats.dark, [x, 0.6, side * SIDE_Z])));
    });
    group.add(part(T, new T.BoxGeometry(0.06, 0.11, 0.72), mats.dark, [2.19, 0.56, 0]));
    group.add(part(T, new T.BoxGeometry(0.05, 0.1, 1.0), mats.dark, [2.18, 0.37, 0]));
    group.add(part(T, new T.BoxGeometry(0.02, 0.12, 0.4), mats.plate, [2.215, 0.42, 0]));
    group.add(part(T, new T.BoxGeometry(0.02, 0.12, 0.4), mats.plate, [-2.19, 0.55, 0]));
    return group;
  }

  /** Meia-lua preta no contorno do paralama, para a roda parecer encaixada na carroceria. */
  function buildArch(T, mats, side, x) {
    const arch = new T.Mesh(new T.CircleGeometry(WHEEL.archRadius, 28, 0, Math.PI), mats.dark);
    arch.position.set(x, WHEEL.radius, side * SIDE_Z);
    arch.rotation.y = side > 0 ? 0 : Math.PI;
    return arch;
  }

  function buildWheel(T, mats, side) {
    const wheel = new T.Group();
    const toAxle = [Math.PI / 2, 0, 0];
    wheel.add(part(T, new T.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, 32), mats.rubber, [0, 0, 0], toAxle));
    wheel.add(part(T, new T.CylinderGeometry(WHEEL.rimRadius, WHEEL.rimRadius, WHEEL.width + 0.01, 28), mats.rim, [0, 0, 0], toAxle));
    wheel.add(part(T, new T.TorusGeometry(WHEEL.rimRadius, 0.02, 8, 28), mats.wheel, [0, 0, WHEEL.width / 2 + 0.006]));
    for (let i = 0; i < SPOKES / 2; i++) {
      const angle = (i * Math.PI) / (SPOKES / 2);
      wheel.add(part(T, new T.BoxGeometry(WHEEL.rimRadius * 1.9, 0.045, 0.02), mats.wheel, [0, 0, WHEEL.width / 2 + 0.006], [0, 0, angle]));
    }
    wheel.rotation.y = side > 0 ? 0 : Math.PI;
    return wheel;
  }

  /** Mancha escura em degradê sob o carro: sombra falsa, sem custo de sombra em tempo real. */
  function buildShadow(T) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const material = new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
    return part(T, new T.PlaneGeometry(5.6, 2.9), material, [0, 0.003, 0], [-Math.PI / 2, 0, 0]);
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

  return { id: 'civic-sedan-procedural', load };
})();
