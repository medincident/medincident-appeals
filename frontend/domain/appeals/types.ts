export type AppealStatus =
  | "pending"
  | "processing"
  | "processed"
  | "resolved"
  | "rejected"

export interface AppealCategory {
  id: string
  name: string
}

export interface Appeal {
  id: string
  text: string
  summary: string
  formalizedText: string
  theses: string[]
  category: AppealCategory | null
  subcategory: AppealCategory | null
  isImportant: boolean
  importantConfidence?: number
  status: AppealStatus
  createdAt: string
}

export interface NlpAnalyzeResult {
  is_important: boolean
  important_confidence?: number
  reason?: string
  formalized_text?: string
  theses?: string[]
  category?: AppealCategory | null
  subcategory?: AppealCategory | null
}

export interface AppealFilters {
  search?: string
  categoryId?: string
  subcategoryId?: string
}
