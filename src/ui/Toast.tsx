import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Defaults to 10 s for a toast with an action and 5 s otherwise; 0 keeps it open. */
  durationMs?: number;
  /** Called once when the toast closes for any reason. */
  onClose?: () => void;
}

export const TOAST_MS = 5000;
export const ACTION_TOAST_MS = 10_000;

export interface ToastProps {
  message: ReactNode;
  action?: ToastAction;
  durationMs: number;
  onDismiss: () => void;
}

interface ToastRecord extends ToastProps {
  id: number;
}

function containsTarget(container: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && container.contains(target);
}

export interface ToastController {
  showToast(message: ReactNode, options?: ToastOptions): number;
  dismissToast(id: number): void;
}

const ToastContext = createContext<ToastController | null>(null);

/**
 * The timer pauses while the pointer is over the toast or focus is inside it and resumes with
 * the remaining time (WCAG 2.2.1). Showing a toast never moves focus.
 */
export function Toast({ message, action, durationMs, onDismiss }: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingMs = useRef(durationMs);
  const paused = hovered || focused;

  useEffect(() => {
    remainingMs.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    if (durationMs <= 0 || paused) return;
    const startedAt = Date.now();
    const timeout = window.setTimeout(onDismiss, Math.max(0, remainingMs.current));
    return () => {
      window.clearTimeout(timeout);
      remainingMs.current -= Date.now() - startedAt;
    };
  }, [durationMs, onDismiss, paused]);

  return (
    <div
      className="sa-toast"
      role="status"
      aria-live="polite"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!containsTarget(event.currentTarget, event.relatedTarget)) setFocused(false);
      }}
    >
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
  const closeHandlers = useRef(new Map<number, (() => void) | undefined>());

  const dismissToast = useCallback((id: number) => {
    const handlers = closeHandlers.current;
    if (!handlers.has(id)) return;
    const onClose = handlers.get(id);
    handlers.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
    onClose?.();
  }, []);

  const showToast = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      closeHandlers.current.set(id, options.onClose);
      setToasts((current) => [
        ...current,
        {
          id,
          message,
          action: options.action,
          durationMs: options.durationMs ?? (options.action ? ACTION_TOAST_MS : TOAST_MS),
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
