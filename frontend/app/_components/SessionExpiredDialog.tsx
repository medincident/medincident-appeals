"use client"

import * as React from "react"
import { signIn } from "next-auth/react"
import { LogIn } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SessionExpiredDialogProps {
  open: boolean
}

export function SessionExpiredDialog({ open }: SessionExpiredDialogProps) {
  const [pending, setPending] = React.useState(false)

  async function handleLogin() {
    setPending(true)
    // signIn редиректит на Zitadel; если OIDC-сессия жива, Zitadel молча
    // отдаёт токен назад — пользователь не увидит форму логина.
    await signIn("zitadel", { redirectTo: window.location.pathname + window.location.search })
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>Сессия завершена</DialogTitle>
          <DialogDescription>
            Вас разлогинило — срок действия сессии истёк. Войдите заново, чтобы
            продолжить работу.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleLogin} disabled={pending} className="gap-1.5">
            <LogIn className="h-4 w-4" />
            {pending ? "Перенаправляем…" : "Войти заново"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
