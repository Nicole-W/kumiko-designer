import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import KumikoGridDesignerApp from "./App.jsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Missing #root element');
}

createRoot(rootEl).render(
  <StrictMode>
    <KumikoGridDesignerApp />
  </StrictMode>,
);
