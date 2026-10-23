import { USERNAMES } from "../vid.js";

/* js/store.js — single shared mutable state for all feature modules.
 * No DOM here. Features read/write ctx.store so one module never
 * has to import another feature directly (fault isolation). */

export function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

export function getDeviceName() {
  let name = null;
  try {
    name = localStorage.getItem("shortxx_name");
  } catch (e) {}
  if (!name) {
    name = USERNAMES[Math.floor(Math.random() * USERNAMES.length)] + Math.floor(Math.random() * 99);
    try {
      localStorage.setItem("shortxx_name", name);
    } catch (e) {}
  }
  return name;
}

export const store = {
  current: null,
  videoId: null,
  creator: null,
  linkedCreator: false,
  likedMap: readJson("shortxx_liked", {}),
};

export function displayIdentity() {
  return getDeviceName();
}

export function publishIdentity() {
  window.shortxxIdentity = displayIdentity();
}
