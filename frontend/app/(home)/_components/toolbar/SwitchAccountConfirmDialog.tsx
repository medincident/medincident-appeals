"use client";

import { useCallback, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SwitchAccountConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwitchAccountConfirmDialog({ open, onOpenChange }: SwitchAccountConfirmDialogProps) {
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSwitch = useCallback(async () => {
    setIsSwitching(true);
    // Чистим локальную NextAuth-сессию и заново уходим в Zitadel с
    // prompt=select_account — там пользователь выберет другой аккаунт.
    await signOut({ redirect: false });
    await signIn(
      "zitadel",
      { redirectTo: window.location.pathname + window.location.search },
      { prompt: "select_account" },
    );
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Сменить аккаунт</DialogTitle>
          <DialogDescription className="pt-2">
            Текущая сессия будет завершена, и вы сможете войти под другим аккаунтом.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={isSwitching}>
              Отмена
            </Button>
          </DialogClose>
          <Button onClick={handleSwitch} disabled={isSwitching}>
            {isSwitching && <Loader2 className="mr-2 animate-spin" />}
            Сменить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
