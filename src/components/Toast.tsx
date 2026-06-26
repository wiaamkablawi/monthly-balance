import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = `toast-${++toastIdCounter}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
      const timer = window.setTimeout(() => dismiss(id), 3800);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role="status"
            onClick={() => dismiss(toast.id)}
          >
            <span className="toast-icon">
              {toast.kind === "success" ? "✓" : toast.kind === "error" ? "✕" : "ℹ"}
            </span>
            <span className="toast-msg">{toast.message}</span>
            <button
              className="toast-close"
              type="button"
              aria-label="סגור"
              onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
