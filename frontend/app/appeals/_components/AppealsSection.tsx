import * as React from "react"

import type { Appeal } from "@/domain/appeals/types"

import { AppealCard } from "./AppealCard"
import { SectionHeader } from "./SectionHeader"

interface AppealsSectionProps {
  title: string
  icon: React.ReactNode
  appeals: Appeal[]
  expandedIds: Set<string>
  onToggle: (id: string) => void
  selectId: string | null
  selectedRef: React.RefObject<HTMLDivElement | null>
}

export function AppealsSection({
  title, icon, appeals, expandedIds, onToggle, selectId, selectedRef,
}: AppealsSectionProps) {
  if (appeals.length === 0) return null
  return (
    <section>
      <SectionHeader title={title} count={appeals.length} icon={icon} />
      <div className="space-y-2">
        {appeals.map((a) => (
          <AppealCard
            key={a.id}
            appeal={a}
            expanded={expandedIds.has(a.id)}
            highlighted={a.id === selectId}
            onToggle={() => onToggle(a.id)}
            cardRef={a.id === selectId ? selectedRef : undefined}
          />
        ))}
      </div>
    </section>
  )
}
