import { build } from "vite";
import { PROJECT_TARGETS, createProjectConfig, resolveProjectTargets } from "../vite.shared.mjs";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const requestedTargets = args.filter((arg) => !arg.startsWith("--"));
const targets = resolveProjectTargets(requestedTargets);

if (targets.length === 0) {
  console.error(
    `No matching Vite build targets. Available targets: ${Object.keys(PROJECT_TARGETS).join(", ")}`
  );
  process.exit(1);
}

async function run() {
  const names = targets.join(", ");
  if (watch) {
    console.log(`Starting Vite watch mode for [${names}]...`);
  } else {
    console.log(`Building with Vite for [${names}]...`);
  }

  for (const targetName of targets) {
    await build(createProjectConfig(targetName, { watch }));
    console.log(`Built ${targetName}`);
  }
}

run().catch((error) => {
  console.error("Vite build failed:", error);
  process.exit(1);
});
