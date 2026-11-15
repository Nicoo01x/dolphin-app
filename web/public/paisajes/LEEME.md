# Los paisajes

Las imágenes que van detrás de las tarjetas: en la web y adentro de la app
(`escritorio/resources/paisajes` tiene `niebla` y `sendero`).

**Ninguna imagen entra acá sin su origen y su licencia en esta tabla.** Que sea CC0 o dominio
público: una foto de banco «gratis» casi nunca lo es para un producto que se vende.

## Los óleos de la home (desde el 12/11/2026)

La home usa siete óleos del paisajismo del siglo XIX, todos del **Metropolitan Museum of Art,
Open Access**: la imagen está marcada como dominio público por el museo y se publica bajo **CC0**
(<https://www.metmuseum.org/about-the-met/policies-and-procedures/image-resources>). No hay que
atribuir; igual va el crédito acá. Se bajaron de la API del museo
(`collectionapi.metmuseum.org/public/collection/v1/objects/<id>`, campo `isPublicDomain: true`).

| Archivo | Obra | Artista | Año | Objeto del Met | Licencia |
|---|---|---|---|---|---|
| `lago.webp` | Lake George | John Frederick Kensett | 1869 | [11311](https://www.metmuseum.org/art/collection/search/11311) (15.30.61) | CC0 |
| `andes.webp` | Heart of the Andes | Frederic Edwin Church | 1859 | [10481](https://www.metmuseum.org/art/collection/search/10481) (09.95) | CC0 |
| `lago-quieto.webp` | Lake George, 1872 | John Frederick Kensett | 1872 | [11312](https://www.metmuseum.org/art/collection/search/11312) (74.12) | CC0 |
| `meandro.webp` | View from Mount Holyoke, Northampton, Massachusetts, after a Thunderstorm (The Oxbow) | Thomas Cole | 1836 | [10497](https://www.metmuseum.org/art/collection/search/10497) (08.228) | CC0 |
| `merced.webp` | Merced River, Yosemite Valley | Albert Bierstadt | 1866 | [10150](https://www.metmuseum.org/art/collection/search/10150) (09.214.1) | CC0 |
| `desfiladero.webp` | A Gorge in the Mountains (Kauterskill Clove) | Sanford Robinson Gifford | 1862 | [10946](https://www.metmuseum.org/art/collection/search/10946) (15.30.62) | CC0 |
| `delaware.webp` | Delaware Water Gap | George Inness | 1861 | [11229](https://www.metmuseum.org/art/collection/search/11229) (32.151) | CC0 |

Cada uno se recortó un 4 % por lado (el canto de la tela y, en `lago-quieto`, el marco), se escaló a
1600 px de ancho (`lago`, que es la portada, a 2000) y se pasó a WebP. `desfiladero` es vertical en
el original: se tomó una franja horizontal de 2960 × 2100 desde y = 700. Para rehacerlos desde el
original del museo (`primaryImage` de la API):

```sh
ffmpeg -i <original>.jpg -vf "format=rgb24,crop=iw*0.96:ih*0.96,scale=1600:-2" -quality 68 -compression_level 6 <nombre>.webp
```

**Why óleos y no fotos:** la referencia que eligió Nico es un paisaje pintado (un prado, un árbol,
montañas con bruma), y siete fotos de lugares distintos no se ven como una sola familia. Los siete
óleos son del mismo siglo y la misma escuela, así que la página tiene un solo mundo.

## Las fotos de antes

| Archivo | Qué es | Origen | Licencia | ¿Se usa? |
|---|---|---|---|---|
| `niebla.webp` | Niebla bajando sobre el bosque y la pradera (Catskill) | Wikimedia Commons, vía [Openverse](https://openverse.org) | CC0 | en la app; la web ya no |
| `sendero.webp` | Un sendero perdiéndose en la niebla (Max Patch, Del Rio) | Wikimedia Commons, vía [Openverse](https://openverse.org) | CC0 | en la app; la web ya no |
| `mar.webp`, `valle.webp`, `verano.webp` | Una playa, una bahía y dos lanchas vistas desde arriba | **Sin documentar** (entraron el 09/11/2026; el commit 37eedaf395 dice que la del agua «la eligió Nico») | **desconocida** | No. No vuelven a usarse hasta que alguien anote de dónde salieron. |
