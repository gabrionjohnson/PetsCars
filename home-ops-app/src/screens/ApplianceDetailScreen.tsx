import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../components/theme';
import { deleteAppliance, getApplianceById } from '../db/queries/appliances';
import { listWarrantiesForAppliance } from '../db/queries/warranties';
import { listRecallMatchesForHome, setRecallMatchStatus } from '../db/queries/recalls';
import { isWarrantyExpired, isWarrantyExpiringSoon } from '../domain/warranty';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { Appliance, RecallMatch, Warranty } from '../types/models';

export function ApplianceDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ApplianceDetail'>>();
  const { applianceId } = route.params;
  const { home } = useAppState();

  const [appliance, setAppliance] = useState<Appliance | null>(null);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [recalls, setRecalls] = useState<RecallMatch[]>([]);

  const load = useCallback(async () => {
    setAppliance(await getApplianceById(applianceId));
    setWarranties(await listWarrantiesForAppliance(applianceId));
    if (home) {
      const allMatches = await listRecallMatchesForHome(home.id);
      setRecalls(allMatches.filter((m) => m.applianceId === applianceId));
    }
  }, [applianceId, home]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!appliance) return null;

  function handleDelete() {
    Alert.alert('Remove this appliance?', 'This also removes its warranties and recall history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteAppliance(appliance!.id);
          navigation.goBack();
        },
      },
    ]);
  }

  async function handleDismissRecall(match: RecallMatch) {
    await setRecallMatchStatus(match.id, 'dismissed');
    await load();
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>{appliance.name}</Text>
      <Text style={styles.meta}>
        {appliance.type}
        {appliance.brand ? ` · ${appliance.brand}` : ''}
        {appliance.model ? ` ${appliance.model}` : ''}
      </Text>
      {appliance.purchaseDate ? (
        <Text style={styles.meta}>Purchased {new Date(appliance.purchaseDate).toLocaleDateString()}</Text>
      ) : null}

      {recalls.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recall notices</Text>
          {recalls.map((match) => (
            <Card key={match.id} style={styles.recallCard}>
              <Text style={styles.recallTitle}>{match.recallTitle}</Text>
              <Text style={styles.meta}>{match.hazard}</Text>
              <View style={styles.recallActions}>
                <Button label="View details" variant="ghost" onPress={() => Linking.openURL(match.recallUrl)} />
                {match.status !== 'dismissed' ? (
                  <Button label="Dismiss" variant="ghost" onPress={() => handleDismissRecall(match)} />
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Warranties</Text>
        {warranties.length === 0 ? (
          <Text style={styles.muted}>No warranty added yet.</Text>
        ) : (
          warranties.map((warranty) => {
            const expiresOn = new Date(warranty.expiresOn);
            const expired = isWarrantyExpired(expiresOn);
            const expiringSoon = isWarrantyExpiringSoon(expiresOn);
            return (
              <Card key={warranty.id}>
                <Text style={styles.warrantyProvider}>{warranty.provider}</Text>
                <Text style={[styles.meta, expired && styles.danger, expiringSoon && styles.warning]}>
                  {expired ? 'Expired ' : 'Expires '}
                  {expiresOn.toLocaleDateString()}
                </Text>
              </Card>
            );
          })
        )}
        <Button
          label="Add warranty"
          variant="secondary"
          onPress={() => navigation.navigate('AddWarranty', { applianceId: appliance.id })}
        />
      </View>

      <Button label="Remove appliance" variant="ghost" onPress={handleDelete} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.xs },
  meta: { ...typography.caption, color: colors.textMuted },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.heading, marginBottom: spacing.sm },
  muted: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  warrantyProvider: { ...typography.body, fontWeight: '600', color: colors.text },
  recallCard: { borderColor: colors.danger },
  recallTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  recallActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  danger: { color: colors.danger },
  warning: { color: colors.warning },
});
