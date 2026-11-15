# Los videos de los carteles de función

Cada **cartel de función** de Dolphin muestra, con un video, lo que hace la opción que estás por
elegir, y te deja elegir ahí mismo. Acá se hacen esos videos.

El catálogo de carteles vive del otro lado, en
`escritorio/src/shared/carteles-de-funcion.ts`: ahí se dice qué opción explica cada uno, en qué
motores vale, y con qué clip. El `clip` es el `id` de la `<Composition>` de `src/Root.tsx` — si
cambia uno, cambia el otro.

## Hacer un clip

```bash
npm install          # una sola vez
npm run estudio      # Remotion Studio, para mirarlo mientras se edita
npm run render       # out/<clip>.mp4 y out/<clip>.poster.jpg
npm run publicar     # los copia a la app y a la web
npm run render delegacion   # uno solo, por su id
```

`publicar` deja cada clip en los dos lugares donde se mira:

| | dónde | cómo lo lee |
|---|---|---|
| La app | `escritorio/resources/carteles/` | `app:getCartelAssetBaseUrl` y el `<video>` del cartel |
| La web | `escritorio/docs/site/public/docs/{videos,posters}/` | `<ImagePlaceholder src="/docs/<clip>.mp4">` |

Los dos archivos se commitean: son lo que se empaqueta y lo que se publica. `out/` y
`node_modules/` no.

## Lo que ya mordió

- **El clip se mira a la mitad de su tamaño.** El cartel es una tarjeta de 640 px y el video sale a
  1280. La primera versión usaba tipografía de 14-19 px y en la tarjeta no se leía nada: los
  tamaños de `src/piezas.tsx` están pensados para que a la mitad se siga leyendo. Antes de dar un
  clip por bueno, miralo al 50 %.
- **La terminal sube, no se corta.** `Terminal` muestra la cola de sus renglones (`aLaVista`), así
  el guion puede tener los que haga falta sin depender del alto del clip.
- **Sin audio y en loop**: el cartel lo reproduce en silencio y repetido, y quien pidió menos
  movimiento ve solo el poster. Por eso el poster tiene que ser un cuadro que ya cuente la
  historia, no el primero (lo elige `scripts/clips.mjs`).
- **h264, no webm**: el mismo archivo lo tiene que leer el `<video>` de Electron y el de Safari.
