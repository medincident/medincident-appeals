"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localLogoutAction, logoutAction } from "@/services/auth/actions";

interface LogoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogoutConfirmDialog({ open, onOpenChange }: LogoutConfirmDialogProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [endEverywhere, setEndEverywhere] = useState(false);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    // «Завершить сессию» → глобальный logout через Zitadel /oidc/v1/end_session;
    // иначе только локальный выход (OIDC-сессия в Zitadel остаётся живой).
    if (endEverywhere) {
      await logoutAction();
    } else {
      await localLogoutAction();
    }
  }, [endEverywhere]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Выход из системы</DialogTitle>
          <DialogDescription className="pt-2">
            Вы уверены, что хотите завершить текущую сессию на этом устройстве?
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 rounded-lg section-surface p-3">
          <Checkbox
            name="endEverywhere"
            checked={endEverywhere}
            onCheckedChange={setEndEverywhere}
            disabled={isLoggingOut}
            align="center"
          >
            <span className="text-sm font-medium text-foreground">Завершить сессию</span>
          </Checkbox>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={isLoggingOut}>
              Отмена
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut && <Loader2 className="mr-2 animate-spin" />}
            Выйти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
