import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { OptionPicker } from '../components/OptionPicker';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../components/theme';
import { importDocumentFile } from '../storage/documentStorage';
import { createDocument } from '../db/queries/documents';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { DocumentType } from '../types/models';

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'manual', label: 'Manual' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

export function AddDocumentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home } = useAppState();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType | null>(null);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedName(asset.name);
    if (!title.trim()) setTitle(asset.name);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to photograph a document.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedName(`photo-${Date.now()}.jpg`);
    if (!title.trim()) setTitle('Photo');
  }

  async function handleSubmit() {
    if (!home) return;
    if (!pickedUri || !pickedName) {
      Alert.alert('Add a file', 'Choose a file or take a photo first.');
      return;
    }
    if (!title.trim() || !type) {
      Alert.alert('Almost there', 'Give the document a title and pick a type.');
      return;
    }
    setSubmitting(true);
    try {
      const stored = await importDocumentFile(pickedUri, pickedName);
      await createDocument({ homeId: home.id, title: title.trim(), type, uri: stored.uri });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.pickerRow}>
        <Button label="Choose file" variant="secondary" onPress={handlePickFile} />
        <Button label="Take photo" variant="secondary" onPress={handleTakePhoto} />
      </View>
      {pickedName ? <Text style={styles.pickedName}>Selected: {pickedName}</Text> : null}

      <TextField label="Title" placeholder="e.g. Dishwasher receipt" value={title} onChangeText={setTitle} />
      <OptionPicker label="Type" options={DOCUMENT_TYPE_OPTIONS} value={type} onChange={setType} />

      <Button label="Save document" onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pickedName: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
});
