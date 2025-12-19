// src/websiteIntelligence.ts

export type TechnologyStack = {
  cms?: string; // WordPress, Shopify, Wix, etc.
  analytics?: string[]; // Google Analytics, etc.
  chatWidgets?: string[]; // Intercom, Drift, etc.
  bookingSystems?: string[]; // Calendly, ScheduleOnce, etc.
  ecommerce?: string; // Shopify, WooCommerce, etc.
  hosting?: string; // AWS, Cloudflare, etc.
  frameworks?: string[]; // React, Vue, etc.
};

export type ContactMethods = {
  hasContactForm: boolean;
  hasLiveChat: boolean;
  hasBookingSystem: boolean;
  hasPhoneClick: boolean;
  contactFormUrl?: string;
  bookingUrl?: string;
};

export type BusinessIntelligence = {
  employeeCount?: number;
  foundedYear?: number;
  certifications?: string[];
  serviceAreas?: string[];
  operatingHours?: string;
  languages?: string[];
};

export type WebsiteIntelligenceResult = {
  technology: TechnologyStack;
  contactMethods: ContactMethods;
  businessIntel: BusinessIntelligence;
  dataQuality: {
    completeness: number; // 0-100
    lastUpdated?: string;
  };
  rawFindings: string[];
};

/**
 * Detect CMS/Platform from HTML
 */
function detectCMS(html: string, headers: Headers): string | undefined {
  const lower = html.toLowerCase();

  // WordPress
  if (lower.includes("wp-content") || lower.includes("wordpress")) {
    return "WordPress";
  }

  // Shopify
  if (lower.includes("shopify") || lower.includes("cdn.shopify.com")) {
    return "Shopify";
  }

  // Wix
  if (lower.includes("wixsite") || lower.includes("wix.com")) {
    return "Wix";
  }

  // Squarespace
  if (lower.includes("squarespace")) {
    return "Squarespace";
  }

  // Webflow
  if (lower.includes("webflow")) {
    return "Webflow";
  }

  // Weebly
  if (lower.includes("weebly")) {
    return "Weebly";
  }

  // GoDaddy
  if (lower.includes("godaddy")) {
    return "GoDaddy Website Builder";
  }

  // Check headers
  const serverHeader = headers.get("x-powered-by")?.toLowerCase();
  if (serverHeader) {
    if (serverHeader.includes("wordpress")) return "WordPress";
    if (serverHeader.includes("wix")) return "Wix";
  }

  return undefined;
}

/**
 * Detect analytics tools
 */
function detectAnalytics(html: string): string[] {
  const analytics: string[] = [];
  const lower = html.toLowerCase();

  if (lower.includes("google-analytics") || lower.includes("googletagmanager")) {
    analytics.push("Google Analytics");
  }
  if (lower.includes("facebook.com/tr") || lower.includes("fbevents")) {
    analytics.push("Facebook Pixel");
  }
  if (lower.includes("hotjar")) {
    analytics.push("Hotjar");
  }
  if (lower.includes("mixpanel")) {
    analytics.push("Mixpanel");
  }

  return analytics;
}

/**
 * Detect chat widgets
 */
function detectChatWidgets(html: string): string[] {
  const widgets: string[] = [];
  const lower = html.toLowerCase();

  if (lower.includes("intercom") || lower.includes("intercomcdn")) {
    widgets.push("Intercom");
  }
  if (lower.includes("drift.com") || lower.includes("js.driftt.com")) {
    widgets.push("Drift");
  }
  if (lower.includes("tawk.to") || lower.includes("tawkto")) {
    widgets.push("Tawk.to");
  }
  if (lower.includes("livechat")) {
    widgets.push("LiveChat");
  }
  if (lower.includes("zendesk") || lower.includes("zdassets")) {
    widgets.push("Zendesk Chat");
  }
  if (lower.includes("crisp.chat")) {
    widgets.push("Crisp");
  }

  return widgets;
}

/**
 * Detect booking systems
 */
function detectBookingSystems(html: string): { systems: string[]; urls: string[] } {
  const systems: string[] = [];
  const urls: string[] = [];
  const lower = html.toLowerCase();

  // Calendly
  if (lower.includes("calendly")) {
    systems.push("Calendly");
    const calendlyMatch = html.match(/calendly\.com\/([a-zA-Z0-9_-]+)/i);
    if (calendlyMatch) {
      urls.push(`https://calendly.com/${calendlyMatch[1]}`);
    }
  }

  // Acuity Scheduling
  if (lower.includes("acuityscheduling")) {
    systems.push("Acuity Scheduling");
  }

  // Square Appointments
  if (lower.includes("squareup.com") && lower.includes("appointments")) {
    systems.push("Square Appointments");
  }

  // ScheduleOnce
  if (lower.includes("scheduleonce") || lower.includes("oncehub")) {
    systems.push("ScheduleOnce");
  }

  // Setmore
  if (lower.includes("setmore")) {
    systems.push("Setmore");
  }

  // SimplyBook
  if (lower.includes("simplybook")) {
    systems.push("SimplyBook.me");
  }

  return { systems, urls };
}

/**
 * Detect contact form
 */
