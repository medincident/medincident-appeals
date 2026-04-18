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
  status: AppealStatus
  createdAt: string
}

export interface NlpAnalyzeResult {
  is_important: boolean
  reason?: string
  formalized_text?: string
  theses?: string[]
  category?: AppealCategory | null
  subcategory?: AppealCategory | null
}
