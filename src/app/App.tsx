import { useCallback, useEffect, useState } from "react";
import { LibraryScreen } from "../library/LibraryScreen";
import type { Repository } from "../persistence/types";
import { Icon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { ToastProvider, useToast } from "../ui/Toast";
import { defaultModules, defaultServices } from "./defaultServices";
import { EditorScreen } from "./EditorScreen";
import { editorHref, LIBRARY_HREF, navigate, useRoute } from "./router";
import type { AppServices, EditorModules } from "./services";
import "./app.css";

export const STORAGE_UNAVAILABLE_TITLE = "Storage is unavailable";
export const STORAGE_UNAVAILABLE_MESSAGE =
  "Swarm Architecturer can't store data in this browser (storage is blocked or unavailable). Check privacy settings or try another browser.";
export const OPEN_FAILED_MESSAGE = "That architecture could not be opened.";

export interface AppProps {
  services?: AppServices;
  modules?: EditorModules;
}

type RepositoryState =
  | { status: "loading" }
  | { status: "ready"; repository: Repository }
  | { status: "unavailable" };

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

function AppRoutes({ services, modules }: Required<AppProps>) {
  const route = useRoute();
  const { showToast } = useToast();
  const [state, setState] = useState<RepositoryState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    services
      .openRepository()
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
  }, [services]);

  const openArchitecture = useCallback((id: string) => navigate(editorHref(id)), []);
  const openLibrary = useCallback(() => navigate(LIBRARY_HREF), []);
  const openFailed = useCallback(() => {
    navigate(LIBRARY_HREF, { replace: true });
    showToast(OPEN_FAILED_MESSAGE);
  }, [showToast]);

  if (state.status === "unavailable") return <StorageUnavailable />;
  if (state.status === "loading") return null;

  if (route.name === "editor") {
    return (
      <EditorScreen
        key={route.id}
        id={route.id}
        repository={state.repository}
        services={services}
        modules={modules}
        onOpenFailed={openFailed}
        onLeave={openLibrary}
        onOpenArchitecture={openArchitecture}
      />
    );
  }

  return (
    <LibraryScreen
      repository={state.repository}
      services={services}
      editorHref={editorHref}
      onOpen={openArchitecture}
    />
  );
}

export default function App({ services = defaultServices, modules = defaultModules }: AppProps) {
  return (
    <ToastProvider>
      <AppRoutes services={services} modules={modules} />
      <LiveRegion />
    </ToastProvider>
  );
}
