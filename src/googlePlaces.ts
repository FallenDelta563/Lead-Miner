// src/googlePlaces-free-enrichment.ts
import { CONFIG } from "./config";
import { computeAutomationNeedScoreDetailed } from "./scoring";
import { upsertProspect } from "./supabase";
import { quickVerifyWebsite } from "./websiteVerification";
import { discoverEmails, getBestEmail, getEmailsByConfidence } from "./emailDiscovery";
import { verifySocialProfiles } from "./socialVerifier";
import { extractWebsiteIntelligence } from "./websiteIntelligence";

export type PlaceResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  geometry?: { location: { lat: number; lng: number } };
  website?: string;
  formatted_phone_number?: string;
  types?: string[];
  business_status?: string;
};

export type SearchConfig = {
  query: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  city: string;
  category: string;

  runId: string;
  minScore?: number;
  pages?: number;
  
  // Enrichment options
  enrichEmails?: boolean; // Discover & validate emails
  enrichSocial?: boolean; // Verify social profiles (LinkedIn, Facebook, etc)
  enrichIntelligence?: boolean; // Extract tech stack, employee count, etc
  skipSuspicious?: boolean; // Skip spam websites
};

async function googleTextSearchPage(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  pagetoken?: string
): Promise<{ results: any[]; next_page_token?: string }> {
  const params = new URLSearchParams({
    key: CONFIG.GOOGLE_PLACES_API_KEY,
    query,
    location: `${lat},${lng}`,
    radius: radiusMeters.toString(),
  });

  if (pagetoken) params.set("pagetoken", pagetoken);

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Google Places error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (
    json.status !== "OK" &&
    json.status !== "ZERO_RESULTS" &&
    json.status !== "OVER_QUERY_LIMIT"
  ) {
    console.warn("Google Places non-OK status:", json.status, json.error_message);
  }

  return {
    results: json.results || [],
    next_page_token: json.next_page_token,
  };
}

async function googlePlaceDetails(placeId: string): Promise<Partial<PlaceResult>> {
  const fields = ["formatted_phone_number", "website", "business_status", "types"].join(",");

  const params = new URLSearchParams({
    key: CONFIG.GOOGLE_PLACES_API_KEY,
    place_id: placeId,
    fields,
  });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Google Place Details error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.status !== "OK") {
    console.warn("Place details status:", json.status, json.error_message);
    return {};
  }

  return json.result || {};
}

