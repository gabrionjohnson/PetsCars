import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { createAppliance } from '../db/queries/appliances';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';

export function AddApplianceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!home) return;
    if (!name.trim() || !type.trim()) {
      Alert.alert('Almost there', 'Give the appliance a name and type (e.g. dishwasher).');
      return;
    }
    setSubmitting(true);
    try {
      await createAppliance({
        homeId: home.id,
        name: name.trim(),
        type: type.trim(),
        brand: brand.trim() || null,
        model: model.trim() || null,
        purchaseDate: purchaseDate.trim() ? new Date(purchaseDate.trim()).toISOString() : null,
      });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <TextField label="Name" placeholder="e.g. Kitchen dishwasher" value={name} onChangeText={setName} />
      <TextField label="Type" placeholder="e.g. dishwasher" value={type} onChangeText={setType} />
      <TextField label="Brand (optional)" placeholder="e.g. Northwind" value={brand} onChangeText={setBrand} />
      <TextField label="Model (optional)" value={model} onChangeText={setModel} />
      <TextField
        label="Purchase date (optional)"
        placeholder="YYYY-MM-DD"
        value={purchaseDate}
        onChangeText={setPurchaseDate}
      />
      <Button label="Add appliance" onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}
