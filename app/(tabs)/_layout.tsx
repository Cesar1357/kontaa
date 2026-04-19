import { HapticTab } from '@/components/HapticTab';
import { Tabs } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: "green",
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarShowLabel:false,
            tabBarStyle: Platform.select({
              default: {
                borderTopWidth: 1,
                elevation: 1,  
              },
            }),
          }}>
          <Tabs.Screen
            name="index"
            options={{
              tabBarIcon: ({ color }) =>  <Ionicons name={"home"} size={30} color={color} style={{overflow: 'visible',width:40,height:40,marginTop:27}}/>,
            }}
          />
          <Tabs.Screen
            name="HistorialScreen"
            options={{
              tabBarIcon: ({ color }) =>  <Ionicons name={"analytics"} size={30} color={color} style={{overflow: 'visible',width:40,height:40,marginTop:27}}/>,
            }}
          />
          <Tabs.Screen
            name="PresupuestosScreen"
            options={{
              tabBarIcon: ({ color }) =>  <Ionicons name={"bar-chart"} size={30} color={color} style={{overflow: 'visible',width:40,height:40,marginTop:27}}/>,
            }}
          />
          <Tabs.Screen
            name="AhorrosScreen"
            options={{
              tabBarIcon: ({ color }) =>  <Ionicons name={"cash"} size={30} color={color} style={{overflow: 'visible',width:40,height:40,marginTop:27}}/>,
            }}
          />
        </Tabs>
  );
}
