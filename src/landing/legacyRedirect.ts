// Old bookmarks like `/#/a/<id>` pointed at the editor when it lived at the site root.
// Keep this file import-free so the landing entry never pulls in React or app code.
if (window.location.hash.startsWith("#/")) {
  window.location.replace("/app/" + window.location.hash);
}
