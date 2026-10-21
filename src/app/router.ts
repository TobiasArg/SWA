import { useEffect, useState } from "react";

/** Hash router (TD 11.1): `#/` → library, `#/a/<id>` → editor, anything else → library. */
export type Route = { name: "library" } | { name: "editor"; id: string };

const EDITOR_PREFIX = "#/a/";

export function parseHash(hash: string): Route {
  if (hash.startsWith(EDITOR_PREFIX)) {
    const encoded = hash.slice(EDITOR_PREFIX.length);
    if (encoded && !encoded.includes("/")) {
      try {
        return { name: "editor", id: decodeURIComponent(encoded) };
      } catch {
        return { name: "library" };
      }
    }
  }
  return { name: "library" };
}

export function editorHref(id: string): string {
  return `${EDITOR_PREFIX}${encodeURIComponent(id)}`;
}

export const LIBRARY_HREF = "#/";

export function navigate(href: string, options: { replace?: boolean } = {}): void {
  if (window.location.hash === href) return;
  if (options.replace) {
    window.history.replaceState(null, "", href);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = href;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHash(window.location.hash);
      setRoute((current) =>
        current.name === next.name && (next.name === "library" || (current.name === "editor" && current.id === next.id))
          ? current
          : next,
      );
    };
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
