// src/supabase-free-enrichment.ts
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

// EMOR OS organization id
const EMOR_ORG_ID = "45a71a2c-aeea-448b-b8f6-544e25e015ab";

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

export type ProspectInsert = {
  place_id: string;
  name: string;

  // Basic info
  address?: string | null;
  phone?: string | null;
  website?: string | null;

  rating?: number | null;
  user_ratings_count?: number | null;

  lat?: number | null;
  lng?: number | null;

  category?: string | null;
  city?: string | null;

  // Scoring
  automation_need_score?: number | null;
  score_reasons?: string[] | null;
  score_signals?: Record<string, number> | any;

  // Website verification
  website_verified?: boolean | null;
  website_trust_score?: number | null;
  website_flags?: string[] | null;

  // Emails (FREE enrichment)
  primary_email?: string | null;
  emails?: string[] | null;

  // Social profiles (verified, FREE)
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;

  // Website intelligence (FREE)
  cms?: string | null;
  has_booking_system?: boolean | null;
  has_live_chat?: boolean | null;
  employee_count?: number | null;
  founded_year?: number | null;

  // Discovery metadata
  run_id?: string | null;
  search_query?: string | null;
  search_city?: string | null;
  search_category?: string | null;
  search_lat?: number | null;
  search_lng?: number | null;
  search_radius_m?: number | null;
  page_index?: number | null;
  result_rank?: number | null;
  discovered_at?: string | null;

  raw_json?: any;
};

export async function upsertProspect(data: ProspectInsert) {
  const payload = {
    ...data,
    organization_id: EMOR_ORG_ID,
  };

  const { error } = await supabase
    .from("prospects")
    .upsert(payload, { onConflict: "organization_id,place_id" });

  if (error) {
    console.error("❌ Supabase upsert error for", data.name, error.message);
  }
}