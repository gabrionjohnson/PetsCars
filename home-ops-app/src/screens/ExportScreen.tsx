import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { ProGate } from '../components/ProGate';
import { colors, spacing, typography } from '../components/theme';
import { exportHomeHistoryAsJson, exportHomeHistoryAsPdf, shareExportedFile } from '../export/exportHome';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';

export function ExportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home, isPro } = useAppState();
  const [exporting, setExporting] = useState<'pdf' | 'json' | null>(null);

  if (!home) return null;

  async function handleExportPdf() {
    setExporting('pdf');
    try {
      const file = await exportHomeHistoryAsPdf(home!);
      await shareExportedFile(file);
    } catch {
      Alert.alert('Export failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportJson() {
    setExporting('json');
    try {
      const file = await exportHomeHistoryAsJson(home!);
      await shareExportedFile(file);
    } catch {
      Alert.alert('Export failed', 'Could not generate the file. Please try again.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <ScreenContainer>
      <ProGate
        isPro={isPro}
        title="Export is a Pro feature"
        message="Export your full home history — tasks, appliances, warranties, and documents — as a PDF or JSON file."
        onUnlock={() => navigation.navigate('Paywall')}
      >
        <Text style={styles.title}>Export home history</Text>
        <Text style={styles.subtitle}>
          A complete, timestamped record of {home.nickname}'s maintenance, appliances, and
          documents. Save it anywhere you like — it's yours.
        </Text>
        <Button label="Export as PDF" onPress={handleExportPdf} loading={exporting === 'pdf'} />
        <Button label="Export as JSON" variant="secondary" onPress={handleExportJson} loading={exporting === 'json'} />
      </ProGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
});