export async function runPlacesSearch(config: SearchConfig) {
  console.log(`\n🔎 [${config.runId}] Starting search for "${config.query}" around ${config.city}...`);
  console.log(`⚙️  Enrichment settings:`);
  console.log(`   Emails: ${config.enrichEmails ? "✅" : "❌"}`);
  console.log(`   Social: ${config.enrichSocial ? "✅" : "❌"}`);
  console.log(`   Intelligence: ${config.enrichIntelligence ? "✅" : "❌"}`);
  console.log(`   Skip Suspicious: ${config.skipSuspicious ? "✅" : "❌"}`);
  console.log(``);

  let nextToken: string | undefined;
  let totalSeen = 0;
  let totalInserted = 0;
  let totalSkippedSpam = 0;
  let totalSkippedScore = 0;

  const maxPages = config.pages ?? 3;

  for (let page = 0; page < maxPages; page++) {
    console.log(`\n📄 [${config.runId}] Fetching page ${page + 1}/${maxPages}...`);
    
    const { results, next_page_token } = await googleTextSearchPage(
      config.query,
      config.lat,
      config.lng,
      config.radiusMeters,
      nextToken
    );

    if (!results.length) {
      console.log(`   No results on page ${page + 1}`);
      break;
    }

    console.log(`   Found ${results.length} businesses\n`);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      totalSeen++;

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📍 [${totalSeen}] ${r.name}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const base: PlaceResult = {
        place_id: r.place_id,
        name: r.name,
        formatted_address: r.formatted_address,
        rating: r.rating,
        user_ratings_total: r.user_ratings_total,
        geometry: r.geometry,
        types: r.types,
        business_status: r.business_status,
      };

      // Get place details
      let details: Partial<PlaceResult> = {};
      try {
        details = await googlePlaceDetails(r.place_id);
      } catch (err) {
        console.warn("⚠️  Failed to get details:", (err as Error).message);
      }

      const merged: PlaceResult = { ...base, ...details };

      // === WEBSITE VERIFICATION ===
      let websiteVerification = null;
      if (merged.website) {
        websiteVerification = quickVerifyWebsite(merged.website);
        
        console.log(`🔍 Website: ${merged.website}`);
        console.log(`   Trust Score: ${websiteVerification.trustScore}/100`);
        if (websiteVerification.flags.length > 0) {
          console.log(`   ⚠️  Flags: ${websiteVerification.flags.join(", ")}`);
        }

        // Skip if spam
        if (config.skipSuspicious && websiteVerification.isLikelySpam) {
          console.log(`🚫 SKIPPED - Spam website detected`);
          totalSkippedSpam++;
          continue;
        }
      } else {
        console.log(`🔍 Website: None`);
      }

      // === EMAIL DISCOVERY ===
      let emailDiscovery = null;
      let bestEmail = null;
      let highConfidenceEmails: string[] = [];

      if (config.enrichEmails && merged.website && websiteVerification?.isValid) {
        console.log(`\n📧 Discovering emails...`);
        try {
          emailDiscovery = await discoverEmails(merged.name, merged.website);
          bestEmail = getBestEmail(emailDiscovery);
          highConfidenceEmails = getEmailsByConfidence(emailDiscovery, 60);

          if (bestEmail) {
            console.log(`   ✅ Best: ${bestEmail} (${emailDiscovery.confidence[bestEmail]}/100)`);
          }
          if (highConfidenceEmails.length > 1) {
            console.log(`   📋 Also found: ${highConfidenceEmails.slice(1, 3).join(", ")}`);
          }
          if (emailDiscovery.emails.length === 0) {
            console.log(`   ❌ No emails found`);
          }
        } catch (err) {
          console.warn(`   ⚠️  Email discovery failed:`, (err as Error).message);
        }
      }

      // === SOCIAL VERIFICATION ===
      let socialVerification = null;
      if (config.enrichSocial) {
        console.log(`\n🔍 Verifying social profiles...`);
        try {
          socialVerification = await verifySocialProfiles(merged.name, merged.website ?? null);
          
          if (socialVerification.summary.totalFound > 0) {
            console.log(`   ✅ Found ${socialVerification.summary.totalFound} profiles:`);
            socialVerification.profiles.forEach((profile) => {
              const metrics = profile.metrics?.followers
                ? ` (${profile.metrics.followers.toLocaleString()} followers)`
                : "";
              console.log(`      • ${profile.platform}: ${profile.url}${metrics}`);
            });
          } else {
            console.log(`   ❌ No verified profiles found`);
          }
        } catch (err) {
          console.warn(`   ⚠️  Social verification failed:`, (err as Error).message);
        }
      }

      // === WEBSITE INTELLIGENCE ===
      let intelligence = null;
      if (config.enrichIntelligence && merged.website && websiteVerification?.isValid) {
        console.log(`\n🧠 Extracting website intelligence...`);
        try {
          intelligence = await extractWebsiteIntelligence(merged.website);
          
          if (intelligence.technology.cms) {
            console.log(`   💻 CMS: ${intelligence.technology.cms}`);
          }
          if (intelligence.contactMethods.hasBookingSystem) {
            console.log(`   📅 Booking: ${intelligence.technology.bookingSystems?.join(", ")}`);
          }
          if (intelligence.businessIntel.employeeCount) {
            console.log(`   👥 Employees: ~${intelligence.businessIntel.employeeCount}`);
          }
          if (intelligence.businessIntel.foundedYear) {
            console.log(`   📆 Founded: ${intelligence.businessIntel.foundedYear}`);
          }
          if (intelligence.dataQuality.completeness) {
            console.log(`   📊 Data Quality: ${intelligence.dataQuality.completeness}/100`);
          }
        } catch (err) {
          console.warn(`   ⚠️  Intelligence extraction failed:`, (err as Error).message);
        }
      }

      // === SCORING ===
      const scored = computeAutomationNeedScoreDetailed({
        rating: merged.rating ?? null,
        user_ratings_total: merged.user_ratings_total ?? null,
        website: merged.website ?? null,
        phone: merged.formatted_phone_number ?? null,
        business_status: merged.business_status ?? null,
      });

      console.log(`\n📊 Automation Score: ${scored.score}/100`);
      console.log(`   Reasons:`);
      scored.reasons.forEach((reason) => console.log(`      • ${reason}`));

      // Filter by score
      if (typeof config.minScore === "number" && scored.score < config.minScore) {
        console.log(`\n⏭️  SKIPPED - Score ${scored.score} below minimum ${config.minScore}`);
        totalSkippedScore++;
        continue;
      }

      const discoveredAt = new Date().toISOString();

      // === SAVE TO DATABASE ===
      await upsertProspect({
        place_id: merged.place_id,
        name: merged.name,
        address: merged.formatted_address ?? null,
        phone: merged.formatted_phone_number ?? null,
        website: merged.website ?? null,
        rating: merged.rating ?? null,
        user_ratings_count: merged.user_ratings_total ?? null,
        lat: merged.geometry?.location.lat ?? null,
        lng: merged.geometry?.location.lng ?? null,
        category: config.category,
        city: config.city,

        // Score
        automation_need_score: scored.score,
        score_reasons: scored.reasons && scored.reasons.length > 0 ? scored.reasons : null,
        score_signals: scored.signals ?? null,

        // Website verification
        website_verified: websiteVerification?.isValid ?? null,
        website_trust_score: websiteVerification?.trustScore ?? null,
        website_flags: websiteVerification?.flags ?? null,

        // Emails
        emails: highConfidenceEmails.length > 0 ? highConfidenceEmails : null,
        primary_email: bestEmail,

        // Social profiles
        linkedin_url: socialVerification?.profiles.find((p) => p.platform === "linkedin")?.url ?? null,
        facebook_url: socialVerification?.profiles.find((p) => p.platform === "facebook")?.url ?? null,
        instagram_url: socialVerification?.profiles.find((p) => p.platform === "instagram")?.url ?? null,
        twitter_url: socialVerification?.profiles.find((p) => p.platform === "twitter")?.url ?? null,

        // Website intelligence
        cms: intelligence?.technology.cms ?? null,
        has_booking_system: intelligence?.contactMethods.hasBookingSystem ?? null,
        has_live_chat: intelligence?.contactMethods.hasLiveChat ?? null,
        employee_count: intelligence?.businessIntel.employeeCount ?? null,
        founded_year: intelligence?.businessIntel.foundedYear ?? null,

        // Discovery metadata
        run_id: config.runId,
        search_query: config.query,
        search_city: config.city,
        search_category: config.category,
        search_lat: config.lat,
        search_lng: config.lng,
        search_radius_m: config.radiusMeters,
        page_index: page,
        result_rank: i + 1,
        discovered_at: discoveredAt,

        raw_json: {
          ...merged,
          _score: scored,
          _verification: websiteVerification,
          _emails: emailDiscovery,
          _social: socialVerification,
          _intelligence: intelligence,
          _discovery: {
            runId: config.runId,
            query: config.query,
            city: config.city,
            category: config.category,
            lat: config.lat,
            lng: config.lng,
            radiusMeters: config.radiusMeters,
            page,
            rank: i + 1,
            discoveredAt,
          },
        },
      });

      totalInserted++;
      console.log(`\n✅ SAVED to database`);
    }

    if (!next_page_token) break;
    nextToken = next_page_token;

    // Google requires delay before using next_page_token
    await new Promise((res) => setTimeout(res, 2500));
  }

  // === FINAL SUMMARY ===
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 [${config.runId}] SEARCH COMPLETE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total seen:       ${totalSeen}`);
  console.log(`✅ Saved:          ${totalInserted}`);
  console.log(`🚫 Skipped (spam): ${totalSkippedSpam}`);
  console.log(`⏭️  Skipped (score): ${totalSkippedScore}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}