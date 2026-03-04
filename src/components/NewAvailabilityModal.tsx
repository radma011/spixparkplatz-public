import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  useColorScheme,
  Platform,
  Switch,
} from 'react-native';
import {showAlert} from '../utils/alertUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {formatDateLabel, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';
import {ParkingAvailability, RecurrenceRule} from '../models/ParkingAvailability';
import BaseModal from './common/Modal';
import Button from './common/Button';
import {modalStyles} from '../styles/modals';
import {inputStyles} from '../styles/inputs';
import {buttonStyles} from '../styles/buttons';
import {
  adjustDateKeepingTime,
  adjustTimeKeepingDate,
  ensureEndAfterStart,
  adjustTimesOnStartChange,
  adjustTimeOnEndChange,
  adjustDatesOnStartChange,
  adjustDateOnEndChange,
} from '../utils/dateTimeValidation';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (spotId: string, from: Date, until: Date, recurrence?: RecurrenceRule | null, autoOffer?: boolean) => Promise<void>;
  availableSpots: string[];
  editingAvailability?: ParkingAvailability | null;
}

const NewAvailabilityModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
  availableSpots,
  editingAvailability,
}) => {
  const colors = getColors(useColorScheme());
  const [selectedSpot, setSelectedSpot] = useState<string>('');
  const [showSpotPicker, setShowSpotPicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [autoOffer, setAutoOffer] = useState(true);

  // One-time availability
  const [fromDateTime, setFromDateTime] = useState(new Date());
  const [untilDateTime, setUntilDateTime] = useState(new Date());

  // Recurring availability
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());

  // Recurrence options
  const [recurrencePattern, setRecurrencePattern] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // Date/Time pickers
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showFromTimePicker, setShowFromTimePicker] = useState(false);
  const [showUntilDatePicker, setShowUntilDatePicker] = useState(false);
  const [showUntilTimePicker, setShowUntilTimePicker] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize from editingAvailability
  useEffect(() => {
    if (editingAvailability) {
      setSelectedSpot(editingAvailability.spotId);
      setIsRecurring(!!editingAvailability.recurrence);
      setAutoOffer(editingAvailability.autoOffer ?? true);
      if (editingAvailability.recurrence) {
        setStartDate(editingAvailability.from);
        setEndDate(editingAvailability.recurrence.endDate || null);
        setStartTime(editingAvailability.from);
        setEndTime(editingAvailability.until);
        setRecurrencePattern(editingAvailability.recurrence.pattern);
        setRecurrenceInterval(editingAvailability.recurrence.interval || 1);
        // Convert JS dayOfWeek (Sunday-first) to UI indices (Monday-first)
        const jsDays = editingAvailability.recurrence.daysOfWeek || [];
        setSelectedDays(jsDays.map((jsDay) => jsDayToUiIndex(jsDay)));
      } else {
        setFromDateTime(editingAvailability.from);
        setUntilDateTime(editingAvailability.until);
      }
    } else {
      // Reset to defaults
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const defaultUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      setFromDateTime(now);
      setUntilDateTime(defaultUntil);
      setStartDate(now);
      setEndDate(null);
      setStartTime(now);
      setEndTime(defaultUntil);
      setSelectedSpot(availableSpots.length > 0 ? availableSpots[0] : '');
      setIsRecurring(false);
      setRecurrencePattern('daily');
      setRecurrenceInterval(1);
      setSelectedDays([]);
      setAutoOffer(true);
    }
  }, [editingAvailability, visible]);

  // Monday-first day names (0 = Monday, 1 = Tuesday, ..., 6 = Sunday)
  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  // Convert UI index (Monday-first: 0=Mo, 1=Di, ..., 6=So) to JS dayOfWeek (Sunday-first: 0=So, 1=Mo, ..., 6=Sa)
  const uiIndexToJsDay = (uiIndex: number): number => {
    // UI: 0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So
    // JS: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
    return uiIndex === 6 ? 0 : uiIndex + 1;
  };

  // Convert JS dayOfWeek (Sunday-first) to UI index (Monday-first)
  const jsDayToUiIndex = (jsDay: number): number => {
    // JS: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
    // UI: 0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So
    return jsDay === 0 ? 6 : jsDay - 1;
  };

  const toggleDay = (uiIndex: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(uiIndex)) {
        return prev.filter((d) => d !== uiIndex).sort();
      } else {
        return [...prev, uiIndex].sort();
      }
    });
  };

  const handleSubmit = async () => {
    if (!selectedSpot) {
      showAlert('Fehler', 'Bitte wähle einen Parkplatz aus');
      return;
    }

    let from: Date;
    let until: Date;
    let recurrence: RecurrenceRule | null = null;

    if (isRecurring) {
      // Combine startDate with startTime
      from = new Date(startDate);
      from.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

      // Combine startDate with endTime (for recurring, endTime is relative to startDate)
      until = new Date(startDate);
      until.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

      // If end time is before or equal to start time, assume end time is on the next day
      if (until <= from) {
        until = new Date(startDate);
        until.setDate(until.getDate() + 1);
        until.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
      }

      recurrence = {
        pattern: recurrencePattern,
        interval: recurrenceInterval,
      };

      if (recurrencePattern === 'weekly') {
        if (selectedDays.length === 0) {
          showAlert('Fehler', 'Bitte wähle mindestens einen Wochentag aus');
          return;
        }
        // Convert UI indices (Monday-first) to JS dayOfWeek (Sunday-first)
        recurrence.daysOfWeek = selectedDays.map((uiIndex) => uiIndexToJsDay(uiIndex));
      }

      if (endDate) {
        recurrence.endDate = endDate;
      }
    } else {
      from = fromDateTime;
      until = untilDateTime;

      // If end time is before or equal to start time, assume end time is on the next day
      if (until <= from) {
        until = new Date(fromDateTime);
        until.setDate(until.getDate() + 1);
        until.setHours(untilDateTime.getHours(), untilDateTime.getMinutes(), 0, 0);
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedSpot, from, until, recurrence, autoOffer);
      onClose();
    } catch (error: any) {
      showAlert('Fehler', error?.message || 'Verfügbarkeit konnte nicht erstellt werden');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setShowFromDatePicker(false);
    setShowFromTimePicker(false);
    setShowUntilDatePicker(false);
    setShowUntilTimePicker(false);
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowSpotPicker(false);
    onClose();
  };

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      title={editingAvailability ? 'Verfügbarkeit bearbeiten' : 'Neue Verfügbarkeit'}
      maxHeight="95%"
      footer={
        <>
          <Button
            variant="cancel"
            label="Abbrechen"
            onPress={handleClose}
            disabled={isSubmitting}
            style={{backgroundColor: colors.surface2}}
            textStyle={{color: colors.text}}
          />
          <Button
            variant="primary"
            label={isSubmitting ? 'Wird gespeichert...' : editingAvailability ? 'Speichern' : 'Erstellen'}
            onPress={handleSubmit}
            disabled={isSubmitting}
            loading={isSubmitting}
            style={{backgroundColor: colors.brand}}
          />
        </>
      }>
      <ScrollView
        style={modalStyles.modalBody}
        contentContainerStyle={modalStyles.modalBodyContent}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          if (showSpotPicker) {
            setShowSpotPicker(false);
          }
        }}>
        {/* Parkplatz-Auswahl */}
        <View style={inputStyles.inputGroup}>
          <View style={inputStyles.inputLabelRow}>
            <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Parkplatz *</Text>
            {availableSpots.length > 1 ? (
              <View style={inputStyles.spotPickerContainer}>
                <TouchableOpacity
                  onPress={() => setShowSpotPicker(!showSpotPicker)}
                  style={[inputStyles.spotPickerButton, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                  <Text style={[inputStyles.spotText, {color: colors.text}]}>P {selectedSpot}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text} />
                </TouchableOpacity>
                {showSpotPicker && (
                  <View
                    style={[inputStyles.pickerCard, {backgroundColor: colors.surface, borderColor: colors.border}]}
                    pointerEvents="box-none">
                    <View pointerEvents="auto">
                      <ScrollView style={inputStyles.pickerBody}>
                        {availableSpots.map((spot) => (
                          <TouchableOpacity
                            key={spot}
                            onPress={() => {
                              setSelectedSpot(spot);
                              setShowSpotPicker(false);
                            }}
                            activeOpacity={0.7}
                            style={[
                              inputStyles.pickerItem,
                              {borderBottomColor: colors.border},
                              selectedSpot === spot && {backgroundColor: colors.surface2},
                            ]}>
                            <Text style={[inputStyles.pickerItemText, {color: colors.text}]}>P {spot}</Text>
                            {selectedSpot === spot && (
                              <MaterialCommunityIcons name="check" size={20} color={colors.brand} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[inputStyles.spotText, {color: colors.text}]}>P {availableSpots[0]}</Text>
            )}
          </View>
        </View>

        {/* Wiederkehrend Toggle */}
        <View style={inputStyles.inputGroup}>
          <View style={inputStyles.switchRow}>
            <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Wiederkehrend</Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{false: colors.border, true: colors.brand + '80'}}
                    thumbColor={isRecurring ? colors.brand : '#f4f3f4'}
                  />
                </View>
              </View>

        {/* Automatisch anbieten Toggle */}
        <View style={inputStyles.inputGroup}>
          <View style={inputStyles.switchRow}>
            <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Automatisch anbieten</Text>
                  <Switch
                    value={autoOffer}
                    onValueChange={setAutoOffer}
                    trackColor={{false: colors.border, true: colors.brand + '80'}}
                    thumbColor={autoOffer ? colors.brand : '#f4f3f4'}
                  />
                </View>
              </View>

              {isRecurring ? (
                <>
          {/* Zeitraum (Startdatum, Enddatum) */}
          <View style={inputStyles.inputGroup}>
            <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Zeitraum</Text>
            <View style={inputStyles.dateRow}>
              <View style={inputStyles.dateInputHalf}>
                <View style={inputStyles.inputLabelRow}>
                  <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>Startdatum *</Text>
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    const next = !showStartDatePicker;
                    setShowStartDatePicker(next);
                    if (next) {
                      setShowEndDatePicker(false);
                      setShowStartTimePicker(false);
                      setShowEndTimePicker(false);
                    }
                  }}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatDateLabel(startDate)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              <View style={inputStyles.dateInputHalf}>
                <View style={inputStyles.inputLabelRow}>
                  <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>Enddatum</Text>
                  {endDate && (
                    <TouchableOpacity
                      style={styles.clearButton}
                      onPress={() => setEndDate(null)}>
                      <MaterialCommunityIcons name="close-circle" size={20} color={colors.subtext} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    const next = !showEndDatePicker;
                    setShowEndDatePicker(next);
                    if (next) {
                      setShowStartDatePicker(false);
                      setShowStartTimePicker(false);
                      setShowEndTimePicker(false);
                    }
                  }}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {endDate ? formatDateLabel(endDate) : 'Optional'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            {/* iOS & Web Date Pickers - render inline (spinner on iOS, native input on Web) */}
            {Platform.OS === 'ios' && showStartDatePicker && (
              <View style={[
                inputStyles.pickerContainer,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                  marginTop: 8,
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'hidden',
                },
              ]}>
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(event, date) => {
                    if (date) {
                      setStartDate(date);
                      // Ensure endDate is not before startDate
                      if (endDate) {
                        const adjusted = adjustDateOnEndChange(date, endDate, 0);
                        setEndDate(adjusted);
                      }
                    }
                  }}
                  style={[inputStyles.picker, {width: '100%', maxWidth: '100%'}]}
                />
              </View>
            )}
            {Platform.OS === 'web' && showStartDatePicker && (
              <View
                style={[
                  inputStyles.pickerContainer,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    marginTop: 8,
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden',
                  },
                ]}>
                {/* @ts-ignore web-only input */}
                <input
                  type="date"
                  value={(() => {
                    const d = startDate;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  })()}
                  min={(() => {
                    const d = new Date();
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  })()}
                  onChange={(e: any) => {
                    const value = e.target.value as string;
                    if (!value) return;
                    const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                    if (!year || !month || !day) return;
                    const next = new Date(startDate);
                    next.setFullYear(year, month - 1, day);
                    setStartDate(next);
                    if (endDate) {
                      const adjusted = adjustDateOnEndChange(next, endDate, 0);
                      setEndDate(adjusted);
                    }
                  }}
                  style={{width: '100%', padding: 8, fontSize: 14}}
                />
              </View>
            )}
            {Platform.OS === 'ios' && showEndDatePicker && (
              <View style={[
                inputStyles.pickerContainer,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                  marginTop: 8,
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'hidden',
                },
              ]}>
                <DateTimePicker
                  value={endDate || new Date()}
                  mode="date"
                  display="spinner"
                  minimumDate={startDate}
                  onChange={(event, date) => {
                    if (date) {
                      // Ensure endDate is not before startDate
                      if (date < startDate) {
                        setEndDate(startDate);
                      } else {
                        setEndDate(date);
                      }
                    }
                  }}
                  style={[inputStyles.picker, {width: '100%', maxWidth: '100%'}]}
                />
              </View>
            )}
            {Platform.OS === 'web' && showEndDatePicker && (
              <View
                style={[
                  inputStyles.pickerContainer,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    marginTop: 8,
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden',
                  },
                ]}>
                {/* @ts-ignore web-only input */}
                <input
                  type="date"
                  value={(() => {
                    const d = endDate || startDate;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  })()}
                  min={(() => {
                    const d = startDate;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  })()}
                  onChange={(e: any) => {
                    const value = e.target.value as string;
                    if (!value) return;
                    const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                    if (!year || !month || !day) return;
                    const picked = new Date(startDate);
                    picked.setFullYear(year, month - 1, day);
                    if (picked < startDate) {
                      setEndDate(startDate);
                    } else {
                      setEndDate(picked);
                    }
                  }}
                  style={{width: '100%', padding: 8, fontSize: 14}}
                />
              </View>
            )}
            {/* Android Date Pickers - rendered inline */}
            {Platform.OS === 'android' && showStartDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setShowStartDatePicker(false);
                  if (event.type === 'dismissed') return;
                  if (date) {
                    setStartDate(date);
                    // Ensure endDate is not before startDate
                    if (endDate) {
                      const adjusted = adjustDateOnEndChange(date, endDate, 0);
                      setEndDate(adjusted);
                    }
                  }
                }}
              />
            )}
            {Platform.OS === 'android' && showEndDatePicker && (
              <DateTimePicker
                value={endDate || new Date()}
                mode="date"
                display="default"
                minimumDate={startDate}
                onChange={(event, date) => {
                  setShowEndDatePicker(false);
                  if (event.type === 'dismissed') return;
                  if (date) {
                    // Ensure endDate is not before startDate
                    const adjusted = adjustDateOnEndChange(startDate, date, 0);
                    setEndDate(adjusted);
                  }
                }}
              />
            )}
          </View>

          {/* Zeit (Start-Zeit, End-Zeit) */}
          <View style={inputStyles.inputGroup}>
            <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Zeit *</Text>
            <View style={inputStyles.dateRow}>
              <View style={inputStyles.dateInputHalf}>
                <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>Start-Zeit</Text>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    const next = !showStartTimePicker;
                    setShowStartTimePicker(next);
                    if (next) {
                      setShowStartDatePicker(false);
                      setShowEndDatePicker(false);
                      setShowEndTimePicker(false);
                    }
                  }}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatTime(startTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              <View style={inputStyles.dateInputHalf}>
                <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>End-Zeit</Text>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    const next = !showEndTimePicker;
                    setShowEndTimePicker(next);
                    if (next) {
                      setShowStartDatePicker(false);
                      setShowEndDatePicker(false);
                      setShowStartTimePicker(false);
                    }
                  }}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatTime(endTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            {/* iOS & Web Time Pickers - render inline (spinner on iOS, native input on Web) */}
            {Platform.OS === 'ios' && showStartTimePicker && (
              <View style={[
                inputStyles.pickerContainer,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                  marginTop: 8,
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'hidden',
                },
              ]}>
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="spinner"
                  onChange={(event, time) => {
                    if (time) {
                      setStartTime(time);
                      // Check if endTime is before startTime (same day)
                      const startTimeOnly = new Date(startDate);
                      startTimeOnly.setHours(time.getHours(), time.getMinutes(), 0, 0);
                      const endTimeOnly = new Date(startDate);
                      endTimeOnly.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
                      // If endTime is before or equal to startTime, adjust endTime
                      if (endTimeOnly <= startTimeOnly) {
                        const adjustedEndTime = new Date(startTimeOnly);
                        adjustedEndTime.setHours(time.getHours() + 1, time.getMinutes(), 0, 0);
                        setEndTime(adjustedEndTime);
                      }
                    }
                  }}
                  style={[inputStyles.picker, {width: '100%', maxWidth: '100%'}]}
                />
              </View>
            )}
            {Platform.OS === 'web' && showStartTimePicker && (
              <View
                style={[
                  inputStyles.pickerContainer,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    marginTop: 8,
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden',
                  },
                ]}>
                {/* @ts-ignore web-only input */}
                <input
                  type="time"
                  step={900}
                  value={(() => {
                    const d = startTime;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  onChange={(e: any) => {
                    const value = e.target.value as string;
                    if (!value) return;
                    const [h, m] = value.split(':').map((v) => parseInt(v, 10));
                    if (h == null || m == null) return;
                    const time = new Date(startTime);
                    time.setHours(h, m, 0, 0);
                    setStartTime(time);
                    const startTimeOnly = new Date(startDate);
                    startTimeOnly.setHours(time.getHours(), time.getMinutes(), 0, 0);
                    const endTimeOnly = new Date(startDate);
                    endTimeOnly.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
                    if (endTimeOnly <= startTimeOnly) {
                      const adjustedEndTime = new Date(startTimeOnly);
                      adjustedEndTime.setHours(time.getHours() + 1, time.getMinutes(), 0, 0);
                      setEndTime(adjustedEndTime);
                    }
                  }}
                  style={{width: '100%', padding: 8, fontSize: 14}}
                />
              </View>
            )}
            {Platform.OS === 'ios' && showEndTimePicker && (
              <View style={[
                inputStyles.pickerContainer,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                  marginTop: 8,
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'hidden',
                },
              ]}>
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="spinner"
                  onChange={(event, time) => {
                    if (time) {
                      // Check if endTime is before startTime (same day)
                      const startTimeOnly = new Date(startDate);
                      startTimeOnly.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
                      const endTimeOnly = new Date(startDate);
                      endTimeOnly.setHours(time.getHours(), time.getMinutes(), 0, 0);
                      // If endTime is before or equal to startTime, it's OK (will be next day in submit)
                      // But we can set it to at least startTime + 1 hour for better UX
                      if (endTimeOnly <= startTimeOnly) {
                        const adjustedEndTime = new Date(startTimeOnly);
                        adjustedEndTime.setHours(startTime.getHours() + 1, startTime.getMinutes(), 0, 0);
                        setEndTime(adjustedEndTime);
                      } else {
                        setEndTime(time);
                      }
                    }
                  }}
                  style={[inputStyles.picker, {width: '100%', maxWidth: '100%'}]}
                />
              </View>
            )}
            {Platform.OS === 'web' && showEndTimePicker && (
              <View
                style={[
                  inputStyles.pickerContainer,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    marginTop: 8,
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden',
                  },
                ]}>
                {/* @ts-ignore web-only input */}
                <input
                  type="time"
                  step={900}
                  value={(() => {
                    const d = endTime;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  onChange={(e: any) => {
                    const value = e.target.value as string;
                    if (!value) return;
                    const [h, m] = value.split(':').map((v) => parseInt(v, 10));
                    if (h == null || m == null) return;
                    const picked = new Date(endTime);
                    picked.setHours(h, m, 0, 0);
                    const startTimeOnly = new Date(startDate);
                    startTimeOnly.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
                    const endTimeOnly = new Date(startDate);
                    endTimeOnly.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                    if (endTimeOnly <= startTimeOnly) {
                      const adjustedEndTime = new Date(startTimeOnly);
                      adjustedEndTime.setHours(startTime.getHours() + 1, startTime.getMinutes(), 0, 0);
                      setEndTime(adjustedEndTime);
                    } else {
                      setEndTime(picked);
                    }
                  }}
                  style={{width: '100%', padding: 8, fontSize: 14}}
                />
              </View>
            )}
            {/* Android Time Pickers - rendered inline */}
            {Platform.OS === 'android' && showStartTimePicker && (
              <DateTimePicker
                value={startTime}
                mode="time"
                display="default"
                onChange={(event, time) => {
                  setShowStartTimePicker(false);
                  if (event.type === 'dismissed') return;
                  if (time) {
                    const result = adjustTimesOnStartChange(startDate, time, endTime, 1);
                    setStartTime(result.start);
                    setEndTime(result.end);
                  }
                }}
              />
            )}
            {Platform.OS === 'android' && showEndTimePicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                display="default"
                onChange={(event, time) => {
                  setShowEndTimePicker(false);
                  if (event.type === 'dismissed') return;
                  if (time) {
                    const adjusted = adjustTimeOnEndChange(startDate, startTime, time, 1);
                    setEndTime(adjusted);
                  }
                }}
              />
            )}
          </View>

          {/* Wiederholungsmuster */}
          <View style={inputStyles.inputGroup}>
            <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Wiederholungsmuster</Text>
                    <View style={styles.patternButtons}>
                      {(['daily', 'weekly', 'monthly'] as const).map((pattern) => (
                        <TouchableOpacity
                          key={pattern}
                          style={[
                            styles.patternButton,
                            {
                              backgroundColor:
                                recurrencePattern === pattern ? colors.brand : colors.surface2,
                              borderColor: recurrencePattern === pattern ? colors.brand : colors.border,
                            },
                          ]}
                          onPress={() => setRecurrencePattern(pattern)}>
                          <Text
                            style={[
                              styles.patternButtonText,
                              {color: recurrencePattern === pattern ? '#fff' : colors.text},
                            ]}>
                            {pattern === 'daily' ? 'Täglich' : pattern === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

          {/* Interval */}
          {recurrencePattern !== 'weekly' && (
            <View style={inputStyles.inputGroup}>
              <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Intervall</Text>
                      <View style={styles.intervalRow}>
                        <Text style={[styles.intervalLabel, {color: colors.text}]}>
                          Alle {recurrenceInterval} {recurrencePattern === 'daily' ? 'Tage' : 'Monate'}
                        </Text>
                        <View style={styles.intervalButtons}>
                          <TouchableOpacity
                            style={[styles.intervalButton, {backgroundColor: colors.surface2}]}
                            onPress={() => setRecurrenceInterval(Math.max(1, recurrenceInterval - 1))}>
                            <Text style={[styles.intervalButtonText, {color: colors.text}]}>-</Text>
                          </TouchableOpacity>
                          <Text style={[styles.intervalValue, {color: colors.text}]}>
                            {recurrenceInterval}
                          </Text>
                          <TouchableOpacity
                            style={[styles.intervalButton, {backgroundColor: colors.surface2}]}
                            onPress={() => setRecurrenceInterval(recurrenceInterval + 1)}>
                            <Text style={[styles.intervalButtonText, {color: colors.text}]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

          {/* Wochentage (für weekly) */}
          {recurrencePattern === 'weekly' && (
            <View style={inputStyles.inputGroup}>
              <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Wochentage *</Text>
                      <View style={styles.daysRow}>
                        {dayNames.map((day, uiIndex) => (
                          <TouchableOpacity
                            key={uiIndex}
                            style={[
                              styles.dayButton,
                              {
                                backgroundColor: selectedDays.includes(uiIndex)
                                  ? colors.brand
                                  : colors.surface2,
                                borderColor: selectedDays.includes(uiIndex) ? colors.brand : colors.border,
                              },
                            ]}
                            onPress={() => toggleDay(uiIndex)}>
                            <Text
                              style={[
                                styles.dayButtonText,
                                {color: selectedDays.includes(uiIndex) ? '#fff' : colors.text},
                              ]}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
          {/* Von (Datum + Zeit) */}
          <View style={inputStyles.inputGroup}>
            <View style={inputStyles.inputLabelRow}>
              <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Von</Text>
                      {(showFromDatePicker || showFromTimePicker) && (
                        <TouchableOpacity
                          onPress={() => {
                            setShowFromDatePicker(false);
                            setShowFromTimePicker(false);
                          }}
                          style={buttonStyles.doneButton}>
                          <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                        </TouchableOpacity>
                      )}
                    </View>
            <View style={inputStyles.dateTimeRow}>
              <TouchableOpacity
                style={[
                  buttonStyles.inputButton,
                  buttonStyles.inputButtonHalf,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                ]}
                        onPress={() => {
                          const next = !showFromDatePicker;
                          setShowFromDatePicker(next);
                          if (next) {
                            setShowFromTimePicker(false);
                            setShowUntilDatePicker(false);
                            setShowUntilTimePicker(false);
                          }
                        }}>
                        <View style={inputStyles.inputButtonInner}>
                          <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                          <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                            {formatDateLabel(fromDateTime)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          buttonStyles.inputButton,
                          buttonStyles.inputButtonHalf,
                          {backgroundColor: colors.surface2, borderColor: colors.border},
                        ]}
                        onPress={() => {
                          const next = !showFromTimePicker;
                          setShowFromTimePicker(next);
                          if (next) {
                            setShowFromDatePicker(false);
                            setShowUntilDatePicker(false);
                            setShowUntilTimePicker(false);
                          }
                        }}>
                        <View style={inputStyles.inputButtonInner}>
                          <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                          <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                            {formatTime(fromDateTime)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                    {showFromDatePicker && (
                      Platform.OS === 'android' ? (
                        <DateTimePicker
                          value={fromDateTime}
                          mode="date"
                          display="default"
                          minimumDate={new Date()}
                          onChange={(event, date) => {
                            setShowFromDatePicker(false);
                            if (event.type === 'dismissed') return;
                            if (date) {
                              const result = adjustDateKeepingTime(date, fromDateTime, untilDateTime, 1);
                              setFromDateTime(result.adjusted);
                              setUntilDateTime(result.other);
                            }
                          }}
                        />
                      ) : Platform.OS === 'web' ? (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          {/* @ts-ignore web-only input */}
                          <input
                            type="date"
                            value={(() => {
                              const d = fromDateTime;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                            })()}
                            min={(() => {
                              const d = new Date();
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                            })()}
                            onChange={(e: any) => {
                              const value = e.target.value as string;
                              if (!value) return;
                              const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                              if (!year || !month || !day) return;
                              const picked = new Date(fromDateTime);
                              picked.setFullYear(year, month - 1, day);
                              const result = adjustDateKeepingTime(picked, fromDateTime, untilDateTime, 1);
                              setFromDateTime(result.adjusted);
                              setUntilDateTime(result.other);
                            }}
                            style={{width: '100%', padding: 8, fontSize: 14}}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          <DateTimePicker
                            value={fromDateTime}
                            mode="date"
                            display="spinner"
                            minimumDate={new Date()}
                            onChange={(event, date) => {
                              if (date) {
                                const result = adjustDateKeepingTime(date, fromDateTime, untilDateTime, 1);
                                setFromDateTime(result.adjusted);
                                setUntilDateTime(result.other);
                              }
                            }}
                            style={inputStyles.picker}
                          />
                        </View>
                      )
                    )}
                    {showFromTimePicker && (
                      Platform.OS === 'android' ? (
                        <DateTimePicker
                          value={fromDateTime}
                          mode="time"
                          display="default"
                          minuteInterval={15}
                          onChange={(event, time) => {
                            setShowFromTimePicker(false);
                            if (event.type === 'dismissed') return;
                            if (time) {
                              const result = adjustTimeKeepingDate(fromDateTime, time, untilDateTime, 1);
                              setFromDateTime(result.adjusted);
                              setUntilDateTime(result.other);
                            }
                          }}
                        />
                      ) : Platform.OS === 'web' ? (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          {/* @ts-ignore web-only input */}
                          <input
                            type="time"
                            step={900}
                            value={(() => {
                              const d = fromDateTime;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            })()}
                            onChange={(e: any) => {
                              const value = e.target.value as string;
                              if (!value) return;
                              const [h, m] = value.split(':').map((v) => parseInt(v, 10));
                              if (h == null || m == null) return;
                              const picked = new Date(fromDateTime);
                              picked.setHours(h, m, 0, 0);
                              const result = adjustTimeKeepingDate(fromDateTime, picked, untilDateTime, 1);
                              setFromDateTime(result.adjusted);
                              setUntilDateTime(result.other);
                            }}
                            style={{width: '100%', padding: 8, fontSize: 14}}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          <DateTimePicker
                            value={fromDateTime}
                            mode="time"
                            display="spinner"
                            minuteInterval={15}
                            onChange={(event, time) => {
                              if (time) {
                                const result = adjustTimeKeepingDate(fromDateTime, time, untilDateTime, 1);
                                setFromDateTime(result.adjusted);
                                setUntilDateTime(result.other);
                              }
                            }}
                            style={inputStyles.picker}
                          />
                        </View>
                      )
                    )}
                  </View>

          {/* Bis (Datum + Zeit) */}
          <View style={inputStyles.inputGroup}>
            <View style={inputStyles.inputLabelRow}>
              <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Bis</Text>
                      {(showUntilDatePicker || showUntilTimePicker) && (
                        <TouchableOpacity
                          onPress={() => {
                            setShowUntilDatePicker(false);
                            setShowUntilTimePicker(false);
                          }}
                          style={buttonStyles.doneButton}>
                          <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                        </TouchableOpacity>
                      )}
                    </View>
            <View style={inputStyles.dateTimeRow}>
              <TouchableOpacity
                style={[
                  buttonStyles.inputButton,
                  buttonStyles.inputButtonHalf,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                ]}
                        onPress={() => {
                          const next = !showUntilDatePicker;
                          setShowUntilDatePicker(next);
                          if (next) {
                            setShowFromDatePicker(false);
                            setShowFromTimePicker(false);
                            setShowUntilTimePicker(false);
                          }
                        }}>
                        <View style={inputStyles.inputButtonInner}>
                          <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                          <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                            {formatDateLabel(untilDateTime)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          buttonStyles.inputButton,
                          buttonStyles.inputButtonHalf,
                          {backgroundColor: colors.surface2, borderColor: colors.border},
                        ]}
                        onPress={() => {
                          const next = !showUntilTimePicker;
                          setShowUntilTimePicker(next);
                          if (next) {
                            setShowFromDatePicker(false);
                            setShowFromTimePicker(false);
                            setShowUntilDatePicker(false);
                          }
                        }}>
                        <View style={inputStyles.inputButtonInner}>
                          <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                          <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                            {formatTime(untilDateTime)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                    {showUntilDatePicker && (
                      Platform.OS === 'android' ? (
                        <DateTimePicker
                          value={untilDateTime}
                          mode="date"
                          display="default"
                          minimumDate={fromDateTime}
                          onChange={(event, date) => {
                            setShowUntilDatePicker(false);
                            if (event.type === 'dismissed') return;
                            if (date) {
                              const next = new Date(date);
                              next.setHours(untilDateTime.getHours(), untilDateTime.getMinutes(), 0, 0);
                              const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                              setUntilDateTime(adjusted);
                            }
                          }}
                        />
                      ) : Platform.OS === 'web' ? (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          {/* @ts-ignore web-only input */}
                          <input
                            type="date"
                            value={(() => {
                              const d = untilDateTime;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                            })()}
                            min={(() => {
                              const d = fromDateTime;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                            })()}
                            onChange={(e: any) => {
                              const value = e.target.value as string;
                              if (!value) return;
                              const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                              if (!year || !month || !day) return;
                              const picked = new Date(untilDateTime);
                              picked.setFullYear(year, month - 1, day);
                              const next = new Date(picked);
                              next.setHours(untilDateTime.getHours(), untilDateTime.getMinutes(), 0, 0);
                              const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                              setUntilDateTime(adjusted);
                            }}
                            style={{width: '100%', padding: 8, fontSize: 14}}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          <DateTimePicker
                            value={untilDateTime}
                            mode="date"
                            display="spinner"
                            minimumDate={fromDateTime}
                            onChange={(event, date) => {
                              if (date) {
                                const next = new Date(date);
                                next.setHours(untilDateTime.getHours(), untilDateTime.getMinutes(), 0, 0);
                                const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                                setUntilDateTime(adjusted);
                              }
                            }}
                            style={inputStyles.picker}
                          />
                        </View>
                      )
                    )}
                    {showUntilTimePicker && (
                      Platform.OS === 'android' ? (
                        <DateTimePicker
                          value={untilDateTime}
                          mode="time"
                          display="default"
                          minuteInterval={15}
                          onChange={(event, time) => {
                            setShowUntilTimePicker(false);
                            if (event.type === 'dismissed') return;
                            if (time) {
                              const next = new Date(untilDateTime);
                              next.setHours(time.getHours(), time.getMinutes(), 0, 0);
                              const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                              setUntilDateTime(adjusted);
                            }
                          }}
                        />
                      ) : Platform.OS === 'web' ? (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          {/* @ts-ignore web-only input */}
                          <input
                            type="time"
                            step={900}
                            value={(() => {
                              const d = untilDateTime;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            })()}
                            onChange={(e: any) => {
                              const value = e.target.value as string;
                              if (!value) return;
                              const [h, m] = value.split(':').map((v) => parseInt(v, 10));
                              if (h == null || m == null) return;
                              const picked = new Date(untilDateTime);
                              picked.setHours(h, m, 0, 0);
                              const next = new Date(picked);
                              const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                              setUntilDateTime(adjusted);
                            }}
                            style={{width: '100%', padding: 8, fontSize: 14}}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            inputStyles.pickerContainer,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}>
                          <DateTimePicker
                            value={untilDateTime}
                            mode="time"
                            display="spinner"
                            minuteInterval={15}
                            onChange={(event, time) => {
                              if (time) {
                                const next = new Date(untilDateTime);
                                next.setHours(time.getHours(), time.getMinutes(), 0, 0);
                                const adjusted = ensureEndAfterStart(fromDateTime, next, 1);
                                setUntilDateTime(adjusted);
                              }
                            }}
                            style={inputStyles.picker}
                          />
                        </View>
                      )
                    )}
                  </View>
                </>
              )}
      </ScrollView>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  // Modal, input, and button styles moved to src/styles/modals.ts, src/styles/inputs.ts, and src/styles/buttons.ts
  // Only component-specific styles remain below
  clearButton: {
    position: 'absolute',
    right: 8,
    top: 32,
  },
  // Spot picker styles moved to src/styles/inputs.ts
  patternButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  patternButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  patternButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  intervalLabel: {
    fontSize: 16,
  },
  intervalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  intervalButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intervalButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  intervalValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  dayButton: {
    flex: 1,
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Button styles moved to src/styles/buttons.ts
});

export default NewAvailabilityModal;

