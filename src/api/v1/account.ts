import { extname } from 'node:path'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { findUserById, updateUserProfile } from '../../modules/auth/user.repository'
import { findProductById } from '../../modules/commerce/product.repository'
import {
  addWishlistItem,
  findOrCreateWishlistByUserId,
  removeWishlistItem
} from '../../modules/commerce/wishlist.repository'
import { getDefaultUserAvatarPath } from '../../modules/auth/user.model'
import { supabase, SUPABASE_AVATAR_BUCKET } from '../../lib/supabase'

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

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_AVATAR_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

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

function isAllowedAvatarFile(filename?: string, mimetype?: string): boolean {
  if (mimetype && ALLOWED_AVATAR_MIME_TYPES.has(mimetype)) {
    return true
  }

  const extension = extname(filename ?? '').toLowerCase()
  return ALLOWED_AVATAR_EXTENSIONS.has(extension)
}

async function uploadAvatarToSupabase(
  part: any,
  userId: string,
  fastify: Parameters<FastifyPluginAsync>[0]
): Promise<string> {
  const extension = resolveAvatarExtension(part.filename, part.mimetype)
  const fileName = `${userId}-${Date.now()}${extension}`
  const storagePath = `avatars/${userId}/${fileName}`
  const chunks: Buffer[] = []

  for await (const chunk of part.file) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const fileBuffer = Buffer.concat(chunks)

  const { error } = await supabase.storage
    .from(SUPABASE_AVATAR_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: part.mimetype || 'application/octet-stream',
      upsert: true,
      cacheControl: '3600'
    })

  if (error) {
    fastify.log.error(error)
    throw fastify.httpErrors.internalServerError('Failed to upload avatar')
  }

  const { data } = supabase.storage
    .from(SUPABASE_AVATAR_BUCKET)
    .getPublicUrl(storagePath)

  if (!data.publicUrl) {
    throw fastify.httpErrors.internalServerError('Failed to resolve avatar URL')
  }

  return data.publicUrl
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

      if (!isAllowedAvatarFile(part.filename, part.mimetype)) {
        throw fastify.httpErrors.badRequest('Avatar must be a JPEG, PNG, WEBP, or GIF image')
      }

      updates.avatarPath = await uploadAvatarToSupabase(part, userId, fastify)
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
      updates.avatarPath = normalizeProfileTextField(part.value) || getDefaultUserAvatarPath()
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
      consumes: ['application/json', 'multipart/form-data']
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
