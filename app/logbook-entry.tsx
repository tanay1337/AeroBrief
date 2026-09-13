import { RouteFuelCheckCard } from '@/components/RouteFuelCheckCard';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { deleteLogbookFlight, getLogbookFlight, getLogbookFlights, logbookChangeHistoryQueryKey, saveLogbookFlight } from '@/data/logbook';
import { deleteLogbookAttachment, getLogbookAttachments, saveLogbookAttachments } from '@/data/logbookAttachments';
import { attachWeatherBriefing, generateFlightWeatherBriefing, getFlightWeatherBriefing, getValidPlannedWeatherBriefing } from '@/data/flightWeather';
import { getAircraftProfile } from '@/data/aircraftProfiles';
import { carryPlannedAttachmentsToLogbook, getPlannedFlightAttachments } from '@/data/plannedFlightAttachments';
import { getPlannedFlight, getPlannedFlightForLogbook, updatePlannedFlight } from '@/data/plannedFlights';
import { saveLocalFileCopy, stagePickedFiles } from '@/data/localFiles';
import { getFlightRouteSnapshot, getRoutePlan, getRoutePlans, linkRoutePlanToFlight } from '@/data/routePlans';
import { getFlightWeightBalance, getWeightBalanceCalculations, linkWeightBalanceToFlight } from '@/data/weightBalance';
import { flightFingerprint, formatMinutes, logbookCompletionErrors, minutesBetweenTimes, parseDuration, PREFLIGHT_ATTACHMENT_CATEGORIES, shouldAutoGenerateWeatherBriefing, type LogbookAttachment, type LogbookAttachmentCategory, type LogbookFlightInput, type PendingLogbookAttachment, type PilotRole } from '@/domain/logbook';
import { useAppTheme } from '@/theme/theme';
import type { AppColors } from '@/theme/theme';

type FormState = Record<'date' | 'aircraftType' | 'callsign' | 'crew' | 'picName' | 'departureAirport' | 'arrivalAirport' | 'departureTime' | 'landingTime' | 'blockOffTime' | 'blockOnTime' | 'airtime' | 'flightTime' | 'landingsDay' | 'landingsNight' | 'nightTime' | 'ifrTime' | 'remarks', string>;


const emptyForm = (): FormState => ({
  date: new Date().toISOString().slice(0, 10), aircraftType: '', callsign: '', crew: '', picName: '',
  departureAirport: '', arrivalAirport: '', departureTime: '', landingTime: '', blockOffTime: '', blockOnTime: '',
  airtime: '0:00', flightTime: '0:00', landingsDay: '1', landingsNight: '0', nightTime: '0:00', ifrTime: '0:00', remarks: ''
});

