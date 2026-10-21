import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastProps {
  message: ReactNode;
  action?: ToastAction;
  durationMs: number;
  onDismiss: () => void;
}

interface ToastRecord extends ToastProps {
  id: number;
}

export interface ToastController {
  showToast(message: ReactNode, options?: ToastOptions): number;
  dismissToast(id: number): void;
}

const ToastContext = createContext<ToastController | null>(null);

export function Toast({ message, action, durationMs, onDismiss }: ToastProps) {
  useEffect(() => {
    if (durationMs <= 0) return;
    const timeout = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, onDismiss]);

  return (
    <div className="sa-toast" role="status" aria-live="polite">
      <span className="sa-toast__message">{message}</span>
      {action ? (
        <Button
          className="sa-toast__action"
          variant="ghost"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [
        ...current,
        {
          id,
          message,
          action: options.action,
          durationMs: options.durationMs ?? 5000,
          onDismiss: () => dismissToast(id),
        },
      ]);
      return id;
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="sa-toast-region" aria-relevant="additions text">
        {toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastController {
  const controller = useContext(ToastContext);
  if (!controller) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return controller;
}
