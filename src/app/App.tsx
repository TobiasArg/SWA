import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { LibraryScreen } from "../library/LibraryScreen";
import { downloadArchitectureJson, downloadRawArchitectureJson } from "../io/exportJson";
import { importArchitectureFile } from "../io/importJson";
import type { Repository } from "../persistence/types";
import { openRepository } from "../persistence/repository";
import { openArchitectureTabSync, subscribeArchitectureChanges } from "../persistence/tabSync";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { ToastProvider, useToast } from "../ui/Toast";
import { editorHref, LIBRARY_HREF, navigate, useRoute } from "./router";
import type { AppServices, EditorModules } from "./services";
import "./app.css";

export const STORAGE_UNAVAILABLE_TITLE = "Storage is unavailable";
export const STORAGE_UNAVAILABLE_MESSAGE =
  "Swarm Architecturer can't store data in this browser (storage is blocked or unavailable). Check privacy settings or try another browser.";
export const OPEN_FAILED_MESSAGE = "That architecture could not be opened.";
export const EDITOR_LOAD_FAILED_TITLE = "The editor could not be loaded";
export const EDITOR_LOAD_FAILED_MESSAGE = "Check your connection and reload the page.";
/** An old tab still holds the previous database version (ROADMAP_V2_DESIGN §6.2). */
export const UPGRADE_BLOCKED_MESSAGE =
  "Finishing an update. Close or reload other Swarm Architecturer tabs to continue.";
/** A newer version in another tab took over the database; this tab no longer saves. */
export const UPGRADE_BLOCKING_MESSAGE =
  "Swarm Architecturer was updated in another tab. Reload this tab to keep saving.";

export interface AppProps {
  services?: AppServices;
  modules?: EditorModules;
}

type RepositoryState =
  | { status: "loading" }
  | { status: "ready"; repository: Repository }
  | { status: "unavailable" };

type LibraryServices = Pick<
  AppServices,
  | "openRepository"
  | "openTabSession"
  | "subscribeToRepositoryChanges"
  | "importArchitectureFile"
  | "exportArchitectureJson"
  | "exportArchitectureMarkdown"
  | "exportRawJson"
  | "requestPersistentStorage"
>;

let persistRequested = false;

function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** The library's eager dependencies; editor-only services live in defaultModules.ts. */
const defaultLibraryServices: LibraryServices = {
  openRepository: (options) => openRepository(undefined, options),
  openTabSession: openArchitectureTabSync,
  subscribeToRepositoryChanges: (listener) => subscribeArchitectureChanges(() => listener()),
  importArchitectureFile,
  exportArchitectureJson: downloadArchitectureJson,
  exportArchitectureMarkdown: (architecture) => {
    void import("../io/exportMarkdown")
      .then(({ downloadArchitectureMarkdown }) => downloadArchitectureMarkdown(architecture))
      .catch((error: unknown) => console.error(error));
  },
  exportRawJson: downloadRawArchitectureJson,
  requestPersistentStorage,
};

const LazyEditorRoute = lazy(() => import("./EditorRoute"));

export function StorageUnavailable() {
  return (
    <main className="sa-storage-unavailable" aria-labelledby="sa-storage-unavailable-title">
      <div className="sa-storage-unavailable__panel">
        <Icon name="alert" size={20} className="sa-storage-unavailable__icon" />
        <h1 id="sa-storage-unavailable-title" className="sa-storage-unavailable__title">
          {STORAGE_UNAVAILABLE_TITLE}
        </h1>
        <p className="sa-storage-unavailable__text">{STORAGE_UNAVAILABLE_MESSAGE}</p>
      </div>
    </main>
  );
}

function EditorLoadFailure({ reload = () => window.location.reload() }: { reload?: () => void }) {
  return (
    <main className="sa-storage-unavailable" aria-labelledby="sa-editor-load-failed-title">
      <div className="sa-storage-unavailable__panel">
        <Icon name="alert" size={20} className="sa-storage-unavailable__icon" />
        <h1 id="sa-editor-load-failed-title" className="sa-storage-unavailable__title">
          {EDITOR_LOAD_FAILED_TITLE}
        </h1>
        <p className="sa-storage-unavailable__text">{EDITOR_LOAD_FAILED_MESSAGE}</p>
        <Button variant="primary" onClick={reload}>
          Reload
        </Button>
      </div>
    </main>
  );
}

