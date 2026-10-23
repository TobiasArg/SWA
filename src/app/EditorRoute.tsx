import { lazy, useMemo } from "react";
import type { Repository } from "../persistence/types";
import type { AppServices, EditorModules } from "./services";

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

export interface EditorRouteProps {
  id: string;
  repository: Repository;
  libraryServices: LibraryServices;
  injectedServices?: AppServices;
  injectedModules?: EditorModules;
  onOpenFailed(): void;
  onLeave(): void;
  onOpenArchitecture(id: string): void;
}

const InjectedEditorScreen = lazy(async () => {
  const { EditorScreen } = await import("./EditorScreen");
  return {
    default: function InjectedEditor(props: EditorRouteProps) {
      return (
        <EditorScreen
          id={props.id}
          repository={props.repository}
          services={props.injectedServices!}
          modules={props.injectedModules!}
          onOpenFailed={props.onOpenFailed}
          onLeave={props.onLeave}
          onOpenArchitecture={props.onOpenArchitecture}
        />
      );
    },
  };
});

const DefaultEditorScreen = lazy(async () => {
  const [{ EditorScreen }, { defaultEditorServices, defaultModules }] = await Promise.all([
    import("./EditorScreen"),
    import("./defaultModules"),
  ]);
  return {
    default: function DefaultEditor(props: EditorRouteProps) {
      const { injectedServices, libraryServices } = props;
      // A new services object would make EditorScreen recreate its store and session.
      const services = useMemo(
        () => injectedServices ?? ({ ...libraryServices, ...defaultEditorServices } as AppServices),
        [injectedServices, libraryServices],
      );
      return (
        <EditorScreen
          id={props.id}
          repository={props.repository}
          services={services}
          modules={props.injectedModules ?? defaultModules}
          onOpenFailed={props.onOpenFailed}
          onLeave={props.onLeave}
          onOpenArchitecture={props.onOpenArchitecture}
        />
      );
    },
  };
});

export default function EditorRoute(props: EditorRouteProps) {
  const Screen = props.injectedServices && props.injectedModules ? InjectedEditorScreen : DefaultEditorScreen;
  return <Screen {...props} />;
}
