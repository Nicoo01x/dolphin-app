/**
 * El delfín de verdad, en 3D, hecho de puntos: se carga un modelo (public/modelos/, ver FUENTE.md), se
 * reparten puntos sobre su piel con MeshSurfaceSampler y cada punto se ilumina según la normal de
 * la superficie, como un grabado con volumen. Lo que mueve la página es `actualizar`: desde qué
 * ángulo se lo ve, el color y el tiempo para que nade (la cola bate arriba y abajo, como la de un
 * delfín de verdad; `nado: 0` lo deja quieto para quien pide menos movimiento).
 *
 * three.js se importa adentro, recién cuando se monta: no pesa en la carga de la portada.
 */

export interface EstadoDelDelfin {
  giro: number;
  altura: number;
  color: readonly [number, number, number];
  t: number;
  nado: number;
}

export interface Delfin3d {
  actualizar(estado: EstadoDelDelfin): void;
  medir(): void;
  destruir(): void;
}

const VERT = /* glsl */ `
attribute vec3 normalPiel;
uniform float uTiempo;
uniform float uNado;
uniform float uTam;
varying float vLuz;
void main() {
  // Nada: el pico mira a +X y la cola (x hacia -1) bate arriba y abajo; cuanto más atrás, más se
  // mueve, y la cabeza apenas acompaña.
  vec3 p = position;
  float cola = clamp((0.35 - p.x) / 1.35, 0.0, 1.0);
  p.y += uNado * (cola * cola * 0.11 * sin(uTiempo * 3.0 - p.x * 1.8) - 0.012 * sin(uTiempo * 3.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normalPiel);
  // Luz de arriba a la izquierda, como en una lámina: lo que la mira, claro; lo que no, se apaga.
  vec3 luz = normalize(vec3(-0.5, 0.8, 0.6));
  vLuz = clamp(dot(n, luz) * 0.75 + 0.35, 0.08, 1.0);
  gl_PointSize = uTam * (0.6 + vLuz * 0.7) * (3.2 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLuz;
void main() {
  // Un punto redondo, con el borde suave.
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float borde = 1.0 - smoothstep(0.32, 0.5, r);
  gl_FragColor = vec4(uColor * (0.25 + vLuz * 0.95), borde * (0.35 + vLuz * 0.65));
}`;

export async function montarDelfin(canvas: HTMLCanvasElement, url: string, cantidad = 22000): Promise<Delfin3d> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { MeshSurfaceSampler } = await import("three/examples/jsm/math/MeshSurfaceSampler.js");
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camara.position.set(0, 0.15, 3.4);
  camara.lookAt(0, 0, 0);

  const gltf = await new GLTFLoader().loadAsync(url);
  // Todas las mallas del modelo en una sola geometría, en el espacio del modelo.
  const partes: InstanceType<typeof THREE.BufferGeometry>[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const nombre of Object.keys(g.attributes)) if (nombre !== "position" && nombre !== "normal") g.deleteAttribute(nombre);
    if (!g.attributes.normal) g.computeVertexNormals();
    partes.push(g.index ? g.toNonIndexed() : g);
  });
  // El GLTF no trae GLBufferAttribute: el tipo amplio de three no lo sabe.
  const unida = mergeGeometries(partes as Parameters<typeof mergeGeometries>[0]);
  if (!unida) throw new Error("el modelo no tiene mallas");
  // Centrado y a escala: el lado más largo mide 2.
  unida.computeBoundingBox();
  const caja = unida.boundingBox!;
  const centro = caja.getCenter(new THREE.Vector3());
  const tam = caja.getSize(new THREE.Vector3());
  const escala = 2 / Math.max(tam.x, tam.y, tam.z);
  unida.translate(-centro.x, -centro.y, -centro.z);
  unida.scale(escala, escala, escala);
  // Que el largo del delfín quede sobre el eje X (de costado a la cámara).
  const t2 = new THREE.Vector3(tam.x, tam.y, tam.z);
  if (t2.z > t2.x && t2.z >= t2.y) unida.rotateY(Math.PI / 2);
  else if (t2.y > t2.x && t2.y > t2.z) unida.rotateZ(Math.PI / 2);

  const malla = new THREE.Mesh(unida);
  const muestreador = new MeshSurfaceSampler(malla).build();
  const pos = new Float32Array(cantidad * 3);
  const nor = new Float32Array(cantidad * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < cantidad; i++) {
    muestreador.sample(p, n);
    pos.set([p.x, p.y, p.z], i * 3);
    nor.set([n.x, n.y, n.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normalPiel", new THREE.BufferAttribute(nor, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTiempo: { value: 0 },
      uNado: { value: 1 },
      uTam: { value: 2.2 * renderer.getPixelRatio() },
      uColor: { value: new THREE.Color(1, 1, 1) },
    },
  });
  const puntos = new THREE.Points(geo, material);
  const grupo = new THREE.Group();
  grupo.add(puntos);
  escena.add(grupo);
  partes.forEach((g) => g.dispose());
  unida.dispose();

  const medir = () => {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camara.aspect = r.width / Math.max(1, r.height);
    camara.updateProjectionMatrix();
  };
  medir();

  return {
    medir,
    actualizar({ giro, altura, color, t, nado }) {
      grupo.rotation.y = giro;
      grupo.rotation.x = altura;
      // Flota: sube y baja apenas, y cabecea al ritmo de la cola.
      grupo.position.y = Math.sin(t * 0.9) * 0.03 * nado;
      grupo.rotation.z = Math.sin(t * 3.0 - 0.6) * 0.025 * nado;
      material.uniforms.uTiempo!.value = t;
      material.uniforms.uNado!.value = nado;
      (material.uniforms.uColor!.value as InstanceType<typeof THREE.Color>).setRGB(color[0] / 255, color[1] / 255, color[2] / 255);
      renderer.render(escena, camara);
    },
    destruir() {
      geo.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
