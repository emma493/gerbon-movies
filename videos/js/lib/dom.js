/* js/lib/dom.js — tiny DOM helpers shared by features. No state. */

export function $(sel, root) {
  return (root || document).querySelector(sel);
}

export function $all(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function makeToast() {
  const list = document.querySelector('[role="region"][aria-label^="Notifications"] ol');
  return function toast(msg) {
    if (!list) return;
    const li = document.createElement("li");
    li.className = "sx-toast";
    li.textContent = msg;
    list.appendChild(li);
    setTimeout(() => {
      li.classList.add("sx-toast-hide");
      setTimeout(() => li.remove(), 320);
    }, 2200);
  };
}
