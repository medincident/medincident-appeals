import { WifiOff } from "lucide-react"

export const metadata = {
  title: "Нет подключения — AI MedIncident",
}

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        <WifiOff className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Нет подключения</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Проверьте интернет. Уже написанные обращения сохранятся локально и
        отправятся, как только сеть вернётся.
      </p>
    </div>
  )
}
