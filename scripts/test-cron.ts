import { runDailyCronTick } from "../src/lib/cronJobs";
import { zonedTimeToUtc } from "../src/lib/dates";

async function main() {
  console.log("=== Simulation : 16 septembre 2026, 09h05 (Genève) — rappel J-4 ===");
  console.log(await runDailyCronTick(zonedTimeToUtc(2026, 9, 16, 9, 5)));

  console.log("\n=== Simulation : 20 septembre 2026, 21h05 (Genève) — deadline ===");
  console.log(await runDailyCronTick(zonedTimeToUtc(2026, 9, 20, 21, 5)));

  console.log("\n=== Re-simulation même minute (doit être no-op, déjà verrouillé) ===");
  console.log(await runDailyCronTick(zonedTimeToUtc(2026, 9, 20, 21, 30)));
}

main().finally(() => process.exit(0));
