import { View, Text } from 'react-native';

export function PaywallPlatformRow() {
  return (
    <View className="mb-6 items-center">
      <Text className="mb-3 text-sm text-muted-foreground">
        Trusted by creators on
      </Text>
      <View className="flex-row gap-3">
        {['TikTok', 'Instagram', 'YouTube'].map((platform) => (
          <View
            key={platform}
            className="rounded-full border border-border px-4 py-1.5"
          >
            <Text className="text-sm font-medium text-foreground">
              {platform}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
