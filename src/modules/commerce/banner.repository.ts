import { BannerModel } from './banner.model'

export type BannerSummary = {
  id: string
  title: string
  subtitle: string
  discountLabel?: string
  actionLabel: string
  imagePath: string
  backgroundColor: string
  accentColor?: string
  textColor?: string
}

const fallbackBanners: BannerSummary[] = [
  {
    id: 'banner-1',
    title: 'New Collection Available',
    subtitle: '50% discount for the first transaction.',
    discountLabel: '50% OFF',
    actionLabel: 'Shop now',
    imagePath: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=80',
    backgroundColor: '#ff6b1a',
    accentColor: '#ff944d',
    textColor: '#ffffff'
  },
  {
    id: 'banner-2',
    title: 'Accessories Week',
    subtitle: 'Fresh picks to complete every outfit.',
    discountLabel: 'New Drop',
    actionLabel: 'Explore',
    imagePath: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
    backgroundColor: '#7c4dff',
    accentColor: '#9f7bff',
    textColor: '#ffffff'
  },
  {
    id: 'banner-3',
    title: 'Weekend Streetwear',
    subtitle: 'Comfort-led layers for everyday movement.',
    discountLabel: 'Trending',
    actionLabel: 'See more',
    imagePath: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=80',
    backgroundColor: '#1f2937',
    accentColor: '#374151',
    textColor: '#ffffff'
  }
]

function toBannerSummary(banner: {
  id?: string
  _id?: unknown
  title: string
  subtitle: string
  discountLabel?: string
  actionLabel: string
  imagePath: string
  backgroundColor: string
  accentColor?: string
  textColor?: string
}): BannerSummary {
  return {
    id: banner.id ?? String(banner._id),
    title: banner.title,
    subtitle: banner.subtitle,
    discountLabel: banner.discountLabel,
    actionLabel: banner.actionLabel,
    imagePath: banner.imagePath,
    backgroundColor: banner.backgroundColor,
    accentColor: banner.accentColor,
    textColor: banner.textColor
  }
}

export async function listBanners(): Promise<BannerSummary[]> {
  const banners = await BannerModel.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 })
  if (banners.length > 0) {
    return banners.map(toBannerSummary)
  }

  return fallbackBanners
}
