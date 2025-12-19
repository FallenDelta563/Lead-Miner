// src/socialVerifier.ts

export type VerifiedSocialProfile = {
  url: string;
  platform: "linkedin" | "facebook" | "instagram" | "twitter" | "yelp" | "bbb";
  exists: boolean;
  confidence: number; // 0-100
  metrics?: {
    followers?: number;
    posts?: number;
    rating?: number;
    lastActive?: string;
  };
};

export type SocialVerificationResult = {
  profiles: VerifiedSocialProfile[];
  summary: {
    totalFound: number;
    platforms: string[];
    bestProfile: string | null;
  };
};

/**
 * Generate possible LinkedIn URLs for a business
 */
function generateLinkedInUrls(businessName: string): string[] {
  const urls: string[] = [];
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  // Pattern 1: Full name with hyphens
  const slug1 = cleanName.replace(/\s+/g, "-");
  urls.push(`https://www.linkedin.com/company/${slug1}`);

  // Pattern 2: First word only
  const firstWord = cleanName.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    urls.push(`https://www.linkedin.com/company/${firstWord}`);
  }

  // Pattern 3: No spaces
  const slug3 = cleanName.replace(/\s+/g, "");
  urls.push(`https://www.linkedin.com/company/${slug3}`);

  // Pattern 4: Common suffixes removed
  const withoutSuffixes = cleanName
    .replace(/\s+(llc|inc|corp|ltd|limited|company|co|group)\s*$/i, "")
    .replace(/\s+/g, "-");
  urls.push(`https://www.linkedin.com/company/${withoutSuffixes}`);

  return Array.from(new Set(urls));
}

/**
 * Generate possible Facebook URLs
 */
function generateFacebookUrls(businessName: string): string[] {
  const urls: string[] = [];
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  // Pattern 1: No spaces
  const slug1 = cleanName.replace(/\s+/g, "");
  urls.push(`https://www.facebook.com/${slug1}`);

  // Pattern 2: With periods
  const slug2 = cleanName.replace(/\s+/g, ".");
  urls.push(`https://www.facebook.com/${slug2}`);

  // Pattern 3: First word
  const firstWord = cleanName.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    urls.push(`https://www.facebook.com/${firstWord}`);
  }

  return Array.from(new Set(urls));
}

/**
 * Generate possible Instagram URLs
 */
function generateInstagramUrls(businessName: string): string[] {
  const urls: string[] = [];
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  // Pattern 1: No spaces, underscores
  const slug1 = cleanName.replace(/\s+/g, "_");
  urls.push(`https://www.instagram.com/${slug1}/`);

  // Pattern 2: No spaces, no separators
  const slug2 = cleanName.replace(/\s+/g, "");
  urls.push(`https://www.instagram.com/${slug2}/`);

  // Pattern 3: First word
  const firstWord = cleanName.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    urls.push(`https://www.instagram.com/${firstWord}/`);
  }

  return Array.from(new Set(urls));
}

/**
 * Check if a URL exists and is valid
 */
async function checkUrlExists(
  url: string,
  timeout: number = 8000
): Promise<{ exists: boolean; statusCode?: number; redirectUrl?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeoutId);

    return {
      exists: response.ok,
      statusCode: response.status,
      redirectUrl: response.url !== url ? response.url : undefined,
    };
  } catch (err) {
    return { exists: false };
  }
}

/**
 * Scrape basic metrics from a LinkedIn company page
 */
async function scrapeLinkedInMetrics(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Try to extract follower count (this is fragile and may break)
    const followerMatch = html.match(/(\d+[\d,]*)\s+followers?/i);
    const followers = followerMatch ? parseInt(followerMatch[1].replace(/,/g, "")) : undefined;

    return { followers };
  } catch {
    return null;
  }
}

/**
 * Scrape basic metrics from Facebook page
 */
async function scrapeFacebookMetrics(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Try to extract follower/like count
    const followerMatch = html.match(/(\d+[\d,KkMm]*)\s+(?:followers?|likes?)/i);
    
    let followers: number | undefined;
    if (followerMatch) {
      const value = followerMatch[1].toLowerCase();
      if (value.includes("k")) {
        followers = Math.round(parseFloat(value) * 1000);
      } else if (value.includes("m")) {
        followers = Math.round(parseFloat(value) * 1000000);
      } else {
        followers = parseInt(value.replace(/,/g, ""));
      }
    }

    return { followers };
  } catch {
    return null;
  }
}

/**
 * Verify LinkedIn profile
 */
async function verifyLinkedIn(businessName: string): Promise<VerifiedSocialProfile | null> {
  const urls = generateLinkedInUrls(businessName);

  for (const url of urls) {
    console.log(`  🔍 Checking LinkedIn: ${url}`);
    const check = await checkUrlExists(url);

    if (check.exists) {
      console.log(`  ✅ Found LinkedIn: ${url}`);
      
      // Try to scrape metrics
      const metrics = await scrapeLinkedInMetrics(url);

      return {
        url,
        platform: "linkedin",
        exists: true,
        confidence: 85,
        metrics,
      };
    }

    // Small delay to avoid rate limiting
    await new Promise((res) => setTimeout(res, 500));
  }

  return null;
}

