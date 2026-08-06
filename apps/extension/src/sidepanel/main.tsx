import React from "react";
import ReactDOM from "react-dom/client";

import { SidePanel } from "./SidePanel";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Не найден элемент #root");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
