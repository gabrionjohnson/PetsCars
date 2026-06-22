import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { OptionPicker } from '../components/OptionPicker';
import { colors, spacing, typography } from '../components/theme';
import { isProDevStubEnabled, isRevenueCatConfigured, setProDevStubEnabled } from '../billing/revenuecat';
import { getWarrantyAlertLeadDays, setWarrantyAlertLeadDays } from '../domain/warranty';
import { runBackgroundChecks } from '../domain/backgroundSync';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';

const LEAD_DAYS_OPTIONS = ['7', '14', '30', '60'];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home, isPro, refreshPro } = useAppState();
  const [devStub, setDevStub] = useState(false);
  const [leadDays, setLeadDays] = useState('30');
  const [checking, setChecking] = useState(false);
  const revenueCatConfigured = isRevenueCatConfigured();

  const load = useCallback(async () => {
    setDevStub(await isProDevStubEnabled());
    setLeadDays(String(await getWarrantyAlertLeadDays()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleToggleDevStub(value: boolean) {
    setDevStub(value);
    await setProDevStubEnabled(value);
    await refreshPro();
  }

  async function handleLeadDaysChange(value: string) {
    setLeadDays(value);
    await setWarrantyAlertLeadDays(parseInt(value, 10));
  }

  async function handleCheckNow() {
    if (!home) return;
    setChecking(true);
    try {
      const result = await runBackgroundChecks(home.id);
      Alert.alert(
        'Checked for updates',
        `${result.newRecalls} new recall match${result.newRecalls === 1 ? '' : 'es'}, ${result.warrantyAlerts} warranty alert${result.warrantyAlerts === 1 ? '' : 's'}.`
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScreenContainer>
      <SectionHeader title="Settings" />

      {home ? (
        <Card>
          <Text style={styles.label}>{home.nickname}</Text>
          {home.address ? <Text style={styles.muted}>{home.address}</Text> : null}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.label}>Warranty alert lead time</Text>
        <Text style={styles.muted}>Get notified this many days before a warranty expires.</Text>
        <OptionPicker
          options={LEAD_DAYS_OPTIONS.map((value) => ({ value, label: `${value} days` }))}
          value={leadDays}
          onChange={handleLeadDaysChange}
        />
      </Card>

      <Button label="Check for recalls & warranty alerts now" variant="secondary" onPress={handleCheckNow} loading={checking} />

      <Button label="Export home history" variant="secondary" onPress={() => navigation.navigate('Export')} />

      {!isPro ? (
        <Button label="Unlock Pro" onPress={() => navigation.navigate('Paywall')} />
      ) : null}

      {!revenueCatConfigured ? (
        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Dev: Pro enabled</Text>
              <Text style={styles.muted}>
                Billing isn't configured in this build. Use this to test Pro features locally.
              </Text>
            </View>
            <Switch value={devStub} onValueChange={handleToggleDevStub} />
          </View>
        </Card>
      ) : null}

      <Text style={styles.disclaimer}>
        Home-Ops keeps a personal record of what you've entered. It does not guarantee safety,
        warranty coverage, or legal compliance — verify details with manufacturers, warranty
        providers, or a licensed professional as needed.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.body, fontWeight: '600', color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1, marginRight: spacing.md },
  disclaimer: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.xl },
});