/**
 * Verify Facebook profile
 */
async function verifyFacebook(businessName: string): Promise<VerifiedSocialProfile | null> {
  const urls = generateFacebookUrls(businessName);

  for (const url of urls) {
    console.log(`  🔍 Checking Facebook: ${url}`);
    const check = await checkUrlExists(url);

    if (check.exists) {
      console.log(`  ✅ Found Facebook: ${url}`);
      
      const metrics = await scrapeFacebookMetrics(url);

      return {
        url,
        platform: "facebook",
        exists: true,
        confidence: 80,
        metrics,
      };
    }

    await new Promise((res) => setTimeout(res, 500));
  }

  return null;
}

/**
 * Verify Instagram profile
 */
async function verifyInstagram(businessName: string): Promise<VerifiedSocialProfile | null> {
  const urls = generateInstagramUrls(businessName);

  for (const url of urls) {
    console.log(`  🔍 Checking Instagram: ${url}`);
    const check = await checkUrlExists(url);

    if (check.exists) {
      console.log(`  ✅ Found Instagram: ${url}`);

      return {
        url,
        platform: "instagram",
        exists: true,
        confidence: 75,
      };
    }

    await new Promise((res) => setTimeout(res, 500));
  }

  return null;
}

/**
 * Extract social links from website
 */
async function extractSocialsFromWebsite(website: string): Promise<VerifiedSocialProfile[]> {
  const profiles: VerifiedSocialProfile[] = [];

  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SocialFinder/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return profiles;

    const html = await response.text();

    // Extract LinkedIn
    const linkedinMatch = html.match(
      /(?:href=["']|url\(["']?)(https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9_-]+)/i
    );
    if (linkedinMatch) {
      profiles.push({
        url: linkedinMatch[1],
        platform: "linkedin",
        exists: true,
        confidence: 95, // Found on their website = high confidence
      });
    }

    // Extract Facebook
    const facebookMatch = html.match(
      /(?:href=["']|url\(["']?)(https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.]+)/i
    );
    if (facebookMatch) {
      profiles.push({
        url: facebookMatch[1],
        platform: "facebook",
        exists: true,
        confidence: 95,
      });
    }

    // Extract Instagram
    const instagramMatch = html.match(
      /(?:href=["']|url\(["']?)(https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+)/i
    );
    if (instagramMatch) {
      profiles.push({
        url: instagramMatch[1],
        platform: "instagram",
        exists: true,
        confidence: 95,
      });
    }

    // Extract Twitter
    const twitterMatch = html.match(
      /(?:href=["']|url\(["']?)(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+)/i
    );
    if (twitterMatch) {
      profiles.push({
        url: twitterMatch[1],
        platform: "twitter",
        exists: true,
        confidence: 95,
      });
    }
  } catch (err) {
    console.warn("  ⚠️ Website scraping error:", (err as Error).message);
  }

  return profiles;
}

/**
 * Verify all social profiles for a business
 */
export async function verifySocialProfiles(
  businessName: string,
  website: string | null
): Promise<SocialVerificationResult> {
  const profiles: VerifiedSocialProfile[] = [];

  console.log(`🔍 Verifying social profiles for: ${businessName}`);

  // Step 1: Extract from website if available (highest confidence)
  if (website) {
    console.log(`  📄 Checking website for social links...`);
    const websiteProfiles = await extractSocialsFromWebsite(website);
    profiles.push(...websiteProfiles);

    if (websiteProfiles.length > 0) {
      console.log(`  ✅ Found ${websiteProfiles.length} profiles on website`);
    }
  }

  // Step 2: Verify LinkedIn (if not found on website)
  if (!profiles.find((p) => p.platform === "linkedin")) {
    const linkedin = await verifyLinkedIn(businessName);
    if (linkedin) profiles.push(linkedin);
  }

  // Step 3: Verify Facebook (if not found on website)
  if (!profiles.find((p) => p.platform === "facebook")) {
    const facebook = await verifyFacebook(businessName);
    if (facebook) profiles.push(facebook);
  }

  // Step 4: Verify Instagram (if not found on website)
  if (!profiles.find((p) => p.platform === "instagram")) {
    const instagram = await verifyInstagram(businessName);
    if (instagram) profiles.push(instagram);
  }

  // Sort by confidence
  profiles.sort((a, b) => b.confidence - a.confidence);

  return {
    profiles,
    summary: {
      totalFound: profiles.length,
      platforms: profiles.map((p) => p.platform),
      bestProfile: profiles.length > 0 ? profiles[0].url : null,
    },
  };
}