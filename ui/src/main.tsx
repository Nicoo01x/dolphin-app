import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import App from "./App";
import { ponerTemaInicial } from "./lib/embebida";

// Antes del primer cuadro: adentro de la app clara, la consola no parpadea en negro.
ponerTemaInicial();

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
