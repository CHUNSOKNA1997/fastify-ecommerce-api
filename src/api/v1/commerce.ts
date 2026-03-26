import { FastifyPluginAsync } from 'fastify'
import {
  addCartItem,
  clearCart,
  findOrCreateCartByUserId,
  removeCartItem,
  updateCartItemQuantity
} from '../../modules/commerce/cart.repository'
import {
  findProductById,
  listCategories,
  listProducts
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

const commerceRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Querystring: ProductListQuery }>('/products', {
    schema: {
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

  fastify.get('/categories', async () => {
    return {
      items: await listCategories()
    }
  })

  fastify.get<{ Params: ProductParams }>('/products/:productId', {
    schema: {
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

  fastify.get('/cart', {
    preHandler: fastify.authenticate
  }, async (request) => {
    const cart = await findOrCreateCartByUserId(request.user.sub)

    return {
      cart: serializeCart(cart)
    }
  })

  fastify.post<{ Body: CartItemBody }>('/cart/items', {
    preHandler: fastify.authenticate,
    schema: {
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

  fastify.patch<{ Params: CartItemParams, Body: CartItemUpdateBody }>('/cart/items/:itemId', {
    preHandler: fastify.authenticate,
    schema: {
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

  fastify.delete<{ Params: CartItemParams }>('/cart/items/:itemId', {
    preHandler: fastify.authenticate,
    schema: {
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

  fastify.delete('/cart', {
    preHandler: fastify.authenticate
  }, async (request) => {
    const cart = await clearCart(request.user.sub)

    return {
      message: 'Cart cleared',
      cart: serializeCart(cart)
    }
  })

  fastify.post('/orders', {
    preHandler: fastify.authenticate
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

    await clearCart(request.user.sub)

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

  fastify.get('/orders', {
    preHandler: fastify.authenticate
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
