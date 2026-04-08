import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ProductModel } from '../modules/commerce/product.model'
import { UserModel } from '../modules/auth/user.model'
import { CartModel } from '../modules/commerce/cart.model'
import { WishlistModel } from '../modules/commerce/wishlist.model'
import { OrderModel } from '../modules/commerce/order.model'

type FakeStoreProduct = {
  id: number
  title: string
  price: number
  description: string
  category: string
  image: string
  rating?: {
    rate?: number
  }
}

const fallbackProducts: FakeStoreProduct[] = [
  {
    id: 1,
    title: 'Fallback Linen Shirt',
    price: 42,
    description: 'Breathable shirt for everyday wear.',
    category: 'fashion',
    image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80',
    rating: { rate: 4.6 }
  },
  {
    id: 2,
    title: 'Fallback Day Dress',
    price: 74,
    description: 'Soft dress with a modern silhouette.',
    category: 'fashion',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    rating: { rate: 4.9 }
  },
  {
    id: 3,
    title: 'Fallback Crossbody',
    price: 33,
    description: 'Compact bag for daily carry.',
    category: 'accessories',
    image: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80',
    rating: { rate: 4.7 }
  },
  {
    id: 4,
    title: 'Fallback Sneakers',
    price: 58,
    description: 'Comfort-first sneaker for city walks.',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
    rating: { rate: 4.5 }
  }
]

function formatMoney(value: number) {
  return Number(value.toFixed(2))
}

function getVatAmount(subTotal: number) {
  return subTotal <= 0 ? 0 : formatMoney(subTotal * 0.1)
}

function getDeliveryFee(subTotal: number) {
  return subTotal <= 0 ? 0 : 2
}

function normalizeCategory(category: string): string {
  const value = category.trim().toLowerCase()

  switch (value) {
    case "men's clothing":
      return 'Male Wear'
    case "women's clothing":
      return 'Female Wear'
    case 'jewelery':
      return 'Accessories'
    case 'electronics':
      return 'Accessories'
    default:
      return category.trim() || 'General'
  }
}

function toSeedProduct(product: FakeStoreProduct, index: number) {
  const image = product.image.trim()

  return {
    name: product.title.trim(),
    description: product.description.trim() || product.title.trim(),
    price: Number(product.price),
    category: normalizeCategory(product.category),
    imagePath: image,
    imagePaths: [image, image, image],
    rating: Math.max(0, Math.min(5, Number(product.rating?.rate ?? 4))),
    isFavorite: index % 3 === 0,
    isNewArrival: index < 4,
    isTrending: index < 6,
    isPopularNearYou: index < 8
  }
}

async function fetchFakeStoreProducts(): Promise<FakeStoreProduct[]> {
  const response = await fetch('https://fakestoreapi.com/products')
  if (!response.ok) {
    throw new Error(`Fake Store API request failed with status ${response.status}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Fake Store API did not return a product array')
  }

  return data as FakeStoreProduct[]
}

async function main() {
  const mongoUri = process.env.MONGODB_URI?.trim()
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(mongoUri)

  try {
    let sourceProducts: FakeStoreProduct[]

    try {
      sourceProducts = await fetchFakeStoreProducts()
    } catch (error) {
      console.warn('Falling back to local seed products because Fake Store API fetch failed.')
      console.warn(error)
      sourceProducts = fallbackProducts
    }

    const demoProducts = sourceProducts
      .slice(0, 12)
      .map((product, index) => toSeedProduct(product, index))

    const seededProducts = []

    for (const product of demoProducts) {
      const savedProduct = await ProductModel.findOneAndUpdate(
        { name: product.name },
        { $set: product },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )

      seededProducts.push(savedProduct)
    }

    const passwordHash = await bcrypt.hash('password123', 10)
    const demoUser = await UserModel.findOneAndUpdate(
      { email: 'demo@phsarrohas.com' },
      {
        $set: {
          firstName: 'Demo',
          lastName: 'Shopper',
          phone: '012345678',
          passwordHash,
          isEmailVerified: true
        },
        $setOnInsert: {
          tokenVersion: 0
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    const wishlistItems = seededProducts.slice(0, 2).map((product) => ({
      productId: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      imagePath: product.imagePath,
      rating: product.rating
    }))

    const cartItems = seededProducts.slice(2, 4).map((product, index) => ({
      productId: product.id,
      name: product.name,
      category: product.category,
      imagePath: product.imagePath,
      unitPrice: product.price,
      quantity: index + 1
    }))

    const subTotal = formatMoney(cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))
    const vat = getVatAmount(subTotal)
    const deliveryFee = getDeliveryFee(subTotal)
    const total = formatMoney(subTotal + vat + deliveryFee)

    await WishlistModel.findOneAndUpdate(
      { userId: demoUser._id },
      { $set: { items: wishlistItems } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    await CartModel.findOneAndUpdate(
      { userId: demoUser._id },
      { $set: { items: cartItems } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    await OrderModel.deleteMany({ userId: demoUser._id })
    await OrderModel.create({
      userId: demoUser._id,
      items: cartItems,
      subTotal,
      vat,
      deliveryFee,
      total,
      status: 'PENDING'
    })

    console.log(JSON.stringify({
      message: 'Demo seed completed',
      productsSeeded: seededProducts.length,
      source: sourceProducts === fallbackProducts ? 'fallback' : 'fakestoreapi',
      categories: Array.from(new Set(seededProducts.map((product) => product.category))).sort(),
      demoUser: {
        email: demoUser.email,
        password: 'password123'
      }
    }, null, 2))
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
