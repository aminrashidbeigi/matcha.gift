import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Utility to get user's IP from request headers
function getClientIP(req) {
    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim(); // in case of multiple IPs
    }
    return null;
}
// Utility to get country from IP
async function getCountryFromIP(ip) {
    if (!ip) return null;
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
        const json = await res.json();
        return json?.countryCode ?? null;
    } catch {
        return null;
    }
}
// Utility function for country-based sorting
function sortByCountryAndScore(gifts, userCountry, hasTags = false) {
    return gifts.sort((a, b) => {
        // First sort by country (user's country first)
        const aIsUserCountry = a.country === userCountry;
        const bIsUserCountry = b.country === userCountry;
        if (aIsUserCountry && !bIsUserCountry) return -1;
        if (!aIsUserCountry && bIsUserCountry) return 1;

        // Then sort by tag score or ID
        if (hasTags) {
            return b.score - a.score;
        } else {
            return a.id - b.id;
        }
    });
}
Deno.serve(async (req) => {
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
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"));
    let body = {};
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

    let base = supabase.from("gifts").select("*, gift_tags(tag_id, tags(id, name))", {
        count: "exact"
    });
    if (delivery === "instant") {
        base = base.eq("delivery", "instant");
    }
    if (priceRange) {
        base = base.eq("priceRange", priceRange);
    }

    // Apply database-level ordering: country first (user's country prioritized), then by id
    if (country) {
        // Order by country first (user's country will be sorted naturally), then by id
        base = base.order('country', { ascending: true, nullsLast: true })
            .order('id', { ascending: true });
    } else {
        // Fallback to simple id ordering if no country detected
        base = base.order('id', { ascending: true });
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
        const instantItems = (data || []).filter(item => item.delivery === "instant");
        console.log(`Delivery filter: Found ${instantItems.length} instant items out of ${data?.length || 0} total items`);
    }

    const prepared = (data || []).map(({ gift_tags, ...gift }) => {
        const tagList = (gift_tags || []).map((gt) => gt.tags).filter(Boolean);
        const score = tagList.filter((t) => tagSet.has(t.name)).length;
        return {
            ...gift,
            tags: tagList,
            score
        };
    });

    // Data is already sorted and paginated at database level
    let final = prepared.map(({ score, priceEur, priceDlr, affiliate_link, original_link, ...gift }) => {
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
