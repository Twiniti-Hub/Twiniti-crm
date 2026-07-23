import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HexclaveProvider, HexclaveTheme } from "@hexclave/react";
import App from "./App";
import { authConfigured, hexclaveApp } from "./hexclave/client";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

const tree = authConfigured && hexclaveApp ? (
  <HexclaveProvider app={hexclaveApp}>
    <HexclaveTheme>
      <Suspense fallback={<div className="banner info">Loading…</div>}>
        <App />
      </Suspense>
    </HexclaveTheme>
  </HexclaveProvider>
) : (
  <Suspense fallback={<div className="banner info">Loading…</div>}>
    <App />
  </Suspense>
);

createRoot(root).render(<StrictMode>{tree}</StrictMode>);
