import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Type definitions
interface RequestBody {
    name: string;
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    let body: RequestBody = { name: "" };
    try {
        body = await req.json();
    } catch (_) { }

    const { name } = body;

    // Validate that name is provided
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return new Response(JSON.stringify({
            error: "List name is required"
        }), {
            status: 400,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // First, find the list by name
    const { data: listData, error: listError } = await supabase
        .from("lists")
        .select("id")
        .eq("name", name.trim())
        .single();

    if (listError || !listData) {
        return new Response(JSON.stringify({
            error: "List not found"
        }), {
            status: 404,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // Now fetch all gifts associated with this list using the list_gifts junction table
    const { data: giftsData, error: giftsError } = await supabase
        .from("list_gifts")
        .select(`
            gift_id,
            gifts (
                *,
                gift_tags (
                    tag_id,
                    tags (
                        id,
                        name
                    )
                )
            )
        `)
        .eq("list_id", listData.id)
        .order('created_at', { ascending: true });

    if (giftsError) {
        return new Response(JSON.stringify({
            error: giftsError.message
        }), {
            status: 500,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        });
    }

    // Process the data - extract gifts from the joined result
    const prepared = (giftsData || []).map((item: any) => {
        const gift = item.gifts;
        const gift_tags = gift.gift_tags || [];
        const tagList = gift_tags.map((gt: GiftTag) => gt.tags).filter(Boolean);
        return {
            ...gift,
            tags: tagList
        };
    });

    // Transform the final result - keep both priceEur and priceDlr for client-side currency handling
    const final = prepared.map(({ priceEur, priceDlr, affiliate_link, original_link, ...gift }) => {
        const link = affiliate_link || original_link; // Use affiliate link by default, fall back to original
        return {
            ...gift,
            priceEur,
            priceDlr,
            link
        };
    });

    return new Response(JSON.stringify({
        listId: listData.id,
        listName: name,
        gifts: final
    }), {
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}); 