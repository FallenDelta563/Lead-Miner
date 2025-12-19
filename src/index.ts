// src/index.ts
import "dotenv/config";
import crypto from "crypto";
import { runPlacesSearch } from "./googlePlaces";

type CliArgs = {
  query: string;
  city: string;
  lat: number;
  lng: number;
  radius: number;
  category: string;

  runId: string;
  minScore?: number;
  pages?: number;
  
  // FREE enrichment options
  enrichEmails?: boolean;
  enrichSocial?: boolean;
  enrichIntelligence?: boolean;
  skipSuspicious?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: any = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    
    // Handle boolean flags
    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
      continue;
    }
    
    args[key] = value;
    i++;
  }

  if (!args.query) throw new Error('Missing --query (e.g. "roofing contractor")');
  if (!args.city) throw new Error('Missing --city (e.g. "Miami, FL")');
  if (!args.lat) throw new Error("Missing --lat (city center latitude)");
  if (!args.lng) throw new Error("Missing --lng (city center longitude)");

  const runId =
    String(args.runId || "").trim() ||
    `run_${new Date().toISOString().slice(0, 10)}_${crypto.randomBytes(3).toString("hex")}`;

  return {
    query: String(args.query),
    city: String(args.city),
    lat: Number(args.lat),
    lng: Number(args.lng),
    radius: Number(args.radius ?? 30000),
    category: String(args.category ?? args.query),

    runId,
    minScore: args.minScore ? Number(args.minScore) : undefined,
    pages: args.pages ? Number(args.pages) : 3,
    
    // FREE enrichment
    enrichEmails: args.enrichEmails === true || args.enrichEmails === "true",
    enrichSocial: args.enrichSocial === true || args.enrichSocial === "true",
    enrichIntelligence: args.enrichIntelligence === true || args.enrichIntelligence === "true",
    skipSuspicious: args.skipSuspicious === true || args.skipSuspicious === "true",
  };
}

(async () => {
  try {
    const args = parseArgs(process.argv);

    console.log("\n🚀 FREE PROSPECT SCRAPER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Query:           "${args.query}"`);
    console.log(`City:            ${args.city}`);
    console.log(`Radius:          ${args.radius}m`);
    console.log(`Pages:           ${args.pages}`);
    console.log(`Min Score:       ${args.minScore ?? "none (save all)"}`);
    console.log(``);
    console.log(`FREE ENRICHMENT:`);
    console.log(`  📧 Emails:      ${args.enrichEmails ? "✅ Enabled" : "❌ Disabled"}`);
    console.log(`  🔗 Social:      ${args.enrichSocial ? "✅ Enabled" : "❌ Disabled"}`);
    console.log(`  🧠 Intel:       ${args.enrichIntelligence ? "✅ Enabled" : "❌ Disabled"}`);
    console.log(`  🚫 Skip Spam:   ${args.skipSuspicious ? "✅ Enabled" : "❌ Disabled"}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const startTime = Date.now();

    await runPlacesSearch({
      query: args.query,
      city: args.city,
      lat: args.lat,
      lng: args.lng,
      radiusMeters: args.radius,
      category: args.category,

      runId: args.runId,
      minScore: args.minScore,
      pages: args.pages,
      
      enrichEmails: args.enrichEmails,
      enrichSocial: args.enrichSocial,
      enrichIntelligence: args.enrichIntelligence,
      skipSuspicious: args.skipSuspicious,
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n⏱️  Total time: ${elapsed}s`);
    console.log("\n✅ Complete!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message);
    console.log("\n📖 USAGE:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("FAST - Basic search only:");
    console.log(
      '  npx ts-node src/index.ts --query "roofing contractor" --city "Miami, FL" --lat 25.7617 --lng -80.1918\n'
    );
    console.log("MEDIUM - With email discovery:");
    console.log(
      '  npx ts-node src/index.ts --query "roofing contractor" --city "Miami, FL" --lat 25.7617 --lng -80.1918 --enrichEmails --skipSuspicious\n'
    );
    console.log("FULL - Complete FREE enrichment:");
    console.log(
      '  npx ts-node src/index.ts --query "roofing contractor" --city "Miami, FL" --lat 25.7617 --lng -80.1918 --enrichEmails --enrichSocial --enrichIntelligence --skipSuspicious --minScore 35\n'
    );
    console.log("OPTIONS:");
    console.log("  --query              Search query (required)");
    console.log("  --city               City name (required)");
    console.log("  --lat                Latitude (required)");
    console.log("  --lng                Longitude (required)");
    console.log("  --radius             Search radius in meters (default: 30000)");
    console.log("  --category           Business category (default: same as query)");
    console.log("  --pages              Number of pages (default: 3, max: 3)");
    console.log("  --minScore           Minimum score to save (default: none)");
    console.log(``);
    console.log("  --enrichEmails       Discover & validate emails");
    console.log("  --enrichSocial       Verify LinkedIn, Facebook, Instagram");
    console.log("  --enrichIntelligence Extract tech stack, employees, etc");
    console.log("  --skipSuspicious     Skip businesses with spam websites");
    process.exit(1);
  }
})();