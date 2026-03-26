import { fallbackCatalog } from './catalog'
import { ProductModel } from './product.model'

type ProductSummary = {
  id: string
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  rating: number
  isFavorite: boolean
}

function toProductSummary(product: {
  id?: string
  _id?: unknown
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  rating: number
  isFavorite: boolean
}): ProductSummary {
  return {
    id: product.id ?? String(product._id),
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
    imagePath: product.imagePath,
    rating: product.rating,
    isFavorite: product.isFavorite
  }
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

export async function findProductById(id: string): Promise<ProductSummary | null> {
  const product = await ProductModel.findById(id)
  if (product) {
    return toProductSummary(product)
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
