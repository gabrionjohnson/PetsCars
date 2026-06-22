import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { createWarranty } from '../db/queries/warranties';
import type { RootStackParamList } from '../navigation/types';

export function AddWarrantyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddWarranty'>>();
  const { applianceId } = route.params;

  const [provider, setProvider] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!provider.trim() || !expiresOn.trim()) {
      Alert.alert('Almost there', 'Add the provider and expiration date.');
      return;
    }
    const parsed = new Date(expiresOn.trim());
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Check the date', 'Use the format YYYY-MM-DD.');
      return;
    }
    setSubmitting(true);
    try {
      await createWarranty({ applianceId, provider: provider.trim(), expiresOn: parsed.toISOString() });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <TextField label="Provider" placeholder="e.g. Manufacturer, store, or home warranty co." value={provider} onChangeText={setProvider} />
      <TextField label="Expires on" placeholder="YYYY-MM-DD" value={expiresOn} onChangeText={setExpiresOn} />
      <Button label="Add warranty" onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}
