import { View, Text } from 'react-native';
import { Check } from '@/lib/icons';

interface PaywallFeatureRowProps {
  boldText: string;
  text: string;
}

export function PaywallFeatureRow({ boldText, text }: PaywallFeatureRowProps) {
  return (
    <View className="mb-3 flex-row items-center gap-3">
      <View className="h-6 w-6 items-center justify-center rounded-full bg-success">
        <Check size={14} color="#ffffff" />
      </View>
      <Text className="flex-1 text-base text-foreground">
        <Text className="font-bold">{boldText}</Text>
        {text}
      </Text>
    </View>
  );
}
