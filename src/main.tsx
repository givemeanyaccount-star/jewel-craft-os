import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPalette } from "./components/ThemeSwitcher";
import { registerServiceWorker } from "./pwa/registerSW";

initPalette();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
