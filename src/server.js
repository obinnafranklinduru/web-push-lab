import app from "./app.js";
import { env, getProvidersStatus } from "./config/env.js";

app.listen(env.port, () => {
  console.log(`\nWeb Push Lab running at http://localhost:${env.port}`);
  console.log("Provider readiness:");

  const providers = getProvidersStatus();
  for (const [key, info] of Object.entries(providers)) {
    if (info.configured) {
      console.log(`  [READY]   ${key} (${info.name})`);
    } else {
      console.log(
        `  [MISSING] ${key} (${info.name}) -> missing: ${info.missing.join(", ")}`,
      );
    }
  }
  console.log("");
});
