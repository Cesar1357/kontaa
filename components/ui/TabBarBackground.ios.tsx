import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { View } from 'react-native';

export default function BlurTabBarBackground() {

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'transparent', // negro semitransparente real
      }}
    />
  );

}

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}
