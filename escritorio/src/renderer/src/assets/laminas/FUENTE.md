# De dónde salen las láminas del inicio

| Archivo             | Obra                                                                                                                                                           | Autor                             | Año                                                              | Fuente                                                                                           | Licencia                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `gran-ola.webp`     | _Kanagawa oki nami ura_ (La gran ola de Kanagawa), de _Treinta y seis vistas del monte Fuji_. Impresión del Metropolitan Museum of Art, entrada 45434 (JP1847) | Katsushika Hokusai                | h. 1830–1832                                                     | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg) | Dominio público, `{{PD-Art\|PD-old-auto-expired\|deathyear=1849}}` |
| `mar-de-noche.webp` | Lámina 20 de _The Rime of the Ancient Mariner_: «Und wiederum ging auf der Mond» («The moving Moon went up the sky»)                                           | Gustave Doré (grabado de Jonnard) | 1876; escaneo de _Der alte Matrose_ (Josef Müller, Múnich, 1925) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Der_Alte_Matrose_b_20.jpg)           | Dominio público, `{{PD-old-100}}`                                  |

Las dos son láminas que tuvo la web (`web/public/grabados/`, borradas en 61659c86ea;
`git show 61659c86ea^:web/public/grabados/FUENTES.md` tiene sus fichas completas). La reproducción de
Hokusai es la del Met (`PD-Art`: una fotografía fiel de una obra bidimensional en dominio público no
crea derechos nuevos); el autor murió en 1849.

**`gran-ola.webp` es la que usa el inicio.** Su silueta —la cresta con las garras de espuma, el hueco
de la ola, el monte chico al fondo— se reconoce aun en puntos gruesos. Va en grises, sin el cartucho
con la caligrafía (la franja izquierda del original) y **en espejo**, para que la cresta quede a la
derecha de la franja y el cielo, que es el hueco claro, a la izquierda, donde van las cifras:

```sh
ffmpeg -i hokusai-gran-ola.webp -vf "crop=1440:1075:160:0,hflip,scale=960:-1,format=gray" \
  -c:v libwebp -quality 72 gran-ola.webp
```

`mar-de-noche.webp` (el mar de Doré, la primera versión de la franja) quedó sin uso: todo textura
fina y sin una silueta, a trama gruesa se leía como ruido. Se recortó así:

```sh
ffmpeg -i dore-luna-sobre-el-mar.webp -vf "crop=1130:460:30:990,scale=960:-1,format=gray" \
  -c:v libwebp -quality 68 mar-de-noche.webp
```

Si se cambia por otra, que sea de dominio público o CC0 y que entre en esta tabla con su origen.
