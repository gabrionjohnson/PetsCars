import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { OptionPicker } from '../components/OptionPicker';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../components/theme';
import { CLIMATE_ZONE_LABELS, CLIMATE_ZONE_OPTIONS, climateZoneFromZip } from '../data/climateZones';
import { HOME_AGE_BAND_LABELS, HOME_AGE_BAND_OPTIONS, homeAgeBandFromYearBuilt } from '../data/homeAgeBand';
import { createHome } from '../db/queries/homes';
import { seedTasksForHome } from '../db/queries/tasks';
import { scheduleTaskReminder } from '../notifications/scheduler';
import { ensureNotificationPermissions } from '../notifications/setup';
import { useAppState } from '../state/AppState';
import type { ClimateZone, HomeAgeBand } from '../types/models';

export function OnboardingScreen() {
  const { setHome, refreshHome } = useAppState();
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [zip, setZip] = useState('');
  const [homeAgeBand, setHomeAgeBand] = useState<HomeAgeBand | null>(null);
  const [climateZone, setClimateZone] = useState<ClimateZone | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleYearBuiltChange(value: string) {
    setYearBuilt(value);
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && value.length === 4) {
      setHomeAgeBand(homeAgeBandFromYearBuilt(parsed));
    }
  }

  function handleZipChange(value: string) {
    setZip(value);
    if (value.length === 5) {
      const zone = climateZoneFromZip(value);
      if (zone) setClimateZone(zone);
    }
  }

  async function handleSubmit() {
    if (!nickname.trim()) {
      Alert.alert('Give your home a name', 'A nickname helps tell this home apart from any others later.');
      return;
    }
    if (!homeAgeBand) {
      Alert.alert('How old is your home?', 'Pick the closest age range, or enter the year it was built.');
      return;
    }
    if (!climateZone) {
      Alert.alert('What climate are you in?', 'Pick the closest match, or enter your ZIP code.');
      return;
    }

    setSubmitting(true);
    try {
      const parsedYear = parseInt(yearBuilt, 10);
      const home = await createHome({
        nickname: nickname.trim(),
        address: address.trim() || null,
        yearBuilt: Number.isNaN(parsedYear) ? null : parsedYear,
        homeAgeBand,
        climateZone,
      });

      const tasks = await seedTasksForHome(home);
      const granted = await ensureNotificationPermissions();
      if (granted) {
        for (const task of tasks) {
          await scheduleTaskReminder(task);
        }
      }

      setHome(home);
      await refreshHome();
    } catch (error) {
      Alert.alert('Something went wrong', 'Could not set up your home. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Welcome home</Text>
      <Text style={styles.subtitle}>
        A few quick details help us build a starter maintenance schedule for your home. Everything
        stays on this device.
      </Text>

      <TextField
        label="Home nickname"
        placeholder="e.g. The Maple St. house"
        value={nickname}
        onChangeText={setNickname}
        returnKeyType="next"
      />

      <TextField
        label="Address (optional)"
        placeholder="Street address"
        value={address}
        onChangeText={setAddress}
      />

      <TextField
        label="Year built (optional)"
        placeholder="e.g. 1998"
        value={yearBuilt}
        onChangeText={handleYearBuiltChange}
        keyboardType="number-pad"
        maxLength={4}
      />

      <OptionPicker
        label="Home age"
        options={HOME_AGE_BAND_OPTIONS.map((value) => ({ value, label: HOME_AGE_BAND_LABELS[value] }))}
        value={homeAgeBand}
        onChange={setHomeAgeBand}
      />

      <TextField
        label="ZIP code (optional, helps suggest your climate)"
        placeholder="e.g. 94110"
        value={zip}
        onChangeText={handleZipChange}
        keyboardType="number-pad"
        maxLength={5}
      />

      <OptionPicker
        label="Climate"
        options={CLIMATE_ZONE_OPTIONS.map((value) => ({ value, label: CLIMATE_ZONE_LABELS[value] }))}
        value={climateZone}
        onChange={setClimateZone}
      />

      <Button label="Set up my schedule" onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}

const styles = {
  title: { ...typography.title, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
} as const;
