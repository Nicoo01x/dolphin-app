# Fuente de los modelos 3D

## delfin.glb (alternativa CC0, NO usada)

- **Título:** Dolphin
- **Autor:** Quaternius (https://quaternius.com)
- **Página:** https://poly.pizza/m/3LzFgI3GLO
- **Archivo original:** https://static.poly.pizza/fcea284f-cafc-4be1-a701-2a0fd811ad5c.glb (sin modificar, copiado tal cual)
- **Licencia (tal cual figura):** "Public Domain (CC0)" — en los datos de la página: `"Licence":"CC0 1.0"`.
  No exige atribución. Si se quiere dar crédito por cortesía: «Dolphin by Quaternius [CC0] via Poly Pizza».
- **Geometría:** 865 vértices, 440 triángulos (una malla `Dolphin` con 2 primitivas: materiales `Top` y `Bottom`). Sin texturas.
- **Animación de nado:** sí. Esqueleto de 13 huesos (`Spine1…4`, `Tail`, `Head`, aletas pectorales L/R) y un clip `Armature|Swim` de 1,04 s en loop
  (26 claves por canal, rotaciones, interpolación LINEAR). Poly Pizza lo marca como `Animated: false`, pero el GLB trae el clip.
- **Peso:** 60 412 bytes (59 KB).
- **Orientación (espacio mundo, con las transformaciones del archivo aplicadas, como lo muestra three.js):**
  pico hacia **+Z**, aleta dorsal hacia **+Y** (arriba = +Y), aletas pectorales sobre ±X.
  Largo ≈ 9,2 unidades (z de −4,59 a +4,60), alto y de −0,87 a +2,15, ancho x ±1,58. No está centrado en el origen en Y.
  - Ojo: es un `SkinnedMesh`. Las posiciones crudas del atributo `position` están en espacio local
    (largo sobre Y, pico hacia −Y, dorsal hacia +Z, ~0,09 de largo); el nodo las rota −90° en X y las escala ×100.
    Para la nube de puntos, aplicar `mesh.matrixWorld` (o muestrear el mesh ya posado si se usa la animación).

## delfin-alt-ccby.glb (el que se usa)

Más triángulos y silueta más suave que el CC0; CC-BY, así que el crédito va en el pie de la web (`Puerto.tsx`). Sin animación: el nado lo hace el shader.

- **Título:** Dolphin
- **Autor:** Poly by Google
- **Página:** https://poly.pizza/m/bRCPQJJP_bR
- **Archivo original:** https://static.poly.pizza/7934c2b9-dc58-44ef-aa25-dcaf4178a508.glb (sin modificar)
- **Licencia (tal cual figura):** `"Licence":"CC-BY 3.0"` (Creative Commons Attribution 3.0)
- **Atribución a mostrar si se usa:** «Dolphin by Poly by Google [CC-BY 3.0] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/bRCPQJJP_bR)»
- **Geometría:** 2 110 vértices, 4 093 triángulos, solo `POSITION` (sin normales ni texturas).
- **Animación:** no.
- **Peso:** 51 032 bytes.
- **Orientación:** pico hacia **+X**, cola hacia −X, arriba = **+Y**. Unidades grandes (x ±209,7, y de 18,4 a 160, z ±58,6), sin centrar en Y.
