export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
export function isFx(src) { return typeof src === "string" && src.includes("/fx/"); }
