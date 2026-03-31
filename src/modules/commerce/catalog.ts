export type CatalogProduct = {
  id: string
  name: string
  description: string
  price: number
  category: string
  imagePath: string
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
    imagePath: '/assets/images/purple-hoodie.svg',
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
    imagePath: '/assets/images/orange-coat.svg',
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
    imagePath: '/assets/images/city-walk-sneaker.svg',
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
    imagePath: '/assets/images/purple-hoodie.svg',
    rating: 4.6,
    isFavorite: false,
    isNewArrival: true,
    isTrending: true,
    isPopularNearYou: true
  }
]
