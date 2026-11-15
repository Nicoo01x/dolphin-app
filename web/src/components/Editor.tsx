import { Encabezado, Seccion } from "./Encabezado";
import { Logo } from "./Logo";
import { TarjetaSobrePaisaje } from "./TarjetaSobrePaisaje";

/**
 * El editor, contado con lo que de verdad hace.
 *
 * Existe por un dato: las cinco cosas más votadas que se le piden a la base en sus issues son
 * todas del editor —inteligencia de lenguaje, ir a definición, ir a referencias, un editor tipo VS Code—, y
 * acá ya están resueltas desde hace rato. La página no lo decía en ningún lado.
 *
 * Cada fila está chequeada contra el código, no contra lo que nos gustaría tener: son los seis
 * proveedores que `components/editor/lsp-en-monaco.ts` registra de verdad (hover, definición,
 * referencias, autocompletado, renombre y formato) más el borde de git de `bordes-de-git.ts`. Si
 * alguno se cae, esta sección miente y hay que tocarla en el mismo commit.
 */
const FILAS = [
  { titulo: "Ves el tipo pasando el mouse", texto: "Sin salir a otra ventana ni abrir una terminal." },
  { titulo: "Vas a la definición y a las referencias", texto: "En todo el proyecto, no en el archivo abierto." },
  { titulo: "Renombrás un símbolo y cambia en todos lados", texto: "Lo resuelve el mismo servidor de lenguaje que usa tu IDE." },
  { titulo: "El borde de git, con revertir por pedazo", texto: "Devolvés un cambio sin perder los otros nueve." },
  { titulo: "Formatea al guardar", texto: "Con la configuración de tu repo, y si falla igual guarda." },
] as const;

export function Editor() {
  return (
    <Seccion id="editor" etiqueta="editor-titulo">
      <Encabezado
        id="editor-titulo"
        titulo="Y un editor de verdad."
        bajada="Es Monaco, el editor de VS Code, con un servidor de lenguaje atrás. Lo que el agente escribe lo podés leer y corregir acá mismo."
      />
      <TarjetaSobrePaisaje
        className="mt-10"
        paisaje="/paisajes/valle.webp"
        encabezado={
          <>
            <Logo className="size-4" />
            <span>En la misma ventana</span>
          </>
        }
        filas={FILAS}
      />
    </Seccion>
  );
}
