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
        setSelectedDays(editingAvailability.recurrence.daysOfWeek || []);
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

  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const handleSubmit = async () => {
    if (!selectedSpot) {
      Alert.alert('Fehler', 'Bitte wähle einen Parkplatz aus');
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
          Alert.alert('Fehler', 'Bitte wähle mindestens einen Wochentag aus');
          return;
        }
        recurrence.daysOfWeek = selectedDays;
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
      Alert.alert('Fehler', error?.message || 'Verfügbarkeit konnte nicht erstellt werden');
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
                  {showStartDatePicker && (
                    <TouchableOpacity
                      onPress={() => setShowStartDatePicker(false)}
                      style={buttonStyles.doneButton}>
                      <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => setShowStartDatePicker(true)}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatDateLabel(startDate)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {showStartDatePicker && (
                  Platform.OS === 'android' ? (
                    <DateTimePicker
                      value={startDate}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(event, date) => {
                        setShowStartDatePicker(false);
                        if (event.type === 'dismissed') return;
                        if (date) setStartDate(date);
                      }}
                    />
                  ) : (
                    <View
                      style={[
                        inputStyles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={startDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(event, date) => {
                          if (date) setStartDate(date);
                        }}
                        style={inputStyles.picker}
                      />
                    </View>
                  )
                )}
              </View>
              <View style={inputStyles.dateInputHalf}>
                <View style={inputStyles.inputLabelRow}>
                  <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>Enddatum</Text>
                  {(showEndDatePicker || endDate) && (
                    <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                      {showEndDatePicker && (
                        <TouchableOpacity
                          onPress={() => setShowEndDatePicker(false)}
                          style={buttonStyles.doneButton}>
                          <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                        </TouchableOpacity>
                      )}
                      {endDate && (
                        <TouchableOpacity
                          style={styles.clearButton}
                          onPress={() => setEndDate(null)}>
                          <MaterialCommunityIcons name="close-circle" size={20} color={colors.subtext} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => setShowEndDatePicker(true)}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="calendar" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {endDate ? formatDateLabel(endDate) : 'Optional'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {showEndDatePicker && (
                  Platform.OS === 'android' ? (
                    <DateTimePicker
                      value={endDate || new Date()}
                      mode="date"
                      display="default"
                      minimumDate={startDate}
                      onChange={(event, date) => {
                        setShowEndDatePicker(false);
                        if (event.type === 'dismissed') return;
                        if (date) setEndDate(date);
                      }}
                    />
                  ) : (
                    <View
                      style={[
                        inputStyles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={endDate || new Date()}
                        mode="date"
                        display="spinner"
                        minimumDate={startDate}
                        onChange={(event, date) => {
                          if (date) setEndDate(date);
                        }}
                        style={inputStyles.picker}
                      />
                    </View>
                  )
                )}
              </View>
                    </View>
                  </View>

          {/* Zeit (Start-Zeit, End-Zeit) */}
          <View style={inputStyles.inputGroup}>
            <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Zeit *</Text>
            <View style={inputStyles.dateRow}>
              <View style={inputStyles.dateInputHalf}>
                <View style={inputStyles.inputLabelRow}>
                  <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>Start-Zeit</Text>
                  {showStartTimePicker && (
                    <TouchableOpacity
                      onPress={() => setShowStartTimePicker(false)}
                      style={buttonStyles.doneButton}>
                      <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => setShowStartTimePicker(true)}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatTime(startTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {showStartTimePicker && (
                  Platform.OS === 'android' ? (
                    <DateTimePicker
                      value={startTime}
                      mode="time"
                      display="default"
                      onChange={(event, time) => {
                        setShowStartTimePicker(false);
                        if (event.type === 'dismissed') return;
                        if (time) setStartTime(time);
                      }}
                    />
                  ) : (
                    <View
                      style={[
                        inputStyles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={startTime}
                        mode="time"
                        display="spinner"
                        onChange={(event, time) => {
                          if (time) setStartTime(time);
                        }}
                        style={inputStyles.picker}
                      />
                    </View>
                  )
                )}
              </View>
              <View style={inputStyles.dateInputHalf}>
                <View style={inputStyles.inputLabelRow}>
                  <Text style={[inputStyles.dateInputLabel, {color: colors.subtext}]}>End-Zeit</Text>
                  {showEndTimePicker && (
                    <TouchableOpacity
                      onPress={() => setShowEndTimePicker(false)}
                      style={buttonStyles.doneButton}>
                      <Text style={buttonStyles.doneButtonText}>Fertig</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    buttonStyles.inputButton,
                    buttonStyles.inputButtonHalf,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => setShowEndTimePicker(true)}>
                  <View style={inputStyles.inputButtonInner}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} style={inputStyles.inputButtonIcon} />
                    <Text style={[buttonStyles.inputButtonText, {color: colors.brand}]}>
                      {formatTime(endTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {showEndTimePicker && (
                  Platform.OS === 'android' ? (
                    <DateTimePicker
                      value={endTime}
                      mode="time"
                      display="default"
                      onChange={(event, time) => {
                        setShowEndTimePicker(false);
                        if (event.type === 'dismissed') return;
                        if (time) setEndTime(time);
                      }}
                    />
                  ) : (
                    <View
                      style={[
                        inputStyles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={endTime}
                        mode="time"
                        display="spinner"
                        onChange={(event, time) => {
                          if (time) setEndTime(time);
                        }}
                        style={inputStyles.picker}
                      />
                    </View>
                  )
                )}
              </View>
                    </View>
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
                        {dayNames.map((day, index) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.dayButton,
                              {
                                backgroundColor: selectedDays.includes(index)
                                  ? colors.brand
                                  : colors.surface2,
                                borderColor: selectedDays.includes(index) ? colors.brand : colors.border,
                              },
                            ]}
                            onPress={() => toggleDay(index)}>
                            <Text
                              style={[
                                styles.dayButtonText,
                                {color: selectedDays.includes(index) ? '#fff' : colors.text},
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
                              const next = new Date(date);
                              next.setHours(fromDateTime.getHours(), fromDateTime.getMinutes(), 0, 0);
                              setFromDateTime(next);
                            }
                          }}
                        />
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
                                const next = new Date(date);
                                next.setHours(fromDateTime.getHours(), fromDateTime.getMinutes(), 0, 0);
                                setFromDateTime(next);
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
                              const next = new Date(fromDateTime);
                              next.setHours(time.getHours(), time.getMinutes(), 0, 0);
                              setFromDateTime(next);
                              // Auto-adjust until if needed
                              if (untilDateTime <= next) {
                                const adjustedUntil = new Date(next.getTime() + 60 * 60 * 1000);
                                setUntilDateTime(adjustedUntil);
                              }
                            }
                          }}
                        />
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
                                const next = new Date(fromDateTime);
                                next.setHours(time.getHours(), time.getMinutes(), 0, 0);
                                setFromDateTime(next);
                                // Auto-adjust until if needed
                                if (untilDateTime <= next) {
                                  const adjustedUntil = new Date(next.getTime() + 60 * 60 * 1000);
                                  setUntilDateTime(adjustedUntil);
                                }
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
                              setUntilDateTime(next);
                            }
                          }}
                        />
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
                                setUntilDateTime(next);
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
                              setUntilDateTime(next);
                            }
                          }}
                        />
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
                                setUntilDateTime(next);
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

