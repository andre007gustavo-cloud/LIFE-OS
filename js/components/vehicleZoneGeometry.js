/**
 * ===================== VEHICLE ZONE GEOMETRY =====================
 * Geometria pura das zonas do carro: caixas em metros, qual zona um raio
 * acerta e de onde a câmera olha cada zona. Sem DOM e sem three.js: vetores
 * são arrays [x, y, z]. Carro centrado na origem, frente em +X, chão em y = 0,
 * lado direito em +Z.
 */

const VehicleZoneGeometry = (() => {

  const { ZONES, HIDDEN_ZONES, SCENE } = Constants.VEHICLE;
  const DEG_TO_RAD = Math.PI / 180;

  /** Caixa normalizada da zona → { min, max } em metros. */
  function worldBox(box, scene = SCENE) {
    const [[x0, y0, z0], [x1, y1, z1]] = box;
    const scale = [scene.LENGTH_M, scene.HEIGHT_M, scene.WIDTH_M];
    return {
      min: [x0, y0, z0].map((v, i) => v * scale[i]),
      max: [x1, y1, z1].map((v, i) => v * scale[i])
    };
  }

  const boxCenter = ({ min, max }) => min.map((v, i) => (v + max[i]) / 2);

  /** Método das lajes: distância até a entrada do raio na caixa, ou null se não a acerta. */
  function entryDistance(origin, direction, { min, max }) {
    let near = 0;
    let far = Infinity;
    for (let axis = 0; axis < 3; axis++) {
      if (direction[axis] === 0) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
        continue;
      }
      const t1 = (min[axis] - origin[axis]) / direction[axis];
      const t2 = (max[axis] - origin[axis]) / direction[axis];
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
    }
    return near <= far ? near : null;
  }

  /** Id da zona que o raio acerta primeiro (ou null). Zonas escondidas só abrem pelo chip. */
  function pickZone(origin, direction, { zones = ZONES, scene = SCENE } = {}) {
    let best = null;
    let bestDistance = Infinity;
    zones.filter(zone => !HIDDEN_ZONES.includes(zone.id)).forEach(zone => {
      const distance = entryDistance(origin, direction, worldBox(zone.box, scene));
      if (distance !== null && distance < bestDistance) {
        best = zone.id;
        bestDistance = distance;
      }
    });
    return best;
  }

  /** Posição da câmera: do ponto-alvo, na direção do azimute/elevação, a `distance` metros. */
  function orbitPosition(target, { azimuth, elevation }, distance) {
    const az = azimuth * DEG_TO_RAD;
    const el = elevation * DEG_TO_RAD;
    return [
      target[0] + distance * Math.cos(el) * Math.cos(az),
      target[1] + distance * Math.sin(el),
      target[2] + distance * Math.cos(el) * Math.sin(az)
    ];
  }

  /** Câmera que enquadra a zona: olha para o centro da caixa a partir da vista da zona. */
  function cameraPose(zone, scene = SCENE) {
    const target = boxCenter(worldBox(zone.box, scene));
    return { position: orbitPosition(target, zone.view, scene.ZONE_DISTANCE_M), target };
  }

  /** Câmera do enquadramento geral do carro. */
  function homePose(scene = SCENE) {
    const target = [0, scene.HEIGHT_M / 2, 0];
    return { position: orbitPosition(target, scene.HOME_VIEW, scene.HOME_VIEW.distance), target };
  }

  return { worldBox, boxCenter, pickZone, cameraPose, homePose };
})();
