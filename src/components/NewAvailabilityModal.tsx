import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  useColorScheme,
  Platform,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {formatDateLabel, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';
import {ParkingAvailability, RecurrenceRule} from '../models/ParkingAvailability';

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
      setSelectedSpot('');
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

      if (until <= from) {
        Alert.alert('Fehler', 'End-Zeit muss nach Start-Zeit liegen');
        return;
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

      if (until <= from) {
        Alert.alert('Fehler', 'Bis muss nach Von liegen');
        return;
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
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{width: '100%', maxWidth: 500}}>
            <View
              style={[
                styles.modalContent,
                {backgroundColor: colors.surface},
                colors.isDark && {borderWidth: 1, borderColor: colors.border, shadowOpacity: 0, elevation: 0},
              ]}>
              <View style={[styles.modalHeader, {borderBottomColor: colors.border}]}>
                <Text style={[styles.modalTitle, {color: colors.text}]}>
                  {editingAvailability ? 'Verfügbarkeit bearbeiten' : 'Neue Verfügbarkeit'}
                </Text>
                <TouchableOpacity onPress={handleClose}>
                  <Text style={[styles.modalCloseButton, {color: colors.subtext}]}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled">
              {/* Parkplatz-Auswahl */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, {color: colors.text}]}>Parkplatz *</Text>
                <View style={styles.spotButtons}>
                  {availableSpots.map((spot) => (
                    <TouchableOpacity
                      key={spot}
                      style={[
                        styles.spotButton,
                        {
                          backgroundColor: selectedSpot === spot ? colors.brand : colors.surface2,
                          borderColor: selectedSpot === spot ? colors.brand : colors.border,
                        },
                      ]}
                      onPress={() => setSelectedSpot(spot)}>
                      <Text
                        style={[
                          styles.spotButtonText,
                          {color: selectedSpot === spot ? '#fff' : colors.text},
                        ]}>
                        {spot}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Wiederkehrend Toggle */}
              <View style={styles.inputGroup}>
                <View style={styles.switchRow}>
                  <Text style={[styles.inputLabel, {color: colors.text}]}>Wiederkehrend</Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{false: colors.border, true: colors.brand + '80'}}
                    thumbColor={isRecurring ? colors.brand : '#f4f3f4'}
                  />
                </View>
              </View>

              {/* Automatisch anbieten Toggle */}
              <View style={styles.inputGroup}>
                <View style={styles.switchRow}>
                  <Text style={[styles.inputLabel, {color: colors.text}]}>Automatisch anbieten</Text>
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
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, {color: colors.text}]}>Zeitraum</Text>
                    <View style={styles.dateRow}>
                      <View style={styles.dateInputHalf}>
                        <Text style={[styles.dateInputLabel, {color: colors.subtext}]}>Startdatum *</Text>
                        <TouchableOpacity
                          style={[
                            styles.inputButton,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}
                          onPress={() => setShowStartDatePicker(true)}>
                          <MaterialCommunityIcons name="calendar" size={20} color={colors.text} />
                          <Text style={[styles.inputButtonText, {color: colors.text}]}>
                            {formatDateLabel(startDate)}
                          </Text>
                        </TouchableOpacity>
                        {showStartDatePicker && (
                          <DateTimePicker
                            value={startDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                              if (Platform.OS === 'android') {
                                setShowStartDatePicker(false);
                                if (event.type === 'dismissed') return;
                              }
                              if (date) setStartDate(date);
                            }}
                            minimumDate={new Date()}
                          />
                        )}
                      </View>
                      <View style={styles.dateInputHalf}>
                        <Text style={[styles.dateInputLabel, {color: colors.subtext}]}>Enddatum</Text>
                        <TouchableOpacity
                          style={[
                            styles.inputButton,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}
                          onPress={() => setShowEndDatePicker(true)}>
                          <MaterialCommunityIcons name="calendar" size={20} color={colors.text} />
                          <Text style={[styles.inputButtonText, {color: colors.text}]}>
                            {endDate ? formatDateLabel(endDate) : 'Optional'}
                          </Text>
                        </TouchableOpacity>
                        {endDate && (
                          <TouchableOpacity
                            style={styles.clearButton}
                            onPress={() => setEndDate(null)}>
                            <MaterialCommunityIcons name="close-circle" size={20} color={colors.subtext} />
                          </TouchableOpacity>
                        )}
                        {showEndDatePicker && (
                          <DateTimePicker
                            value={endDate || new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                              if (Platform.OS === 'android') {
                                setShowEndDatePicker(false);
                                if (event.type === 'dismissed') return;
                              }
                              if (date) setEndDate(date);
                            }}
                            minimumDate={startDate}
                          />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Zeit (Start-Zeit, End-Zeit) */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, {color: colors.text}]}>Zeit *</Text>
                    <View style={styles.dateRow}>
                      <View style={styles.dateInputHalf}>
                        <Text style={[styles.dateInputLabel, {color: colors.subtext}]}>Start-Zeit</Text>
                        <TouchableOpacity
                          style={[
                            styles.inputButton,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}
                          onPress={() => setShowStartTimePicker(true)}>
                          <MaterialCommunityIcons name="clock-outline" size={20} color={colors.text} />
                          <Text style={[styles.inputButtonText, {color: colors.text}]}>
                            {formatTime(startTime)}
                          </Text>
                        </TouchableOpacity>
                        {showStartTimePicker && (
                          <DateTimePicker
                            value={startTime}
                            mode="time"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, time) => {
                              if (Platform.OS === 'android') {
                                setShowStartTimePicker(false);
                                if (event.type === 'dismissed') return;
                              }
                              if (time) setStartTime(time);
                            }}
                          />
                        )}
                      </View>
                      <View style={styles.dateInputHalf}>
                        <Text style={[styles.dateInputLabel, {color: colors.subtext}]}>End-Zeit</Text>
                        <TouchableOpacity
                          style={[
                            styles.inputButton,
                            {backgroundColor: colors.surface2, borderColor: colors.border},
                          ]}
                          onPress={() => setShowEndTimePicker(true)}>
                          <MaterialCommunityIcons name="clock-outline" size={20} color={colors.text} />
                          <Text style={[styles.inputButtonText, {color: colors.text}]}>
                            {formatTime(endTime)}
                          </Text>
                        </TouchableOpacity>
                        {showEndTimePicker && (
                          <DateTimePicker
                            value={endTime}
                            mode="time"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, time) => {
                              if (Platform.OS === 'android') {
                                setShowEndTimePicker(false);
                                if (event.type === 'dismissed') return;
                              }
                              if (time) setEndTime(time);
                            }}
                          />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Wiederholungsmuster */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, {color: colors.text}]}>Wiederholungsmuster</Text>
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
                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, {color: colors.text}]}>Intervall</Text>
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
                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, {color: colors.text}]}>Wochentage *</Text>
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
                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Text style={[styles.inputLabel, {color: colors.text}]}>Von</Text>
                      {(showFromDatePicker || showFromTimePicker) && (
                        <TouchableOpacity
                          onPress={() => {
                            setShowFromDatePicker(false);
                            setShowFromTimePicker(false);
                          }}
                          style={styles.doneButton}>
                          <Text style={styles.doneButtonText}>Fertig</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.dateTimeRow}>
                      <TouchableOpacity
                        style={[
                          styles.inputButton,
                          styles.inputButtonHalf,
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
                        <MaterialCommunityIcons name="calendar" size={20} color={colors.text} />
                        <Text style={[styles.inputButtonText, {color: colors.text}]}>
                          {formatDateLabel(fromDateTime)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.inputButton,
                          styles.inputButtonHalf,
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
                        <MaterialCommunityIcons name="clock-outline" size={20} color={colors.text} />
                        <Text style={[styles.inputButtonText, {color: colors.text}]}>
                          {formatTime(fromDateTime)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showFromDatePicker && (
                      <DateTimePicker
                        value={fromDateTime}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                          if (Platform.OS === 'android') {
                            setShowFromDatePicker(false);
                            if (event.type === 'dismissed') return;
                          }
                          if (date) {
                            const next = new Date(date);
                            next.setHours(fromDateTime.getHours(), fromDateTime.getMinutes(), 0, 0);
                            setFromDateTime(next);
                          }
                        }}
                        minimumDate={new Date()}
                      />
                    )}
                    {showFromTimePicker && (
                      <DateTimePicker
                        value={fromDateTime}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, time) => {
                          if (Platform.OS === 'android') {
                            setShowFromTimePicker(false);
                            if (event.type === 'dismissed') return;
                          }
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
                    )}
                  </View>

                  {/* Bis (Datum + Zeit) */}
                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Text style={[styles.inputLabel, {color: colors.text}]}>Bis</Text>
                      {(showUntilDatePicker || showUntilTimePicker) && (
                        <TouchableOpacity
                          onPress={() => {
                            setShowUntilDatePicker(false);
                            setShowUntilTimePicker(false);
                          }}
                          style={styles.doneButton}>
                          <Text style={styles.doneButtonText}>Fertig</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.dateTimeRow}>
                      <TouchableOpacity
                        style={[
                          styles.inputButton,
                          styles.inputButtonHalf,
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
                        <MaterialCommunityIcons name="calendar" size={20} color={colors.text} />
                        <Text style={[styles.inputButtonText, {color: colors.text}]}>
                          {formatDateLabel(untilDateTime)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.inputButton,
                          styles.inputButtonHalf,
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
                        <MaterialCommunityIcons name="clock-outline" size={20} color={colors.text} />
                        <Text style={[styles.inputButtonText, {color: colors.text}]}>
                          {formatTime(untilDateTime)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showUntilDatePicker && (
                      <DateTimePicker
                        value={untilDateTime}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                          if (Platform.OS === 'android') {
                            setShowUntilDatePicker(false);
                            if (event.type === 'dismissed') return;
                          }
                          if (date) {
                            const next = new Date(date);
                            next.setHours(untilDateTime.getHours(), untilDateTime.getMinutes(), 0, 0);
                            if (next > fromDateTime) {
                              setUntilDateTime(next);
                            } else {
                              Alert.alert('Fehler', 'Bis muss nach Von liegen');
                            }
                          }
                        }}
                        minimumDate={fromDateTime}
                      />
                    )}
                    {showUntilTimePicker && (
                      <DateTimePicker
                        value={untilDateTime}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, time) => {
                          if (Platform.OS === 'android') {
                            setShowUntilTimePicker(false);
                            if (event.type === 'dismissed') return;
                          }
                          if (time) {
                            const next = new Date(untilDateTime);
                            next.setHours(time.getHours(), time.getMinutes(), 0, 0);
                            if (next > fromDateTime) {
                              setUntilDateTime(next);
                            } else {
                              Alert.alert('Fehler', 'Bis muss nach Von liegen');
                            }
                          }
                        }}
                      />
                    )}
                  </View>
                </>
              )}
              </ScrollView>

              <View style={[styles.modalFooter, {borderTopColor: colors.border}]}>
                <TouchableOpacity
                  style={[styles.cancelButton, {backgroundColor: colors.surface2}]}
                  onPress={handleClose}
                  disabled={isSubmitting}>
                  <Text style={[styles.cancelButtonText, {color: colors.text}]}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, {backgroundColor: colors.brand}]}
                  onPress={handleSubmit}
                  disabled={isSubmitting}>
                  <Text style={styles.submitButtonText}>
                    {isSubmitting ? 'Wird gespeichert...' : editingAvailability ? 'Speichern' : 'Erstellen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '95%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  modalCloseButton: {
    fontSize: 24,
    fontWeight: '300',
  },
  modalBody: {
    maxHeight: 500,
  },
  modalBodyContent: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateInputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputHalf: {
    flex: 1,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  inputButtonHalf: {
    flex: 1,
  },
  inputButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  spotButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  spotButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  spotButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
    flexWrap: 'wrap',
    gap: 8,
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    position: 'absolute',
    right: 8,
    top: 32,
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NewAvailabilityModal;

