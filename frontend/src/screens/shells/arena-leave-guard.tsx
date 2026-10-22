"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * Lets the game screen tell the arena header whether leaving needs a
 * confirmation. A ref rather than state: the header reads it at click time, so
 * registering never re-renders anything.
 */
const LeaveGuardContext = createContext<RefObject<boolean> | null>(null);

export function ArenaLeaveGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef(false);
  return <LeaveGuardContext.Provider value={guardRef}>{children}</LeaveGuardContext.Provider>;
}

/** Whether the current arena screen asks for confirmation before the player leaves. */
export function useLeaveGuardRef() {
  const ref = useContext(LeaveGuardContext);
  if (!ref) throw new Error("useLeaveGuardRef must be used within an ArenaLeaveGuardProvider");
  return ref;
}

/** Registers that leaving this screen needs confirmation while `active`. */
export function useRegisterLeaveGuard(active: boolean) {
  const guardRef = useLeaveGuardRef();
  useEffect(() => {
    guardRef.current = active;
    return () => {
      guardRef.current = false;
    };
  }, [guardRef, active]);
}
