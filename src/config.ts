// src/config.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

export const CONFIG = {
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

const missing: string[] = [];
if (!CONFIG.GOOGLE_PLACES_API_KEY) missing.push("GOOGLE_PLACES_API_KEY");
if (!CONFIG.SUPABASE_URL) missing.push("SUPABASE_URL");
if (!CONFIG.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

if (missing.length) {
  console.error(`Missing env vars in .env.local: ${missing.join(", ")}`);
}
