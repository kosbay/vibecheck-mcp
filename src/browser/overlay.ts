/**
 * In-page overlay injected into every document of the recorded session
 * (via context.addInitScript) so the video shows WHAT the agent is doing:
 *   - a fake cursor that glides to the target of each click/type/hover
 *   - a click ripple at the interaction point
 *   - a semi-transparent caption pill describing the current action
 *
 * Constraints the implementation must respect:
 *   - CSP-safe: no external resources, no <style> tags (style-src may block
 *     them) — inline element styles + Web Animations API only
 *   - pointer-events: none everywhere so it can never intercept the page
 *   - aria-hidden so it never appears in accessibility snapshots
 */

export const CURSOR_GLIDE_MS = 350;

export const OVERLAY_SCRIPT = `(() => {
  if (window.__vckOverlay) return;

  const Z = 2147483647;
  let root = null;
  let cursor = null;
  let caption = null;
  let captionTimer = 0;

  function ensureRoot() {
    if (root && root.isConnected) return root;
    root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("data-vck-overlay", "");
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: String(Z),
    });
    (document.body || document.documentElement).appendChild(root);
    return root;
  }

  function ensureCursor() {
    ensureRoot();
    if (cursor && cursor.isConnected) return cursor;
    cursor = document.createElement("div");
    cursor.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5));">' +
      '<path d="M5.5 3.2 L5.5 17.5 L9.1 14.4 L11.3 19.8 L13.9 18.7 L11.7 13.4 L16.4 13 Z" ' +
      'fill="#f8fafc" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "24px",
      height: "24px",
      pointerEvents: "none",
      opacity: "0",
      transform: "translate(-100px, -100px)",
      transition: "transform ${CURSOR_GLIDE_MS}ms cubic-bezier(0.35, 0, 0.25, 1), opacity 150ms ease",
      willChange: "transform",
    });
    root.appendChild(cursor);
    return cursor;
  }

  function ensureCaption() {
    ensureRoot();
    if (caption && caption.isConnected) return caption;
    caption = document.createElement("div");
    Object.assign(caption.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      maxWidth: "72%",
      padding: "8px 18px",
      borderRadius: "999px",
      background: "rgba(15, 23, 42, 0.68)",
      border: "1px solid rgba(148, 163, 184, 0.35)",
      color: "rgba(255, 255, 255, 0.96)",
      font: "500 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 180ms ease",
    });
    root.appendChild(caption);
    return caption;
  }

  window.__vckOverlay = {
    moveTo(x, y) {
      const c = ensureCursor();
      c.style.opacity = "1";
      // Cursor hotspot is the arrow tip at the element's top-left of the SVG
      c.style.transform = "translate(" + (x - 5) + "px, " + (y - 3) + "px)";
    },

    ripple(x, y) {
      ensureRoot();
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed",
        left: x - 18 + "px",
        top: y - 18 + "px",
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        border: "2.5px solid rgba(56, 189, 248, 0.95)",
        background: "rgba(56, 189, 248, 0.28)",
        pointerEvents: "none",
      });
      root.appendChild(r);
      r.animate(
        [
          { transform: "scale(0.35)", opacity: 1 },
          { transform: "scale(2.1)", opacity: 0 },
        ],
        { duration: 500, easing: "ease-out" }
      ).onfinish = () => r.remove();
    },

    caption(text) {
      const el = ensureCaption();
      el.textContent = text;
      el.style.opacity = "1";
      clearTimeout(captionTimer);
      captionTimer = setTimeout(() => {
        el.style.opacity = "0";
      }, 2600);
    },

    hide() {
      if (root) root.style.visibility = "hidden";
    },

    show() {
      if (root) root.style.visibility = "";
    },
  };
})();`;
