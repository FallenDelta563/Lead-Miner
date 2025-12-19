// src/emailDiscovery.ts
import * as dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

export type EmailDiscoveryResult = {
  emails: string[];
  patterns: string[];
  confidence: Record<string, number>; // email -> confidence score 0-100
  validationResults: Record<string, "valid" | "invalid" | "unknown">;
  sources: Record<string, string>; // email -> source (scraped, pattern, etc)
};

/**
 * Common email patterns used by businesses
 */
const EMAIL_PATTERNS = [
  "info",
  "contact",
  "sales",
  "hello",
  "support",
  "admin",
  "office",
  "inquiries",
  "team",
  "mail",
];

/**
 * Extract domain from website URL
 */
function extractDomain(website: string): string | null {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const hostname = new URL(url).hostname;
    // Remove www. prefix
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Generate likely email addresses based on common patterns
 */
export function generateEmailPatterns(businessName: string, website: string): string[] {
  const domain = extractDomain(website);
  if (!domain) return [];

  const emails: string[] = [];

  // Pattern 1: Common prefixes
  EMAIL_PATTERNS.forEach((prefix) => {
    emails.push(`${prefix}@${domain}`);
  });

  // Pattern 2: Business name based
  const cleanName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)[0]; // First word only

  if (cleanName && cleanName.length > 2) {
    emails.push(`${cleanName}@${domain}`);
    emails.push(`contact@${cleanName}.com`);
  }

  // Pattern 3: Industry-specific
  // For roofing: estimate@, quote@, service@
  emails.push(`estimate@${domain}`);
  emails.push(`quote@${domain}`);
  emails.push(`service@${domain}`);
  emails.push(`booking@${domain}`);
  emails.push(`appointments@${domain}`);

  // Deduplicate
  return Array.from(new Set(emails));
}

/**
 * Validate email format (basic regex)
 */
function isValidEmailFormat(email: string): boolean {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
}

/**
 * Check if domain has MX records (can receive email)
 */
export async function checkMXRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * SMTP verification (check if email exists without sending)
 * NOTE: Many modern mail servers block this, so results are not 100% accurate
 */
export async function validateEmailSMTP(email: string): Promise<"valid" | "invalid" | "unknown"> {
  if (!isValidEmailFormat(email)) {
    return "invalid";
  }

  const domain = email.split("@")[1];

  try {
    // Check if domain has MX records
    const hasMX = await checkMXRecords(domain);
    if (!hasMX) {
      return "invalid"; // Domain can't receive email
    }

    // For now, if MX exists, we'll say "unknown" since full SMTP verification
    // requires actually connecting to the mail server, which is complex
    // and often blocked by modern servers
    return "unknown"; // Domain can receive email, but we can't verify this specific address
  } catch {
    return "unknown";
  }
}

/**
 * Scrape emails from website HTML
 */
export async function scrapeEmailsFromWebsite(
  website: string,
  timeout: number = 10000
): Promise<string[]> {
  const emails: string[] = [];

  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EmailFinder/1.0)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return emails;

    const html = await response.text();

    // Find emails in HTML
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex);

    if (matches) {
      // Filter out common junk emails
      const filtered = matches.filter((email) => {
        const lower = email.toLowerCase();
        return (
          !lower.includes("example.com") &&
          !lower.includes("test.com") &&
          !lower.includes("sample.com") &&
          !lower.includes("domain.com") &&
          !lower.includes("yoursite.com") &&
          !lower.includes("yourdomain.com") &&
          !lower.includes("noreply") &&
          !lower.includes("no-reply") &&
          !lower.includes("mailer-daemon") &&
          !lower.includes("postmaster") &&
          !lower.includes(".png") &&
          !lower.includes(".jpg") &&
          !lower.endsWith(".gif")
        );
      });

      emails.push(...filtered);
    }

    // Also check mailto: links
    const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    let mailtoMatch;
    while ((mailtoMatch = mailtoRegex.exec(html)) !== null) {
      emails.push(mailtoMatch[1]);
    }

    // Deduplicate
    return Array.from(new Set(emails));
  } catch (err) {
    console.warn("Email scraping error:", (err as Error).message);
    return emails;
  }
}

