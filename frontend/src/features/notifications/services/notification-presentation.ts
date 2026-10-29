const storageKey = "vortix-presented-notifications";

/** Shares presentation claims between tabs; inbox reconciliation still happens in
 * every tab. Web Locks serialize read/write; unsupported browsers use best effort. */
export async function presentNotificationOnce(id: string, present: () => void) {
  if (document.visibilityState !== "visible") return;
  const claim = () => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      const seen = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
      if (seen.includes(id)) return;
      localStorage.setItem(
        storageKey,
        JSON.stringify([...seen.slice(-127), id]),
      );
    } catch {
      /* Private/disabled storage: per-tab stable-id deduplication still applies. */
    }
    present();
  };
  if (navigator.locks)
    await navigator.locks.request("vortix-notification-presentation", claim);
  else claim();
}
