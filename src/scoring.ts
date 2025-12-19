// src/scoring.ts
export type ScoreInput = {
  rating?: number | null;
  user_ratings_total?: number | null;
  website?: string | null;
  phone?: string | null;
  business_status?: string | null; // OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY (when available)
};

export type ScoreOutput = {
  score: number; // 0..100
  reasons: string[];
  signals: Record<string, number>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function builderPenalty(website: string) {
  const w = website.toLowerCase();
  if (
    w.includes("wixsite") ||
    w.includes("wix.com") ||
    w.includes("square.site") ||
    w.includes("squarespace") ||
    w.includes("weebly") ||
    w.includes("godaddysites") ||
    w.includes("webflow")
  ) return 8;
  return 0;
}

export function computeAutomationNeedScoreDetailed(input: ScoreInput): ScoreOutput {
  const reasons: string[] = [];
  const signals: Record<string, number> = {};

  const rating = input.rating ?? 0;
  const reviews = input.user_ratings_total ?? 0;
  const website = (input.website ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const status = (input.business_status ?? "").trim();

  // Hard filters / strong negatives
  if (status.toUpperCase().includes("CLOSED_PERMANENTLY")) {
    return {
      score: 0,
      reasons: ["Permanently closed (skip)"],
      signals: { closed: 100 },
    };
  }

  let score = 0;

  // 1) Website signal (biggest)
  if (!website) {
    signals.no_website = 25;
    reasons.push("No website (big automation + marketing gap)");
    score += 25;
  } else {
    const bp = builderPenalty(website);
    if (bp > 0) {
      signals.site_builder = bp;
      reasons.push("Website looks like a site-builder (upgrade opportunity)");
      score += bp;
    } else {
      // Even if they have a good website, note it for context
      signals.has_website = 0;
    }
  }

  // 2) Reviews volume (marketing footprint)
  // fewer reviews -> larger opportunity, but don't overweight tiny numbers too hard
  let reviewPoints = 0;
  if (reviews <= 5) {
    reviewPoints = 18;
    reasons.push("Very low review volume (weak online footprint)");
  } else if (reviews <= 20) {
    reviewPoints = 14;
    reasons.push("Low review volume (weak online footprint)");
  } else if (reviews <= 60) {
    reviewPoints = 10;
    reasons.push("Moderate review volume (growth opportunity)");
  } else if (reviews <= 150) {
    reviewPoints = 6;
    reasons.push("Decent review volume (established presence)");
  } else {
    reviewPoints = 2;
    reasons.push("High review volume (strong presence)");
  }

  signals.low_reviews = reviewPoints;
  score += reviewPoints;

  // 3) Rating penalty (ops / CX)
  // Best leads are often 3.6–4.3 range: enough demand, but clear improvement needed
  let ratingPoints = 0;
  if (rating > 0) {
    if (rating < 3.6) {
      ratingPoints = 18;
      reasons.push("Poor rating (major ops / CX gap)");
    } else if (rating < 4.0) {
      ratingPoints = 14;
      reasons.push("Below average rating (ops / CX improvement needed)");
    } else if (rating < 4.3) {
      ratingPoints = 9;
      reasons.push("Mediocre rating (ops / CX gap)");
    } else if (rating < 4.6) {
      ratingPoints = 4;
      reasons.push("Good rating (minor improvement opportunities)");
    } else {
      ratingPoints = 1;
      reasons.push("Excellent rating (well-established business)");
    }
  } else {
    // no rating data can mean low activity
    ratingPoints = 6;
    reasons.push("No rating data (possible low activity / incomplete profile)");
  }
  signals.rating_gap = ratingPoints;
  score += ratingPoints;

  // 4) Missing phone (conversion readiness)
  if (!phone) {
    signals.no_phone = 8;
    reasons.push("No phone listed (conversion friction)");
    score += 8;
  } else {
    signals.phone_present = 0;
    // Don't add a reason for having a phone - that's expected
  }

  // 5) Small "recent readiness" bump for operational businesses
  if (status.toUpperCase().includes("OPERATIONAL")) {
    signals.operational = -2; // slight discount (they're healthy enough to operate)
    score -= 2;
    // Only add this as a reason if score is still high after discount
    if (score > 20) {
      reasons.push("Currently operational (active business)");
    }
  }

  // Normalize
  score = clamp(Math.round(score), 0, 100);

  // Deduplicate reasons (shouldn't happen now, but safety check)
  const dedupReasons = Array.from(new Set(reasons));

  // Ensure we always have at least one reason if score > 0
  if (score > 0 && dedupReasons.length === 0) {
    dedupReasons.push("Automation opportunity detected");
  }

  return { score, reasons: dedupReasons, signals };
}

// Backward compatible: keep your old function name returning a number
export function computeAutomationNeedScore(input: ScoreInput): number {
  return computeAutomationNeedScoreDetailed(input).score;
}