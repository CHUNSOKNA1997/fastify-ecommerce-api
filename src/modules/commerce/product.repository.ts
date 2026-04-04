import { fallbackCatalog } from './catalog'
import { ProductModel } from './product.model'
import { isValidObjectId } from 'mongoose'

type ProductSummary = {
  id: string
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  imagePaths: string[]
  rating: number
  isFavorite: boolean
  isNewArrival: boolean
  isTrending: boolean
  isPopularNearYou: boolean
}

const fallbackProductGallery = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80'
]

function ensureThreeImagePaths(primaryImagePath: string, imagePaths?: string[]): string[] {
  const normalized = Array.from(new Set(
    [primaryImagePath, ...(imagePaths ?? [])]
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  ))

  if (normalized.length === 0) {
    normalized.push(primaryImagePath)
  }

  for (const fallbackImage of fallbackProductGallery) {
    if (normalized.length >= 3) {
      break
    }

    if (!normalized.includes(fallbackImage)) {
      normalized.push(fallbackImage)
    }
  }

  return normalized.slice(0, 3)
}

function toProductSummary(product: {
  id?: string
  _id?: unknown
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  imagePaths?: string[]
  rating: number
  isFavorite: boolean
  isNewArrival?: boolean
  isTrending?: boolean
  isPopularNearYou?: boolean
}): ProductSummary {
  return {
    id: product.id ?? String(product._id),
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
    imagePath: product.imagePath,
    imagePaths: ensureThreeImagePaths(product.imagePath, product.imagePaths),
    rating: product.rating,
    isFavorite: product.isFavorite,
    isNewArrival: product.isNewArrival ?? false,
    isTrending: product.isTrending ?? false,
    isPopularNearYou: product.isPopularNearYou ?? false
  }
}

function rankFallbackProducts(
  selector: 'new-arrivals' | 'trending-now' | 'popular-near-you'
): ProductSummary[] {
  const products = fallbackCatalog.map((product, index) => ({
    ...product,
    isNewArrival: index >= fallbackCatalog.length - 2,
    isTrending: product.isFavorite || product.rating >= 4.7,
    isPopularNearYou: product.rating >= 4.5
  }))

  if (selector === 'new-arrivals') {
    return products.reverse()
  }

  if (selector === 'trending-now') {
    return products.sort((left, right) => {
      const favoriteBoost = Number(right.isFavorite) - Number(left.isFavorite)
      if (favoriteBoost !== 0) {
        return favoriteBoost
      }

      return right.rating - left.rating
    })
  }

  return products.sort((left, right) => {
    const popularityLeft = left.rating * 100 + (left.isFavorite ? 25 : 0) + left.price / 100
    const popularityRight = right.rating * 100 + (right.isFavorite ? 25 : 0) + right.price / 100
    return popularityRight - popularityLeft
  })
}

function searchFallbackCatalog(search?: string, category?: string): ProductSummary[] {
  const normalizedSearch = search?.trim().toLowerCase()
  const normalizedCategory = category?.trim().toLowerCase()

  return fallbackCatalog.filter((product) => {
    const matchesCategory = !normalizedCategory || product.category.toLowerCase() === normalizedCategory
    const matchesSearch = !normalizedSearch ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      product.description.toLowerCase().includes(normalizedSearch)

    return matchesCategory && matchesSearch
  })
}

export async function listProducts(search?: string, category?: string): Promise<ProductSummary[]> {
  const query: Record<string, unknown> = {}

  if (category?.trim()) {
    query.category = category.trim()
  }

  if (search?.trim()) {
    query.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { description: { $regex: search.trim(), $options: 'i' } }
    ]
  }

  const products = await ProductModel.find(query).sort({ createdAt: -1 })
  if (products.length > 0) {
    return products.map(toProductSummary)
  }

  return searchFallbackCatalog(search, category)
}

export async function listNewArrivals(limit = 10): Promise<ProductSummary[]> {
  const products = await ProductModel.find({ isNewArrival: true }).sort({ createdAt: -1 }).limit(limit)
  if (products.length > 0) {
    return products.map(toProductSummary)
  }

  return rankFallbackProducts('new-arrivals').slice(0, limit)
}

export async function listTrendingNow(limit = 10): Promise<ProductSummary[]> {
  const products = await ProductModel.find({ isTrending: true }).sort({ rating: -1, createdAt: -1 }).limit(limit)
  if (products.length > 0) {
    return products.map(toProductSummary)
  }

  return rankFallbackProducts('trending-now').slice(0, limit)
}

export async function listPopularNearYou(limit = 10): Promise<ProductSummary[]> {
  const products = await ProductModel.find({ isPopularNearYou: true }).sort({ rating: -1, isFavorite: -1, price: -1 }).limit(limit)
  if (products.length > 0) {
    return products.map(toProductSummary)
  }

  return rankFallbackProducts('popular-near-you').slice(0, limit)
}

export async function findProductById(id: string): Promise<ProductSummary | null> {
  if (isValidObjectId(id)) {
    const product = await ProductModel.findById(id)
    if (product) {
      return toProductSummary(product)
    }
  }

  return fallbackCatalog.find((item) => item.id === id) ?? null
}

export async function listCategories(): Promise<Array<{ id: string, name: string }>> {
  const products = await ProductModel.find().select('category')
  const categories = new Set<string>()

  if (products.length > 0) {
    for (const product of products) {
      categories.add(product.category)
    }
  } else {
    for (const product of fallbackCatalog) {
      categories.add(product.category)
    }
  }

  return Array.from(categories).sort().map((name) => ({
    id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    name
  }))
}
