/**
 * ===================== VEHICLE 3D =====================
 * Carro 3D da Garagem (three.js, carregado por import map só quando a Garagem
 * pede). Um único canvas/contexto WebGL vive de uma renderização da tela para a
 * próxima: o AreasView reescreve o HTML a cada mudança, então mount() só move o
 * mesmo canvas para o host novo, na hora. Quando a Garagem sai da tela,
 * releaseIfDetached() libera tudo. Sem import map, sem WebGL ou com falha na
 * carga, o host mantém o conteúdo inicial (a silhueta) e nada quebra.
 *
 * Não lê service nenhum: quem chama passa os estados das zonas prontos.
 */

const Vehicle3D = (() => {

  const { SCENE, ZONES, ZONE_STATE, VISUAL } = Constants.VEHICLE;
  const Geometry = VehicleZoneGeometry;
  const HOST_READY_CLASS = 'is-3d';
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
    libsPromise ??= Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')])
      .then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }))
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

  /** Se montar a cena falha depois de criar o renderer, solta o contexto WebGL antes de repassar o erro. */
  function createSession(libs, model) {
    const renderer = createRenderer(libs.THREE);
    try {
      return assembleSession(libs, model, renderer);
    } catch (error) {
      renderer.dispose();
      renderer.forceContextLoss();
      throw error;
    }
  }

  function assembleSession({ THREE, OrbitControls }, model, renderer) {
    const scene = new THREE.Scene();
    const zoneGroup = new THREE.Group();
    addLights(THREE, scene);
    scene.add(model.root, zoneGroup);
    const camera = new THREE.PerspectiveCamera(SCENE.FOV_DEG, 1, SCENE.CAMERA_NEAR, SCENE.CAMERA_FAR);
    const s = {
      renderer, scene, camera, model, canvas: renderer.domElement, raycaster: new THREE.Raycaster(),
      glassBase: model.glass.map(material => ({ opacity: material.opacity, color: material.color.clone() })),
      controls: createControls(OrbitControls, camera, renderer.domElement),
      zoneMeshes: buildZoneMeshes(THREE, zoneGroup),
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

  /** A película escurece e opacifica o vidro a partir do que ele era sem ela. */
  function tintGlass(material, base, tint) {
    material.opacity = base.opacity + (VISUAL.GLASS_MAX_OPACITY - base.opacity) * tint;
    material.color.copy(base.color).multiplyScalar(1 - VISUAL.GLASS_MAX_DARKEN * tint);
  }

  /** look: { paint, wheels, tint, rideHeight } (cores #rrggbb, película 0-1, altura em cm). */
  function paintModel(s, look) {
    const { paint, wheels, glass, suspended, cmPerUnit } = s.model;
    paint.forEach(material => material.color.set(look.paint));
    wheels.forEach(material => material.color.set(look.wheels));
    glass.forEach((material, i) => tintGlass(material, s.glassBase[i], look.tint));
    suspended.position.y = look.rideHeight / cmPerUnit;
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

  function disposeObject(object) {
    object.geometry?.dispose();
    [].concat(object.material || []).forEach(material => {
      material.map?.dispose();
      material.dispose();
    });
  }

  function disposeSession() {
    const s = session;
    session = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    s.cleanups.forEach(cleanup => cleanup());
    s.controls.dispose();
    s.scene.traverse(disposeObject);
    s.renderer.dispose();
    s.renderer.forceContextLoss();
    s.canvas.remove();
  }

  /** Move o canvas para o host atual. Falso se o host já saiu da tela. */
  function attach() {
    if (!session || !host?.isConnected) return false;
    host.replaceChildren(session.canvas);
    host.classList.add(HOST_READY_CLASS);
    resize();
    applyHighlights();
    applyLook(options.look);
    return true;
  }

  async function buildSession(libs) {
    const model = await VehicleModelProcedural.load(libs.THREE);
    session = createSession(libs, model);
    watchCanvas(session);
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
        await buildSession(libs);
      } catch (error) {
        return giveUp(error, true);
      }
    } finally {
      starting = null;
    }
    if (attach()) return true;
    disposeSession();
    return false;
  }

  // ===== API pública =====

  /**
   * Põe o carro no host (síncrono se o canvas já existe). options: zoneStates
   * { [zoneId]: 'symptom'|'planned'|'neutral' }, selectedZone, onZoneSelect(zoneId), look
   * (aparência, como em applyLook).
   * Devolve uma promessa: true quando o 3D está na tela.
   */
  function mount(newHost, newOptions = {}) {
    host = newHost;
    options = { ...options, ...newOptions };
    if (session) return Promise.resolve(attach());
    if (!isSupported()) return Promise.resolve(false);
    starting ??= start();
    return starting;
  }

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

  /** A Garagem saiu da tela: o canvas ficou fora do documento ou dentro de uma view escondida. */
  function isCanvasGone(canvas) {
    if (!canvas.isConnected) return true;
    const view = canvas.closest('.view');
    return !!view && !view.classList.contains('active');
  }

  /** Libera o WebGL se a Garagem saiu da tela. */
  function releaseIfDetached() {
    if (!session || !isCanvasGone(session.canvas)) return false;
    disposeSession();
    return true;
  }

  return { isSupported, mount, setZoneStates, focusZone, applyLook, releaseIfDetached };
})();
