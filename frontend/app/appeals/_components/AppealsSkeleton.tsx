import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function AppealsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4 space-y-2.5">
          <div className="flex justify-between items-start gap-3">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-5 w-28 rounded-full shrink-0" />
          </div>
          <Skeleton className="h-3 w-24" />
        </Card>
      ))}
    </div>
  )
}
