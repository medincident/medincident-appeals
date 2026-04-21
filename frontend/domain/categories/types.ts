export interface Subcategory {
  id: string
  name: string
  description?: string
}

export interface Category {
  id: string
  name: string
  description?: string
  subcategories?: Subcategory[]
}
