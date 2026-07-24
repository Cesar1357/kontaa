import { HapticTab } from '@/components/HapticTab';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Tabs } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarBackground = useThemeColor({ light: '#FFFFFF', dark: '#111827' }, 'cardsMain');
  const tabBarInactive = useThemeColor({ light: '#9CA3AF', dark: '#6B7280' }, 'icon');

  return (
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: "#22C55E",
            tabBarInactiveTintColor: tabBarInactive,
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarShowLabel:false,
            tabBarStyle: Platform.select({
              default: {
                borderTopWidth: 1,
                borderColor: tabBarBackground,
                elevation: 1,
                backgroundColor: tabBarBackground,
                height: 60 + insets.bottom,
                paddingBottom: Math.max(insets.bottom, 8),
                paddingTop: 8,
              },
            }),
          }}>
          <Tabs.Screen
            name="index"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="home" size={27} color={color} />,
            }}
          />
          <Tabs.Screen
            name="HistorialScreen"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="analytics" size={27} color={color} />,
            }}
          />
          <Tabs.Screen
            name="PresupuestosScreen"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="bar-chart" size={27} color={color} />,
            }}
          />
          <Tabs.Screen
            name="AhorrosScreen"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="cash" size={27} color={color} />,
            }}
          />
        </Tabs>
  );
}
