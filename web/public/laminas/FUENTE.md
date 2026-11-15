# De dónde salen las láminas

Todas son obras en **dominio público** (anteriores a 1930 y con el autor muerto hace más de
setenta años), bajadas de Wikimedia Commons y reducidas a 1100 px de ancho en WebP. El crédito no
es una obligación legal: es parte de lo que hace que una lámina se lea como material de archivo.

Lo que se muestra al lado de cada epígrafe en el sitio sale de `src/lib/laminas.ts`.

| Archivo | Obra | Autor | Año | Fuente |
|---|---|---|---|---|
| `sifonoforos.webp` | *Kunstformen der Natur*, lámina 17: Siphonophorae | Ernst Haeckel | 1904 | [Commons](https://commons.wikimedia.org/wiki/File:Haeckel_Siphonophorae.jpg) |
| `radiolarios.webp` | *Kunstformen der Natur*: Discoidea (Scheiben-Strahlinge) | Ernst Haeckel, litografía de Adolf Giltsch | 1904 | [Commons](https://commons.wikimedia.org/wiki/File:Discoidea._-_Scheiben-Strahlinge_LCCN2015647741.jpg) · escaneo de la Library of Congress |
| `medusas.webp` | *Kunstformen der Natur*, lámina 8: Discomedusae | Ernst Haeckel | 1904 | [Commons](https://commons.wikimedia.org/wiki/File:Haeckel_Discomedusae_8.jpg) |
| `medusas-peine.webp` | *Kunstformen der Natur*: Ctenophorae (Kammquallen) | Ernst Haeckel, litografía de Adolf Giltsch | 1904 | [Commons](https://commons.wikimedia.org/wiki/File:Ctenophorae._-_Kammquallen_LCCN2015648914.jpg) · escaneo de la Library of Congress |
| `rosa-de-los-vientos.webp` | Detalle de *A Mariner's Compass and Armillary Sphere* | Emanuel Bowen | 1747 | [Commons](https://commons.wikimedia.org/wiki/File:Compass_rose_detail_from_1748_Bowen_Mariner%E2%80%99s_Compass_and_Armillary_Sphere_-_Geographicus_-_CircleofWinds-bowen-1747_(cropped).jpg) · Geographicus |
| `anemonas.webp` | *Kunstformen der Natur*: Actiniae | Ernst Haeckel | 1904 | [Commons](https://commons.wikimedia.org/wiki/File:Haeckel_Actiniae.jpg) |
| `delfin.webp` | *The zoology of the voyage of H.M.S. Erebus & Terror*, lámina 24 | John Richardson y John Edward Gray (eds.) | 1844–1875 | [Commons](https://commons.wikimedia.org/wiki/File:The_zoology_of_the_voyage_of_the_H.M.S._Erebus_and_Terror_(6257847245).jpg) |

## Para sumar una lámina nueva

1. Buscala en Commons y **comprobá que diga «Public domain»** en su licencia (la API lo devuelve en
   `imageinfo.extmetadata.LicenseShortName`). Una imagen con CC-BY obliga a dar crédito en la
   página misma, no solo acá.
2. Bajala por `Special:FilePath/<archivo>?width=1600` y pasala a WebP de 1100 px de ancho con
   calidad 78 (con `sharp`, que ya está en `web/node_modules`). Arriba de 600 KB conviene bajar la
   calidad antes que el tamaño: estas láminas viven del detalle fino.
3. Sumala a `src/lib/laminas.ts` con su epígrafe y su crédito, y a la tabla de acá arriba.
