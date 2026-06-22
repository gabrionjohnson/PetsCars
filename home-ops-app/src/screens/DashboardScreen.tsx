import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../components/theme';
import { isDueNow, isDueSoon } from '../domain/scheduleEngine';
import { completeTask, listTasksForHome } from '../db/queries/tasks';
import { scheduleTaskReminder } from '../notifications/scheduler';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import type { Task } from '../types/models';

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { home } = useAppState();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!home) return;
    const all = await listTasksForHome(home.id);
    setTasks(all.filter((t) => t.isActive));
  }, [home]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleComplete(task: Task) {
    const updated = await completeTask(task.id);
    await scheduleTaskReminder(updated);
    await load();
  }

  if (!home) return null;

  const now = new Date();
  const due = tasks.filter((t) => isDueNow(new Date(t.nextDueDate), now));
  const upcoming = tasks.filter((t) => isDueSoon(new Date(t.nextDueDate), now));
  const later = tasks.filter(
    (t) => !isDueNow(new Date(t.nextDueDate), now) && !isDueSoon(new Date(t.nextDueDate), now)
  );

  const sections = [
    { key: 'due', title: 'Due now', data: due },
    { key: 'upcoming', title: 'Coming up', data: upcoming },
    { key: 'later', title: 'Later', data: later },
  ].filter((section) => section.data.length > 0);

  return (
    <ScreenContainer scroll={false}>
      <SectionHeader
        title={home.nickname}
        subtitle="Your home's maintenance schedule"
        action={<Button label="Add task" onPress={() => navigation.navigate('AddTask')} variant="ghost" />}
      />
      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" message="Add a custom task to start tracking your home." />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(section) => section.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((task) => (
                <Card key={task.id}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskMeta}>{task.category} · {task.defaultCadence.replace(/_/g, ' ')}</Text>
                  <View style={styles.taskActions}>
                    <Button
                      label="View"
                      variant="ghost"
                      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                    />
                    <Button label="Mark done" variant="secondary" onPress={() => handleComplete(task)} />
                  </View>
                </Card>
              ))}
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md },
  sectionTitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase' },
  taskTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  taskMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  taskActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
});
