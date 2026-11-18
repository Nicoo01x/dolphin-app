// La base del panel: SQLite de Node (`node:sqlite`, sin dependencias), un archivo en el VPS.
//
// Guarda tres cosas: los reportes que manda la app (crashes y comentarios), las visitas de la web
// contadas por día y página, y los clics al botón Descargar. Las descargas de verdad no se guardan
// acá: las cuenta GitHub y se piden a su API (ver descargas.mjs).

import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS reportes (
  id TEXT PRIMARY KEY,
  recibido TEXT NOT NULL,
  tipo TEXT NOT NULL,
  firma TEXT,
  titulo TEXT,
  version TEXT,
  plataforma TEXT,
  sistema TEXT,
  arch TEXT,
  proceso TEXT,
  motivo TEXT,
  texto TEXT NOT NULL,
  github TEXT,
  correo TEXT,
  diagnostico_bytes INTEGER NOT NULL DEFAULT 0,
  imagenes INTEGER NOT NULL DEFAULT 0,
  visto INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reportes_firma ON reportes (firma, recibido);
CREATE INDEX IF NOT EXISTS reportes_tipo ON reportes (tipo, recibido);
CREATE TABLE IF NOT EXISTS firmas (
  firma TEXT PRIMARY KEY,
  resuelto_en TEXT,
  version_al_resolver TEXT
);
CREATE TABLE IF NOT EXISTS visitas (
  dia TEXT NOT NULL,
  ruta TEXT NOT NULL,
  origen TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (dia, ruta, origen)
);
CREATE TABLE IF NOT EXISTS clics_descarga (
  dia TEXT NOT NULL,
  sistema TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (dia, sistema)
);
`;

/** Abre (o crea) la base. `:memory:` para los tests. */
export function abrirBase(ruta) {
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
  db.exec(ESQUEMA);
  return crearConsultas(db);
}

function crearConsultas(db) {
  const insertarReporte = db.prepare(`
    INSERT INTO reportes (id, recibido, tipo, firma, titulo, version, plataforma, sistema, arch,
      proceso, motivo, texto, github, correo, diagnostico_bytes, imagenes)
    VALUES (:id, :recibido, :tipo, :firma, :titulo, :version, :plataforma, :sistema, :arch,
      :proceso, :motivo, :texto, :github, :correo, :diagnostico_bytes, :imagenes)`);
  const vecesDeFirma = db.prepare("SELECT COUNT(*) AS n FROM reportes WHERE firma = ?");
  const estadoDeFirma = db.prepare("SELECT resuelto_en, version_al_resolver FROM firmas WHERE firma = ?");
  const sumarVisita = db.prepare(`
    INSERT INTO visitas (dia, ruta, origen, n) VALUES (?, ?, ?, 1)
    ON CONFLICT (dia, ruta, origen) DO UPDATE SET n = n + 1`);
  const sumarClic = db.prepare(`
    INSERT INTO clics_descarga (dia, sistema, n) VALUES (?, ?, 1)
    ON CONFLICT (dia, sistema) DO UPDATE SET n = n + 1`);

  return {
    db,
    cerrar: () => db.close(),

    /** Guarda un reporte y dice si su firma es nueva o volvió después de darla por resuelta. */
    guardarReporte(r) {
      const antes = r.firma ? vecesDeFirma.get(r.firma).n : 0;
      const estado = r.firma ? estadoDeFirma.get(r.firma) : undefined;
      insertarReporte.run({
        ...r,
        firma: r.firma ?? null,
        titulo: r.titulo ?? null,
        github: r.github ?? null,
        correo: r.correo ?? null,
      });
      const volvio = Boolean(estado?.resuelto_en);
      if (volvio) db.prepare("UPDATE firmas SET resuelto_en = NULL WHERE firma = ?").run(r.firma);
      return { nueva: r.firma ? antes === 0 : false, volvio };
    },

    resumen(desde) {
      const una = (sql, ...p) => db.prepare(sql).get(...p);
      return {
        crashesSinVer: una("SELECT COUNT(*) AS n FROM reportes WHERE tipo = 'crash' AND visto = 0").n,
        comentariosSinVer: una("SELECT COUNT(*) AS n FROM reportes WHERE tipo = 'feedback' AND visto = 0").n,
        crashesPeriodo: una("SELECT COUNT(*) AS n FROM reportes WHERE tipo = 'crash' AND recibido >= ?", desde).n,
        firmasAbiertas: una(`SELECT COUNT(DISTINCT r.firma) AS n FROM reportes r
          LEFT JOIN firmas f ON f.firma = r.firma WHERE r.tipo = 'crash' AND f.resuelto_en IS NULL`).n,
        visitasPeriodo: una("SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE dia >= ?", desde.slice(0, 10)).n,
        clicsPeriodo: una("SELECT COALESCE(SUM(n), 0) AS n FROM clics_descarga WHERE dia >= ?", desde.slice(0, 10)).n,
      };
    },

    /** Los crashes agrupados por firma, los abiertos primero y los más recientes arriba. */
    firmasDeCrash() {
      return db.prepare(`
        SELECT r.firma, MAX(r.titulo) AS titulo, COUNT(*) AS veces, MIN(r.recibido) AS primera,
          MAX(r.recibido) AS ultima, SUM(r.visto = 0) AS sin_ver,
          GROUP_CONCAT(DISTINCT r.version) AS versiones, GROUP_CONCAT(DISTINCT r.plataforma) AS plataformas,
          f.resuelto_en, f.version_al_resolver
        FROM reportes r LEFT JOIN firmas f ON f.firma = r.firma
        WHERE r.tipo = 'crash'
        GROUP BY r.firma
        ORDER BY (f.resuelto_en IS NOT NULL), ultima DESC
        LIMIT 200`).all();
    },

    reportesDeFirma(firma) {
      return db.prepare(`SELECT id, recibido, version, plataforma, sistema, arch, proceso, motivo, visto,
        diagnostico_bytes FROM reportes WHERE firma = ? ORDER BY recibido DESC LIMIT 100`).all(firma);
    },

    comentarios() {
      return db.prepare(`SELECT id, recibido, version, plataforma, sistema, texto, github, correo, imagenes,
        diagnostico_bytes, visto FROM reportes WHERE tipo = 'feedback' ORDER BY recibido DESC LIMIT 200`).all();
    },

    reporte(id) {
      return db.prepare("SELECT * FROM reportes WHERE id = ?").get(id);
    },

    marcarVisto(ids) {
      const una = db.prepare("UPDATE reportes SET visto = 1 WHERE id = ?");
      for (const id of ids) una.run(id);
    },

    marcarFirmaVista(firma) {
      db.prepare("UPDATE reportes SET visto = 1 WHERE firma = ?").run(firma);
    },

    resolverFirma(firma, cuando, version) {
      db.prepare(`INSERT INTO firmas (firma, resuelto_en, version_al_resolver) VALUES (?, ?, ?)
        ON CONFLICT (firma) DO UPDATE SET resuelto_en = excluded.resuelto_en,
        version_al_resolver = excluded.version_al_resolver`).run(firma, cuando, version ?? null);
      db.prepare("UPDATE reportes SET visto = 1 WHERE firma = ?").run(firma);
    },

    reabrirFirma(firma) {
      db.prepare("UPDATE firmas SET resuelto_en = NULL WHERE firma = ?").run(firma);
    },

    sumarVisita: (dia, ruta, origen) => sumarVisita.run(dia, ruta, origen),
    sumarClic: (dia, sistema) => sumarClic.run(dia, sistema),

    visitasPorDia(desdeDia) {
      return db.prepare("SELECT dia, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY dia ORDER BY dia").all(desdeDia);
    },
    visitasPorRuta(desdeDia) {
      return db.prepare(`SELECT ruta, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY ruta
        ORDER BY n DESC LIMIT 30`).all(desdeDia);
    },
    visitasPorOrigen(desdeDia) {
      return db.prepare(`SELECT origen, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY origen
        ORDER BY n DESC LIMIT 30`).all(desdeDia);
    },
    clicsPorDia(desdeDia) {
      return db.prepare(`SELECT dia, sistema, n FROM clics_descarga WHERE dia >= ? ORDER BY dia`).all(desdeDia);
    },
  };
}
