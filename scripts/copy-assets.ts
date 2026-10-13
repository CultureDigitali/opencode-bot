import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
mkdirSync(join(root, "dist"), { recursive: true });
for (const file of ["dashboard.html", "dashboard.css", "dashboard.js"]) {
  copyFileSync(join(root, "src", file), join(root, "dist", file));
  console.log("Copied " + file);
}
