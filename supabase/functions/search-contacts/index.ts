import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();

    // Extract parameters directly from request
    const query = requestData.query;
    const location = requestData.location;
    const pages = requestData.pages || 1;
    const emailProviders = requestData.emailProviders || [];
    const websites = requestData.websites || [];
    const searchEngines = requestData.searchEngines || [];
    const targetNames = requestData.targetNames || [];
    const providedUserId = requestData.user_id; // From batch processor
    const country = requestData.country || 'it'; // 🌍 Country code (default: Italy)
    const batchName = requestData.batch_name; // Nome del batch per validation list

    if (!query) {
      throw new Error('Query is required');
    }

    const numPages = Math.min(Math.max(1, pages), 50);
    console.log('Provided query from frontend:', query);
    console.log('Search params:', { numPages, emailProviders, websites, targetNames, providedUserId, location });

    // Build enhanced search query with email providers and target names for better results
    let searchQuery = query;

    // Add email providers to query if specified (critical for finding emails in Google index)
    if (emailProviders && emailProviders.length > 0) {
      const emailQuery = emailProviders.map((p: string) => `"${p}"`).join(' OR ');
      searchQuery = `${searchQuery} (${emailQuery})`;
      console.log(`Enhanced query with email providers: ${searchQuery}`);
    }

    // Add target names to query if specified (improves search relevance)
    if (targetNames && targetNames.length > 0) {
      const namesQuery = targetNames.slice(0, 5).map((n: string) => `"${n.toLowerCase()}"`).join(' OR ');
      searchQuery = `${searchQuery} (${namesQuery})`;
      console.log(`Enhanced query with names: ${searchQuery}`);
    }

    // 🎯 INJECT LOCATION into query for better geo-targeting on social media
    const sanitizeLocationForQuery = (loc: unknown): string | null => {
      if (typeof loc !== 'string') return null;
      let l = loc;
      if (l.includes('|')) l = l.split('|')[0];
      l = l.split('\t')[0];
      l = l.replace(/\d+/g, '').trim();
      if (!l) return null;
      return l;
    };

    const cityName = sanitizeLocationForQuery(location);
    if (cityName) {
      // Add city as both text and hashtag for social media platforms
      searchQuery = `${searchQuery} ("${cityName}" OR #${cityName})`;
      console.log(`🎯 Geo-targeting enhanced: injected city "${cityName}" into query`);
    }

    // 🇮🇹 FORCE ITALIAN RESULTS: When country=it and no city specified, add Italy to query
    if (country === 'it' && !cityName) {
      searchQuery = `${searchQuery} (Italy OR Italia)`;
      console.log(`🇮🇹 Forcing Italian geo-targeting: added "Italy OR Italia" to query`);
    }

    console.log('Final search query sent to Serper:', searchQuery);

    // Call Serper API
    const serperApiKey = '8d50c54251f874feffa1b73aa4d566e36844cf42';
    if (!serperApiKey) {
      throw new Error('SERPER_API_KEY not configured');
    }

    // Initialize Supabase client
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user ID: from body (batch) or from auth header (frontend)
    let userId: string | null = providedUserId || null;

    if (!userId && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log('User ID for this search:', userId);

    // Check usage limits if user is authenticated
    if (userId) {
      // Check SEARCH limit first (1 search = 1 request)
      const { data: searchAllowed, error: searchLimitError } = await supabase.rpc('check_usage_limit', {
        p_user_id: userId,
        p_metric: 'searches',
        p_amount: 1
      });

      if (searchLimitError) {
        console.error('Error checking search limits:', searchLimitError);
      } else if (searchAllowed === false) {
        throw new Error('Monthly search limit reached. Please upgrade your plan.');
      }

      // Check EMAIL limit (just to be safe, though we don't know exact amount yet)
      const { data: allowed, error: limitError } = await supabase.rpc('check_usage_limit', {
        p_user_id: userId,
        p_metric: 'emails_found',
        p_amount: 0 // Just check if they are already over limit
      });

      if (limitError) {
        console.error('Error checking limits:', limitError);
      } else if (allowed === false) {
        throw new Error('Monthly email limit reached. Please upgrade your plan.');
      }
    }

    // Save search to database if user is authenticated
    let searchId: string | null = null;
    let listId: string | null = null;

    if (userId) {
      const { data: searchData, error: searchError } = await supabase
        .from('searches')
        .insert({ query, location, user_id: userId })
        .select()
        .single();

      if (searchError) {
        console.error('Error saving search:', searchError);
      } else {
        searchId = searchData.id;

        // Create validation list for this search (status='unvalidated')
        // Use batch_name if provided, otherwise generate from query
        const listName = batchName
          ? `Batch: ${batchName}`
          : `Search: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`;

        const { data: listData, error: listError } = await supabase
          .from('validation_lists')
          .insert({
            name: listName,
            user_id: userId,
            status: 'unvalidated',
            total_emails: 0,
          })
          .select()
          .single();

        if (listError) {
          console.error('Error creating validation list:', listError);
        } else {
          listId = listData.id;
          console.log(`Created validation list: ${listId} for search: ${searchId}`);
        }
      }
    }
    const allContacts: any[] = [];
    const seenEmails = new Set<string>();

    // Loop through pages
    for (let page = 1; page <= numPages; page++) {
      console.log(`Fetching page ${page}/${numPages}`);

      const serperBody: any = {
        q: searchQuery,
        num: 10,
        page: page,
      };

      // Use proper Google geolocation parameter for geo-targeting (sanitize weird values)
      const sanitizeLocation = (loc: unknown): string | null => {
        if (typeof loc !== 'string') return null;
        let l = loc;
        if (l.includes('|')) l = l.split('|')[0];
        l = l.split('\t')[0];
        l = l.replace(/\d+/g, '').trim();
        if (!l) return null;
        return l;
      };

      const safeLocation = sanitizeLocation(location);

      // 🌍 Map country codes to full names for location formatting
      const countryNames: Record<string, string> = {
        'it': 'Italy',
        'de': 'Germany',
        'uk': 'United Kingdom',
        'us': 'United States',
        'fr': 'France',
        'es': 'Spain',
      };

      if (safeLocation) {
        const countryName = countryNames[country] || 'Italy';
        const alreadyHasCountry = /,/.test(safeLocation) || new RegExp(`\\b${countryName}\\b`, 'i').test(safeLocation);
        serperBody.location = alreadyHasCountry ? safeLocation : `${safeLocation}, ${countryName}`;
        serperBody.gl = country; // Country code
        serperBody.hl = country; // Language
        console.log(`\n=== GEO-TARGETING ENABLED ===`);
        console.log(`Location: "${serperBody.location}" | gl=${country} | hl=${country}`);
      } else {
        serperBody.gl = country;
        serperBody.hl = country;
        console.log(`\n=== DEFAULT GEO-TARGETING ===`);
        console.log(`No specific location (using gl=${country}, hl=${country} for ${countryNames[country] || country}-wide results)`);
      }
      console.log(`Query sent to Serper: "${searchQuery}"`);

      const serperResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serperBody),
      });

      if (!serperResponse.ok) {
        console.error(`Serper API error on page ${page}: ${serperResponse.statusText}`);
        continue; // Skip failed pages
      }

      const serperData = await serperResponse.json();
      const resultCount = serperData.organic?.length || 0;

      // 📊 DETAILED LOGGING: Track Serper results
      console.log(`\n📊 === PAGE ${page}/${numPages} RESULTS ===`);
      console.log(`🔍 Serper returned: ${resultCount} organic results`);
      console.log(`💰 Credits used: ${page} (total so far)`);
      console.log(`📧 Contacts found so far: ${allContacts.length}`);

      // Log first 3 result URLs to verify geo-targeting
      if (serperData.organic?.length > 0) {
        console.log(`Sample URLs from page ${page}:`);
        serperData.organic.slice(0, 3).forEach((r: any, i: number) => {
          console.log(`  ${i + 1}. ${r.title?.substring(0, 50)}... - ${r.link}`);
        });
      }

      // Extract contacts from this page with filters (including city filtering)
      const pageContacts = await extractContactsFromResults(
        serperData,
        searchId,
        listId,
        seenEmails,
        supabase,
        userId,
        emailProviders,
        websites,
        targetNames,
        cityName // Pass city name for filtering
      );

      allContacts.push(...pageContacts);
      console.log(`Page ${page}: extracted ${pageContacts.length} new contacts (total: ${allContacts.length})`);
    }

    console.log(`Total extracted ${allContacts.length} unique contacts from ${numPages} pages`);

    // Update validation list with total emails count
    if (listId && allContacts.length > 0) {
      await supabase
        .from('validation_lists')
        .update({ total_emails: allContacts.length })
        .eq('id', listId);
      console.log(`Updated validation list ${listId} with ${allContacts.length} emails`);
    }

    // Increment usage stats
    if (userId) {
      // Increment SEARCH count
      const { error: searchUsageError } = await supabase.rpc('increment_usage', {
        p_user_id: userId,
        p_metric: 'searches',
        p_amount: 1
      });

      if (searchUsageError) {
        console.error('Error incrementing search usage:', searchUsageError);
      }

      // Increment EMAIL count
      if (allContacts.length > 0) {
        const { error: usageError } = await supabase.rpc('increment_usage', {
          p_user_id: userId,
          p_metric: 'emails_found',
          p_amount: allContacts.length
        });

        if (usageError) {
          console.error('Error incrementing usage:', usageError);
        } else {
          console.log(`Incremented usage for user ${userId} by ${allContacts.length} emails`);
        }
      }
    }

    return new Response(
      JSON.stringify({ contacts: allContacts, list_id: listId }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );
  }
});

