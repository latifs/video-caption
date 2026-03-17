import "../../global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { PortalHost } from "@rn-primitives/portal";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const onLoginPage = segments[0] === "login";

    if (!session && !onLoginPage) {
      router.replace("/login");
    } else if (session && onLoginPage) {
      router.replace("/");
    }
  }, [session, loading, segments]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#111" },
        animation: "default",
      }}
    />
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Linking.addEventListener("url", ({ url }) => {
      const hashIndex = url.indexOf("#");
      if (hashIndex === -1) return;

      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch((err) =>
          console.error("Failed to set session from deep link:", err)
        );
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <AuthProvider>
      <AuthGate />
      <PortalHost />
    </AuthProvider>
  );
}
