import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { session, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/" />;
  }

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Sign in failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-7">
      <View className="mb-5 h-[72px] w-[72px] items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40">
        <Text className="text-2xl font-extrabold tracking-wider text-white">
          VC
        </Text>
      </View>
      <Text className="mb-2 text-3xl font-extrabold text-foreground">
        Video Caption
      </Text>
      <Text className="mb-10 text-base text-accent">Sign in to continue</Text>

      <View className="w-full">
        <Text className="mb-2 text-xs font-semibold tracking-wide text-accent">
          EMAIL
        </Text>
        <TextInput
          className="mb-5 w-full rounded-xl border-[1.5px] border-[#2A2A4A] bg-muted p-4 text-base text-foreground"
          placeholder="you@example.com"
          placeholderTextColor="#6B6B8D"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <Text className="mb-2 text-xs font-semibold tracking-wide text-accent">
          PASSWORD
        </Text>
        <TextInput
          className="mb-5 w-full rounded-xl border-[1.5px] border-[#2A2A4A] bg-muted p-4 text-base text-foreground"
          placeholder="Enter your password"
          placeholderTextColor="#6B6B8D"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.8}
          className={`mt-2 items-center rounded-xl bg-primary py-4 shadow-lg shadow-primary/30 ${loading ? "opacity-60" : ""}`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-lg font-bold tracking-wide text-white">
              Sign In
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
