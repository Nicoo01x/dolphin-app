// Las máquinas: lo que se prueba acá es el COMANDO que se arma, porque es lo único que se puede
// revisar sin un VPS y es donde están los errores caros — un destino que ssh lee como opción, un
// túnel que parece abierto y no reenvía nada, un `cd` que falla en silencio y corre en el home.

import { describe, expect, it } from "vitest";
import {
  DestinoPeligroso,
  MaquinaDesconocida,
  comandoDeAlcance,
  comandoDeDolphinRemoto,
  comandoDeTunel,
  comandoParaCorrer,
  leerAlcance,
  maquinaLlamada,
  maquinasDe,
  type Maquina,
} from "../src/nucleo/maquinas.js";

const HOSTS = {
  vps: { destino: "nico@1.2.3.4", repo: "/var/www/app", dolphin: "/opt/dolphin-app" },
  casa: { destino: "pepe@192.168.0.9", repo: "/home/pepe/proyecto", dolphin: "/opt/dolphin" },
};

const VPS: Maquina = { nombre: "vps", host: HOSTS.vps };

describe("las máquinas configuradas", () => {
  it("salen ordenadas, para que la lista no baile entre corridas", () => {
    expect(maquinasDe(HOSTS).map((m) => m.nombre)).toEqual(["casa", "vps"]);
  });

  it("sin hosts en el config, la lista está vacía y no revienta", () => {
    expect(maquinasDe(undefined)).toEqual([]);
  });

  it("pedir una que no existe nombra las que sí", () => {
    expect(() => maquinaLlamada("nube", HOSTS)).toThrow(MaquinaDesconocida);
    expect(() => maquinaLlamada("nube", HOSTS)).toThrow(/casa, vps/);
  });

  it("sin ninguna configurada, lo dice y manda al config", () => {
    expect(() => maquinaLlamada("vps", {})).toThrow(/ninguna.*dolphin\.config\.json/s);
  });

  it("un destino que ssh leería como opción no se usa", () => {
    const hosts = {
      malo: { destino: "-oProxyCommand=rm -rf /", repo: "/x", dolphin: "/y" },
    };
    expect(() => maquinaLlamada("malo", hosts)).toThrow(DestinoPeligroso);
  });
});

describe("preguntar si contesta", () => {
  it("no pregunta contraseña ni se cuelga esperando una máquina apagada", () => {
    const { programa, argumentos } = comandoDeAlcance(VPS, 5);
    expect(programa).toBe("ssh");
    expect(argumentos).toContain("BatchMode=yes");
    expect(argumentos).toContain("ConnectTimeout=5");
    expect(argumentos.at(-1)).toBe("true");
  });

  it("salir con 0 es que llega; con otra cosa, el motivo es la primera línea del error", () => {
    expect(leerAlcance("vps", { codigo: 0, error: "" }, 42)).toEqual({
      nombre: "vps",
      llega: true,
      ms: 42,
    });
    const caido = leerAlcance(
      "vps",
      { codigo: 255, error: "\n  ssh: connect to host 1.2.3.4 port 22: Connection refused\nmás ruido" },
      900,
    );
    expect(caido.llega).toBe(false);
    expect(caido.porque).toBe("ssh: connect to host 1.2.3.4 port 22: Connection refused");
  });

  it("un error sin ninguna línea útil igual dice algo", () => {
    expect(leerAlcance("vps", { codigo: 255, error: "   \n\n" }, 1).porque).toBe("ssh salió con 255");
  });
});

describe("el túnel", () => {
  it("no abre una shell, falla si el puerto está ocupado y se mantiene vivo", () => {
    const { argumentos } = comandoDeTunel(VPS, { local: 7777 });
    expect(argumentos).toContain("-N");
    expect(argumentos).toContain("ExitOnForwardFailure=yes");
    expect(argumentos).toContain("ServerAliveInterval=30");
  });

  it("escucha sólo en esta máquina, no en toda la red local", () => {
    const { argumentos } = comandoDeTunel(VPS, { local: 7777 });
    expect(argumentos).toContain("127.0.0.1:7777:127.0.0.1:7777");
  });

  it("el puerto de allá puede ser otro", () => {
    const { argumentos } = comandoDeTunel(VPS, { local: 8080, remoto: 3000 });
    expect(argumentos).toContain("127.0.0.1:8080:127.0.0.1:3000");
  });

  it("un puerto que no es un puerto se rechaza antes de lanzar nada", () => {
    expect(() => comandoDeTunel(VPS, { local: 0 })).toThrow(RangeError);
    expect(() => comandoDeTunel(VPS, { local: 70000 })).toThrow(RangeError);
    expect(() => comandoDeTunel(VPS, { local: 80.5 })).toThrow(RangeError);
  });
});

describe("correr algo allá", () => {
  it("pide terminal del otro lado y entra al repo con && para que falle si no está", () => {
    const { argumentos } = comandoParaCorrer(VPS, "npm test");
    expect(argumentos).toContain("-t");
    expect(argumentos.at(-1)).toBe("cd '/var/www/app' && npm test");
  });

  it("una ruta con comilla no rompe el comando de allá", () => {
    const raro: Maquina = {
      nombre: "raro",
      host: { destino: "a@b", repo: "/tmp/el 'repo'", dolphin: "/d" },
    };
    expect(comandoParaCorrer(raro, "ls").argumentos.at(-1)).toBe(
      "cd '/tmp/el '\\''repo'\\''' && ls",
    );
  });

  it("sin comando no manda nada", () => {
    expect(() => comandoParaCorrer(VPS, "   ")).toThrow(RangeError);
  });

  it("el dolphin de allá se llama por su ruta, con cada argumento entrecomillado", () => {
    const { argumentos } = comandoDeDolphinRemoto(VPS, ["sembrar", "--tarea", "arreglá el login"]);
    expect(argumentos.at(-1)).toBe(
      "cd '/var/www/app' && '/opt/dolphin-app/dolphin' 'sembrar' '--tarea' 'arreglá el login'",
    );
  });
});
