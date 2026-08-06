import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    node.isContentEditable === true
  );
}

function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
  );
}

/** Pressing Escape navigates back, unless typing or an overlay is open. */
export function useEscapeBack() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (isEditable(e.target)) return;
      if (overlayOpen()) return;
      if (location.pathname === "/") return;
      navigate(-1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, location.pathname]);
}
