import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { findUserById, updateUserProfile } from '../../modules/auth/user.repository'
import { findProductById } from '../../modules/commerce/product.repository'
import {
  addWishlistItem,
  findOrCreateWishlistByUserId,
  removeWishlistItem
} from '../../modules/commerce/wishlist.repository'
import { DEFAULT_USER_AVATAR_PATH } from '../../modules/auth/user.model'

type UpdateProfileBody = {
  firstName: string
  lastName: string
  phone?: string
  avatarPath?: string
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

const AVATAR_UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'avatars')
const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function normalizeProfileTextField(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    return value.value.trim()
  }

  return ''
}

function resolveAvatarExtension(filename?: string, mimetype?: string): string {
  const normalizedExtension = extname(filename ?? '').toLowerCase()
  if (normalizedExtension) {
    return normalizedExtension
  }

  switch (mimetype) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    default:
      return '.png'
  }
}

async function storeAvatarUpload(
  request: FastifyRequest & { parts: () => AsyncIterable<any> },
  userId: string,
  fastify: Parameters<FastifyPluginAsync>[0]
): Promise<{
  firstName: string
  lastName: string
  phone?: string
  avatarPath?: string
}> {
  const parts = request.parts()
  const updates: {
    firstName: string
    lastName: string
    phone?: string
    avatarPath?: string
  } = {
    firstName: '',
    lastName: ''
  }

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname !== 'avatar') {
        part.file.resume()
        continue
      }

      if (!ALLOWED_AVATAR_MIME_TYPES.has(part.mimetype)) {
        throw fastify.httpErrors.badRequest('Avatar must be a JPEG, PNG, WEBP, or GIF image')
      }

      await mkdir(AVATAR_UPLOAD_DIR, { recursive: true })

      const extension = resolveAvatarExtension(part.filename, part.mimetype)
      const fileName = `${userId}-${Date.now()}${extension}`
      const filePath = join(AVATAR_UPLOAD_DIR, fileName)

      await pipeline(part.file, createWriteStream(filePath))
      updates.avatarPath = `/uploads/avatars/${fileName}`
      continue
    }

    if (part.fieldname === 'firstName') {
      updates.firstName = normalizeProfileTextField(part.value)
      continue
    }

    if (part.fieldname === 'lastName') {
      updates.lastName = normalizeProfileTextField(part.value)
      continue
    }

    if (part.fieldname === 'phone') {
      updates.phone = normalizeProfileTextField(part.value) || undefined
      continue
    }

    if (part.fieldname === 'avatarPath') {
      updates.avatarPath = normalizeProfileTextField(part.value) || DEFAULT_USER_AVATAR_PATH
    }
  }

  if (!updates.firstName || !updates.lastName) {
    throw fastify.httpErrors.badRequest('First name and last name are required')
  }

  return updates
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
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Account'],
      summary: 'Get profile',
      description: 'Return the authenticated user profile.',
      security: [{ bearerAuth: [] }]
    }
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
        phone: user.phone ?? null,
        avatarPath: user.avatarPath
      }
    }
  })

  /**
   * Update user profile
   * @route PUT /users/profile
   * @description Update user profile
   * @response 200 - User profile updated
   * @response 400 - Bad request
   * @response 401 - Unauthorized
   * @response 404 - Not found
   * @response 500 - Internal server error
   */
  fastify.put<{ Body: UpdateProfileBody }>('/users/profile', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Account'],
      summary: 'Update profile',
      description: 'Update the authenticated user profile. Accepts JSON or multipart form data with an optional avatar file.',
      security: [{ bearerAuth: [] }],
      consumes: ['application/json', 'multipart/form-data'],
      body: {
        type: 'object',
        required: ['firstName', 'lastName'],
        additionalProperties: false,
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string', minLength: 1, maxLength: 30 },
          avatarPath: { type: 'string', minLength: 1, maxLength: 500 },
          avatar: { type: 'string', format: 'binary' }
        }
      }
    }
  }, async (request) => {
    const updateInput = request.isMultipart()
      ? await storeAvatarUpload(request as FastifyRequest & { parts: () => AsyncIterable<any> }, request.user.sub, fastify)
      : {
          firstName: normalizeProfileTextField(request.body.firstName),
          lastName: normalizeProfileTextField(request.body.lastName),
          phone: normalizeProfileTextField(request.body.phone) || undefined,
          avatarPath: normalizeProfileTextField(request.body.avatarPath) || undefined
        }

    if (!updateInput.firstName || !updateInput.lastName) {
      throw fastify.httpErrors.badRequest('First name and last name are required')
    }

    const updatedUser = await updateUserProfile(request.user.sub, updateInput)

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
        phone: updatedUser.phone ?? null,
        avatarPath: updatedUser.avatarPath
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
    preHandler: fastify.authenticate,
    schema: {
      tags: ['Wishlist'],
      summary: 'Get wishlist',
      description: 'Return the authenticated user wishlist.',
      security: [{ bearerAuth: [] }]
    }
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
      tags: ['Wishlist'],
      summary: 'Add wishlist item',
      description: 'Add a product to the authenticated user wishlist.',
      security: [{ bearerAuth: [] }],
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
      tags: ['Wishlist'],
      summary: 'Remove wishlist item',
      description: 'Remove a product from the authenticated user wishlist.',
      security: [{ bearerAuth: [] }],
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
