import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { OptionPicker } from '../components/OptionPicker';
import { colors, spacing, typography } from '../components/theme';
import { TASK_CADENCE_LABELS, TASK_CADENCE_OPTIONS } from '../data/taskCadence';
import {
  completeTask,
  getTaskById,
  listCompletionsForTask,
  setTaskActive,
  updateTaskCadence,
} from '../db/queries/tasks';
import { cancelTaskReminder, scheduleTaskReminder } from '../notifications/scheduler';
import type { RootStackParamList } from '../navigation/types';
import type { Task, TaskCompletion } from '../types/models';

export function TaskDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const { taskId } = route.params;

  const [task, setTask] = useState<Task | null>(null);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);

  const load = useCallback(async () => {
    const current = await getTaskById(taskId);
    setTask(current);
    setCompletions(await listCompletionsForTask(taskId));
  }, [taskId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!task) return null;

  async function handleComplete() {
    const updated = await completeTask(task!.id);
    await scheduleTaskReminder(updated);
    await load();
  }

  async function handleToggleActive(value: boolean) {
    await setTaskActive(task!.id, value);
    if (value) {
      await scheduleTaskReminder(task!);
    } else {
      await cancelTaskReminder(task!);
    }
    await load();
  }

  async function handleCadenceChange(cadence: (typeof TASK_CADENCE_OPTIONS)[number]) {
    await updateTaskCadence(task!.id, cadence);
    await load();
  }

  function handleDelete() {
    Alert.alert('Stop tracking this task?', 'You can still see past completions, but reminders will stop.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop tracking', style: 'destructive', onPress: () => handleToggleActive(false).then(() => navigation.goBack()) },
    ]);
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>{task.title}</Text>
      <Text style={styles.description}>{task.description}</Text>

      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Active reminders</Text>
          <Switch value={task.isActive} onValueChange={handleToggleActive} />
        </View>
      </Card>

      <OptionPicker
        label="How often"
        options={TASK_CADENCE_OPTIONS.map((value) => ({ value, label: TASK_CADENCE_LABELS[value] }))}
        value={task.defaultCadence}
        onChange={handleCadenceChange}
      />

      <Button label="Mark done today" onPress={handleComplete} />

      <Text style={styles.sectionTitle}>History</Text>
      {completions.length === 0 ? (
        <Text style={styles.muted}>No completions logged yet.</Text>
      ) : (
        completions.map((c) => (
          <Card key={c.id}>
            <Text style={styles.label}>{new Date(c.completedAt).toLocaleDateString()}</Text>
            {c.note ? <Text style={styles.muted}>{c.note}</Text> : null}
          </Card>
        ))
      )}

      <Button label="Stop tracking this task" variant="ghost" onPress={handleDelete} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.xs },
  description: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.body, color: colors.text, fontWeight: '600' },
  sectionTitle: { ...typography.heading, marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { ...typography.caption, color: colors.textMuted },
});
