import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../components/theme';
import {
  getAvailablePackages,
  isRevenueCatConfigured,
  purchasePackage,
  restorePurchases,
} from '../billing/revenuecat';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';

export function PaywallScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refreshPro } = useAppState();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [working, setWorking] = useState(false);
  const configured = isRevenueCatConfigured();

  useEffect(() => {
    if (!configured) return;
    getAvailablePackages().then(setPackages);
  }, [configured]);

  async function handlePurchase(pkg: PurchasesPackage) {
    setWorking(true);
    try {
      await purchasePackage(pkg);
      await refreshPro();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Purchase not completed', 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function handleRestore() {
    setWorking(true);
    try {
      await restorePurchases();
      await refreshPro();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not restore purchases', 'Please try again later.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Home-Ops Pro</Text>
      <Text style={styles.subtitle}>
        Unlock appliance tracking, recall alerts, warranty reminders, document storage, and full
        home-history export.
      </Text>

      {!configured ? (
        <Card>
          <Text style={styles.unavailable}>
            Purchases aren't available in this build yet. Check back once billing is configured.
          </Text>
        </Card>
      ) : packages.length === 0 ? (
        <Card>
          <Text style={styles.unavailable}>No plans available right now.</Text>
        </Card>
      ) : (
        packages.map((pkg) => (
          <Card key={pkg.identifier}>
            <Text style={styles.planTitle}>{pkg.product.title}</Text>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
            <Button label="Subscribe" onPress={() => handlePurchase(pkg)} loading={working} />
          </Card>
        ))
      )}

      {configured ? (
        <Button label="Restore purchases" variant="ghost" onPress={handleRestore} loading={working} />
      ) : null}
      <Button label="Not now" variant="ghost" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  unavailable: { ...typography.body, color: colors.textMuted },
  planTitle: { ...typography.heading, color: colors.text },
  planPrice: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
});
