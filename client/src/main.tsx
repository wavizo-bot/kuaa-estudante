import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const nativeShell = window.location.protocol === "capacitor:" || Boolean((window as Window & { Capacitor?: unknown }).Capacitor);
if (nativeShell) {
  Object.assign(window, {
    __KUAA_MODE__: "student",
    __KUAA_VIEW__: "student",
    __KUAA_DEVICE__: "phone",
  });
  import("@capacitor/app").then(({ App: NativeApp }) => {
    NativeApp.addListener("backButton", () => window.dispatchEvent(new Event("kuaa-back")));
    window.addEventListener("kuaa-exit", () => { void NativeApp.exitApp(); });
  }).catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  });
}
