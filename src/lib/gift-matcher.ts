import type { Product } from './api/gifts'
import { fetchGifts, formatPrice } from './api/gifts'

// Global state
let productsCache: Product[] = []
let currentCurrency: string = 'dollar'
let selectedGifts: Set<number> = new Set()

// Function to create a gift card element
function createGiftCard(product: Product): HTMLElement {
    const card = document.createElement('div')
    card.className = 'gift-card group relative overflow-hidden rounded-xl bg-white shadow-md transition-all hover:shadow-lg cursor-pointer'
    card.dataset.productId = product.id.toString()

    const price = formatPrice(product, currentCurrency)

    card.innerHTML = `
    <div class="relative aspect-square overflow-hidden">
      <img src="${product.image}" alt="${product.title}" class="h-full w-full object-cover transition-transform group-hover:scale-105" />
      <div class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5"></div>
    </div>
    <div class="p-4">
      <h3 class="mb-1 line-clamp-2 text-lg font-semibold">${product.title}</h3>
      <p class="text-sm text-gray-600">${price}</p>
    </div>
  `

    // Add click handler for selection
    card.addEventListener('click', () => {
        toggleGiftSelection(product.id)
    })

    return card
}

// Function to toggle gift selection
function toggleGiftSelection(productId: number) {
    const card = document.querySelector(`[data-product-id="${productId}"]`)

    if (selectedGifts.has(productId)) {
        selectedGifts.delete(productId)
        card?.classList.remove('ring-2', 'ring-[var(--link-color)]')
    } else {
        selectedGifts.add(productId)
        card?.classList.add('ring-2', 'ring-[var(--link-color)]')
    }

    updateSelectionProgress()
}

// Function to update selection progress
function updateSelectionProgress() {
    const countElement = document.getElementById('selection-count')
    if (!countElement) return

    const count = selectedGifts.size
    countElement.textContent = count.toString()
}

// Initialize the component
export async function initialize() {
    const grid = document.getElementById('gift-grid')
    const loading = document.getElementById('loading-spinner')
    const noResults = document.getElementById('no-results-message')
    const error = document.getElementById('error-message')

    if (!grid || !loading || !noResults || !error) return

    try {
        const result = await fetchGifts()
        productsCache = result.products
        currentCurrency = result.currency

        if (productsCache.length === 0) {
            loading.classList.add('hidden')
            noResults.classList.remove('hidden')
            return
        }

        // Create and append gift cards
        productsCache.forEach(product => {
            const card = createGiftCard(product)
            grid.appendChild(card)
        })

        loading.classList.add('hidden')
    } catch (err) {
        console.error('Failed to initialize:', err)
        loading.classList.add('hidden')
        error.classList.remove('hidden')
    }
}

// Add event listener for get inspired button
document.addEventListener('astro:page-load', () => {
    const getInspiredBtn = document.getElementById('get-inspired-btn')
    getInspiredBtn?.addEventListener('click', () => {
        // Get selected products
        const selectedProducts = productsCache.filter(p => selectedGifts.has(p.id))

        // Get all unique tags from selected gifts
        const selectedTags = new Set<string>()
        selectedProducts.forEach(product => {
            product.tags.forEach(tag => selectedTags.add(tag.name.toLowerCase()))
        })

        // Build URL parameters with only tags
        const params = new URLSearchParams()
        params.set('tags', Array.from(selectedTags).join(','))

        // Redirect to list page with parameters
        window.location.href = `/list?${params.toString()}`
    })
}) 