import { getSupabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export async function authenticateRequest(
  request: Request
): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await getSupabase().auth.getUser(token);

  if (error || !user) return null;
  return user;
}
