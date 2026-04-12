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
    name: profile?.displayName ?? [profile?.givenName, profile?.familyName].filter(Boolean).join(" "),
    initials: getInitials(profile?.givenName, profile?.familyName),
    avatarUrl: profile?.avatarUrl ?? null,
    email: email?.email ?? "",
    loginName: user?.preferredLoginName ?? "",
    position: "Пациент",
  });
}

function getInitials(givenName?: string, familyName?: string): string {
  return [(givenName ?? "")[0], (familyName ?? "")[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
}
