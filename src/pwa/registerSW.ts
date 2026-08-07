/**
 * Single guarded service-worker registration point.
 * Never registers in development, inside an iframe, in Lovable preview hosts,
 * or when the URL carries ?sw=off — and unregisters any stale worker there.
 */

const SW_URL = "/sw.js";

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isBlockedHost() {
  const h = window.location.hostname;
  return (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister())
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const swOff = new URLSearchParams(window.location.search).get("sw") === "off";
  const refuse = !import.meta.env.PROD || inIframe() || isBlockedHost() || swOff;

  if (refuse) {
    void unregisterAppWorkers();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {
      /* offline support is best-effort */
    });
  });
}
