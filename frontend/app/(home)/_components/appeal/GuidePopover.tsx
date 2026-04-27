"use client"

import { HelpCircle } from "lucide-react"

import { ListPopup, type ListPopupItem } from "./ListPopup"

const TIPS: ListPopupItem[] = [
  {
    title: "Одно обращение — одна проблема",
    text: "Если вопросов несколько, оформите каждый отдельно — так быстрее разберут.",
  },
  {
    title: "Опишите ситуацию подробно",
    text: "Расскажите, что именно случилось, когда и где. Чем больше деталей — тем лучше.",
  },
  {
    title: "Не скрывайте симптомы",
    text: "Напишите, какие они, как долго длятся и насколько сильные.",
  },
]

export function GuidePopover() {
  return (
    <ListPopup
      trigger={
        <>
          <HelpCircle className="h-3 w-3" />
          Как писать
        </>
      }
      header={
        <>
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-popover-foreground">
            Как писать обращения
          </p>
        </>
      }
      items={TIPS}
    />
  )
}
