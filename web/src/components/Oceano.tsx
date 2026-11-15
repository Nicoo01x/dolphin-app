"use client";

import { useEffect, useRef } from "react";
import { EMPIEZA_A_HUNDIRSE, profundidadDeLaLamina, TODO_EL_MAR, YA_ABAJO, type Tramo } from "@/lib/profundidad";
import { useQuieto } from "@/lib/quieto";

/**
 * El océano, en un solo shader. Arriba: el mar al amanecer, con el sol abriendo un camino de
 * brillos. Al avanzar, la cámara se hunde: la línea del agua sube (mitad arriba, mitad abajo, como
 * una foto partida) y del otro lado empieza la zona de luz con sus rayos y cáusticas. Más abajo se
 * apaga el sol, flota la nieve marina y en el abismo solo queda lo que brilla solo; ahí el puntero
 * es una linterna.
 *
 * **Es una ESTAMPA, no el fondo de la página** (Nico, 31/10: «toda la web está asquerosa, muy
 * fea»). Detrás de todo, el mar tramado y el sol quemado ensuciaban cada cosa que iba encima: el
 * texto necesitaba un vidrio turbio para poder leerse y la página entera parecía una textura. Del
 * tamaño de un cuadro y con su marco, el mismo shader se ve como lo que es; el resto de la página
 * es negro liso, y ahí el texto se lee sin trucos.
 *
 * El color vive acá adentro (la interfaz es blanco y negro) y sale de un solo celeste.
 */

const VERTICES = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENTOS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform float uD;
uniform vec2 uP;
uniform float uLinterna;
uniform float uHorizonte;
uniform float uSolX;
uniform float uBrillo;
/** Cuánto del mar se dibuja como grabado (0 = pintura, 1 = lámina), y cada cuántos píxeles va una línea. */
uniform float uGrabado;
uniform float uPaso;
out vec4 color;

const vec3 CELESTE = vec3(0.557, 0.792, 0.902);
const vec3 CIELO_ALTO = vec3(0.035, 0.075, 0.115);
const vec3 HORIZONTE = vec3(0.40, 0.58, 0.68);
const vec3 SOL = vec3(1.0, 0.97, 0.92);
const vec3 MAR = vec3(0.012, 0.06, 0.085);

float azar(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(azar(i), azar(i + vec2(1, 0)), u.x), mix(azar(i + vec2(0, 1)), azar(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * ruido(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

// La altura del mar en un punto del plano; el detalle fino se apaga a lo lejos (si no, centellea).
float olas(vec2 q, float t, float detalle) {
  float h = sin(q.x * 0.42 + t * 0.55) * 0.32;
  h += sin(q.x * 0.23 - q.y * 0.37 + t * 0.42) * 0.42;
  h += sin(dot(q, vec2(0.71, 0.53)) - t * 0.9) * 0.14 * detalle;
  h += (fbm(q * 0.55 + vec2(t * 0.12, -t * 0.07)) - 0.5) * 0.8 * detalle;
  return h;
}

vec3 cielo(float y, vec3 dir, vec3 sol) {
  vec3 c = mix(HORIZONTE, CIELO_ALTO, pow(clamp(y * 2.2, 0.0, 1.0), 0.55));
  float s = max(dot(dir, sol), 0.0);
  c += SOL * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.28) * uBrillo + SOL * pow(s, 4.0) * 0.07;
  return c;
}

vec3 superficie(vec2 uv, float aspecto, float hundido) {
  float horizonte = uHorizonte + hundido * 0.55;
  float altura = mix(2.4, 0.55, hundido);
  vec3 dir = normalize(vec3((uv.x - 0.5) * aspecto, uv.y - horizonte, 1.35));
  vec3 sol = normalize(vec3(uSolX, 0.075, 1.0));
  if (dir.y >= 0.0) return cielo(dir.y, dir, sol);

  float t = altura / -dir.y;
  vec2 q = dir.xz * t;
  float detalle = clamp(1.0 - t / 70.0, 0.0, 1.0);
  float e = 0.06 + t * 0.004;
  float h0 = olas(q, uT, detalle);
  vec3 normal = normalize(vec3(h0 - olas(q + vec2(e, 0.0), uT, detalle), e * 2.4, h0 - olas(q + vec2(0.0, e), uT, detalle)));
  vec3 refleja = reflect(dir, normal);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-dir, normal), 0.0), 5.0);
  vec3 c = mix(MAR + CELESTE * 0.03 * (h0 + 0.5), cielo(max(refleja.y, 0.0), refleja, sol), fresnel);
  // El camino del sol: brillos que titilan sobre las olas.
  float brillo = pow(max(dot(refleja, sol), 0.0), 380.0) * 6.0;
  c += SOL * brillo * smoothstep(0.0, 0.6, detalle + 0.3) * uBrillo;
  // La bruma lleva el mar al horizonte.
  return mix(HORIZONTE * 0.85, c, exp(-t * 0.018));
}

