import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/notifications/setup';
import { setupNotificationChannels } from './src/notifications/setup';
import { configureRevenueCat } from './src/billing/revenuecat';
import { AppStateProvider } from './src/state/AppState';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    setupNotificationChannels();
    configureRevenueCat();
  }, []);

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <RootNavigator />
      </AppStateProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
