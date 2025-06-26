import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Type definitions
interface RequestBody {
    delivery?: string;
    priceRange?: string;
    tags?: string[];
    offset?: number;
    limit?: number;
}

interface Gift {
    id: number;
    country?: string;
    delivery?: string;
    priceRange?: string;
    priceEur?: number;
    priceDlr?: number;
    affiliate_link?: string;
    original_link?: string;
    [key: string]: any;
}

interface GiftTag {
    tag_id: number;
    tags: {
        id: number;
        name: string;
    };
}

interface GiftWithScore extends Gift {
    score: number;
    tags: { id: number; name: string; }[];
}

// Utility to get user's IP from request headers
function getClientIP(req: Request): string | null {
    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim(); // in case of multiple IPs
    }
    return null;
}

// Utility to get country from IP
async function getCountryFromIP(ip: string | null): Promise<string | null> {
    if (!ip) return null;
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
        const json = await res.json();
        return json?.countryCode ?? null;
    } catch {
        return null;
    }
}

Deno.serve(async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }

    const ip = getClientIP(req);
    const country = await getCountryFromIP(ip);
    const currency = country === "US" ? "dollar" : "euro";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    let body: RequestBody = {};
    try {
        body = await req.json();
    } catch (_) { }

    const { delivery, priceRange, tags = [], offset = 0, limit } = body;
    const tagSet = new Set(tags);
    const giftLimit = limit ?? 3;

    // Validate limit parameter
    if (limit && limit > 10) {
        return new Response(JSON.stringify({
            error: "Limit cannot be more than 10"
        }), {
            status: 400,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // Build the base query
    let base = supabase.from("gifts").select("*, gift_tags(tag_id, tags(id, name))", {
        count: "exact"
    });

    if (delivery === "instant") {
        base = base.eq("delivery", "instant");
    }
    if (priceRange) {
        base = base.eq("priceRange", priceRange);
    }

    // Apply database-level ordering based on tags and country
    if (tags.length > 0) {
        // When tags are provided, we need to sort by matched tag count first
        // We'll use a subquery approach to count matched tags
        base = base.order('id', { ascending: true }); // Fallback ordering
    } else {
        // No tags provided, sort by country and id
        if (country) {
            base = base.order('country', { ascending: true, nullsLast: true })
                .order('id', { ascending: true });
        } else {
            base = base.order('id', { ascending: true });
        }
    }

    // Apply pagination at database level
    base = base.range(offset, offset + giftLimit - 1);
    const { data, error } = await base;

    if (error) {
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // Debug: Check if delivery filter is working
    if (delivery === "instant") {
        const instantItems = (data || []).filter((item: any) => item.delivery === "instant");
        console.log(`Delivery filter: Found ${instantItems.length} instant items out of ${data?.length || 0} total items`);
    }

    // Process the data and calculate tag scores
    const prepared = (data || []).map(({ gift_tags, ...gift }: Gift & { gift_tags: GiftTag[] }): GiftWithScore => {
        const tagList = (gift_tags || []).map((gt: GiftTag) => gt.tags).filter(Boolean);
        const score = tagList.filter((t: { name: string }) => tagSet.has(t.name)).length;
        return {
            ...gift,
            tags: tagList,
            score
        };
    });

    // Sort by tag score if tags were provided
    let final = prepared;
    if (tags.length > 0) {
        final = prepared.sort((a: GiftWithScore, b: GiftWithScore) => {
            // First sort by tag score (descending - higher scores first)
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            // If same score, sort by country (user's country first)
            if (country) {
                const aIsUserCountry = a.country === country;
                const bIsUserCountry = b.country === country;
                if (aIsUserCountry && !bIsUserCountry) return -1;
                if (!aIsUserCountry && bIsUserCountry) return 1;
            }

            // Finally sort by ID
            return a.id - b.id;
        });
    }

    // Transform the final result
    final = final.map(({ score, priceEur, priceDlr, affiliate_link, original_link, ...gift }: GiftWithScore) => {
        const price = currency === "dollar" ? priceDlr : priceEur;
        const link = affiliate_link || original_link; // Use affiliate link by default, fall back to original
        return {
            ...gift,
            price,
            link
        };
    });

    return new Response(JSON.stringify({
        currency,
        gifts: final
    }), {
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
});
