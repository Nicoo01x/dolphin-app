# Turnos en tu VPS, por SSH

Un turno del calendario puede correr en otra máquina —tu VPS— en vez de en
la tuya. Dolphin se conecta por SSH, corre la siembra allá (corriendo sola,
con la política encima: no deploya ni toca migraciones) y se trae la
cosecha, así la consola la muestra como cualquier otra.

## Lo que tiene que haber en el VPS

1. **Dolphin clonado** y con sus dependencias:
   ```bash
   git clone <tu repo de dolphin> /opt/dolphin-app
   cd /opt/dolphin-app && npm install
   ```
2. **El repo del proyecto** clonado donde quieras (por ejemplo `/var/www/tienda`),
   con la identidad de git configurada: los commits de las ramas salen a tu nombre.
   ```bash
   git -C /var/www/tienda config user.name "Tu Nombre"
   git -C /var/www/tienda config user.email "vos@ejemplo.com"
   ```
3. **El agente** instalado y con sesión (Claude Code, Antigravity o Codex).

## Lo que tiene que haber en tu máquina

Acceso por clave al VPS, sin contraseña: Dolphin usa `ssh -o BatchMode=yes`,
así que si la clave no está **falla en vez de quedarse esperando** una
contraseña que nadie va a escribir a las 3 de la mañana.

```bash
ssh -o BatchMode=yes nico@1.2.3.4 echo anda   # tiene que decir «anda»
```

## La configuración

En `dolphin.config.json` del repo, en tu máquina:

```json
{
  "hosts": {
    "vps": {
      "destino": "nico@1.2.3.4",
      "repo": "/var/www/tienda",
      "dolphin": "/opt/dolphin-app"
    }
  }
}
```

`destino` puede ser también un alias de `~/.ssh/config`. Con eso, en la
consola, al agendar una tarea («Cuándo» en Nueva) aparece **Dónde**: «Esta
máquina» o «vps, por SSH».

## Qué pasa a la hora del turno

1. El servidor de Dolphin (el que levanta la consola) ve que le llegó la hora.
2. Lanza por SSH, **desprendido**: `cd /opt/dolphin-app && node --import tsx src/cli.ts --repo /var/www/tienda --automatico --tarea '…'`
   corre allá en su propia sesión (`setsid nohup … &`), con la salida en
   `/var/www/tienda/.dolphin/turnos/<id>.log` y su estado (pid, inicio y, al
   terminar, código y fin) en `.dolphin/turnos/<id>.json`. La conexión se
   cierra enseguida: el turno no depende de ella.
   La tarea va entre comillas simples y escapada: una comilla o un `$(…)`
   adentro de la tarea no se ejecuta nunca.
3. Desde acá se lo sigue con consultas cortas cada 15 s. Si se corta el wifi o
   la PC se suspende, la consulta falla y **no pasa nada**: la próxima se hace
   esperando el doble (hasta 2 min), y al volver la red se sigue mirando. Lo
   único que lo da por perdido:
   - el tope de 3 h (allá lo corta un `timeout`, y acá se espera 10 min más);
   - que allá el proceso ya no esté y no haya dejado su código (el VPS se
     reinició): «se cortó», con la última línea del log.
4. Al terminar bien, se trae `.dolphin/ultima.json` del VPS y lo guarda como una cosecha más.
5. La Agenda marca el turno como hecho, o como «no salió» con el motivo
   (por ejemplo, `en nico@1.2.3.4: Permission denied (publickey).`).

Cancelar un turno desde la Agenda lo corta allá también.

## Mirarlo mientras corre

```bash
dolphin turno adjuntar <id>               # el log en vivo, hasta que termine
dolphin turno adjuntar <id> --host vps    # si no quedó anotado adónde fue
```

Ctrl+C deja de mirar; el turno sigue allá. El id es el del turno en la Agenda.

Si Dolphin se cerró mientras un turno corría allá, nadie lo vio terminar:
`dolphin doctor` lo avisa pasado el tope, con el comando para mirarlo.
(Hoy la Agenda lo da por cortado al volver a abrir; el turno de allá igual
termina y deja su log.)
