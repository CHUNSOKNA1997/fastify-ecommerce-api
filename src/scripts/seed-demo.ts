import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ProductModel } from '../modules/commerce/product.model'
import { UserModel } from '../modules/auth/user.model'
import { CartModel } from '../modules/commerce/cart.model'
import { WishlistModel } from '../modules/commerce/wishlist.model'
import { OrderModel } from '../modules/commerce/order.model'

const demoProducts = [
  {
    name: 'PhsarRohas Linen Shirt',
    description: 'Breathable linen shirt tailored for warm-weather daily wear.',
    price: 42,
    category: 'Unisex Wear',
    imagePath: '/assets/images/linen-shirt.svg',
    rating: 4.7,
    isFavorite: false,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  },
  {
    name: 'Market Runner Jacket',
    description: 'Lightweight outerwear with a clean street silhouette and matte finish.',
    price: 68,
    category: 'Male Wear',
    imagePath: '/assets/images/runner-jacket.svg',
    rating: 4.8,
    isFavorite: false,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  },
  {
    name: 'Silk Day Dress',
    description: 'Soft drape dress with a modern cut for everyday elegance.',
    price: 74,
    category: 'Female Wear',
    imagePath: '/assets/images/silk-dress.svg',
    rating: 4.9,
    isFavorite: true,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  },
  {
    name: 'Canvas Utility Tote',
    description: 'Structured carryall with reinforced handles and durable canvas body.',
    price: 24,
    category: 'Accessories',
    imagePath: '/assets/images/utility-tote.svg',
    rating: 4.5,
    isFavorite: false,
    isNewArrival: false,
    isTrending: false,
    isPopularNearYou: true
  },
  {
    name: 'City Walk Sneaker',
    description: 'Comfort-first sneaker with layered sole and low-profile upper.',
    price: 58,
    category: 'Footwear',
    imagePath: '/assets/images/city-walk-sneaker.svg',
    rating: 4.6,
    isFavorite: true,
    isNewArrival: false,
    isTrending: true,
    isPopularNearYou: true
  },
  {
    name: 'Rohas Knit Polo',
    description: 'Textured knit polo that sits between formal and casual.',
    price: 39,
    category: 'Male Wear',
    imagePath: '/assets/images/knit-polo.svg',
    rating: 4.4,
    isFavorite: false,
    isNewArrival: false,
    isTrending: false,
    isPopularNearYou: false
  },
  {
    name: 'Morning Pleat Skirt',
    description: 'Midi skirt with sharp pleats and an easy elastic waist.',
    price: 46,
    category: 'Female Wear',
    imagePath: '/assets/images/pleat-skirt.svg',
    rating: 4.3,
    isFavorite: false,
    isNewArrival: false,
    isTrending: false,
    isPopularNearYou: false
  },
  {
    name: 'Weekend Crossbody',
    description: 'Compact crossbody bag built for essentials and all-day use.',
    price: 33,
    category: 'Accessories',
    imagePath: '/assets/images/crossbody.svg',
    rating: 4.8,
    isFavorite: false,
    isNewArrival: false,
    isTrending: true,
    isPopularNearYou: true
  }
] as const

async function main() {
  const mongoUri = process.env.MONGODB_URI?.trim()
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(mongoUri)

  try {
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
          passwordHash
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

    const subTotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const vat = 350
    const deliveryFee = 150
    const total = Number((subTotal + vat + deliveryFee).toFixed(2))

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
