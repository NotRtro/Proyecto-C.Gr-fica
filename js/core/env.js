export const Q = new URLSearchParams(location.search);
export const ROLE = Q.get("role") || "stage";

export const HIDE_CURSORS = Q.get("cursors") === "0";
export const RFLIP = Q.get("mirror") !== "1";
