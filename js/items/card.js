import { registerItemType } from "./registry.js";

function fill(el, def) {
  el.querySelector(".card-title").textContent = def.title || "";
  el.querySelector(".card-body").textContent = def.body || "";
}

registerItemType("card", {
  defaultPos: { x: 0.5, y: 0.4 },
  build(def) {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = '<div class="card-title"></div><div class="card-body"></div>';
    fill(el, def);
    return { el };
  },
  init(item, def) { item.body = def.body || ""; },
  sync(ri, def) { fill(ri.el, def); },
  onTap(item) { item.el.classList.toggle("expanded"); },
});
