import { ROLE } from "./core/env.js";
import "./items/index.js";
import { bootTracker } from "./stage/tracker.js";
import { bootRender } from "./stage/render.js";

if (ROLE === "render") bootRender();
else bootTracker();