async function extractContactsFromResults(
  serperData: any,
  searchId: string | null,
  listId: string | null,
  seenEmails: Set<string>,
  supabase: any,
  userId: string | null,
  emailProviders: string[] = [],
  websites: string[] = [],
  targetNames: string[] = [],
  cityFilter: string | null = null, // 🎯 NEW: City filter for geo-targeting
  query: string | null = null // 🔒 NEW: Query for strict relevance filtering
) {
  const contacts: any[] = [];
  const results = serperData.organic || [];

  // 📊 METRICS TRACKING
  let fetchedPages = 0;
  let emailsFoundInHTML = 0;
  let skippedByCityFilter = 0;
  let skippedByWebsiteFilter = 0;
  let emailsFoundInSnippet = 0;
  let filteredByTargetNames = 0;
  let totalEmailsExtracted = 0;
  let personalEmails = 0; // Gmail, Yahoo, Hotmail, etc.
  let businessEmails = 0; // Domini aziendali

  for (const result of results) {
    const snippet = result.snippet || '';
    const title = result.title || '';
    const link = result.link || '';
    let text = `${title} ${snippet}`;
    let htmlFetched = false;

    // Il filtro "STRICT FILTER" è stato rimosso per permettere a Google/Serper di gestire nativamente
    // la rilevanza. Filtraggi testuali troppo stringenti spezzavano query come 'site:linkedin.com'.

    // 🎯 CITY FILTER: Skip results that don't mention the city (when cityFilter is set)
    if (cityFilter) {
      const textLower = text.toLowerCase();
      const cityLower = cityFilter.toLowerCase();
      const hasCityMention = textLower.includes(cityLower);

      if (!hasCityMention) {
        skippedByCityFilter++;
        continue; // Skip this result if city is not mentioned
      }
    }

    // Apply website filter if specified
    if (websites.length > 0) {
      try {
        const urlObj = new URL(link);
        const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();
        const linkPath = urlObj.pathname.toLowerCase();
        
        const matchesDomain = websites.some(w => {
          const cleanW = w.replace('www.', '').toLowerCase();
          // Gestione dei filtri con subpath come linkedin.com/in
          if (cleanW.includes('/')) {
            const parts = cleanW.split('/');
            const domainPart = parts[0];
            const pathPart = parts.slice(1).join('/');
            return linkDomain.includes(domainPart) && linkPath.includes(pathPart);
          }
          return linkDomain.includes(cleanW);
        });

        if (!matchesDomain) {
          skippedByWebsiteFilter++;
          continue;
        }
      } catch (e) {
        skippedByWebsiteFilter++;
        continue; // Skip invalid URLs
      }
    }

    // Check if this is a social media link (Instagram, Facebook, TikTok, LinkedIn)
    const isSocialMedia = link.includes('instagram.com') ||
      link.includes('facebook.com') ||
      link.includes('tiktok.com') ||
      link.includes('linkedin.com');

    // 🔗 LINKEDIN SPECIFIC FILTERING & PARSING
    let linkedinName: string | null = null;
    let linkedinRole: string | null = null;

    if (link.includes('linkedin.com')) {
      // 1. Scartiamo URL indesiderati (post, company, feed, activity, jobs, etc.)
      const isBadLinkedinUrl = /\/(company|jobs|showcase|pub|groups|events|pulse|posts|detail|activity|feed)\//i.test(link);
      const isGoodLinkedinUrl = /\/in\//i.test(link);

      if (isBadLinkedinUrl || !isGoodLinkedinUrl) {
        continue; // 🚫 Salta la pagina, non è un profilo personale!
      }

      // 2. Parsing chirurgico del Titolo (Formato: Nome Cognome - Ruolo - Società)
      const cleanTitle = title.replace(/\s*\|\s*LinkedIn$/i, '').trim();
      const titleParts = cleanTitle.split(/\s*[-|]\s*/);
      
      if (titleParts.length >= 1) {
        // Rimuoviamo eventuali pronomi es. "He/Him" che appaiono a volte in coda al nome
        linkedinName = titleParts[0].replace(/\s+(He\/Him|She\/Her|They\/Them)$/i, '').trim();
      }
      if (titleParts.length >= 2) {
        // La seconda parte è solitamente il Ruolo / Azienda (es. "Marketing Director @ Hyper Island")
        linkedinRole = titleParts[1].trim();
      }
    }

    // For social media, ONLY use snippets (don't fetch HTML - it's blocked)
    // For other sites, try to fetch HTML for more emails
    if (!isSocialMedia) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 sec timeout

        const htmlResponse = await fetch(link, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        clearTimeout(timeoutId);

        if (htmlResponse.ok) {
          const contentType = htmlResponse.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            const html = await htmlResponse.text();

            // --- DOM PARSING WITH CHEERIO ---
            const $ = cheerio.load(html);

            // 1. Extract from mailto links (Highest Confidence)
            $('a[href^="mailto:"]').each((_: number, elem: any) => {
              const href = $(elem).attr('href');
              if (href) {
                const email = href.replace('mailto:', '').split('?')[0].trim();
                text += ' ' + email;
              }
            });

            // 2. Extract from Contact sections (High Confidence)
            // Look for elements with IDs or classes containing "contact", "about", "footer"
            const contactAreas = $('footer, #contact, .contact, #footer, .footer, [class*="contact"], [id*="contact"]').text();
            text += ' ' + contactAreas;

            // 3. Fallback: Add visible body text (Lower Confidence but broad coverage)
            // Limit to avoid memory issues, but verify important tags first
            const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 50000);
            text += ' ' + bodyText;

            htmlFetched = true;
            fetchedPages++;
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        console.log(`Could not fetch ${link}: ${errorMsg}`);
      }
    } else {
      console.log(`Skipping HTML fetch for social media: ${link} - using snippet only`);
    }

    // Extract emails with improved regex - include accented characters
    const emailRegex = /\b[A-Za-z0-9àèéìòùÀÈÉÌÒÙ][\w\.\-àèéìòùÀÈÉÌÒÙ]*@[A-Za-z0-9][\w\.\-]*\.[A-Za-z]{2,}\b/gi;
    const rawEmails = text.match(emailRegex) || [];

    // Track emails found
    totalEmailsExtracted += rawEmails.length;

    // Filter out invalid emails (file paths, placeholders, etc)
    const invalidExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.ttf', '.eot', '.ico'];
    const emails = rawEmails.filter(email => {
      const lowerEmail = email.toLowerCase();
      // Skip file extensions
      if (invalidExtensions.some(ext => lowerEmail.endsWith(ext))) return false;
      // Skip common placeholder/test emails
      if (lowerEmail.includes('example') || lowerEmail.includes('test@') || lowerEmail.includes('noreply')) return false;
      // Skip short nonsense
      if (lowerEmail.length < 6) return false;
      return true;
    });

    // Track where emails come from
    if (htmlFetched && emails.length > 0) {
      emailsFoundInHTML += emails.length;
    } else if (!htmlFetched && emails.length > 0) {
      emailsFoundInSnippet += emails.length;
    }

    // Extract phone numbers (international format)
    const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
    const phones = text.match(phoneRegex) || [];

    for (const email of emails) {
      if (seenEmails.has(email.toLowerCase())) continue;

      // 📧 CLASSIFY EMAIL TYPE: Personal vs Business
      const emailDomain = email.split('@')[1]?.toLowerCase() || '';
      const personalDomains = ['gmail.com', 'yahoo.com', 'yahoo.it', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it', 'live.com', 'live.it', 'icloud.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'tin.it'];
      const isPersonalEmail = personalDomains.includes(emailDomain);

      if (isPersonalEmail) {
        personalEmails++;
      } else {
        businessEmails++;
      }

      // Apply email provider filter if specified
      if (emailProviders.length > 0) {
        const emailDomainAt = '@' + emailDomain;
        const matchesProvider = emailProviders.some(provider =>
          emailDomainAt.includes(provider.toLowerCase().replace('@', ''))
        );
        if (!matchesProvider) {
          continue; // Skip this email if it doesn't match any specified provider
        }
      }

      seenEmails.add(email.toLowerCase());

      let extractedName = extractName(title, snippet);
      let extractedOrg = extractOrganization(title, snippet);

      // Sovrascrivi con i dati d"oro se stiamo elaborando un profilo LinkedIn accettato
      if (link.includes('linkedin.com')) {
        if (linkedinName) extractedName = linkedinName;
        if (linkedinRole) extractedOrg = linkedinRole;
      }

      // Apply name filter if specified - CHECK ONLY IN EMAIL ADDRESS
      if (targetNames.length > 0) {
        const emailLower = email.toLowerCase();
        const emailLocalPart = emailLower.split('@')[0]; // Get part before @

        const nameInEmail = targetNames.some(targetName => {
          const targetLower = targetName.toLowerCase().trim();
          // Check if name appears in email address (local part or full email)
          // Support formats: name@, name.surname@, surname.name@, namesurname@
          return emailLocalPart.includes(targetLower) || emailLower.includes(targetLower);
        });

        if (!nameInEmail) {
          filteredByTargetNames++;
          continue;
        }
      }

      const contact = {
        email: email.toLowerCase(),
        name: extractedName,
        organization: extractedOrg,
        phone: phones[0] || null,
        website: link,
        social_links: null,
      };

      // Save to database only if user is authenticated and search was saved
      if (userId && searchId) {
        const { data: contactData, error: contactError } = await supabase
          .from('contacts')
          .insert({ ...contact, search_id: searchId, list_id: listId })
          .select()
          .single();

        if (!contactError && contactData) {
          contacts.push(contactData);
        } else if (contactError) {
          console.error('Error saving contact:', contactError);
        }
      } else {
        // Return contact without saving
        contacts.push(contact);
      }
    }
  }

  console.log(`\n📊 === EXTRACTION SUMMARY ===`);
  console.log(`🔍 Total organic results from Serper: ${results.length}`);
  console.log(`\n🚫 FILTERING BREAKDOWN:`);
  if (cityFilter) {
    console.log(`  - Skipped by city filter ("${cityFilter}"): ${skippedByCityFilter}`);
  }
  if (websites.length > 0) {
    console.log(`  - Skipped by website filter: ${skippedByWebsiteFilter}`);
  }
  console.log(`\n📧 EMAIL EXTRACTION:`);
  console.log(`  - Total raw emails extracted: ${totalEmailsExtracted}`);
  console.log(`  - From snippets only: ${emailsFoundInSnippet}`);
  console.log(`  - From HTML fetches: ${emailsFoundInHTML} (${fetchedPages} pages fetched)`);
  console.log(`  - Filtered by target names: ${filteredByTargetNames}`);
  console.log(`\n📧 EMAIL TYPE BREAKDOWN:`);
  console.log(`  - 👤 Personal emails (gmail, yahoo, etc.): ${personalEmails} (${contacts.length > 0 ? ((personalEmails / contacts.length) * 100).toFixed(1) : 0}%)`);
  console.log(`  - 🏢 Business emails (custom domains): ${businessEmails} (${contacts.length > 0 ? ((businessEmails / contacts.length) * 100).toFixed(1) : 0}%)`);
  console.log(`\n✅ FINAL RESULTS:`);
  console.log(`  - Valid unique contacts: ${contacts.length}`);
  console.log(`  - Conversion rate: ${results.length > 0 ? ((contacts.length / results.length) * 100).toFixed(1) : 0}%`);
  console.log(`  - Contacts per Serper credit: ${(contacts.length / 1).toFixed(2)}`);
  if (targetNames.length > 0) {
    console.log(`  - Names filter active: ${targetNames.slice(0, 5).join(', ')}${targetNames.length > 5 ? '...' : ''}`);
  }
  console.log(`========================\n`);
  return contacts;
}

function extractName(title: string, snippet: string): string | null {
  // Try to extract a person's name from title or snippet
  const text = `${title} ${snippet}`;

  // Look for patterns like "Name - Company" or "Name | Company"
  const namePattern = /^([A-Z][a-z]+\s[A-Z][a-z]+)[\s\-|]/;
  const match = text.match(namePattern);

  return match ? match[1] : null;
}

function extractOrganization(title: string, snippet: string): string | null {
  // Try to extract organization name
  const text = `${title} ${snippet}`;

  // Look for common organization indicators
  const orgPatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z\s&.]+(?:Inc|LLC|Ltd|Corp)?)/,
    /([A-Z][A-Za-z\s&.]+(?:Inc|LLC|Ltd|Corp))/,
  ];

  for (const pattern of orgPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}
