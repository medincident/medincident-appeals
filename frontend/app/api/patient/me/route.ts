import { auth } from "@/services/auth/auth";
import { getProfile } from "@/services/auth/requests/profile";

export async function GET() {
  const session = await auth();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session as any).userId as string;
  const result = await getProfile(userId);

  if (!result.success) {
    console.error("[patient/me] Profile fetch error:", result.error);
    return Response.json({ error: result.error.message }, { status: 500 });
  }

  const user = result.data.user;
  const profile = user?.human?.profile;
  const email = user?.human?.email;

  return Response.json({
    id: user?.id ?? "",
    firstName: profile?.givenName ?? "",
    lastName: profile?.familyName ?? "",
    email: email?.email ?? "",
    isEmailVerified: email?.isVerified ?? false,
    position: "Пациент",
    avatarUrl: profile?.avatarUrl ?? undefined,
  });
}
