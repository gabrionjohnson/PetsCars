import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { ProGate } from '../components/ProGate';
import { colors, spacing, typography } from '../components/theme';
import { deleteDocument, listDocumentsForHome } from '../db/queries/documents';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { HomeDocument } from '../types/models';

export function DocumentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home, isPro } = useAppState();
  const [documents, setDocuments] = useState<HomeDocument[]>([]);

  const load = useCallback(async () => {
    if (!home) return;
    setDocuments(await listDocumentsForHome(home.id));
  }, [home]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!home) return null;

  async function handleOpen(doc: HomeDocument) {
    const available = await Sharing.isAvailableAsync();
    if (available) await Sharing.shareAsync(doc.uri);
  }

  function handleDelete(doc: HomeDocument) {
    Alert.alert('Remove this document?', doc.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteDocument(doc.id); await load(); } },
    ]);
  }

  return (
    <ScreenContainer scroll={false}>
      <ProGate
        isPro={isPro}
        title="Documents is a Pro feature"
        message="Keep receipts, manuals, and photos for every appliance and repair, permanently."
        onUnlock={() => navigation.navigate('Paywall')}
      >
        <SectionHeader
          title="Documents"
          subtitle="Receipts, manuals & photos"
          action={<Button label="Add" variant="ghost" onPress={() => navigation.navigate('AddDocument')} />}
        />
        {documents.length === 0 ? (
          <EmptyState title="No documents yet" message="Add a receipt, manual, or photo to keep a permanent record." />
        ) : (
          <ScrollView style={styles.list}>
            {documents.map((doc) => (
              <Card key={doc.id}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{doc.title}</Text>
                    <Text style={styles.meta}>
                      {doc.type} · {new Date(doc.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button label="Open" variant="ghost" onPress={() => handleOpen(doc)} />
                  <Button label="Remove" variant="ghost" onPress={() => handleDelete(doc)} />
                </View>
              </Card>
            ))}
          </ScrollView>
        )}
      </ProGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.md },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  title: { ...typography.body, fontWeight: '600', color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
});
