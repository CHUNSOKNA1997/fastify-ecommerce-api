import { FastifyPluginAsync } from 'fastify'
import { findUserById, updateUserProfile } from '../../modules/auth/user.repository'
import { findProductById } from '../../modules/commerce/product.repository'
import {
  addWishlistItem,
  findOrCreateWishlistByUserId,
  removeWishlistItem
} from '../../modules/commerce/wishlist.repository'

type UpdateProfileBody = {
  firstName: string
  lastName: string
  phone?: string
}

type WishlistBody = {
  productId: string
}

type WishlistParams = {
  productId: string
}

function serializeWishlist(wishlist: Awaited<ReturnType<typeof findOrCreateWishlistByUserId>>) {
  return {
    items: wishlist.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      imagePath: item.imagePath,
      rating: item.rating
    })),
    updatedAt: wishlist.updatedAt.toISOString()
  }
}

/**
 * Account routes
 * @param fastify 
 */
const accountRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * Get user profile
   * @route GET /users/profile
   * @description Get user profile
   * @response 200 - User profile
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get('/users/profile', {
    preHandler: fastify.authenticate
  }, async (request) => {
    const user = await findUserById(request.user.sub)
    if (!user) {
      throw fastify.httpErrors.unauthorized('User no longer exists')
    }

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? null
      }
    }
  })

  /**
   * Update user profile
   * @route PATCH /users/profile
   * @description Update user profile
   * @response 200 - User profile updated
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.patch<{ Body: UpdateProfileBody }>('/users/profile', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['firstName', 'lastName'],
        additionalProperties: false,
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string', minLength: 1, maxLength: 30 }
        }
      }
    }
  }, async (request) => {
    const updatedUser = await updateUserProfile(request.user.sub, {
      firstName: request.body.firstName.trim(),
      lastName: request.body.lastName.trim(),
      phone: request.body.phone
    })

    if (!updatedUser) {
      throw fastify.httpErrors.notFound('User not found')
    }

    return {
      message: 'Profile updated',
      user: {
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phone: updatedUser.phone ?? null
      }
    }
  })

  /**
   * Get wishlist
   * @route GET /wishlist
   * @description Get wishlist
   * @response 200 - Wishlist details
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.get('/wishlist', {
    preHandler: fastify.authenticate
  }, async (request) => {
    const wishlist = await findOrCreateWishlistByUserId(request.user.sub)

    return {
      wishlist: serializeWishlist(wishlist)
    }
  })

  /**
   * Add wishlist item
   * @route POST /wishlist/items
   * @description Add wishlist item
   * @response 201 - Wishlist item added
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.post<{ Body: WishlistBody }>('/wishlist/items', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['productId'],
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request, reply) => {
    const product = await findProductById(request.body.productId)
    if (!product) {
      throw fastify.httpErrors.notFound('Product not found')
    }

    const wishlist = await addWishlistItem(request.user.sub, {
      productId: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      imagePath: product.imagePath,
      rating: product.rating
    })

    reply.code(201)
    return {
      message: 'Item added to wishlist',
      wishlist: serializeWishlist(wishlist)
    }
  })

  /**
   * Remove wishlist item
   * @route DELETE /wishlist/items/:productId
   * @description Remove wishlist item
   * @response 200 - Wishlist item removed
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.delete<{ Params: WishlistParams }>('/wishlist/items/:productId', {
    preHandler: fastify.authenticate,
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
    const wishlist = await removeWishlistItem(request.user.sub, request.params.productId)
    if (!wishlist) {
      throw fastify.httpErrors.notFound('Wishlist item not found')
    }

    return {
      message: 'Item removed from wishlist',
      wishlist: serializeWishlist(wishlist)
    }
  })
}

export default accountRoutes
