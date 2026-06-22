import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { OptionPicker } from '../components/OptionPicker';
import { Button } from '../components/Button';
import { TASK_CADENCE_LABELS, TASK_CADENCE_OPTIONS } from '../data/taskCadence';
import { createCustomTask } from '../db/queries/tasks';
import { scheduleTaskReminder } from '../notifications/scheduler';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { TaskCadence } from '../types/models';

export function AddTaskScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home } = useAppState();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [cadence, setCadence] = useState<TaskCadence | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!home) return;
    if (!title.trim() || !cadence) {
      Alert.alert('Almost there', 'Give the task a name and choose how often it repeats.');
      return;
    }
    setSubmitting(true);
    try {
      const task = await createCustomTask({
        homeId: home.id,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'custom',
        defaultCadence: cadence,
      });
      await scheduleTaskReminder(task);
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <TextField label="Task name" placeholder="e.g. Clean gutters" value={title} onChangeText={setTitle} />
      <TextField
        label="Notes (optional)"
        placeholder="Any details to remember"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <TextField label="Category (optional)" placeholder="e.g. exterior" value={category} onChangeText={setCategory} />
      <OptionPicker
        label="How often"
        options={TASK_CADENCE_OPTIONS.map((value) => ({ value, label: TASK_CADENCE_LABELS[value] }))}
        value={cadence}
        onChange={setCadence}
      />
      <Button label="Add task" onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}
