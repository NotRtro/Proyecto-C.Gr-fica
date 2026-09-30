// Entrada unica. stage.html carga este modulo; segun ?role= arranca el tracker
// (operador, con camara) o la render page (OBS, sin camara).
import { ROLE } from "./core/env.js";
import "./items/index.js";
import { bootTracker } from "./stage/tracker.js";
import { bootRender } from "./stage/render.js";

if (ROLE === "render") bootRender();
else bootTracker();
