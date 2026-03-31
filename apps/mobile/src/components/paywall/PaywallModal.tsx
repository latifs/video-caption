import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { X, Star } from '@/lib/icons';
import { PaywallFeatureRow } from './PaywallFeatureRow';
import { PaywallPlatformRow } from './PaywallPlatformRow';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const FEATURES: { boldText: string; text: string }[] = [
  { boldText: 'UNLIMITED videos', text: ' with precise auto-captions' },
  { boldText: 'Ad-free', text: ' experience for faster, focused editing' },
  { boldText: 'Export videos', text: ' with no watermarks' },
  { boldText: 'Priority Processing', text: ' for faster generation ⚡' },
];

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const anim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      anim.value = withTiming(1, { duration: 300 });
    } else {
      anim.value = 0;
    }
  }, [visible, anim]);

  const animateOut = (callback: () => void) => {
    anim.value = withTiming(0, { duration: 250 });
    setTimeout(callback, 250);
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(anim.value, [0, 1], [SCREEN_HEIGHT, 0]) },
    ],
  }));

  const handleSubscribe = () => {
    Alert.alert('Coming soon', 'Subscriptions are coming soon!');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => animateOut(onClose)}
    >
      <Animated.View className="flex-1 bg-background" style={sheetStyle}>
        {/* Close button */}
        <View className="absolute right-5 top-14 z-10">
          <TouchableOpacity
            onPress={() => animateOut(onClose)}
            className="h-9 w-9 items-center justify-center rounded-full bg-card"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} className="text-foreground" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="items-center px-6 pt-16">
            <Text className="mb-6 text-sm text-muted-foreground">
              You've used up your{' '}
              <Text className="font-semibold text-primary">free video</Text>
            </Text>

            <Text className="mb-2 text-center text-3xl font-bold text-foreground">
              Unlock Video Caption App Pro
            </Text>
            <Text className="mb-6 text-center text-base text-muted-foreground">
              Create captions people actually finish watching
            </Text>

            {/* Rating */}
            <View className="mb-6 items-center">
              <View className="mb-1 flex-row gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    size={20}
                    color="#F59E0B"
                    fill="#F59E0B"
                  />
                ))}
              </View>
              <Text className="text-sm font-semibold text-foreground">
                4.8 stars
              </Text>
              <Text className="text-xs text-muted-foreground">
                8000+ reviews
              </Text>
            </View>
          </View>

          {/* Features */}
          <View className="mb-6 px-6">
            {FEATURES.map((feature) => (
              <PaywallFeatureRow
                key={feature.boldText}
                boldText={feature.boldText}
                text={feature.text}
              />
            ))}
          </View>

          {/* Platform row */}
          <PaywallPlatformRow />

          {/* Pricing card */}
          <View className="mx-6 mb-6 rounded-2xl border border-border bg-card p-5">
            <Text className="mb-1 text-center text-2xl font-bold text-foreground">
              $14.99 / month
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              Unlimited videos · Cancel anytime
            </Text>
          </View>

          {/* CTA */}
          <View className="mx-6">
            <TouchableOpacity
              className="items-center rounded-2xl bg-primary py-4"
              onPress={handleSubscribe}
            >
              <Text className="text-lg font-bold text-primary-foreground">
                Unlock Full Access
              </Text>
            </TouchableOpacity>

            <Text className="mt-3 text-center text-xs text-muted-foreground">
              Cancel anytime · Already purchased?
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