function detectContactForm(html: string): { hasForm: boolean; url?: string } {
  const lower = html.toLowerCase();

  // Look for common form indicators
  const hasForm =
    lower.includes("<form") ||
    lower.includes("contact") ||
    lower.includes("get in touch") ||
    lower.includes("send message");

  // Try to find contact page URL
  const contactMatch = html.match(/href=["']([^"']*contact[^"']*)["']/i);
  const url = contactMatch ? contactMatch[1] : undefined;

  return { hasForm, url };
}

/**
 * Extract employee count
 */
function extractEmployeeCount(html: string): number | undefined {
  // Look for patterns like "50+ employees", "team of 25", etc.
  const patterns = [
    /(\d+)\+?\s+employees?/i,
    /team of (\d+)/i,
    /(\d+)\s+team members?/i,
    /staff of (\d+)/i,
    /(\d+)\s+professionals?/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }

  // Count team member photos on "About" or "Team" pages
  const teamSection = html.match(/<section[^>]*(?:team|about)[^>]*>[\s\S]*?<\/section>/i);
  if (teamSection) {
    const imgCount = (teamSection[0].match(/<img/gi) || []).length;
    if (imgCount >= 3 && imgCount <= 100) {
      return imgCount; // Rough estimate
    }
  }

  return undefined;
}

/**
 * Extract founded year
 */
function extractFoundedYear(html: string): number | undefined {
  const patterns = [
    /(?:established|founded|since)\s+(\d{4})/i,
    /©\s*(\d{4})/i,
    /(\d{4})\s*-\s*(?:present|now|\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      const currentYear = new Date().getFullYear();
      if (year >= 1900 && year <= currentYear) {
        return year;
      }
    }
  }

  return undefined;
}

/**
 * Extract certifications
 */
function extractCertifications(html: string): string[] {
  const certs: string[] = [];
  const lower = html.toLowerCase();

  const commonCerts = [
    "BBB Accredited",
    "Licensed & Insured",
    "Certified",
    "ISO Certified",
    "Insured",
    "Bonded",
    "Veteran Owned",
    "Woman Owned",
    "Minority Owned",
    "Green Certified",
    "Energy Star Partner",
  ];

  commonCerts.forEach((cert) => {
    if (lower.includes(cert.toLowerCase())) {
      certs.push(cert);
    }
  });

  return certs;
}

/**
 * Extract service areas
 */
function extractServiceAreas(html: string): string[] {
  const areas: string[] = [];

  // Look for "serving" or "service area" sections
  const patterns = [
    /(?:serving|service areas?)[:\s]+([^<.]*)/gi,
    /we serve[:\s]+([^<.]*)/gi,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const text = match[1];
      // Extract city names (capitalized words)
      const cities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
      if (cities) {
        areas.push(...cities);
      }
    }
  });

  return Array.from(new Set(areas)).slice(0, 10); // Dedupe and limit
}

/**
 * Main function to extract all intelligence from a website
 */
export async function extractWebsiteIntelligence(
  website: string,
  timeout: number = 15000
): Promise<WebsiteIntelligenceResult> {
  const rawFindings: string[] = [];

  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    rawFindings.push(`Fetching ${url}...`);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      rawFindings.push(`HTTP ${response.status}: ${response.statusText}`);
      return createEmptyResult(rawFindings);
    }

    const html = await response.text();
    rawFindings.push(`Fetched ${Math.round(html.length / 1024)}KB of HTML`);

    // Extract technology stack
    const cms = detectCMS(html, response.headers);
    const analytics = detectAnalytics(html);
    const chatWidgets = detectChatWidgets(html);
    const booking = detectBookingSystems(html);
    
    if (cms) rawFindings.push(`CMS: ${cms}`);
    if (analytics.length) rawFindings.push(`Analytics: ${analytics.join(", ")}`);
    if (chatWidgets.length) rawFindings.push(`Chat: ${chatWidgets.join(", ")}`);
    if (booking.systems.length) rawFindings.push(`Booking: ${booking.systems.join(", ")}`);

    // Extract contact methods
    const contactForm = detectContactForm(html);
    const hasLiveChat = chatWidgets.length > 0;
    const hasBookingSystem = booking.systems.length > 0;
    const hasPhoneClick = html.toLowerCase().includes("tel:");

    // Extract business intelligence
    const employeeCount = extractEmployeeCount(html);
    const foundedYear = extractFoundedYear(html);
    const certifications = extractCertifications(html);
    const serviceAreas = extractServiceAreas(html);

    if (employeeCount) rawFindings.push(`Employees: ~${employeeCount}`);
    if (foundedYear) rawFindings.push(`Founded: ${foundedYear}`);
    if (certifications.length) rawFindings.push(`Certs: ${certifications.join(", ")}`);
    if (serviceAreas.length) rawFindings.push(`Service areas: ${serviceAreas.length} found`);

    // Calculate data completeness
    let completeness = 0;
    if (cms) completeness += 15;
    if (analytics.length) completeness += 10;
    if (contactForm.hasForm) completeness += 15;
    if (hasLiveChat) completeness += 10;
    if (hasBookingSystem) completeness += 15;
    if (employeeCount) completeness += 15;
    if (foundedYear) completeness += 10;
    if (certifications.length) completeness += 10;

    return {
      technology: {
        cms,
        analytics,
        chatWidgets,
        bookingSystems: booking.systems,
      },
      contactMethods: {
        hasContactForm: contactForm.hasForm,
        hasLiveChat,
        hasBookingSystem,
        hasPhoneClick,
        contactFormUrl: contactForm.url,
        bookingUrl: booking.urls[0],
      },
      businessIntel: {
        employeeCount,
        foundedYear,
        certifications,
        serviceAreas,
      },
      dataQuality: {
        completeness: Math.min(100, completeness),
      },
      rawFindings,
    };
  } catch (err) {
    rawFindings.push(`Error: ${(err as Error).message}`);
    return createEmptyResult(rawFindings);
  }
}

function createEmptyResult(rawFindings: string[]): WebsiteIntelligenceResult {
  return {
    technology: {},
    contactMethods: {
      hasContactForm: false,
      hasLiveChat: false,
      hasBookingSystem: false,
      hasPhoneClick: false,
    },
    businessIntel: {},
    dataQuality: {
      completeness: 0,
    },
    rawFindings,
  };
}