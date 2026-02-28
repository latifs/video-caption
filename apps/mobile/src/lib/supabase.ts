import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    detectSessionInUrl: Platform.OS === "web",
    autoRefreshToken: true,
  },
});

// Handle deep link auth callbacks on native
if (Platform.OS !== "web") {
  Linking.addEventListener("url", ({ url }) => {
    const hashIndex = url.indexOf("#");
    if (hashIndex === -1) return;

    const params = new URLSearchParams(url.slice(hashIndex + 1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  });
}
