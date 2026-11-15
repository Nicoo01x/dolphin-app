# Los fondos del chat

Los óleos que puede llevar la ventana detrás de los paneles (Ajustes → Apariencia → «Fondo del
chat»). Son de la misma familia que los de la web (`web/public/paisajes/LEEME.md`): paisajismo
norteamericano del siglo XIX, del **Metropolitan Museum of Art, Open Access**. El museo los marca
como dominio público y los publica bajo **CC0**
(<https://www.metmuseum.org/about-the-met/policies-and-procedures/image-resources>). No hace falta
atribuir; igual va el crédito acá.

**Ningún fondo entra acá sin su origen y su licencia en esta tabla.**

| Archivo                       | Obra                                                                                  | Artista                  | Año  | Objeto del Met                                                 | Imagen original    | Licencia |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------ | ---- | -------------------------------------------------------------- | ------------------ | -------- |
| `merced.webp` (el de fábrica) | Merced River, Yosemite Valley                                                         | Albert Bierstadt         | 1866 | [10150](https://www.metmuseum.org/art/collection/search/10150) | `DT2961.jpg`       | CC0      |
| `desfiladero.webp`            | A Gorge in the Mountains (Kauterskill Clove)                                          | Sanford Robinson Gifford | 1862 | [10946](https://www.metmuseum.org/art/collection/search/10946) | `DT81.jpg`         | CC0      |
| `andes.webp`                  | Heart of the Andes                                                                    | Frederic Edwin Church    | 1859 | [10481](https://www.metmuseum.org/art/collection/search/10481) | `DT78.jpg`         | CC0      |
| `lago.webp`                   | Lake George                                                                           | John Frederick Kensett   | 1869 | [11311](https://www.metmuseum.org/art/collection/search/11311) | `DT84.jpg`         | CC0      |
| `meandro.webp`                | View from Mount Holyoke, Northampton, Massachusetts, after a Thunderstorm (The Oxbow) | Thomas Cole              | 1836 | [10497](https://www.metmuseum.org/art/collection/search/10497) | `DP-12550-001.jpg` | CC0      |
| `delaware.webp`               | Delaware Water Gap                                                                    | George Inness            | 1861 | [11229](https://www.metmuseum.org/art/collection/search/11229) | `DT2892.jpg`       | CC0      |

**Why `merced` de fábrica:** es el más parecido a la referencia que eligió Nico
(`docs/reforma/referencias/chat-con-paisaje-referencia.png`, también un Bierstadt): paredes de roca
con niebla y el valle oscuro abajo, que es donde va el compositor.

## Cómo se hicieron

Se bajó el original de la API del museo
(`collectionapi.metmuseum.org/public/collection/v1/objects/<id>`, campo `primaryImage`,
`isPublicDomain: true`), se recortó un 4 % por lado (el canto de la tela) y se escaló a 2560 px de
ancho en WebP. `desfiladero` es vertical en el original: se toma una franja horizontal de
2960 × 2100 desde y = 700, como en la web.

```sh
ffmpeg -i <original>.jpg -vf "format=rgb24,crop=iw*0.96:ih*0.96,scale=2560:-2" -quality 62 -compression_level 6 <nombre>.webp
ffmpeg -i DT81.jpg -vf "format=rgb24,crop=2960:2100:67:700,scale=2560:-2" -quality 62 -compression_level 6 desfiladero.webp
```

Pesan entre 146 y 408 KB cada uno. La trama de la tela se tiene que notar: no bajar la calidad de
62 para ahorrar unos KB.
