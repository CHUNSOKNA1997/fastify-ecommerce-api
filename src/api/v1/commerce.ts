import { FastifyPluginAsync } from 'fastify'
import {
  addCartItem,
  clearCart,
  findOrCreateCartByUserId,
  removeCartItem,
  updateCartItemQuantity
} from '../../modules/commerce/cart.repository'
import { listBanners } from '../../modules/commerce/banner.repository'
import {
  findProductById,
  listCategories,
  listNewArrivals,
  listPopularNearYou,
  listProducts,
  listTrendingNow
} from '../../modules/commerce/product.repository'
import {
  createOrder,
  listOrdersByUserId
} from '../../modules/commerce/order.repository'

type ProductListQuery = {
  search?: string
  category?: string
}

type ProductParams = {
  productId: string
}

type CartItemBody = {
  productId: string
  quantity: number
}

type CartItemParams = {
  itemId: string
}

type CartItemUpdateBody = {
  quantity: number
}

function formatMoney(value: number) {
  return Number(value.toFixed(2))
}

function serializeCart(cart: Awaited<ReturnType<typeof findOrCreateCartByUserId>>) {
  const items = cart.items.map((item) => ({
    id: String(item._id),
    productId: item.productId,
    name: item.name,
    category: item.category,
    imagePath: item.imagePath,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: formatMoney(item.unitPrice * item.quantity)
  }))
  const subTotal = formatMoney(items.reduce((sum, item) => sum + item.lineTotal, 0))
  const vat = items.length === 0 ? 0 : 350
  const deliveryFee = items.length === 0 ? 0 : 150
  const total = formatMoney(subTotal + vat + deliveryFee)

  return {
    id: cart.id ?? String(cart._id),
    items,
    summary: {
      subTotal,
      vat,
      deliveryFee,
      total
    },
    updatedAt: cart.updatedAt.toISOString()
  }
}

/**
 * Commerce routes
 * @param fastify 
 */
const commerceRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/banner', {
    schema: {
      tags: ['Catalog'],
      summary: 'List banners',
      description: 'Return home screen banner items for the storefront carousel.'
    }
  }, async () => {
    return {
      items: await listBanners()
    }
  })

  /**
   * List products
   * @route GET /products
   * @description List products with optional search and category filtering
   * @response 200 - List of products
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get<{ Querystring: ProductListQuery }>('/products', {
    schema: {
      tags: ['Catalog'],
      summary: 'List products',
      description: 'List products with optional search and category filtering.',
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 100 },
          category: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const products = await listProducts(request.query.search, request.query.category)

    return {
      items: products
    }
  })

  fastify.get('/products/new-arrivals', {
    schema: {
      tags: ['Catalog'],
      summary: 'List new arrivals',
      description: 'Return recently added products for the home screen.'
    }
  }, async () => {
    return {
      items: await listNewArrivals()
    }
  })

  fastify.get('/products/trending-now', {
    schema: {
      tags: ['Catalog'],
      summary: 'List trending products',
      description: 'Return trending products ranked by favorite flag and rating.'
    }
  }, async () => {
    return {
      items: await listTrendingNow()
    }
  })

  fastify.get('/products/popular-near-you', {
    schema: {
      tags: ['Catalog'],
      summary: 'List popular near you',
      description: 'Return high-performing products for local popularity sections.'
    }
  }, async () => {
    return {
      items: await listPopularNearYou()
    }
  })

  /**
   * List categories
   * @route GET /categories
   * @description List categories
   * @response 200 - List of categories
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get('/categories', {
    schema: {
      tags: ['Catalog'],
      summary: 'List categories',
      description: 'Return the list of product categories.'
    }
  }, async () => {
    return {
      items: await listCategories()
    }
  })

  /**
   * Get product by ID
   * @route GET /products/:productId
   * @description Get product by ID
   * @response 200 - Product details
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get<{ Params: ProductParams }>('/products/:productId', {
    schema: {
      tags: ['Catalog'],
      summary: 'Get product detail',
      description: 'Return a single product by its identifier.',
      params: {
        type: 'object',
        required: ['productId'],
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const product = await findProductById(request.params.productId)
    if (!product) {
      throw fastify.httpErrors.notFound('Product not found')
    }

    return {
      item: product
    }
  })

  /**
   * Get cart
   * @route GET /cart
   * @description Get cart
   * @response 200 - Cart details
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get('/cart', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Cart'],
      summary: 'Get cart',
      description: 'Return the authenticated user cart.',
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const cart = await findOrCreateCartByUserId(request.user.sub)

    return {
      cart: serializeCart(cart)
    }
  })

  /**
   * Add cart item
   * @route POST /cart/items
   * @description Add cart item
   * @response 201 - Cart item added
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.post<{ Body: CartItemBody }>('/cart/items', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Cart'],
      summary: 'Add cart item',
      description: 'Add a product to the authenticated user cart.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['productId', 'quantity'],
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1, maxLength: 100 },
          quantity: { type: 'integer', minimum: 1, maximum: 99 }
        }
      }
    }
  }, async (request, reply) => {
    const product = await findProductById(request.body.productId)
    if (!product) {
      throw fastify.httpErrors.notFound('Product not found')
    }

    const cart = await addCartItem(request.user.sub, {
      productId: product.id,
      name: product.name,
      category: product.category,
      imagePath: product.imagePath,
      unitPrice: product.price,
      quantity: request.body.quantity
    })

    reply.code(201)
    return {
      message: 'Item added to cart',
      cart: serializeCart(cart)
    }
  })

  /**
   * Update cart item
   * @route PUT /cart/items/:itemId
   * @description Update cart item
   * @response 200 - Cart item updated
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.put<{ Params: CartItemParams, Body: CartItemUpdateBody }>('/cart/items/:itemId', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Cart'],
      summary: 'Update cart item',
      description: 'Update the quantity of a cart item.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['itemId'],
        additionalProperties: false,
        properties: {
          itemId: { type: 'string', minLength: 1, maxLength: 100 }
        }
      },
      body: {
        type: 'object',
        required: ['quantity'],
        additionalProperties: false,
        properties: {
          quantity: { type: 'integer', minimum: 1, maximum: 99 }
        }
      }
    }
  }, async (request) => {
    const cart = await updateCartItemQuantity(request.user.sub, request.params.itemId, request.body.quantity)
    if (!cart) {
      throw fastify.httpErrors.notFound('Cart item not found')
    }

    return {
      message: 'Cart item updated',
      cart: serializeCart(cart)
    }
  })

  /**
   * Remove cart item
   * @route DELETE /cart/items/:itemId
   * @description Remove cart item
   * @response 200 - Cart item removed
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.delete<{ Params: CartItemParams }>('/cart/items/:itemId', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Cart'],
      summary: 'Remove cart item',
      description: 'Remove a cart item from the authenticated user cart.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['itemId'],
        additionalProperties: false,
        properties: {
          itemId: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const cart = await removeCartItem(request.user.sub, request.params.itemId)
    if (!cart) {
      throw fastify.httpErrors.notFound('Cart item not found')
    }

    return {
      message: 'Cart item removed',
      cart: serializeCart(cart)
    }
  })

  /**
   * Clear cart
   * @route DELETE /cart
   * @description Clear cart
   * @response 200 - Cart cleared
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.delete('/cart', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Cart'],
      summary: 'Clear cart',
      description: 'Remove all items from the authenticated user cart.',
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const cart = await clearCart(request.user.sub)

    return {
      message: 'Cart cleared',
      cart: serializeCart(cart)
    }
  })

  /**
   * Create order
   * @route POST /orders
   * @description Create order
   * @response 201 - Order created
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.post('/orders', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Orders'],
      summary: 'Create order',
      description: 'Create an order from the authenticated user cart.',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    const cart = await findOrCreateCartByUserId(request.user.sub)
    if (cart.items.length === 0) {
      throw fastify.httpErrors.badRequest('Cart is empty')
    }

    const serializedCart = serializeCart(cart)
    const order = await createOrder({
      userId: request.user.sub,
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        category: item.category,
        imagePath: item.imagePath,
        unitPrice: item.unitPrice,
        quantity: item.quantity
      })),
      subTotal: serializedCart.summary.subTotal,
      vat: serializedCart.summary.vat,
      deliveryFee: serializedCart.summary.deliveryFee,
      total: serializedCart.summary.total
    })

    reply.code(201)
    return {
      message: 'Order created',
      order: {
        id: order.id ?? String(order._id),
        status: order.status,
        subTotal: order.subTotal,
        vat: order.vat,
        deliveryFee: order.deliveryFee,
        total: order.total,
        createdAt: order.createdAt.toISOString()
      }
    }
  })

  /**
   * List orders
   * @route GET /orders
   * @description List orders
   * @response 200 - List of orders
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get('/orders', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Orders'],
      summary: 'List orders',
      description: 'List orders for the authenticated user.',
      security: [{ bearerAuth: [] }]
    }
  }, async (request) => {
    const orders = await listOrdersByUserId(request.user.sub)

    return {
      items: orders.map((order) => ({
        id: order.id ?? String(order._id),
        status: order.status,
        items: order.items,
        subTotal: order.subTotal,
        vat: order.vat,
        deliveryFee: order.deliveryFee,
        total: order.total,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString()
      }))
    }
  })
}

export default commerceRoutes
