"server only";

import { z } from "zod";
import { handleApiRequest } from "@/services/auth/client-helper";
import { userApi } from "@/services/auth/client";
import type { Result } from "@/domain/error";

export const UserProfileSchema = z.object({
  user: z
    .object({
      id: z.string().optional(),
      preferredLoginName: z.string().optional(),
      human: z
        .object({
          profile: z
            .object({
              givenName: z.string().optional(),
              familyName: z.string().optional(),
              nickName: z.string().optional(),
              displayName: z.string().optional(),
              preferredLanguage: z.string().optional(),
              gender: z.string().optional(),
              avatarUrl: z.string().optional(),
            })
            .catchall(z.any())
            .optional(),
          email: z
            .object({
              email: z.string().optional(),
              isVerified: z.boolean().optional(),
            })
            .catchall(z.any())
            .optional(),
        })
        .catchall(z.any())
        .optional(),
    })
    .catchall(z.any())
    .optional(),
}).catchall(z.any());

export type UserProfile = z.infer<typeof UserProfileSchema>;

export async function getProfile(userId: string): Promise<Result<UserProfile>> {
  return handleApiRequest(
    () => userApi.get(`/v2/users/${userId}`),
    UserProfileSchema
  );
}
