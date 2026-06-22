import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { ProGate } from '../components/ProGate';
import { colors, spacing, typography } from '../components/theme';
import { listAppliancesForHome } from '../db/queries/appliances';
import { listRecallMatchesForHome } from '../db/queries/recalls';
import { runBackgroundChecks } from '../domain/backgroundSync';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { Appliance, RecallMatch } from '../types/models';

export function AppliancesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home, isPro } = useAppState();
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [recallMatches, setRecallMatches] = useState<RecallMatch[]>([]);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    if (!home) return;
    setAppliances(await listAppliancesForHome(home.id));
    setRecallMatches(await listRecallMatchesForHome(home.id));
  }, [home]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCheckRecalls() {
    if (!home) return;
    setChecking(true);
    try {
      const result = await runBackgroundChecks(home.id);
      await load();
      Alert.alert(
        'Checked for updates',
        result.newRecalls > 0
          ? `Found ${result.newRecalls} new recall match${result.newRecalls === 1 ? '' : 'es'}.`
          : 'No new recalls found.'
      );
    } finally {
      setChecking(false);
    }
  }

  if (!home) return null;

  function recallCountFor(applianceId: number): number {
    return recallMatches.filter((m) => m.applianceId === applianceId && m.status === 'new').length;
  }

  return (
    <ScreenContainer scroll={false}>
      <ProGate
        isPro={isPro}
        title="Appliances & recalls is a Pro feature"
        message="Track your appliances, warranties, and get notified about safety recalls."
        onUnlock={() => navigation.navigate('Paywall')}
      >
        <SectionHeader
          title="Appliances"
          subtitle="Warranties & recall watch"
          action={<Button label="Add" variant="ghost" onPress={() => navigation.navigate('AddAppliance')} />}
        />
        <Button label="Check for new recalls" variant="secondary" onPress={handleCheckRecalls} loading={checking} />
        {appliances.length === 0 ? (
          <EmptyState
            title="No appliances yet"
            message="Add an appliance to track its warranty and watch for recalls."
          />
        ) : (
          <ScrollView style={styles.list}>
            {appliances.map((appliance) => {
              const recallCount = recallCountFor(appliance.id);
              return (
                <Card key={appliance.id}>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{appliance.name}</Text>
                      <Text style={styles.meta}>{appliance.type}</Text>
                    </View>
                    {recallCount > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{recallCount} recall{recallCount === 1 ? '' : 's'}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Button
                    label="View"
                    variant="ghost"
                    onPress={() => navigation.navigate('ApplianceDetail', { applianceId: appliance.id })}
                  />
                </Card>
              );
            })}
          </ScrollView>
        )}
      </ProGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  flex: { flex: 1 },
  name: { ...typography.body, fontWeight: '600', color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
