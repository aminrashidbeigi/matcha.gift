// Types
export interface Product {
    id: number
    title: string
    price: number
    priceRange: string
    delivery: string
    image: string
    link: string
    seller: string
    tags: Array<{
        id: number
        name: string
    }>
    description?: string
}

export interface ApiResponse {
    currency: string
    gifts: Product[]
}

// API configuration
const API_URL = 'https://haufabfvozxukyawzsnc.supabase.co/functions/v1/fetch-gifts'
const LIST_API_URL = 'https://haufabfvozxukyawzsnc.supabase.co/functions/v1/list'
const API_KEY = import.meta.env.PUBLIC_SUPABASE_API_KEY

// Function to format price
export function formatPrice(product: Product, currency: string): string {
    const symbol = currency === 'dollar' ? '$' : '€'
    return `${symbol}${product.price}`
}

// Function to fetch gifts for the list page (original function)
export async function fetchGifts(
    tags: string[] = [],
    priceRange?: string,
    timeConstraint?: string,
    offset: number = 0,
    limit: number = 8
): Promise<{ products: Product[], currency: string }> {
    try {
        const requestBody: Record<string, any> = {
            tags: tags.length > 0 ? tags : undefined,
            priceRange,
            delivery: timeConstraint,
            offset,
            limit
        }
        console.log(requestBody)
        // Remove undefined values
        Object.keys(requestBody).forEach(key =>
            requestBody[key] === undefined && delete requestBody[key]
        )

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data: ApiResponse = await response.json()
        return {
            products: data.gifts || [],
            currency: data.currency || 'dollar'
        }
    } catch (error) {
        console.error('Failed to fetch gifts:', error)
        return { products: [], currency: 'dollar' }
    }
}

// Function to fetch gifts for the GiftMatcher component
export async function fetchGiftsForMatcher(): Promise<{ products: Product[], currency: string }> {
    try {
        const requestBody = {
            name: 'home'
        }

        const response = await fetch(LIST_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data: ApiResponse = await response.json()
        return {
            products: data.gifts || [],
            currency: data.currency || 'dollar'
        }
    } catch (error) {
        console.error('Failed to fetch gifts for matcher:', error)
        return { products: [], currency: 'dollar' }
    }
} 
