"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Browser reachability is a display hint; HTTP remains the authority. */
export function useBrowserOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
