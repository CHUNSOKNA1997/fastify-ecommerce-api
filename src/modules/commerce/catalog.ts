export type CatalogProduct = {
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

export const fallbackCatalog: CatalogProduct[] = [
  {
    id: '1',
    name: 'Abracadabra Shirt',
    description:
      'Crafted with attention to detail and designed for everyday confidence, this shirt blends comfort, style, and versatility.',
    price: 4000,
    category: 'Unisex Wear',
    imagePath: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80',
    imagePaths: [
      'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80'
    ],
    rating: 4.5,
    isFavorite: false,
    isNewArrival: false,
    isTrending: false,
    isPopularNearYou: true
  },
  {
    id: '2',
    name: 'Panther Jacket',
    description: 'A stylish and comfortable jacket perfect for any occasion.',
    price: 5500,
    category: 'Female Wear',
    imagePath: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    imagePaths: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=80'
    ],
    rating: 4.8,
    isFavorite: false,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  },
  {
    id: '3',
    name: 'Paul Elite Shoe',
    description: 'A clean silhouette with all-day comfort and an athletic edge.',
    price: 2500.89,
    category: 'Male Wear',
    imagePath: 'https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80',
    imagePaths: [
      'https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80'
    ],
    rating: 4.3,
    isFavorite: false,
    isNewArrival: false,
    isTrending: false,
    isPopularNearYou: false
  },
  {
    id: '4',
    name: 'Sambizza Fitz',
    description: 'A relaxed everyday essential designed for easy layering.',
    price: 6340,
    category: 'Male Wear',
    imagePath: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80',
    imagePaths: [
      'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80'
    ],
    rating: 4.6,
    isFavorite: false,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  }
]