/**
 * Score email confidence based on various factors
 */
function scoreEmailConfidence(
  email: string,
  source: string,
  validationResult: string,
  domain: string
): number {
  let score = 50; // Base score

  // Source scoring
  if (source === "scraped-mailto") score += 30; // High confidence - explicit mailto
  else if (source === "scraped-html") score += 20; // Medium confidence
  else if (source === "pattern-common") score += 10; // Low confidence - guessed

  // Validation scoring
  if (validationResult === "valid") score += 20;
  else if (validationResult === "invalid") score -= 40;

  // Pattern scoring
  const prefix = email.split("@")[0].toLowerCase();
  if (["info", "contact", "hello", "sales"].includes(prefix)) {
    score += 15; // Very common patterns
  } else if (["support", "admin", "team"].includes(prefix)) {
    score += 10;
  } else if (["estimate", "quote", "service"].includes(prefix)) {
    score += 8; // Industry-specific
  }

  // Domain match
  if (email.includes(domain)) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Discover all possible emails for a business
 */
export async function discoverEmails(
  businessName: string,
  website: string
): Promise<EmailDiscoveryResult> {
  const allEmails = new Set<string>();
  const confidence: Record<string, number> = {};
  const validationResults: Record<string, "valid" | "invalid" | "unknown"> = {};
  const sources: Record<string, string> = {};

  const domain = extractDomain(website);
  if (!domain) {
    return {
      emails: [],
      patterns: [],
      confidence: {},
      validationResults: {},
      sources: {},
    };
  }

  // Step 1: Scrape emails from website
  console.log(`📧 Scraping emails from ${website}...`);
  const scrapedEmails = await scrapeEmailsFromWebsite(website);
  scrapedEmails.forEach((email) => {
    allEmails.add(email.toLowerCase());
    sources[email.toLowerCase()] = "scraped-html";
  });

  // Step 2: Generate pattern-based emails
  console.log(`📧 Generating email patterns for ${businessName}...`);
  const patternEmails = generateEmailPatterns(businessName, website);
  patternEmails.forEach((email) => {
    allEmails.add(email.toLowerCase());
    if (!sources[email.toLowerCase()]) {
      sources[email.toLowerCase()] = "pattern-common";
    }
  });

  // Step 3: Validate each email
  console.log(`📧 Validating ${allEmails.size} emails...`);
  const emailArray = Array.from(allEmails);
  
  // Check domain MX records once (applies to all emails)
  const hasMX = await checkMXRecords(domain);
  
  for (const email of emailArray) {
    // Basic format validation
    if (!isValidEmailFormat(email)) {
      validationResults[email] = "invalid";
      confidence[email] = 0;
      continue;
    }

    // If domain has no MX records, all emails are invalid
    if (!hasMX) {
      validationResults[email] = "invalid";
    } else {
      validationResults[email] = "unknown"; // Can't fully verify without sending
    }

    // Calculate confidence score
    confidence[email] = scoreEmailConfidence(
      email,
      sources[email],
      validationResults[email],
      domain
    );
  }

  // Filter out invalid emails and sort by confidence
  const validEmails = emailArray
    .filter((email) => validationResults[email] !== "invalid")
    .sort((a, b) => (confidence[b] || 0) - (confidence[a] || 0));

  return {
    emails: validEmails,
    patterns: patternEmails,
    confidence,
    validationResults,
    sources,
  };
}

/**
 * Get best email (highest confidence)
 */
export function getBestEmail(result: EmailDiscoveryResult): string | null {
  if (result.emails.length === 0) return null;
  return result.emails[0]; // Already sorted by confidence
}

/**
 * Get emails by confidence threshold
 */
export function getEmailsByConfidence(
  result: EmailDiscoveryResult,
  minConfidence: number = 60
): string[] {
  return result.emails.filter((email) => (result.confidence[email] || 0) >= minConfidence);
}