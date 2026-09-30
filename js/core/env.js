// Parametros de URL. Se leen una sola vez al cargar la pagina.
export const Q = new URLSearchParams(location.search);
export const ROLE = Q.get("role") || "stage";

// Solo render page (?role=render): &cursors=0 oculta cursores, &mirror=1 desactiva
// la ley de espejo (cuando la fuente de camara en OBS ya viene espejada).
export const HIDE_CURSORS = Q.get("cursors") === "0";
export const RFLIP = Q.get("mirror") !== "1";
