import { redirect } from "next/navigation";

// Zitadel RP-Initiated Logout (/oidc/v1/end_session) редиректит сюда после
// завершения OIDC-сессии. Единственная роль страницы — быстро увести
// пользователя на /login. URL должен быть зарегистрирован в Post Logout URIs
// соответствующего приложения в Zitadel.
export default function LogoutPage(): never {
  redirect("/login");
}
