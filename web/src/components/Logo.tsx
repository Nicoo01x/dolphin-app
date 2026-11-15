/**
 * El logo de Dolphin: el delfín saltando de branding/dolphin-marca-fuente.png, con el mismo trazado
 * que usa la app de escritorio (escritorio/resources/logo.svg). En currentColor.
 */
const TRAZO =
  "M171.3 2.0L190.0 2.9L204.0 5.7L214.0 8.9L228.0 15.0L256.0 31.5L267.0 36.2L282.0 39.1L319.0 41.7L340.0 44.8L349.0 46.8L366.0 51.8L387.0 60.8L403.0 70.8L410.5 77.0L417.2 84.0L425.2 96.0L431.9 114.0L448.0 126.7L454.4 133.0L457.2 137.0L459.2 142.0L459.3 146.0L458.4 148.0L455.0 150.2L452.0 150.1L423.0 141.7L414.0 139.8L397.0 137.6L384.0 137.1L370.0 137.8L354.0 140.7L337.0 146.8L327.0 152.6L319.0 158.7L292.0 184.1L279.0 193.3L266.0 200.4L249.0 207.3L234.0 211.4L217.0 214.2L205.0 214.6L204.1 214.0L222.0 201.3L234.1 190.0L243.4 179.0L257.7 158.0L268.2 146.0L277.0 137.9L292.0 127.7L304.0 121.7L315.0 117.6L336.0 112.7L359.0 110.8L384.0 112.4L385.7 112.0L374.0 106.8L360.0 102.6L342.0 99.5L329.0 98.5L309.0 98.8L292.0 100.7L276.0 103.7L261.0 107.6L240.0 114.9L214.0 126.8L200.0 134.8L186.0 143.8L166.0 158.8L145.0 177.6L125.7 198.0L106.8 221.0L80.0 257.3L79.2 256.0L78.9 251.0L79.4 238.0L83.6 213.0L91.7 187.0L103.9 160.0L118.8 135.0L133.7 115.0L148.6 98.0L163.0 83.8L181.1 68.0L184.5 63.0L185.3 57.0L183.2 50.0L178.5 41.0L173.3 34.0L168.0 28.0L161.0 21.7L151.0 14.9L141.3 10.0L140.8 9.0L145.0 6.8L152.0 4.6L162.0 2.7ZM127.3 225.0L128.0 224.4L128.6 225.0L120.6 239.0L114.6 254.0L111.8 268.0L111.8 276.0L113.6 285.0L116.5 292.0L119.8 298.0L137.2 324.0L144.2 339.0L147.2 351.0L147.7 356.0L147.4 364.0L146.0 367.9L133.2 351.0L119.0 338.7L111.0 333.7L100.0 328.6L90.0 325.7L83.0 324.6L68.0 324.8L57.0 326.9L45.0 330.7L35.0 334.9L24.0 340.6L13.0 347.7L3.0 355.2L2.1 355.0L1.8 350.0L2.6 344.0L6.7 332.0L14.7 318.0L25.0 305.2L36.0 294.8L44.0 288.8L73.0 271.3L87.0 261.3L119.0 231.6Z";

export function Logo({ className, titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 462 370" className={className} role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}>
      <path fill="currentColor" fillRule="evenodd" d={TRAZO} />
    </svg>
  );
}

/**
 * La marca al revés: una pastilla clara con el delfín recortado en negro.
 *
 * El sitio entero es negro, así que un delfín blanco al aire se apoya en la nada y no se lee como
 * una marca: se lee como un dibujo más. Invertido, la pastilla es la que tiene forma y el delfín
 * es el hueco — que es lo que hace que una marca aguante al lado de cualquier cosa (Nico,
 * 09/11/2026: «todo el blanco y el delfín en negro, así toda la web es negra»).
 *
 * Why el delfín es un hueco y no un path negro encima: con `fillRule="evenodd"` en un solo path,
 * por el agujero se ve lo que haya atrás. Sobre el fondo oscuro se ve negro igual, y sobre una
 * foto —la tarjeta sobre el paisaje— se ve el agua, que es mejor que un negro plano pegado.
 */
export function LogoPastilla({ className, titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={`M0 112C0 50.1 50.1 0 112 0h288c61.9 0 112 50.1 112 112v288c0 61.9-50.1 112-112 112H112C50.1 512 0 461.9 0 400V112Z ${TRAZO_TRASLADADO}`}
      />
    </svg>
  );
}

/** El mismo delfín, corrido y achicado para que entre centrado en la pastilla de 512. */
const TRAZO_TRASLADADO = trasladar(TRAZO, 0.78, 76, 112);

/**
 * Mueve y escala un trazado SVG. Sólo entiende los comandos que usa el nuestro (M, L, Z), que es
 * a propósito: una implementación general acá sería código muerto que igual habría que probar.
 */
function trasladar(d: string, escala: number, dx: number, dy: number): string {
  return d.replace(/([ML])([\d.]+) ?([\d.]+)/g, (_, cmd: string, x: string, y: string) => {
    const nx = Number(x) * escala + dx;
    const ny = Number(y) * escala + dy;
    return `${cmd}${Math.round(nx * 10) / 10} ${Math.round(ny * 10) / 10}`;
  });
}

/** El trazado suelto, para dibujarlo adentro de otro SVG (el delfín que recorre la ruta). */
export const TRAZO_DEL_LOGO = TRAZO;
