// src/websiteVerification.ts

export type WebsiteVerificationResult = {
  isValid: boolean;
  isLikelySpam: boolean;
  isSuspicious: boolean;
  flags: string[];
  trustScore: number; // 0-100, higher is better
  details: {
    hasValidSSL?: boolean;
    redirectCount?: number;
    finalUrl?: string;
    statusCode?: number;
    contentType?: string;
    hasPhishingIndicators?: boolean;
  };
};

const SPAM_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "short.link",
  "spam-domain.com",
  // Add more as you discover them
];

const SUSPICIOUS_KEYWORDS = [
  "casino",
  "viagra",
  "porn",
  "xxx",
  "loan",
  "crypto",
  "bitcoin",
  "pharma",
  "click here",
  "buy now",
  "limited time",
];

const PARKED_DOMAIN_INDICATORS = [
  "domain for sale",
  "this domain is parked",
  "buy this domain",
  "domain parking",
  "sedo.com",
  "afternic.com",
  "godaddy.com/domainsearch",
];

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObj.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSpamDomain(domain: string): boolean {
  return SPAM_DOMAINS.some((spam) => domain.includes(spam));
}

function hasSuspiciousKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SUSPICIOUS_KEYWORDS.some((kw) => lower.includes(kw));
}

function isParkedDomain(html: string): boolean {
  const lower = html.toLowerCase();
  return PARKED_DOMAIN_INDICATORS.some((indicator) => lower.includes(indicator));
}

/**
 * Verify a website URL for legitimacy
 * This does NOT fetch the URL - it analyzes the URL structure
 */
export function quickVerifyWebsite(url: string | null): WebsiteVerificationResult {
  const flags: string[] = [];
  let trustScore = 100;

  if (!url || url.trim() === "") {
    return {
      isValid: false,
      isLikelySpam: false,
      isSuspicious: false,
      flags: ["No website provided"],
      trustScore: 0,
      details: {},
    };
  }

  const cleanUrl = url.trim();
  const domain = extractDomain(cleanUrl);

  // Check for empty or invalid domain
  if (!domain) {
    flags.push("Invalid URL format");
    trustScore = 0;
    return {
      isValid: false,
      isLikelySpam: false,
      isSuspicious: true,
      flags,
      trustScore,
      details: {},
    };
  }

  // Check spam domains
  if (isSpamDomain(domain)) {
    flags.push("Known spam/redirect domain");
    trustScore -= 80;
  }

  // Check for suspicious TLDs
  const suspiciousTLDs = [".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".win"];
  if (suspiciousTLDs.some((tld) => domain.endsWith(tld))) {
    flags.push("Suspicious TLD");
    trustScore -= 30;
  }

  // Check for IP addresses instead of domains
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain)) {
    flags.push("IP address instead of domain");
    trustScore -= 50;
  }

  // Check for excessive subdomains (often used by spam)
  const subdomains = domain.split(".");
  if (subdomains.length > 4) {
    flags.push("Excessive subdomains");
    trustScore -= 20;
  }

  // Check URL for suspicious keywords
  if (hasSuspiciousKeywords(cleanUrl)) {
    flags.push("Contains suspicious keywords");
    trustScore -= 40;
  }

  // Check for very long URLs (often spam)
  if (cleanUrl.length > 200) {
    flags.push("Unusually long URL");
    trustScore -= 15;
  }

  // Normalize trust score
  trustScore = Math.max(0, Math.min(100, trustScore));

  const isValid = trustScore >= 50;
  const isLikelySpam = trustScore < 30;
  const isSuspicious = trustScore < 50;

  return {
    isValid,
    isLikelySpam,
    isSuspicious,
    flags,
    trustScore,
    details: {},
  };
}

/**
 * Deep verification - actually fetches the URL to check content
 * Use sparingly due to rate limits and performance
 */
export async function deepVerifyWebsite(
  url: string,
  timeout: number = 10000
): Promise<WebsiteVerificationResult> {
  const quickCheck = quickVerifyWebsite(url);
  
  // If quick check already failed badly, don't waste time on deep check
  if (quickCheck.isLikelySpam) {
    return quickCheck;
  }

  const flags = [...quickCheck.flags];
  let trustScore = quickCheck.trustScore;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      method: "HEAD", // Just get headers, not full content
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BusinessVerifier/1.0)",
      },
    });

    clearTimeout(timeoutId);

    const details = {
      hasValidSSL: response.url.startsWith("https://"),
      statusCode: response.status,
      contentType: response.headers.get("content-type") || undefined,
      finalUrl: response.url,
      redirectCount: 0, // Would need to track manually
    };

    // Check status code
    if (response.status === 404) {
      flags.push("Website not found (404)");
      trustScore -= 50;
    } else if (response.status >= 400) {
      flags.push(`HTTP error: ${response.status}`);
      trustScore -= 30;
    }

    // Check for SSL
    if (!details.hasValidSSL) {
      flags.push("No HTTPS/SSL");
      trustScore -= 20;
    }

    // Check if redirect is suspicious
    if (details.finalUrl !== url && !details.finalUrl.startsWith(url)) {
      flags.push("Suspicious redirect");
      trustScore -= 25;
    }

    // Normalize
    trustScore = Math.max(0, Math.min(100, trustScore));

    return {
      isValid: trustScore >= 50,
      isLikelySpam: trustScore < 30,
      isSuspicious: trustScore < 50,
      flags,
      trustScore,
      details,
    };
  } catch (err) {
    const error = err as Error;
    
    if (error.name === "AbortError") {
      flags.push("Request timeout");
      trustScore -= 20;
    } else {
      flags.push(`Fetch error: ${error.message}`);
      trustScore -= 15;
    }

    return {
      isValid: trustScore >= 50,
      isLikelySpam: false,
      isSuspicious: true,
      flags,
      trustScore,
      details: {},
    };
  }
}