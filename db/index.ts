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
    if (delivery === "below_day") {
        base = base.in("delivery", [
            "below_day"
        ]);
    } else if (delivery === "below_week") {
        base = base.in("delivery", [
            "below_day",
            "below_week"
        ]);
    } else if (delivery === "more_than_week") {
        // No filter applied: include all delivery types
    }
    if (priceRange) {
        base = base.eq("priceRange", priceRange);
    }
    const preloadSize = Math.max(100, (offset + giftLimit) * 2);
    base = base.range(0, preloadSize - 1);
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
    const prepared = (data || []).map(({ gift_tags, ...gift }) => {
        const tagList = (gift_tags || []).map((gt) => gt.tags).filter(Boolean);
        const score = tagList.filter((t) => tagSet.has(t.name)).length;
        return {
            ...gift,
            tags: tagList,
            score
        };
    });
    let final;
    if (tags.length > 0) {
        final = prepared.sort((a, b) => b.score - a.score);
    } else {
        // Stable sort by e.g. created_at or id
        final = prepared.sort((a, b) => a.id - b.id); // Use any consistently available field
    }
    final = final.slice(offset, offset + giftLimit);
    final = final.map(({ score, priceEur, priceDlr, ...gift }) => {
        const price = currency === "dollar" ? priceDlr : priceEur;
        return {
            ...gift,
            price
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
