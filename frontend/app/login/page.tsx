import { Suspense } from "react";
import { AutoSignIn } from "@/components/auth/auto-sign-in";

export default function LoginPage() {
  return (
    <Suspense>
      <AutoSignIn />
    </Suspense>
  );
}
