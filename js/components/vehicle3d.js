/**
 * ===================== VEHICLE 3D =====================
 * Carro 3D da Garagem (three.js, carregado por import map só quando a Garagem
 * pede). Um único canvas/contexto WebGL vive de uma renderização da tela para a
 * próxima: o AreasView reescreve o HTML a cada mudança, então mount() só move o
 * mesmo canvas para o host novo, na hora. Quando a Garagem sai da tela,
 * releaseIfDetached() libera tudo. Sem import map, sem WebGL ou com falha na
 * carga, o host mantém o conteúdo inicial (a silhueta) e nada quebra.
 *
 * Carrega o modelo real (VehicleModelCivicG6) e cai no procedural se ele falhar.
 * Não lê service nenhum: quem chama passa os estados das zonas prontos.
 */

const Vehicle3D = (() => {

  const { SCENE, ZONES, ZONE_STATE, VISUAL } = Constants.VEHICLE;
  const Geometry = VehicleZoneGeometry;
  const { disposeObject } = VehicleModelProcedural;
  const HOST_READY_CLASS = 'is-3d';
  // Resultado de mount quando a Garagem saiu da tela no meio da montagem: não é falha, ninguém deve mostrar aviso.
  const ABORTED = null;
  const CANVAS_LABEL = 'Carro em 3D. Toque numa região para ver os detalhes dela; os botões de zona abaixo fazem o mesmo pelo teclado.';

  let libsPromise = null;
  let failed = false;
  let starting = null;
  let session = null;
  let host = null;
  let options = { zoneStates: {}, selectedZone: null, onZoneSelect: null, look: null };

  // ===== Suporte e carga =====

  function isSupported() {
    const hasImportMap = !!document.querySelector('script[type="importmap"]')
      && (typeof HTMLScriptElement.supports !== 'function' || HTMLScriptElement.supports('importmap'));
    return !failed && hasImportMap && typeof WebGLRenderingContext !== 'undefined';
  }

  /**
   * Import memoizado: a biblioteca baixa uma vez só, mesmo que a Garagem abra e feche.
   * Se o download falha (rede), a promessa é descartada para a próxima montagem tentar de novo.
   */
  function loadLibs() {
    libsPromise ??= Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js')])
      .then(([THREE, controls, environment]) => ({ THREE, OrbitControls: controls.OrbitControls, RoomEnvironment: environment.RoomEnvironment }))
      .catch(error => {
        libsPromise = null;
        throw error;
      });
    return libsPromise;
  }

  // ===== Montagem da cena =====

  function createRenderer(THREE) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SCENE.MAX_PIXEL_RATIO));
    renderer.domElement.className = 'veh-3d-canvas';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', CANVAS_LABEL);
    return renderer;
  }

  function addLights(THREE, scene) {
    const { SKY, SUN, FILL } = SCENE.LIGHTS;
    const sky = new THREE.HemisphereLight(SKY.color, SKY.ground, SKY.intensity);
    const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
    sun.position.set(...SUN.position);
    const fill = new THREE.DirectionalLight(FILL.color, FILL.intensity);
    fill.position.set(...FILL.position);
    scene.add(sky, sun, fill);
  }

  /** Ambiente de estúdio gerado uma vez: dá o que a pintura metálica e o verniz refletem. Devolve o alvo a liberar no fim. */
  function buildEnvironment({ THREE, RoomEnvironment }, renderer, scene) {
    const generator = new THREE.PMREMGenerator(renderer);
    let room = null;
    try {
      room = new RoomEnvironment();
      const target = generator.fromScene(room, SCENE.ENV_BLUR_SIGMA);
      scene.environment = target.texture;
      scene.environmentIntensity = SCENE.ENV_INTENSITY;
      return target;
    } finally {
      room?.dispose();
      generator.dispose();
    }
  }

  /** O ambiente só melhora o reflexo: se o aparelho não consegue gerá-lo (ex.: sem alvo half-float), o carro sobe sem ele (alvo null). */
  function addEnvironment(libs, renderer, scene) {
    try {
      return buildEnvironment(libs, renderer, scene);
    } catch (error) {
      console.warn('[Vehicle3D] Sem mapa de ambiente, o reflexo da pintura fica mais simples:', error);
      return null;
    }
  }

  /** Uma caixa translúcida por zona, sempre à vista (depthTest off): marca onde está o sintoma ou o plano. */
  function buildZoneMeshes(THREE, group) {
    const meshes = new Map();
    ZONES.forEach(zone => {
      const box = Geometry.worldBox(zone.box);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...box.max.map((v, i) => v - box.min[i])),
        new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })
      );
      mesh.position.set(...Geometry.boxCenter(box));
      mesh.renderOrder = SCENE.ZONE_RENDER_ORDER;
      mesh.visible = false;
      group.add(mesh);
      meshes.set(zone.id, mesh);
    });
    return meshes;
  }

  function createControls(OrbitControls, camera, canvas) {
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = SCENE.DAMPING_FACTOR;
    controls.minPolarAngle = Math.PI / 2 - SCENE.MAX_ELEVATION_DEG * SCENE.DEG_TO_RAD;
    controls.maxPolarAngle = Math.PI / 2;
    canvas.style.touchAction = 'pan-y';
    return controls;
  }

  function placeCamera(s, pose) {
    s.camera.position.set(...pose.position);
    s.controls.target.set(...pose.target);
    s.controls.update();
  }

  /**
   * Monta a sessão e assume o modelo: se qualquer passo falha, solta tudo o que já nasceu
   * (modelo, caixas das zonas, ambiente, contexto WebGL) antes de repassar o erro.
   */
  function createSession(libs, model) {
    const scene = new libs.THREE.Scene();
    scene.add(model.root);
    let renderer = null;
    let envTarget = null;
    try {
      renderer = createRenderer(libs.THREE);
      envTarget = addEnvironment(libs, renderer, scene);
      return assembleSession(libs, { model, scene, renderer, envTarget });
    } catch (error) {
      scene.traverse(disposeObject);
      envTarget?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      throw error;
    }
  }

  function assembleSession(libs, { model, scene, renderer, envTarget }) {
    const { THREE, OrbitControls } = libs;
    const zoneGroup = new THREE.Group();
    scene.add(zoneGroup);
    addLights(THREE, scene);
    const camera = new THREE.PerspectiveCamera(SCENE.FOV_DEG, 1, SCENE.CAMERA_NEAR, SCENE.CAMERA_FAR);
    const zoneMeshes = buildZoneMeshes(THREE, zoneGroup);
    const s = {
      renderer, scene, envTarget, camera, model, zoneMeshes, canvas: renderer.domElement, raycaster: new THREE.Raycaster(),
      base: captureBase(model),
      controls: createControls(OrbitControls, camera, renderer.domElement),
      dirty: true, raf: 0, flight: null, inView: true, contextLost: false, pointerDown: null, cleanups: []
    };
    placeCamera(s, poseFor(options.selectedZone));
    return s;
  }

  // ===== Realce das zonas =====

  function highlightOf(zoneId) {
    const state = options.zoneStates[zoneId] || ZONE_STATE.NEUTRAL;
    const selected = zoneId === options.selectedZone;
    return {
      visible: selected || state !== ZONE_STATE.NEUTRAL,
      color: SCENE.HIGHLIGHT_COLORS[state],
      opacity: selected ? SCENE.HIGHLIGHT_OPACITY_SELECTED : SCENE.HIGHLIGHT_OPACITY
    };
  }

  function applyHighlights() {
    if (!session) return;
    session.zoneMeshes.forEach((mesh, zoneId) => {
      const { visible, color, opacity } = highlightOf(zoneId);
      mesh.visible = visible;
      mesh.material.color.set(color);
      mesh.material.opacity = opacity;
    });
    requestRender();
  }

  // ===== Aparência (pintura, rodas, película, altura) =====

  /** Guarda como o modelo veio (cores e vidro): é a esse estado que "sem valor" volta. */
  function captureBase({ paint, wheels, glass }) {
    return {
      paint: paint.map(material => material.color.clone()),
      wheels: wheels.map(material => material.color.clone()),
      glass: glass.map(material => ({ opacity: material.opacity, color: material.color.clone() }))
    };
  }

  /** Película 0-1: parte do vidro limpo e escurece/opacifica. */
  function tintGlass(material, tint) {
    const clear = VISUAL.GLASS_CLEAR;
    material.opacity = clear.opacity + (VISUAL.GLASS_MAX_OPACITY - clear.opacity) * tint;
    material.color.set(clear.color).multiplyScalar(1 - VISUAL.GLASS_MAX_DARKEN * tint);
  }

  function restoreGlass(material, base) {
    material.opacity = base.opacity;
    material.color.copy(base.color);
  }

  const paintMaterials = (materials, bases, hex) => materials.forEach((material, i) => {
    if (hex) material.color.set(hex);
    else material.color.copy(bases[i]);
  });

  /** look: { paint, wheels, tint, rideHeight } (cores #rrggbb, película 0-1, altura em cm); null = original do modelo. */
  function paintModel(s, look) {
    const { paint, wheels, glass, suspended, cmPerUnit } = s.model;
    paintMaterials(paint, s.base.paint, look.paint);
    paintMaterials(wheels, s.base.wheels, look.wheels);
    glass.forEach((material, i) => (look.tint == null ? restoreGlass(material, s.base.glass[i]) : tintGlass(material, look.tint)));
    suspended.position.y = look.rideHeight / cmPerUnit;
  }

  const toHex = color => `#${color.getHexString()}`;

  /** Cores originais do modelo na tela ({ paint, wheels } em #rrggbb), ou null sem 3D. */
  function originalColors() {
    return session ? { paint: toHex(session.base.paint[0]), wheels: toHex(session.base.wheels[0]) } : null;
  }

  /** Muda a aparência do carro (guarda para os próximos mount); não grava nada. */
  function applyLook(look) {
    options.look = look;
    if (!session || !look) return;
    paintModel(session, look);
    requestRender();
  }

  // ===== Laço de desenho (sob demanda) =====

  const isPaused = s => !s.inView || document.hidden;

  function requestRender() {
    if (!session) return;
    session.dirty = true;
    if (!session.raf && !isPaused(session)) session.raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    const s = session;
    if (!s) return;
    s.raf = 0;
    stepFlight(s, now);
    s.controls.update();
    if (s.dirty && !s.contextLost) {
      s.renderer.render(s.scene, s.camera);
      s.dirty = false;
    }
    if (s.flight) requestRender();
  }

  /** Em telas estreitas abre o campo de visão na vertical, para o carro inteiro caber na largura. */
  function fovFor(aspect) {
    const halfTan = Math.tan((SCENE.FOV_DEG * SCENE.DEG_TO_RAD) / 2);
    return (2 * Math.atan(halfTan * Math.max(1, SCENE.MIN_ASPECT / aspect))) / SCENE.DEG_TO_RAD;
  }

  function resize() {
    const s = session;
    const width = s?.canvas.clientWidth;
    const height = s?.canvas.clientHeight;
    if (!width || !height) return;
    s.renderer.setSize(width, height, false);
    s.camera.aspect = width / height;
    s.camera.fov = fovFor(s.camera.aspect);
    s.camera.updateProjectionMatrix();
    requestRender();
  }

  // ===== Voo da câmera =====

  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

  function poseFor(zoneId) {
    const zone = ZONES.find(z => z.id === zoneId);
    return zone ? Geometry.cameraPose(zone) : Geometry.homePose();
  }

  function flyTo(pose) {
    const s = session;
    if (!s) return;
    if (prefersReducedMotion()) {
      s.flight = null;
      placeCamera(s, pose);
    } else {
      s.flight = { pose, start: performance.now(), fromPosition: s.camera.position.toArray(), fromTarget: s.controls.target.toArray() };
    }
    requestRender();
  }

  function stepFlight(s, now) {
    const flight = s.flight;
    if (!flight) return;
    const progress = Math.min(1, Math.max(0, (now - flight.start) / SCENE.FLY_MS));
    const k = easeInOut(progress);
    const mix = (from, to) => from.map((v, i) => v + (to[i] - v) * k);
    s.camera.position.set(...mix(flight.fromPosition, flight.pose.position));
    s.controls.target.set(...mix(flight.fromTarget, flight.pose.target));
    if (progress >= 1) s.flight = null;
  }

  // ===== Toque =====

  function pickAt(s, clientX, clientY) {
    const rect = s.canvas.getBoundingClientRect();
    const ndc = { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -((clientY - rect.top) / rect.height) * 2 + 1 };
    s.camera.updateMatrixWorld();
    s.raycaster.setFromCamera(ndc, s.camera);
    return Geometry.pickZone(s.raycaster.ray.origin.toArray(), s.raycaster.ray.direction.toArray());
  }

  function isTap(down, event) {
    return Math.hypot(event.clientX - down.x, event.clientY - down.y) <= SCENE.TAP_MAX_MOVE_PX
      && performance.now() - down.at <= SCENE.TAP_MAX_MS;
  }

  function onPointerUp(event) {
    const s = session;
    const down = s?.pointerDown;
    if (s) s.pointerDown = null;
    if (!down || !isTap(down, event)) return;
    const zoneId = pickAt(s, event.clientX, event.clientY);
    if (zoneId && options.onZoneSelect) options.onZoneSelect(zoneId);
  }

  // ===== Ciclo de vida =====

  /** A Garagem saiu da tela: o elemento (canvas ou host) ficou fora do documento ou dentro de uma view escondida. */
  function isGone(element) {
    if (!element?.isConnected) return true;
    const view = element.closest('.view');
    return !!view && !view.classList.contains('active');
  }

  function listen(s, target, type, handler) {
    target.addEventListener(type, handler);
    s.cleanups.push(() => target.removeEventListener(type, handler));
  }

  function watchCanvas(s) {
    const resizeObserver = new ResizeObserver(resize);
    const viewObserver = new IntersectionObserver(([entry]) => {
      s.inView = entry.isIntersecting;
      if (s.inView) requestRender();
    });
    resizeObserver.observe(s.canvas);
    viewObserver.observe(s.canvas);
    s.cleanups.push(() => resizeObserver.disconnect(), () => viewObserver.disconnect());
    listen(s, document, 'visibilitychange', () => !document.hidden && requestRender());
    listen(s, s.canvas, 'pointerdown', e => { s.pointerDown = { x: e.clientX, y: e.clientY, at: performance.now() }; });
    listen(s, s.canvas, 'pointerup', onPointerUp);
    listen(s, s.canvas, 'webglcontextlost', e => { e.preventDefault(); s.contextLost = true; });
    listen(s, s.canvas, 'webglcontextrestored', () => { s.contextLost = false; requestRender(); });
    s.controls.addEventListener('change', requestRender);
    s.controls.addEventListener('start', () => { s.flight = null; });
  }

  function disposeSession() {
    const s = session;
    session = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    s.cleanups.forEach(cleanup => cleanup());
    s.controls.dispose();
    s.scene.traverse(disposeObject);
    s.envTarget?.dispose();
    s.renderer.dispose();
    s.renderer.forceContextLoss();
    s.canvas.remove();
  }

  /** Move o canvas para o host atual. Falso se o host já saiu da tela. */
  function attach() {
    if (!session || isGone(host)) return false;
    host.replaceChildren(session.canvas);
    host.classList.add(HOST_READY_CLASS);
    resize();
    applyHighlights();
    applyLook(options.look);
    return true;
  }

  /**
   * O carro real é o padrão. Se o arquivo não vem (rede, 404) ou não serve, o procedural
   * sobe no lugar: o 3D continua funcionando. Falha de rede não é lembrada (a próxima montagem
   * tenta o real de novo); arquivo com conteúdo ruim é lembrado pelo próprio modelo até recarregar a página.
   */
  async function loadModel(THREE) {
    try {
      return { model: await VehicleModelCivicG6.load(THREE), real: true };
    } catch (error) {
      console.warn('[Vehicle3D] Modelo real indisponível, usando o carro simplificado:', error);
      return { model: await VehicleModelProcedural.load(THREE), real: false };
    }
  }

  /** Monta a sessão com o carro real; se a cena não monta com ele, tenta uma vez com o procedural. */
  async function createSessionWithFallback(libs, { model, real }) {
    try {
      return Object.assign(createSession(libs, model), { usesRealModel: real });
    } catch (error) {
      if (!real) throw error;
      console.warn('[Vehicle3D] Cena com o modelo real falhou, usando o carro simplificado:', error);
      const fallback = await VehicleModelProcedural.load(libs.THREE);
      return Object.assign(createSession(libs, fallback), { usesRealModel: false });
    }
  }

  /** Falso (sem criar renderer) se a Garagem saiu da tela enquanto o modelo carregava. */
  async function buildSession(libs) {
    const loaded = await loadModel(libs.THREE);
    if (isGone(host)) {
      loaded.model.root.traverse(disposeObject);
      return false;
    }
    session = await createSessionWithFallback(libs, loaded);
    watchCanvas(session);
    return true;
  }

  /** Mantém a silhueta. Falha de carga (rede) é passageira; falha ao montar a cena (WebGL, modelo) desliga o 3D de vez. */
  function giveUp(error, permanent) {
    failed ||= permanent;
    disposeSession();
    host?.classList.remove(HOST_READY_CLASS);
    console.warn('[Vehicle3D] Carro 3D indisponível, mantendo a silhueta:', error);
    return false;
  }

  async function start() {
    try {
      let libs;
      try {
        libs = await loadLibs();
      } catch (error) {
        return giveUp(error, false);
      }
      try {
        if (!await buildSession(libs)) return ABORTED;
      } catch (error) {
        return giveUp(error, true);
      }
    } finally {
      starting = null;
    }
    if (attach()) return true;
    disposeSession();
    return ABORTED;
  }

  // ===== API pública =====

  /**
   * Põe o carro no host (síncrono se o canvas já existe). options: zoneStates
   * { [zoneId]: 'symptom'|'planned'|'neutral' }, selectedZone, onZoneSelect(zoneId), look
   * (aparência, como em applyLook).
   * Devolve uma promessa: true quando o 3D está na tela, false quando está indisponível,
   * null quando a Garagem saiu da tela antes de terminar (nada a avisar).
   */
  function mount(newHost, newOptions = {}) {
    host = newHost;
    options = { ...options, ...newOptions };
    if (session) return Promise.resolve(attach() || ABORTED);
    if (!isSupported()) return Promise.resolve(false);
    starting ??= start();
    return starting;
  }

  /** O modelo em uso é o real (o crédito da licença só vale para ele). */
  const usesRealModel = () => !!session?.usesRealModel;

  function setZoneStates(zoneStates) {
    options.zoneStates = zoneStates;
    applyHighlights();
  }

  /** Marca a zona e leva a câmera até ela; null limpa a marca e volta ao enquadramento geral. */
  function focusZone(zoneId) {
    options.selectedZone = zoneId || null;
    applyHighlights();
    flyTo(poseFor(options.selectedZone));
  }

  /** Libera o WebGL se a Garagem saiu da tela. */
  function releaseIfDetached() {
    if (!session || !isGone(session.canvas)) return false;
    disposeSession();
    return true;
  }

  return { isSupported, mount, usesRealModel, originalColors, setZoneStates, focusZone, applyLook, releaseIfDetached };
})();
