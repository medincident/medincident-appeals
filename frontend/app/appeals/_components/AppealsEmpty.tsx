import Link from "next/link"
import { MessageSquare, SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"

interface AppealsEmptyProps {
  hasFilters: boolean
  onReset: () => void
}

export function AppealsEmpty({ hasFilters, onReset }: AppealsEmptyProps) {
  const Icon = hasFilters ? SearchX : MessageSquare
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "Ничего не найдено" : "Обращений пока нет"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {hasFilters ? "Попробуйте изменить запрос или сбросить фильтры" : "Создайте первое обращение"}
        </p>
      </div>
      {hasFilters ? (
        <Button size="sm" variant="outline" className="text-xs mt-1" onClick={onReset}>
          Сбросить
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline" className="text-xs mt-1">
          <Link href="/">Оставить обращение</Link>
        </Button>
      )}
    </div>
  )
}
