import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";
import { SieveWasmBridge, FilterOp } from "./sieve.ts";

console.log("Sieve core frontend initialized");

const rootEl = typeof document !== "undefined" ? document.getElementById("app") : null;
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

export { SieveWasmBridge, FilterOp };
export * from "./workers/protocol.ts";
export * from "./workers/pool.ts";
export * from "./storage/db.ts";
export * from "./storage/repositories/history.repo.ts";
export * from "./state/useSieveStore.ts";
export * from "./components/dropzone/FileDropzone.tsx";
export * from "./components/kpi/SummaryDashboard.tsx";
export * from "./components/dashboard/ExecutiveDashboard.tsx";
export * from "./components/dashboard/SpendWaterfallBar.tsx";
export * from "./components/dashboard/BidElasticityProbe.tsx";
export * from "./utils/executiveAnalytics.ts";
export * from "./components/sliders/ThresholdControls.tsx";
export * from "./components/grid/KeywordVirtualGrid.tsx";
export * from "./components/badges/CollisionBadge.tsx";

