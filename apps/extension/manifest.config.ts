import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "ChartMate — журнал сделок",
  description: "ИИ-компаньон трейдера: наблюдения по графику, журнал дисциплины. Не даёт торговых сигналов.",
  version: pkg.version,
  permissions: ["activeTab", "sidePanel", "storage"],
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "ChartMate",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
});
