"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CloseIcon, InfoIcon } from "@/components/ui/icons";

type Toast = {
  id: number;
  title: string;
  description?: string;
  /** Stable identity; showing the same key again replaces instead of stacking. */
  key?: string;
  /** Optional link. Toasts never navigate on their own. */
  action?: { label: string; href: string };
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TOAST_DURATION_MS = 5_000;
/** Longer when there is something to act on. */
const ACTION_TOAST_DURATION_MS = 10_000;
const MAX_VISIBLE_TOASTS = 3;

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within a ToastProvider");
  return showToast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => {
      // Repeated clicks or deliveries should not stack identical toasts.
      const others = current.filter((item) =>
        toast.key ? item.key !== toast.key : item.title !== toast.title,
      );
      return [...others, { ...toast, id }].slice(-MAX_VISIBLE_TOASTS);
    });
  }, []);

  const value = useMemo(() => showToast, [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const duration = toast.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.action, onDismiss]);

  return (
    <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border border-accent-line bg-surface-raised px-4 py-3 shadow-panel">
      <InfoIcon className="mt-0.5 shrink-0 text-xl text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <Link
            href={toast.action.href}
            onClick={() => onDismiss(toast.id)}
            className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline"
          >
            {toast.action.label}
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-m-1 rounded p-1 text-lg text-fg-subtle transition-colors hover:text-fg"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
