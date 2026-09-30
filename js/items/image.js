import { registerItemType } from "./registry.js";
import { isFx } from "../core/util.js";

registerItemType("img", {
  defaultPos: { x: 0.5, y: 0.6 },
  build(def) {
    const isVideo = /\.(webm|mp4)(\?|$)/i.test(def.src || "");
    const el = document.createElement(isVideo ? "video" : "img");
    if (isVideo) { el.muted = true; el.loop = true; el.playsInline = true; el.autoplay = true; }
    el.src = "/media/" + (def.src || "");
    el.className = "propimg " + (isFx(def.src) ? "fx" : "framed");
    return { el, src: def.src };
  },
  init(item, def) { item.src = def.src || ""; },
  sync(ri, def) {
    if (ri.view.src !== def.src) { ri.el.src = "/media/" + def.src; ri.view.src = def.src; }
  },
});
