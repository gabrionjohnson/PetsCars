import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { AddTaskScreen } from '../screens/AddTaskScreen';
import { ApplianceDetailScreen } from '../screens/ApplianceDetailScreen';
import { AddApplianceScreen } from '../screens/AddApplianceScreen';
import { AddWarrantyScreen } from '../screens/AddWarrantyScreen';
import { AddDocumentScreen } from '../screens/AddDocumentScreen';
import { ExportScreen } from '../screens/ExportScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { colors } from '../components/theme';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { ready, home } = useAppState();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }}>
        {!home ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
            <Stack.Screen name="AddTask" component={AddTaskScreen} options={{ title: 'Add task' }} />
            <Stack.Screen name="ApplianceDetail" component={ApplianceDetailScreen} options={{ title: 'Appliance' }} />
            <Stack.Screen name="AddAppliance" component={AddApplianceScreen} options={{ title: 'Add appliance' }} />
            <Stack.Screen name="AddWarranty" component={AddWarrantyScreen} options={{ title: 'Add warranty' }} />
            <Stack.Screen name="AddDocument" component={AddDocumentScreen} options={{ title: 'Add document' }} />
            <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'Export' }} />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ presentation: 'modal', title: 'Home-Ops Pro' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