function EntryField({ name, label, placeholder, wide = false, form, onChange, colors, suggestions = [] }: {
  name: keyof FormState;
  label: string;
  placeholder?: string;
  wide?: boolean;
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  colors: AppColors;
  suggestions?: string[];
}): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const matches = suggestions.filter((value) => value && value.toLowerCase().includes(form[name].toLowerCase()) && value.toLowerCase() !== form[name].toLowerCase()).slice(0, 5);
  return (
    <View style={wide ? styles.wideField : styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput value={form[name]} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} onChangeText={(value) => onChange(name, value)} placeholder={placeholder} placeholderTextColor={colors.textMuted} autoCapitalize="characters" style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
      {focused && matches.length ? <View style={styles.suggestions}>{matches.map((value) => <Pressable key={value} onPress={() => { onChange(name, value); setFocused(false); }} style={[styles.suggestion, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><Text numberOfLines={1} style={[styles.suggestionText, { color: colors.text }]}>{value}</Text></Pressable>)}</View> : null}
    </View>
  );
}

function TimeField({ name, label, value, onChange, colors }: { name: keyof FormState; label: string; value: string; onChange: (key: keyof FormState, value: string) => void; colors: AppColors }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(value.match(/^([0-2]\d):/)?.[1] ?? '00');
  const [minute, setMinute] = useState(value.match(/:([0-5]\d)$/)?.[1] ?? '00');
  const openPicker = () => {
    const match = value.match(/^([0-2]\d):([0-5]\d)$/);
    if (match) { setHour(match[1]!); setMinute(match[2]!); }
    setOpen(true);
  };
  const useNow = () => {
    const now = new Date();
    const nextHour = String(now.getUTCHours()).padStart(2, '0');
    const nextMinute = String(now.getUTCMinutes()).padStart(2, '0');
    setHour(nextHour); setMinute(nextMinute); onChange(name, `${nextHour}:${nextMinute}`); setOpen(false);
  };
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.timeActions}>
        <Pressable onPress={openPicker} style={[styles.timeInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><Ionicons name="time-outline" size={17} color={colors.primary} /><Text style={[styles.timeText, { color: value ? colors.text : colors.textMuted }]}>{value || 'Select'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Set ${label} to now in UTC`} onPress={useNow} style={[styles.nowButton, { backgroundColor: colors.primarySoft }]}><Text style={[styles.nowText, { color: colors.primary }]}>Now</Text></Pressable>
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.timeModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.timeModalTitle, { color: colors.text }]}>{label}</Text>
          <View style={styles.timeColumns}>
            <ScrollView style={styles.timeColumn}>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((item) => <Pressable key={item} onPress={() => setHour(item)} style={[styles.timeOption, { backgroundColor: item === hour ? colors.primary : 'transparent' }]}><Text style={[styles.timeOptionText, { color: item === hour ? '#FFFFFF' : colors.text }]}>{item}</Text></Pressable>)}</ScrollView>
            <Text style={[styles.timeColon, { color: colors.text }]}>:</Text>
            <ScrollView style={styles.timeColumn}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((item) => <Pressable key={item} onPress={() => setMinute(item)} style={[styles.timeOption, { backgroundColor: item === minute ? colors.primary : 'transparent' }]}><Text style={[styles.timeOptionText, { color: item === minute ? '#FFFFFF' : colors.text }]}>{item}</Text></Pressable>)}</ScrollView>
          </View>
          <View style={styles.modalActions}><Pressable onPress={() => { onChange(name, ''); setOpen(false); }}><Text style={[styles.modalLink, { color: colors.textMuted }]}>Clear</Text></Pressable><Pressable onPress={useNow}><Text style={[styles.modalLink, { color: colors.primary }]}>Now UTC</Text></Pressable><Pressable onPress={() => { onChange(name, `${hour}:${minute}`); setOpen(false); }} style={[styles.doneButton, { backgroundColor: colors.primary }]}><Text style={styles.doneText}>Done</Text></Pressable></View>
        </View></View>
      </Modal>
    </View>
  );
}

export default function LogbookEntryScreen(): React.JSX.Element {
  const { id, plannedFlightId } = useLocalSearchParams<{ id?: string; plannedFlightId?: string }>();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [role, setRole] = useState<PilotRole>('DUAL');
  const [saving, setSaving] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [pickingAttachmentType, setPickingAttachmentType] = useState<'photos' | 'files' | LogbookAttachmentCategory | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingLogbookAttachment[]>([]);
  const [expandedMaterial, setExpandedMaterial] = useState<LogbookAttachmentCategory | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [selectedCalculationId, setSelectedCalculationId] = useState<string | null>(null);
  const [showCalculations, setShowCalculations] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const existing = useQuery({ queryKey: ['logbook-flight', id], queryFn: () => getLogbookFlight(db, id!), enabled: Boolean(id) });
  const plannedFlight = useQuery({ queryKey: ['planned-flight', plannedFlightId], queryFn: () => getPlannedFlight(db, plannedFlightId!), enabled: Boolean(plannedFlightId && !id) });
  const plannedAttachments = useQuery({ queryKey: ['planned-flight-attachments', plannedFlightId], queryFn: () => getPlannedFlightAttachments(db, plannedFlightId!), enabled: Boolean(plannedFlightId && !id) });
  const plannedAircraft = useQuery({ queryKey: ['aircraft-profile', plannedFlight.data?.aircraftProfileId], queryFn: () => getAircraftProfile(db, plannedFlight.data!.aircraftProfileId!), enabled: Boolean(plannedFlight.data?.aircraftProfileId && !id) });
  const attachments = useQuery({ queryKey: ['logbook-attachments', id], queryFn: () => getLogbookAttachments(db, id!), enabled: Boolean(id) });
  const allFlights = useQuery({ queryKey: ['logbook-flights'], queryFn: () => getLogbookFlights(db) });
  const calculations = useQuery({ queryKey: ['weight-balance-calculations'], queryFn: () => getWeightBalanceCalculations(db) });
  const linkedCalculation = useQuery({ queryKey: ['flight-weight-balance', id], queryFn: () => getFlightWeightBalance(db, id!), enabled: Boolean(id) });
  const routePlans = useQuery({ queryKey: ['route-plans'], queryFn: () => getRoutePlans(db) });
  const linkedRoute = useQuery({ queryKey: ['flight-route', id], queryFn: () => getFlightRouteSnapshot(db, id!), enabled: Boolean(id) });
  const weatherBriefing = useQuery({ queryKey: ['flight-weather-briefing', id], queryFn: () => getFlightWeatherBriefing(db, id!), enabled: Boolean(id) });
  const plannedRoute = useQuery({ queryKey: ['route-plan', plannedFlight.data?.routePlanId], queryFn: () => getRoutePlan(db, plannedFlight.data!.routePlanId!), enabled: Boolean(plannedFlight.data?.routePlanId && !id) });
  const plannedWeather = useQuery({ queryKey: ['planned-weather-handoff', plannedFlightId], queryFn: () => getValidPlannedWeatherBriefing(db, plannedFlightId!), enabled: Boolean(plannedFlightId && !id) });
  const validPlannedWeather = plannedWeather.data?.departureAirport === form.departureAirport.trim().toUpperCase() && plannedWeather.data?.arrivalAirport === form.arrivalAirport.trim().toUpperCase() ? plannedWeather.data : null;
  const shownWeather = weatherBriefing.data ?? validPlannedWeather;
  const routeLocked = Boolean(plannedFlightId && !id && plannedFlight.data?.routePlanId);
  const effectiveRouteId = routeLocked ? plannedFlight.data!.routePlanId : selectedRouteId;
  const suggestions = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
    const flights = allFlights.data ?? [];
    return {
      aircraftType: unique(flights.map((flight) => flight.aircraftType)),
      callsign: unique(flights.map((flight) => flight.callsign)),
      crew: unique(flights.map((flight) => flight.crew)),
      picName: unique(flights.map((flight) => flight.picName)),
      airports: unique(flights.flatMap((flight) => [flight.departureAirport, flight.arrivalAirport]))
    };
  }, [allFlights.data]);

  useEffect(() => {
    const flight = existing.data;
    if (!flight) return;
    // The query result hydrates the editable draft once the persisted record arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(flight.pilotRole);
    setForm({
      date: flight.date, aircraftType: flight.aircraftType, callsign: flight.callsign, crew: flight.crew, picName: flight.picName,
      departureAirport: flight.departureAirport, arrivalAirport: flight.arrivalAirport, departureTime: flight.departureTime,
      landingTime: flight.landingTime, blockOffTime: flight.blockOffTime, blockOnTime: flight.blockOnTime,
      airtime: formatMinutes(minutesBetweenTimes(flight.departureTime, flight.landingTime) ?? flight.airtimeMinutes),
      flightTime: formatMinutes(minutesBetweenTimes(flight.blockOffTime, flight.blockOnTime) ?? flight.flightTimeMinutes),
      landingsDay: String(flight.landingsDay ?? 0), landingsNight: String(flight.landingsNight ?? 0),
      nightTime: formatMinutes(flight.nightMinutes), ifrTime: formatMinutes(flight.ifrMinutes), remarks: flight.remarks
    });
  }, [existing.data]);

  useEffect(() => {
    if (id || !plannedFlight.data) return;
    const draft = plannedFlight.data;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => ({ ...current, date: draft.departureDate || current.date, departureTime: draft.departureTime, departureAirport: draft.departureAirport, arrivalAirport: draft.arrivalAirport,
      aircraftType: plannedAircraft.data ? `${plannedAircraft.data.manufacturer} ${plannedAircraft.data.model}`.trim() : current.aircraftType,
      callsign: plannedAircraft.data?.registration ?? current.callsign }));
    setSelectedRouteId(draft.routePlanId);
    setSelectedCalculationId(draft.weightBalanceId);
  }, [id, plannedFlight.data, plannedAircraft.data]);

  useEffect(() => {
    if (!id || linkedCalculation.isLoading) return;
    // The linked immutable snapshot hydrates independently from the flight record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCalculationId(linkedCalculation.data?.id ?? null);
  }, [id, linkedCalculation.data, linkedCalculation.isLoading]);

  useEffect(() => {
    if (!id || linkedRoute.isLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRouteId(linkedRoute.data?.sourceRoutePlanId ?? null);
  }, [id, linkedRoute.data, linkedRoute.isLoading]);

  const update = (key: keyof FormState, value: string) => setForm((current) => {
    const next = { ...current, [key]: value };
    if (key === 'blockOffTime' || key === 'blockOnTime') {
      next.flightTime = formatMinutes(minutesBetweenTimes(next.blockOffTime, next.blockOnTime) ?? 0);
    }
    if (key === 'departureTime' || key === 'landingTime') {
      next.airtime = formatMinutes(minutesBetweenTimes(next.departureTime, next.landingTime) ?? 0);
    }
    return next;
  });

  const chooseAttachments = async (type: 'photos' | 'files', category: LogbookAttachmentCategory = 'GENERAL') => {
    try {
      setPickingAttachmentType(category === 'GENERAL' ? type : category);
      const choosingPhotos = type === 'photos';
      const picked = await File.pickFileAsync({
        multipleFiles: true,
        mimeTypes: choosingPhotos ? ['image/*'] : category === 'GENERAL' ? ['application/pdf', 'text/plain'] : ['application/pdf'],
        initialUri: choosingPhotos ? 'content://com.android.providers.media.documents/root/images_root' : undefined
      });
      if (picked.canceled) return;
      const staged = await stagePickedFiles(picked.result);
      setPendingAttachments((current) => [...current, ...staged.map((attachment) => ({ ...attachment, category }))]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected attachments could not be read.';
      if (!/cancel/i.test(message)) Alert.alert('Could not add attachment', message);
    } finally {
      setPickingAttachmentType(null);
    }
  };

  const choosePreflightAttachment = (category: LogbookAttachmentCategory, singular: string) => {
    if (category === 'NOTAM_BRIEFING') {
      void chooseAttachments('files', category);
      return;
    }
    Alert.alert(`Add ${singular}`, 'Choose an image from your gallery, or attach a PDF.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose image', onPress: () => void chooseAttachments('photos', category) },
      { text: 'Choose PDF', onPress: () => void chooseAttachments('files', category) }
    ]);
  };

  const buildFlight = (): LogbookFlightInput => {
    const flightTimeMinutes = parseDuration(form.flightTime);
    const landingsDay = Math.max(0, Number.parseInt(form.landingsDay || '0', 10) || 0);
    const landingsNight = Math.max(0, Number.parseInt(form.landingsNight || '0', 10) || 0);
    const base: LogbookFlightInput = {
      id: id ?? savedDraftId ?? undefined, date: form.date.trim(), aircraftType: form.aircraftType.trim(), callsign: form.callsign.trim().toUpperCase(),
      crew: form.crew.trim(), picName: form.picName.trim(), pilotRole: role,
      departureAirport: form.departureAirport.trim().toUpperCase(), arrivalAirport: form.arrivalAirport.trim().toUpperCase(),
      departureTime: form.departureTime.trim(), landingTime: form.landingTime.trim(), blockOffTime: form.blockOffTime.trim(), blockOnTime: form.blockOnTime.trim(),
      landingsTotal: landingsDay + landingsNight, landingsDay, landingsNight,
      airtimeMinutes: parseDuration(form.airtime), flightTimeMinutes,
      picMinutes: role === 'PIC' || role === 'SOLO' || role === 'INSTRUCTOR' ? flightTimeMinutes : 0,
      dualMinutes: role === 'DUAL' ? flightTimeMinutes : 0, instructorMinutes: role === 'INSTRUCTOR' ? flightTimeMinutes : 0,
      nightMinutes: parseDuration(form.nightTime), ifrMinutes: parseDuration(form.ifrTime),
      priceCategory: existing.data?.priceCategory ?? '', remarks: form.remarks.trim(), track: existing.data?.track ?? '',
      capzlog: existing.data?.capzlog ?? '', cloudlog: existing.data?.cloudlog ?? '', source: existing.data?.source ?? 'Manual entry',
      sourceRow: existing.data?.sourceRow ?? null, sourceFingerprint: '', needsReview: false
    };
    const status = logbookCompletionErrors(base).length ? 'DRAFT' : 'COMPLETE';
    return { ...base, status, sourceFingerprint: status === 'COMPLETE' ? flightFingerprint(base) : '' };
  };

  const save = async () => {
    try {
      setSaving(true);
      const flight = buildFlight();
      const savedId = await saveLogbookFlight(db, flight);
      setSavedDraftId(savedId);
      await saveLogbookAttachments(db, savedId, pendingAttachments);
      await linkWeightBalanceToFlight(db, selectedCalculationId, savedId);
      // Editing flight times must preserve the recorded route, including when its source was deleted.
      if (!id || !linkedRoute.data || effectiveRouteId !== linkedRoute.data.sourceRoutePlanId) await linkRoutePlanToFlight(db, effectiveRouteId, savedId);
      const handoffWeather = plannedFlightId && !id ? await getValidPlannedWeatherBriefing(db, plannedFlightId) : null;
      const matchingHandoff = handoffWeather?.departureAirport === flight.departureAirport && handoffWeather?.arrivalAirport === flight.arrivalAirport ? handoffWeather : null;
      if (matchingHandoff) await attachWeatherBriefing(db, savedId, matchingHandoff);
      if (plannedFlightId && !id) {
        await carryPlannedAttachmentsToLogbook(db, plannedFlightId, savedId);
        await updatePlannedFlight(db, plannedFlightId, { logbookFlightId: savedId });
        void queryClient.invalidateQueries({ queryKey: ['planned-flight', plannedFlightId] });
        void queryClient.invalidateQueries({ queryKey: ['planned-flights'] });
      }
      const routeChanged = weatherBriefing.data
        && (weatherBriefing.data.departureAirport !== flight.departureAirport || weatherBriefing.data.arrivalAirport !== flight.arrivalAirport);
      for (const key of [['logbook-flights'], ['logbook-flight', savedId], ['logbook-attachments', savedId], logbookChangeHistoryQueryKey(savedId), ['weight-balance-calculations'], ['flight-weight-balance', savedId], ['flight-route', savedId], ['flight-weather-briefing', savedId]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      router.dismissTo(plannedFlightId && !id ? { pathname: '/flight-plan', params: { id: plannedFlightId } } : { pathname: '/logbook-flight', params: { id: savedId } });
      // Network weather lookups can take much longer than a local save; they never block navigation.
      if (shouldAutoGenerateWeatherBriefing(existing.data?.sourceRow) && flight.departureAirport && flight.arrivalAirport && (!weatherBriefing.data || routeChanged) && !matchingHandoff) {
        void generateFlightWeatherBriefing(db, savedId, flight.departureAirport, flight.arrivalAirport)
          .then(() => queryClient.invalidateQueries({ queryKey: ['flight-weather-briefing', savedId] }))
          .catch(() => { /* The saved flight remains available; briefing can be requested from the flight screen. */ });
      }
    } catch (error) {
      Alert.alert('Could not save flight', error instanceof Error ? error.message : 'Please check the values and try again.');
    } finally { setSaving(false); }
  };

  const refreshWeather = async () => {
    if (!id || existing.data?.status !== 'DRAFT' || !shouldAutoGenerateWeatherBriefing(existing.data.sourceRow)) return;
    try {
      setWeatherBusy(true);
      await generateFlightWeatherBriefing(db, id, form.departureAirport, form.arrivalAirport);
      await queryClient.invalidateQueries({ queryKey: ['flight-weather-briefing', id] });
    } catch (error) {
      Alert.alert('Could not refresh weather', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWeatherBusy(false);
    }
  };

  const removeAttachment = (attachment: LogbookAttachment) => {
    Alert.alert('Remove attachment?', attachment.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteLogbookAttachment(db, attachment).then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['logbook-attachments', id] });
      }) }
    ]);
  };

  const removePendingAttachment = (attachment: PendingLogbookAttachment) => {
    const file = new File(attachment.uri);
    if (file.parentDirectory.exists) file.parentDirectory.delete();
    setPendingAttachments((current) => current.filter((item) => item.uri !== attachment.uri));
  };

  const openAttachment = async (attachment: LogbookAttachment) => {
    try {
      if (attachment.mimeType.startsWith('image/')) {
        setPreviewUri(attachment.uri);
        return;
      }
      const savedName = await saveLocalFileCopy(attachment.uri, attachment.name, attachment.mimeType);
      Alert.alert('Copy saved', `${savedName} was saved to the selected folder. Open it from your Files app.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The attachment could not be saved.';
      if (!/cancel/i.test(message)) Alert.alert('Could not access attachment', message);
    }
  };

  const remove = () => {
    if (!id) return;
    Alert.alert('Delete flight?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void getPlannedFlightForLogbook(db, id).then(async (linkedPlan) => {
        await deleteLogbookFlight(db, id);
        void queryClient.invalidateQueries({ queryKey: ['logbook-flights'] });
        void queryClient.invalidateQueries({ queryKey: ['planned-flights'] });
        if (linkedPlan) {
          void queryClient.invalidateQueries({ queryKey: ['planned-flight', linkedPlan.id] });
          router.dismissTo({ pathname: '/flight-plan', params: { id: linkedPlan.id } });
        } else router.dismissTo('/logbook');
      }).catch((error) => Alert.alert('Could not delete flight', error instanceof Error ? error.message : 'Please try again.')) }
    ]);
  };

  const fieldProps = { form, onChange: update, colors };
  const generalAttachments = (attachments.data ?? []).filter((attachment) => attachment.category === 'GENERAL');
  const pendingGeneralAttachments = pendingAttachments.filter((attachment) => (attachment.category ?? 'GENERAL') === 'GENERAL');
  const availableCalculations = (calculations.data ?? []).filter((calculation) => (!calculation.logbookFlightId || calculation.logbookFlightId === id) && (!form.callsign.trim() || calculation.registration.toUpperCase() === form.callsign.trim().toUpperCase()));
  const selectedCalculation = availableCalculations.find((calculation) => calculation.id === selectedCalculationId) ?? null;
  const selectedRoute = (routeLocked ? plannedRoute.data : (routePlans.data ?? []).find((plan) => plan.id === selectedRouteId)) ?? (id && linkedRoute.data && effectiveRouteId === linkedRoute.data.sourceRoutePlanId ? linkedRoute.data.plan : null);
  const isImportedEntry = !shouldAutoGenerateWeatherBriefing(existing.data?.sourceRow);


  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit flight' : 'Add flight' }} />
      <Screen>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Flight</Text>
          <View style={styles.grid}><EntryField {...fieldProps} name="date" label="Date" placeholder="YYYY-MM-DD" wide /><EntryField {...fieldProps} name="aircraftType" label="Aircraft type" placeholder="DA20-A1" suggestions={suggestions.aircraftType} /><EntryField {...fieldProps} name="callsign" label="Registration" placeholder="D-TEST" suggestions={suggestions.callsign} /></View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Route and times</Text>
          <View style={styles.grid}>
            <EntryField {...fieldProps} name="departureAirport" label="From" placeholder="EDAY" suggestions={suggestions.airports} /><EntryField {...fieldProps} name="arrivalAirport" label="To" placeholder="EDAV" suggestions={suggestions.airports} />
            <TimeField name="blockOffTime" label="Block off (UTC)" value={form.blockOffTime} onChange={update} colors={colors} /><TimeField name="blockOnTime" label="Block on (UTC)" value={form.blockOnTime} onChange={update} colors={colors} />
            <TimeField name="departureTime" label="Takeoff (UTC)" value={form.departureTime} onChange={update} colors={colors} /><TimeField name="landingTime" label="Landing (UTC)" value={form.landingTime} onChange={update} colors={colors} />
          </View>
          <View style={styles.durationRow}>
            <View style={[styles.durationBox, { backgroundColor: colors.primarySoft }]}><Text style={[styles.durationLabel, { color: colors.textMuted }]}>Block time</Text><Text style={[styles.durationValue, { color: colors.text }]}>{form.flightTime}</Text></View>
            <View style={[styles.durationBox, { backgroundColor: colors.primarySoft }]}><Text style={[styles.durationLabel, { color: colors.textMuted }]}>Air time</Text><Text style={[styles.durationValue, { color: colors.text }]}>{form.airtime}</Text></View>
          </View>
          <Text style={[styles.help, { color: colors.textMuted }]}>Times are calculated automatically. Overnight flights are handled across midnight.</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Crew and experience</Text>
          <View style={styles.options}>{(['DUAL', 'PIC', 'SOLO', 'INSTRUCTOR'] as PilotRole[]).map((option) => <Pressable key={option} onPress={() => setRole(option)} style={[styles.chip, { backgroundColor: role === option ? colors.primary : colors.surfaceRaised }]}><Text style={[styles.chipText, { color: role === option ? '#FFFFFF' : colors.text }]}>{option}</Text></Pressable>)}</View>
          <View style={styles.grid}>
            <EntryField {...fieldProps} name="crew" label="Crew / instructor" placeholder="Student / Instructor" wide suggestions={suggestions.crew} /><EntryField {...fieldProps} name="picName" label="PIC name" placeholder="SELF or name" wide suggestions={suggestions.picName} />
            <EntryField {...fieldProps} name="landingsDay" label="Day landings" /><EntryField {...fieldProps} name="landingsNight" label="Night landings" />
            <EntryField {...fieldProps} name="nightTime" label="Night time" placeholder="0:00" /><EntryField {...fieldProps} name="ifrTime" label="IFR time" placeholder="0:00" />
            <EntryField {...fieldProps} name="remarks" label="Remarks / endorsements" wide />
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <View style={styles.attachmentHeading}>
            <View style={styles.attachmentName}><Text style={[styles.sectionTitle, { color: colors.text }]}>Pre-flight materials</Text><Text style={[styles.help, { color: colors.textMuted }]}>Build and attach the briefing for this flight.</Text></View>
          </View>
          <View style={[styles.materialGroup, { borderTopColor: colors.border }]}>
            <View style={styles.materialRow}>
              <Ionicons name={shownWeather ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={shownWeather ? colors.success : colors.textMuted} />
              <Pressable disabled={!shownWeather} onPress={() => router.push({ pathname: '/flight-weather', params: id ? { id } : { plannedFlightId } })} style={styles.attachmentName}><Text style={[styles.attachmentTitle, { color: colors.text }]}>Weather briefing</Text><Text style={[styles.help, { color: colors.textMuted }]}>{shownWeather ? `Generated ${new Date(shownWeather.generatedAt).toLocaleString()}` : isImportedEntry ? 'Not generated for imported entries' : 'Generated when the flight is first saved'}</Text></Pressable>
              {id && existing.data?.status === 'DRAFT' && !isImportedEntry ? <Pressable disabled={weatherBusy || !form.departureAirport.trim() || !form.arrivalAirport.trim()} accessibilityRole="button" accessibilityLabel="Refresh weather briefing" onPress={() => void refreshWeather()} style={{ opacity: weatherBusy || !form.departureAirport.trim() || !form.arrivalAirport.trim() ? 0.4 : 1 }}><Ionicons name="refresh" size={20} color={colors.primary} /></Pressable> : null}
            </View>
          </View>
          <View style={[styles.materialGroup, { borderTopColor: colors.border }]}>
            <View style={styles.materialRow}>
              <Ionicons name={selectedCalculation ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selectedCalculation ? colors.success : colors.textMuted} />
              <Pressable style={styles.attachmentName} onPress={() => setShowCalculations((current) => !current)}><Text style={[styles.attachmentTitle, { color: colors.text }]}>Mass and Balance</Text><Text style={[styles.help, { color: colors.textMuted }]}>{selectedCalculation ? selectedCalculation.title : 'Not attached'}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose a Mass and Balance calculation" hitSlop={6} onPress={() => setShowCalculations((current) => !current)}><Ionicons name={showCalculations ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Create a Mass and Balance calculation" onPress={() => router.push('/weight-balance')} style={[styles.materialAdd, { backgroundColor: colors.primarySoft }]}><Ionicons name="add" size={20} color={colors.primary} /></Pressable>
            </View>
            {showCalculations ? <View style={styles.calculationChoices}>
              {availableCalculations.map((calculation) => <Pressable key={calculation.id} onPress={() => setSelectedCalculationId(selectedCalculationId === calculation.id ? null : calculation.id)} style={[styles.calculationRow, { borderColor: selectedCalculationId === calculation.id ? colors.primary : colors.border, backgroundColor: selectedCalculationId === calculation.id ? colors.primarySoft : colors.surfaceRaised }]}><Ionicons name={selectedCalculationId === calculation.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedCalculationId === calculation.id ? colors.primary : colors.textMuted} /><View style={styles.attachmentName}><Text style={[styles.attachmentTitle, { color: colors.text }]}>{calculation.title}</Text><Text style={[styles.help, { color: colors.textMuted }]}>{calculation.registration} · {calculation.calculationDate} · Profile r{calculation.profileRevision}</Text></View></Pressable>)}
              {!availableCalculations.length ? <Text style={[styles.emptyAttachments, { color: colors.textMuted }]}>No available calculation matches this registration.</Text> : null}
            </View> : null}
          </View>
          <View style={[styles.materialGroup, { borderTopColor: colors.border }]}> 
            <View style={styles.materialRow}>
              <Ionicons name={selectedRoute ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selectedRoute ? colors.success : colors.textMuted} />
              <Pressable disabled={routeLocked} style={styles.attachmentName} onPress={() => setShowRoutes((current) => !current)}><Text style={[styles.attachmentTitle, { color: colors.text }]}>Planned route</Text><Text style={[styles.help, { color: colors.textMuted }]}>{selectedRoute ? selectedRoute.title : 'Not attached'}</Text></Pressable>
              {!routeLocked ? <>              <Pressable accessibilityRole="button" accessibilityLabel="Choose a planned route" hitSlop={6} onPress={() => setShowRoutes((current) => !current)}><Ionicons name={showRoutes ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Create a planned route" onPress={() => router.push('/route-planner')} style={[styles.materialAdd, { backgroundColor: colors.primarySoft }]}><Ionicons name="add" size={20} color={colors.primary} /></Pressable></> : null}
            </View>
            {showRoutes && !routeLocked ? <View style={styles.calculationChoices}>
              {(routePlans.data ?? []).map((plan) => <Pressable key={plan.id} onPress={() => setSelectedRouteId(selectedRouteId === plan.id ? null : plan.id)} style={[styles.calculationRow, { borderColor: selectedRouteId === plan.id ? colors.primary : colors.border, backgroundColor: selectedRouteId === plan.id ? colors.primarySoft : colors.surfaceRaised }]}><Ionicons name={selectedRouteId === plan.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedRouteId === plan.id ? colors.primary : colors.textMuted} /><View style={styles.attachmentName}><Text style={[styles.attachmentTitle, { color: colors.text }]}>{plan.title}</Text><Text numberOfLines={1} style={[styles.help, { color: colors.textMuted }]}>{plan.waypoints.map((point) => point.ident).join(' → ')}</Text></View></Pressable>)}
              {!(routePlans.data?.length) ? <Text style={[styles.emptyAttachments, { color: colors.textMuted }]}>No saved routes yet.</Text> : null}
            </View> : null}
          </View>
          {selectedRoute && selectedCalculation ? <RouteFuelCheckCard route={selectedRoute} calculation={selectedCalculation} flight={form} /> : null}
            {PREFLIGHT_ATTACHMENT_CATEGORIES.map(({ category, label, singular }) => {
            const savedFiles = (attachments.data ?? []).filter((attachment) => attachment.category === category);
            const pendingFiles = pendingAttachments.filter((attachment) => attachment.category === category);
            const carriedFiles = (plannedAttachments.data ?? []).filter((attachment) => attachment.category === category);
            const count = savedFiles.length + pendingFiles.length + carriedFiles.length;
            const expanded = expandedMaterial === category;
            return (
              <View key={category} style={[styles.materialGroup, { borderTopColor: colors.border }]}> 
                <View style={styles.materialRow}>
                  <Ionicons name={count ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={count ? colors.success : colors.textMuted} />
                  <Pressable disabled={!count} style={styles.attachmentName} onPress={() => setExpandedMaterial(expanded ? null : category)}><Text style={[styles.attachmentTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.help, { color: colors.textMuted }]}>{count ? `${count} attached` : 'Not attached'}</Text></Pressable>
                  {count ? <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} attached ${label.toLowerCase()}`} hitSlop={6} onPress={() => setExpandedMaterial(expanded ? null : category)}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable> : null}
                  <Pressable disabled={Boolean(pickingAttachmentType)} accessibilityRole="button" accessibilityLabel={`Attach ${singular}`} onPress={() => choosePreflightAttachment(category, singular)} style={[styles.materialAdd, { backgroundColor: colors.primarySoft, opacity: pickingAttachmentType ? 0.45 : 1 }]}>
                    <Ionicons name={pickingAttachmentType === category ? 'hourglass-outline' : 'attach'} size={18} color={colors.primary} />
                  </Pressable>
                </View>
                {expanded ? carriedFiles.map((attachment) => <View key={attachment.id} style={styles.materialFile}><Ionicons name="document-outline" size={18} color={colors.primary} /><Pressable style={styles.attachmentName} onPress={() => void openAttachment(attachment)}><Text numberOfLines={1} style={[styles.materialFileName, { color: colors.text }]}>{attachment.name}</Text><Text style={[styles.help, { color: colors.textMuted }]}>Included from flight plan</Text></Pressable></View>) : null}
                {expanded ? savedFiles.map((attachment) => <View key={attachment.id} style={styles.materialFile}>{attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.materialThumbnail} /> : <Ionicons name="document-outline" size={18} color={colors.primary} />}<Pressable style={styles.attachmentName} onPress={() => void openAttachment(attachment)}><Text numberOfLines={1} style={[styles.materialFileName, { color: colors.text }]}>{attachment.name}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => removeAttachment(attachment)}><Text style={[styles.removeAttachment, { color: colors.danger }]}>Remove</Text></Pressable></View>) : null}
                {expanded ? pendingFiles.map((attachment) => <View key={attachment.uri} style={styles.materialFile}>{attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.materialThumbnail} /> : <Ionicons name="document-outline" size={18} color={colors.primary} />}<View style={styles.attachmentName}><Text numberOfLines={1} style={[styles.materialFileName, { color: colors.text }]}>{attachment.name}</Text><Text style={[styles.help, { color: colors.textMuted }]}>Added when saved</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => removePendingAttachment(attachment)}><Text style={[styles.removeAttachment, { color: colors.danger }]}>Remove</Text></Pressable></View>) : null}
              </View>
            );
          })}

        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <View style={styles.attachmentHeading}>
            <View><Text style={[styles.sectionTitle, { color: colors.text }]}>Attachments</Text><Text style={[styles.help, { color: colors.textMuted }]}>Add photos, PDFs, or text documents to this flight.</Text></View>
          </View>
          <View style={styles.attachmentActions}>
            <Pressable disabled={Boolean(pickingAttachmentType)} accessibilityRole="button" accessibilityLabel="Add photos" onPress={() => void chooseAttachments('photos')} style={[styles.addAttachment, { borderColor: colors.primary }]}><Ionicons name="images-outline" size={17} color={colors.primary} /><Text style={[styles.addAttachmentText, { color: colors.primary }]}>{pickingAttachmentType === 'photos' ? 'Opening…' : 'Add photos'}</Text></Pressable>
            <Pressable disabled={Boolean(pickingAttachmentType)} accessibilityRole="button" accessibilityLabel="Add PDF or text file" onPress={() => void chooseAttachments('files')} style={[styles.addAttachment, { borderColor: colors.border }]}><Ionicons name="document-attach-outline" size={17} color={colors.text} /><Text style={[styles.addAttachmentText, { color: colors.text }]}>{pickingAttachmentType === 'files' ? 'Opening…' : 'Add file'}</Text></Pressable>
          </View>
          {generalAttachments.map((attachment) => (
            <View key={attachment.id} style={[styles.attachmentRow, { borderTopColor: colors.border }]}> 
              {attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.thumbnail} /> : <View style={[styles.fileIcon, { backgroundColor: colors.primarySoft }]}><Text style={[styles.fileIconText, { color: colors.primary }]}>FILE</Text></View>}
              <Pressable style={styles.attachmentName} onPress={() => void openAttachment(attachment)}><Text numberOfLines={2} style={[styles.attachmentTitle, { color: colors.text }]}>{attachment.name}</Text><Text style={[styles.help, { color: colors.textMuted }]}>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => removeAttachment(attachment)}><Text style={[styles.removeAttachment, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          ))}
          {pendingGeneralAttachments.map((attachment) => (
            <View key={attachment.uri} style={[styles.attachmentRow, { borderTopColor: colors.border }]}> 
              {attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.thumbnail} /> : <View style={[styles.fileIcon, { backgroundColor: colors.primarySoft }]}><Text style={[styles.fileIconText, { color: colors.primary }]}>NEW</Text></View>}
              <View style={styles.attachmentName}><Text numberOfLines={2} style={[styles.attachmentTitle, { color: colors.text }]}>{attachment.name}</Text><Text style={[styles.help, { color: colors.textMuted }]}>Will be added when saved</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => removePendingAttachment(attachment)}><Text style={[styles.removeAttachment, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          ))}
          {!generalAttachments.length && !pendingGeneralAttachments.length ? <Text style={[styles.emptyAttachments, { color: colors.textMuted }]}>No attachments yet.</Text> : null}
        </View>
        <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: saving || pressed ? 0.7 : 1 }]}><Text style={styles.saveText}>{saving ? 'Saving…' : logbookCompletionErrors(buildFlight()).length ? 'Save draft' : 'Save flight'}</Text></Pressable>
        {id ? <Pressable onPress={remove} style={[styles.delete, { borderColor: colors.danger }]}><Text style={[styles.deleteText, { color: colors.danger }]}>Delete flight</Text></Pressable> : null}
      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
          <View style={styles.previewBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={() => setPreviewUri(null)} style={styles.previewClose}><Ionicons name="close" size={28} color="#FFFFFF" /></Pressable>{previewUri ? <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" /> : null}</View>
        </Modal>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 21, padding: 16, gap: 13 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { width: '48%', gap: 5 },
  wideField: { width: '100%', gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, fontWeight: '700' },
  suggestions: { gap: 4 },
  suggestion: { borderWidth: StyleSheet.hairlineWidth, minHeight: 34, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 10 },
  suggestionText: { fontSize: 12, fontWeight: '700' },
  timeActions: { flexDirection: 'row', gap: 5 },
  timeInput: { flex: 1, minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9 },
  timeText: { fontSize: 13, fontWeight: '800' },
  nowButton: { minWidth: 42, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nowText: { fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  timeModal: { width: '100%', maxWidth: 340, borderWidth: 1, borderRadius: 22, padding: 16, gap: 13 },
  timeModalTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  timeColumns: { height: 250, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  timeColumn: { flex: 1 },
  timeOption: { minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timeOptionText: { fontSize: 16, fontWeight: '800' },
  timeColon: { fontSize: 24, fontWeight: '900' },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalLink: { fontSize: 12, fontWeight: '900' },
  doneButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  durationRow: { flexDirection: 'row', gap: 10 },
  durationBox: { flex: 1, borderRadius: 14, padding: 13 },
  durationLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  durationValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  help: { fontSize: 11, lineHeight: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11, fontWeight: '900' },
  save: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  delete: { minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '900' },
  attachmentHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  attachmentActions: { flexDirection: 'row', gap: 9 },
  addAttachment: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  addAttachmentText: { fontSize: 12, fontWeight: '900' },
  attachmentRow: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
  thumbnail: { width: 46, height: 46, borderRadius: 9 },
  fileIcon: { width: 46, height: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fileIconText: { fontSize: 9, fontWeight: '900' },
  attachmentName: { flex: 1 },
  attachmentTitle: { fontSize: 13, fontWeight: '800' },
  removeAttachment: { fontSize: 11, fontWeight: '900' },
  emptyAttachments: { fontSize: 12, paddingVertical: 6 },
  calculationRow: { minHeight: 58, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  calculationChoices: { gap: 7 },
  materialGroup: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 7 },
  materialRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  materialAdd: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  materialFile: { minHeight: 38, marginLeft: 30, flexDirection: 'row', alignItems: 'center', gap: 9 },
  materialThumbnail: { width: 32, height: 32, borderRadius: 7 },
  materialFileName: { fontSize: 11, fontWeight: '700' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 42, right: 20, zIndex: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '82%' }
});
