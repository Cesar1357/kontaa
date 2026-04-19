import { useColorScheme } from '@/hooks/useColorScheme';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';
import { useNotifications } from '../hooks/useNotifications';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    onFetchUpdateAsync(); 
  }, []);

  async function onFetchUpdateAsync() {
    try {
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      }
    } catch (error) {
      // You can also add an alert() to see the error message in case of an error when fetching updates.
    }
  }
  useNotifications();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <PaperProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'black' },
              }}>
              
              <Stack.Screen name="(sesion)/create" options={{
                presentation: 'transparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }}/>
              <Stack.Screen name="(sesion)/login" options={{
                presentation: 'transparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }}/>
              <Stack.Screen name="(sesion)/forgotPassword" options={{
                presentation: 'transparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }}/>
              <Stack.Screen name="(screens)/Settings" options={{
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: 'transparent' },
              }} />

              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="auto" />
          </PaperProvider>
        </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
