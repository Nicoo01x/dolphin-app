# Cómo se saca una versión de Dolphin

La app de escritorio sale de GitHub Releases de este repo. Una versión instalada lee
`https://github.com/Nicoo01x/dolphin-app/releases/latest/download/latest*.yml`: si ahí hay un
número mayor que el suyo, muestra la tarjeta de «Actualización disponible». Para que eso funcione
el repo tiene que ser **público** y la release tiene que estar **publicada** (un borrador o una
prerelease no salen en `/releases/latest`).

Todo lo hace el workflow [`.github/workflows/instaladores.yml`](.github/workflows/instaladores.yml).

## Los pasos

1. **Subir la versión** en `escritorio/package.json` (`"version": "1.6.1"`). Tiene que ser mayor
   que la última publicada: electron-updater compara por semver y una igual o menor no se ofrece.
2. **Escribir las notas** en `docs/versiones/v1.6.1.md` (opcional: sin el archivo la release sale
   con un texto genérico). Es lo que ve la gente en la página de la release y en «Notas de la
   versión» de la tarjeta.
3. **Commitear** las dos cosas en `master` y empujar.
4. **Crear y empujar el tag**, que es lo que dispara todo:

   ```sh
   git tag v1.6.1
   git push origin v1.6.1
   ```

5. El workflow hace, en orden:
   - **Borrador de la release**: verifica que el tag diga lo mismo que el `package.json` y crea la
     release `v1.6.1` como borrador, con las notas.
   - **Instalador de Windows, macOS y Linux** (en paralelo): compila y sube al borrador. Tarda
     entre 30 y 60 minutos.
   - **Publicar la release**: verifica que estén todos los archivos que nombran los manifiestos
     (`verify-release-required-assets.mjs`), la saca del borrador como `latest`, y lee
     `/releases/latest/download/latest*.yml` como lo haría la app.

Un tag con guion (`v1.7.0-rc.1`) sale como **prerelease**: queda publicado pero ninguna app
instalada lo ofrece, porque `/releases/latest` lo saltea. Sirve para probar un instalador sin
mandárselo a nadie.

Si una corrida falla a la mitad, el borrador queda con lo que alcanzó a subir y nadie lo ve. Se
vuelve a correr el workflow sobre el mismo tag (Re-run all jobs, o el tag movido a otro commit):
reusa el borrador, lo vacía y las tres plataformas suben todo de nuevo, así no se mezclan archivos
de dos commits. «Re-run failed jobs» no lo vacía: recompila solo lo que falló y conserva lo que ya
había subido bien. Una release ya publicada no se recompila: se sube el número.

Para ensayar sin publicar nada: **Actions → Instaladores → Run workflow** sobre una rama. Compila
las tres plataformas y deja los instaladores como artefactos de la corrida.

## Qué verificar después

- [ ] La release `vX.Y.Z` está publicada y marcada como **Latest**.
- [ ] Tiene `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, `dolphin-windows-setup.exe` (+ su
      `.blockmap`), `dolphin-macos-arm64.dmg`, `dolphin-macos-x64.dmg`, los dos `.zip` de macOS
      (+ `.blockmap`), `dolphin-linux.AppImage`, el `.deb` y el `.rpm`. El job «Publicar la
      release» ya lo chequea; esto es mirarlo una vez con los ojos.
- [ ] El último paso del workflow («La app ya ve la versión nueva») está en verde.
- [ ] En una máquina con la versión anterior instalada: Ayuda → **Buscar actualizaciones…** muestra
      la tarjeta con la versión nueva. En Windows y Linux, **Actualizar** la baja, la instala y la
      app vuelve a abrir en la versión nueva (si la descarga quedó lista sin que nadie tocara el
      botón, la tarjeta ofrece **Reiniciar para actualizar**). En macOS el botón dice **Descargar
      manualmente** y abre la release.

## Probar la cadena sin publicar

```sh
cd escritorio
pnpm run verify:update-chain
```

Levanta un servidor local armado como las releases de GitHub y corre una app de Electron
«instalada» en la 1.6.0 con el electron-updater del repo y el mismo feed que usa Dolphin. Comprueba
que ve la 1.6.1, que no ofrece nada cuando ya está al día, y —en Windows— que baja la versión nueva
y verifica su sha512, y que una instalada que declara un `publisherName` sin estar firmada rechaza
la siguiente (la trampa de abajo). No ejecuta un instalador real.

## Sin firma: lo que hay que saber

Los instaladores salen **sin firmar** hasta que haya certificados.

- **Windows** — SmartScreen avisa «Windows protegió su PC» → **Más información → Ejecutar de todas
  formas**. La actualización automática funciona igual: electron-updater sólo verifica la firma si
  la app instalada tiene un `publisherName` en su `app-update.yml`, y un build sin firma no lo
  declara (`firmaDeVerdad` en `escritorio/config/electron-builder.config.cjs`).
- **macOS** — Gatekeeper avisa que no puede comprobar la app → Ajustes del Sistema → Privacidad y
  seguridad → **Abrir igualmente**. Si dice que «está dañada»:
  `xattr -dr com.apple.quarantine "/Applications/Dolphin Code.app"`. Squirrel.Mac (lo que
  reemplaza la app en macOS) no acepta una versión sin firma, así que la app **avisa** de la
  versión nueva pero el botón abre la release para bajar el `.dmg` (`DOLPHIN_MAC_ACTUALIZA_SOLO`
  en `escritorio/src/shared/dolphin-brand.ts`).
- **Linux** — no hay firma de por medio. El AppImage se reemplaza solo; con `.deb`/`.rpm` la app
  baja el paquete e instalarlo pide la contraseña de administrador.

### La trampa que ya rompió la cadena una vez

Quien decide con qué firma se valida una versión nueva es el `app-update.yml` de la versión **ya
instalada**, no el de la nueva. La 1.5.2 decía `publisherName: SignPath Foundation` sin estar
firmada, y por eso rechazaba cualquier versión siguiente. Reglas:

- `publisherName` entra en el **mismo** build en que se firma de verdad, nunca antes.
- Cuando se firme macOS, `DOLPHIN_MAC_ACTUALIZA_SOLO` pasa a `true` en ese mismo build. Las Macs
  con una versión anterior seguirán bajando a mano esa vez; desde ahí, se actualizan solas.
- Quien tiene la 1.5.x instalada la reemplaza a mano por la primera versión pública: esas versiones
  apuntaban a un repo privado y no ven ninguna release.

## Cuando haya firma

- **Windows**: el relevo a SignPath se prende con `DOLPHIN_WIN_SIGNPATH_RELAY` /
  `DOLPHIN_WIN_UNINSTALLER_RELAY_URL` en el job de Windows; con ellas el build declara
  `publisherName` solo.
- **macOS**: certificado Developer ID + notarización con `DOLPHIN_MAC_RELEASE=1`
  (`verify-macos-release-env.mjs` dice qué variables pide) y `DOLPHIN_MAC_ACTUALIZA_SOLO = true`.
