import "../../global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { Platform, View, useColorScheme } from "react-native";
import * as Linking from "expo-linking";
import { PortalHost } from "@rn-primitives/portal";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { lightThemeVars, darkThemeVars, THEME_COLORS, loadThemePreference } from "@/lib/theme";

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

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
        contentStyle: { backgroundColor: THEME_COLORS[colorScheme ?? "light"].background },
        animation: "default",
      }}
    />
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const themeVars = colorScheme === "dark" ? darkThemeVars : lightThemeVars;

  useEffect(() => {
    loadThemePreference();
  }, []);

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
      <View style={[{ flex: 1 }, themeVars]}>
        <AuthGate />
        <PortalHost />
      </View>
    </AuthProvider>
  );
}