interface EditorLoadBoundaryProps {
  children: ReactNode;
  reload?: () => void;
}

interface EditorLoadBoundaryState {
  failed: boolean;
}

/** A failed lazy chunk is recoverable by reloading after the connection/deploy is fixed. */
export class EditorLoadBoundary extends Component<EditorLoadBoundaryProps, EditorLoadBoundaryState> {
  state: EditorLoadBoundaryState = { failed: false };

  static getDerivedStateFromError(): EditorLoadBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <EditorLoadFailure reload={this.props.reload} />;
    return this.props.children;
  }
}

function UpgradeBlocked() {
  return (
    <main className="sa-storage-unavailable">
      <div className="sa-storage-unavailable__panel">
        <Icon name="info" size={20} />
        <p className="sa-storage-unavailable__text" role="status">
          {UPGRADE_BLOCKED_MESSAGE}
        </p>
      </div>
    </main>
  );
}

function EditorLoading() {
  return (
    <main className="sa-storage-unavailable" aria-live="polite">
      <p role="status">Loading editor…</p>
    </main>
  );
}

interface AppRoutesProps {
  injectedServices?: AppServices;
  injectedModules?: EditorModules;
}

function AppRoutes({ injectedServices, injectedModules }: AppRoutesProps) {
  const route = useRoute();
  const { showToast } = useToast();
  const [state, setState] = useState<RepositoryState>({ status: "loading" });
  const [upgrade, setUpgrade] = useState<"blocked" | "blocking" | null>(null);
  const libraryServices = injectedServices ?? (defaultLibraryServices as AppServices);

  useEffect(() => {
    let cancelled = false;
    libraryServices
      .openRepository({
        // A blocked open resumes by itself once the old tab closes; it is never "storage unavailable".
        onStatus(status) {
          if (cancelled) return;
          if (status === "blocked") setUpgrade("blocked");
          else if (status === "open") setUpgrade((current) => (current === "blocked" ? null : current));
          else if (status === "blocking") setUpgrade("blocking");
        },
      })
      .then((repository) => {
        if (!cancelled) setState({ status: "ready", repository });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [libraryServices]);

  const openArchitecture = useCallback((id: string) => navigate(editorHref(id)), []);
  const openLibrary = useCallback(() => navigate(LIBRARY_HREF), []);
  const openFailed = useCallback(() => {
    navigate(LIBRARY_HREF, { replace: true });
    showToast(OPEN_FAILED_MESSAGE);
  }, [showToast]);

  if (state.status === "unavailable") return <StorageUnavailable />;
  if (state.status === "loading") return upgrade === "blocked" ? <UpgradeBlocked /> : null;

  const content =
    route.name === "editor" ? (
      <EditorLoadBoundary key={route.id}>
        <Suspense fallback={<EditorLoading />}>
          <LazyEditorRoute
            id={route.id}
            repository={state.repository}
            libraryServices={defaultLibraryServices}
            injectedServices={injectedServices}
            injectedModules={injectedModules}
            onOpenFailed={openFailed}
            onLeave={openLibrary}
            onOpenArchitecture={openArchitecture}
          />
        </Suspense>
      </EditorLoadBoundary>
    ) : (
      <LibraryScreen
        repository={state.repository}
        services={libraryServices}
        editorHref={editorHref}
        onOpen={openArchitecture}
      />
    );

  // One element structure with or without the banner, so the route never remounts when it appears.
  return (
    <div className={upgrade === "blocking" ? "sa-app-shell sa-app-shell--banner" : "sa-app-shell"}>
      {upgrade === "blocking" ? (
        <div className="sa-app-banner" role="alert">
          <Icon name="warning" />
          <span>{UPGRADE_BLOCKING_MESSAGE}</span>
          <Button size="compact" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : null}
      {content}
    </div>
  );
}

export default function App({ services, modules }: AppProps) {
  return (
    <ToastProvider>
      <AppRoutes injectedServices={services} injectedModules={modules} />
      <LiveRegion />
    </ToastProvider>
  );
}