vec3 abajo(vec2 uv, float aspecto, float z) {
  // De la zona de luz al negro del abismo; un poco más claro hacia arriba, de donde viene la luz.
  float luz = clamp(z - (uv.y - 0.5) * 0.16 * (1.0 - z), 0.0, 1.0);
  vec3 c = mix(vec3(0.075, 0.22, 0.29), vec3(0.025, 0.09, 0.15), smoothstep(0.0, 0.32, luz));
  c = mix(c, vec3(0.008, 0.022, 0.035), smoothstep(0.25, 0.7, luz));
  // El fondo no es negro de pantalla: queda un azul casi negro, de agua.
  c = mix(c, vec3(0.012, 0.024, 0.036), smoothstep(0.62, 1.0, luz));

  float cerca = pow(1.0 - z, 2.4);
  vec2 a = vec2((uv.x - 0.5) * aspecto, uv.y);

  // Rayos de sol que bajan en abanico y respiran.
  vec2 origen = vec2(0.18 * sin(uT * 0.05), 1.35);
  vec2 hacia = a - origen;
  float angulo = atan(hacia.x, -hacia.y);
  float rayos = ruido(vec2(angulo * 13.0, uT * 0.22)) * ruido(vec2(angulo * 29.0 + 4.0, -uT * 0.17));
  rayos = pow(rayos, 1.6) * smoothstep(1.9, 0.2, length(hacia));
  c += mix(CELESTE, SOL, 0.35) * rayos * 0.4 * cerca;

  // Cáusticas: la superficie, vista desde abajo, deja hilos de luz que se mueven.
  vec2 p = a * 3.2 + vec2(0.0, z * 4.0);
  float k = 1.0 - abs(fbm(p + uT * 0.16) - fbm(p * 1.13 - uT * 0.13 + 3.1));
  c += CELESTE * pow(k, 14.0) * 0.32 * cerca * smoothstep(0.15, 1.0, uv.y);

  // La superficie desde abajo: una banda que ondea arriba de todo.
  float banda = smoothstep(0.9, 1.0, uv.y + (fbm(vec2(a.x * 3.0, uT * 0.3)) - 0.5) * 0.06);
  c += mix(CELESTE, SOL, 0.5) * banda * 0.45 * pow(1.0 - z, 6.0);

  // Nieve marina en tres capas: sube mientras bajás. Abajo, algunas partículas brillan solas.
  float linterna = smoothstep(0.42, 0.0, length(a - vec2((uP.x - 0.5) * aspecto, uP.y))) * uLinterna * smoothstep(0.35, 0.8, z);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float escala = 9.0 + fi * 7.0;
    vec2 g = a * escala + vec2(fi * 13.1, uD * (26.0 + fi * 18.0) + uT * (0.04 + fi * 0.03));
    vec2 celda = floor(g);
    vec2 f = fract(g);
    float r = azar(celda + fi * 7.7);
    vec2 punto = vec2(azar(celda + 1.3 + fi), azar(celda + 7.1 + fi)) * 0.8 + 0.1;
    // Copos blandos y un poco estirados (caen), no puntos duros: si no, el abismo parece un cielo.
    float tam = (0.05 + r * 0.06) * (1.0 - fi * 0.2);
    float dist = length((f - punto) * vec2(1.0, 0.6));
    float gota = pow(smoothstep(tam, 0.0, dist), 2.0) * step(0.62, r);
    float vive = step(0.95, r) * smoothstep(0.45, 0.9, z) * (0.5 + 0.5 * sin(uT * (0.8 + r * 1.5) + r * 60.0));
    vec3 tono = mix(vec3(0.62, 0.72, 0.78) * (0.12 + 0.22 * (1.0 - z)), CELESTE * 1.4, vive);
    c += tono * gota * (0.45 + vive * 1.2 + linterna * 2.2) * (0.3 + fi * 0.22);
    // Lo que brilla solo tiene un halo, como la bioluminiscencia de verdad.
    c += CELESTE * vive * exp(-dist * 9.0) * 0.12;
  }
  // Pocas criaturas grandes que laten despacio y derivan: medusas vistas de lejos.
  vec2 gm = a * 2.4 + vec2(uT * 0.015, uD * 9.0 - uT * 0.02);
  vec2 cm = floor(gm);
  float rm = azar(cm + 41.0);
  vec2 pm = vec2(azar(cm + 3.7), azar(cm + 9.1)) * 0.6 + 0.2 + vec2(sin(uT * 0.3 + rm * 9.0), cos(uT * 0.23 + rm * 5.0)) * 0.08;
  float dm = length((fract(gm) - pm) * vec2(1.0, 1.3));
  float late = 0.55 + 0.45 * sin(uT * (0.6 + rm) + rm * 30.0);
  c += CELESTE * step(0.9, rm) * smoothstep(0.5, 0.95, z) * (exp(-dm * 22.0) * 0.5 + exp(-dm * 6.0) * 0.08) * late;
  c += CELESTE * linterna * 0.035;
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspecto = uRes.x / uRes.y;
  float hundido = smoothstep(0.0, ${EMPIEZA_A_HUNDIRSE.toFixed(3)}, uD);
  float cruce = smoothstep(${EMPIEZA_A_HUNDIRSE.toFixed(3)}, ${YA_ABAJO.toFixed(3)}, uD);
  float z = clamp((uD - ${YA_ABAJO.toFixed(3)}) / ${(1 - YA_ABAJO).toFixed(3)}, 0.0, 1.0);

  // La línea del agua: sube por la pantalla al cruzar, y nunca es recta.
  float linea = mix(-0.12, 1.14, cruce) + sin(uv.x * 9.0 + uT * 1.4) * 0.011 + sin(uv.x * 23.0 - uT * 2.1) * 0.005;
  vec3 c;
  if (uv.y > linea) {
    c = superficie(uv, aspecto, hundido);
  } else {
    c = abajo(uv, aspecto, z);
    // Justo debajo de la línea el agua oscurece un poco: así se lee el cruce.
    c *= 1.0 - 0.35 * exp(-(linea - uv.y) * 24.0) * step(0.001, cruce) * step(cruce, 0.999);
  }
  // El menisco: un hilo de luz donde se tocan aire y agua.
  c += mix(CELESTE, SOL, 0.6) * exp(-abs(uv.y - linea) * 260.0) * 0.55;

  // Viñeta suave.
  c *= 1.0 - 0.28 * pow(length((uv - 0.5) * vec2(1.1, 1.0)), 2.2);

  // El grabado: el mar entero se dibuja con líneas de buril, como una lámina antigua, pero vivo. Las
  // líneas siguen el oleaje y engordan donde hay luz; en lo oscuro aparece un segundo trazo cruzado,
  // el sombreado del grabador. Es nuestro mar, no una lámina de otro (Nico, 28/10: «me gustaba ese
  // estilo clásico»).
  float luz = dot(c, vec3(0.299, 0.587, 0.114));
  vec2 px = gl_FragCoord.xy;
  float ondula = (fbm(uv * vec2(2.5, 7.0) + vec2(uT * 0.04, uD * 3.0)) - 0.5) * 2.2 * uPaso;
  float trazo = 0.5 + 0.5 * sin((px.y + px.x * 0.16 + ondula) * 6.2832 / uPaso);
  float grosor = clamp(luz * 2.1, 0.0, 1.0);
  float tinta = smoothstep(1.0 - grosor - 0.22, 1.0 - grosor + 0.22, trazo);
  float cruzado = 0.5 + 0.5 * sin((px.x - px.y * 0.42 + ondula * 0.5) * 6.2832 / (uPaso * 1.4));
  float sombra = smoothstep(0.86, 1.0, cruzado) * smoothstep(0.16, 0.035, luz) * smoothstep(0.004, 0.02, luz);
  vec3 tono = mix(vec3(luz), c, 0.6) / max(luz, 0.03);
  // Entre línea y línea queda algo del mar: con negro puro el texto encima no se leía.
  vec3 grabado = tono * (tinta * (0.1 + luz * 1.15) + sombra * 0.08) + c * 0.38;
  c = mix(c, grabado, uGrabado);

  // Un grano que evita escalones en los degradés oscuros.
  c += (azar(gl_FragCoord.xy + fract(uT)) - 0.5) / 255.0;
  color = vec4(c, 1.0);
}`;

export function Oceano({ tramo = TODO_EL_MAR, className }: { tramo?: Tramo; className?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const quieto = useQuieto();
  const [desde, hasta] = tramo;

  useEffect(() => {
    const canvas = lienzo.current;
    const gl = canvas?.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!canvas || !gl) return; // sin WebGL2 queda el degradé de CSS del <body>

    const compilar = (tipo: number, fuente: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, fuente);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const programa = gl.createProgram()!;
    gl.attachShader(programa, compilar(gl.VERTEX_SHADER, VERTICES));
    gl.attachShader(programa, compilar(gl.FRAGMENT_SHADER, FRAGMENTOS));
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return;
    gl.useProgram(programa);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(programa, "p");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(programa, n);
    const [uRes, uT, uD, uP, uLinterna, uHorizonte, uSolX, uBrillo, uGrabado, uPaso] = [
      "uRes",
      "uT",
      "uD",
      "uP",
      "uLinterna",
      "uHorizonte",
      "uSolX",
      "uBrillo",
      "uGrabado",
      "uPaso",
    ].map(u);
    gl.uniform1f(uGrabado, 0.8);

    // El océano no necesita la resolución entera: a menos píxeles se ve igual de suave y no calienta.
    // Se mide contra la ESTAMPA (el recuadro que lo contiene), no contra la ventana.
    const medir = () => {
      const ancho = canvas.clientWidth || 1;
      const alto = canvas.clientHeight || 1;
      const escala = Math.min(window.devicePixelRatio || 1, 1.5) * (ancho < 700 ? 0.6 : 0.7);
      canvas.width = Math.max(1, Math.round(ancho * escala));
      canvas.height = Math.max(1, Math.round(alto * escala));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      // En una estampa parada (el celular) el sol queda velado —un resplandor, sin disco ni camino
      // de brillos—: el disco blanco en un recuadro angosto se come media lámina.
      // Y el disco del sol va velado también en apaisado: a tamaño de estampa quemaba el centro y
      // dejaba una mancha blanca donde tendría que verse el agua.
      const parado = ancho / alto < 0.8;
      gl.uniform1f(uHorizonte, parado ? 0.74 : 0.66);
      gl.uniform1f(uBrillo, parado ? 0.2 : 0.42);
      // Una línea cada ~4 px de pantalla, sea cual sea la resolución del lienzo.
      gl.uniform1f(uPaso, Math.max(2.2, 4 * (canvas.width / ancho)));
      gl.uniform1f(uSolX, parado ? 0.1 : 0.18);
    };
    medir();

    const observador = new ResizeObserver(medir);
    observador.observe(canvas);

    const leer = () => profundidadDeLaLamina(canvas, [desde, hasta]);
    let profundidad = leer();
    let suave = profundidad;
    const puntero = { x: 0.5, y: 0.5, ahora: 0 };
    const sobre = { x: 0.5, y: 0.5 };
    let linterna = 0;
    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const caja = canvas.getBoundingClientRect();
      puntero.x = (e.clientX - caja.left) / Math.max(1, caja.width);
      puntero.y = 1 - (e.clientY - caja.top) / Math.max(1, caja.height);
      // La linterna del abismo se enciende solo con el puntero adentro de la estampa.
      puntero.ahora = puntero.x >= 0 && puntero.x <= 1 && puntero.y >= 0 && puntero.y <= 1 ? 1 : 0;
    };
    const alSalir = () => (puntero.ahora = 0);
    const alScroll = () => (profundidad = leer());
    window.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("pointermove", alMover, { passive: true });
    document.documentElement.addEventListener("pointerleave", alSalir);

    const inicio = performance.now();
    let cuadro = 0;
    const dibujar = (tiempo: number) => {
      suave += (profundidad - suave) * (quieto ? 1 : 0.12);
      sobre.x += (puntero.x - sobre.x) * 0.08;
      sobre.y += (puntero.y - sobre.y) * 0.08;
      linterna += (puntero.ahora - linterna) * 0.06;
      // Quieto: el mar se congela en un instante y solo cambia con la profundidad.
      gl.uniform1f(uT, quieto ? 12.0 : (tiempo - inicio) / 1000);
      gl.uniform1f(uD, suave);
      gl.uniform2f(uP, sobre.x, sobre.y);
      gl.uniform1f(uLinterna, linterna);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!quieto || Math.abs(profundidad - suave) > 0.0005) cuadro = requestAnimationFrame(dibujar);
      else cuadro = 0;
    };
    // Fuera de pantalla no se dibuja: en la home hay dos estampas y la de abajo se pasaba el día
    // calculando un mar que nadie estaba mirando.
    let aLaVista = true;
    const seguir = () => {
      if (!cuadro && aLaVista && !document.hidden) cuadro = requestAnimationFrame(dibujar);
    };
    const mirando = new IntersectionObserver(
      ([entrada]) => {
        aLaVista = entrada?.isIntersecting ?? true;
        if (aLaVista) {
          seguir();
        } else {
          cancelAnimationFrame(cuadro);
          cuadro = 0;
        }
      },
      { rootMargin: "150px" },
    );
    mirando.observe(canvas);
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        cancelAnimationFrame(cuadro);
        cuadro = 0;
      } else seguir();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    // Quieto, cada scroll o cambio de tamaño pide un cuadro (no hay bucle corriendo).
    window.addEventListener("scroll", seguir, { passive: true });
    window.addEventListener("resize", seguir);
    seguir();

    return () => {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
      mirando.disconnect();
      window.removeEventListener("scroll", alScroll);
      window.removeEventListener("scroll", seguir);
      window.removeEventListener("resize", seguir);
      window.removeEventListener("pointermove", alMover);
      document.documentElement.removeEventListener("pointerleave", alSalir);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      gl.deleteProgram(programa);
      gl.deleteBuffer(buffer);
    };
  }, [quieto, desde, hasta]);

  return <canvas ref={lienzo} aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full ${className ?? ""}`} />;
}
