import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  useColorScheme,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {showAlert} from '../utils/alertUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {formatDateLabel, formatDateRange, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';
import BaseModal from './common/Modal';
import Button from './common/Button';
import {modalStyles} from '../styles/modals';
import {inputStyles} from '../styles/inputs';
import {buttonStyles} from '../styles/buttons';
import {adjustDateKeepingTime, adjustTimeKeepingDate, ensureEndAfterStart} from '../utils/dateTimeValidation';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (from: Date, until: Date, comment?: string) => Promise<void>;
}

const NewRequestModal: React.FC<Props> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const toWebDateString = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const toWebTimeString = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const colors = getColors(useColorScheme());
  const defaultRange = () => {
    const base = new Date(Date.now() + 4 * 60 * 60 * 1000); // now + 4h
    base.setMinutes(0, 0, 0); // full hour
    const from = base;
    const until = new Date(from.getTime() + 4 * 60 * 60 * 1000); // +4h
    return {from, until};
  };

  const [{from, until}] = useState(() => defaultRange());
  const [fromDateTime, setFromDateTime] = useState(from);
  const [untilDateTime, setUntilDateTime] = useState(until);
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showFromTimePicker, setShowFromTimePicker] = useState(false);
  const [showUntilDatePicker, setShowUntilDatePicker] = useState(false);
  const [showUntilTimePicker, setShowUntilTimePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comment, setComment] = useState('');

  // Import centralized validation utility
  const {adjustDateKeepingTime, adjustTimeKeepingDate} = require('../utils/dateTimeValidation');

  const handleFromDateSelected = (event: any, date?: Date) => {
    // On Android, close the picker when user confirms (type === 'set') or cancels (type === 'dismissed')
    if (Platform.OS === 'android') {
      setShowFromDatePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (!date) return;
    const result = adjustDateKeepingTime(date, fromDateTime, untilDateTime, 2);
    setFromDateTime(result.adjusted);
    setUntilDateTime(result.other);
  };

  const handleFromTimeSelected = (event: any, time?: Date) => {
    // On Android, close the picker when user confirms (type === 'set') or cancels (type === 'dismissed')
    if (Platform.OS === 'android') {
      setShowFromTimePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (!time) return;
    const result = adjustTimeKeepingDate(fromDateTime, time, untilDateTime, 2);
    setFromDateTime(result.adjusted);
    setUntilDateTime(result.other);
  };

  const handleUntilDateSelected = (event: any, date?: Date) => {
    // On Android, close the picker when user confirms (type === 'set') or cancels (type === 'dismissed')
    if (Platform.OS === 'android') {
      setShowUntilDatePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (!date) return;
    const next = new Date(untilDateTime);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setUntilDateTime(ensureEndAfterStart(fromDateTime, next, 2));
  };

  const handleUntilTimeSelected = (event: any, time?: Date) => {
    // On Android, close the picker when user confirms (type === 'set') or cancels (type === 'dismissed')
    if (Platform.OS === 'android') {
      setShowUntilTimePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (!time) return;
    const next = new Date(untilDateTime);
    next.setHours(time.getHours(), time.getMinutes(), 0, 0);
    setUntilDateTime(ensureEndAfterStart(fromDateTime, next, 2));
  };

  const handleSubmit = async () => {
    // Basic date validation
    if (!(fromDateTime instanceof Date) || isNaN(fromDateTime.getTime())) {
      showAlert('Fehler', 'Ungültiges Start-Datum/Zeit. Bitte erneut auswählen.');
      return;
    }
    if (!(untilDateTime instanceof Date) || isNaN(untilDateTime.getTime())) {
      showAlert('Fehler', 'Ungültiges End-Datum/Zeit. Bitte erneut auswählen.');
      return;
    }
    if (untilDateTime <= fromDateTime) {
      showAlert('Fehler', 'Bis muss nach Von liegen');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(fromDateTime, untilDateTime, comment.trim() ? comment.trim() : undefined);
      // Reset to default values
      const {from: resetFrom, until: resetUntil} = defaultRange();
      setFromDateTime(resetFrom);
      setUntilDateTime(resetUntil);
      setComment('');
      onClose();
    } catch (error: any) {
      // Log für Debugging (z.B. in der Web-Konsole)
      console.error('Fehler beim Erstellen der Anfrage:', error);
      const msg =
        error?.message && typeof error.message === 'string'
          ? error.message
          : 'Anfrage konnte nicht erstellt werden';
      showAlert('Fehler', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset to default values
    const {from: resetFrom, until: resetUntil} = defaultRange();
    setFromDateTime(resetFrom);
    setUntilDateTime(resetUntil);
    setComment('');
    setShowFromDatePicker(false);
    setShowFromTimePicker(false);
    setShowUntilDatePicker(false);
    setShowUntilTimePicker(false);
    onClose();
  };

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      title="Neue Parkplatz-Anfrage"
      footer={
        <>
          <Button
            variant="cancel"
            label="Abbrechen"
            onPress={handleClose}
            disabled={isSubmitting}
            style={{backgroundColor: colors.surface2}}
            textStyle={{color: colors.subtext}}
          />
          <Button
            variant="primary"
            label={isSubmitting ? 'Erstelle...' : 'Anfragen'}
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
        keyboardShouldPersistTaps="handled">
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
                      onChange={handleFromDateSelected}
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
                        value={toWebDateString(fromDateTime)}
                        min={toWebDateString(new Date())}
                        onChange={(e: any) => {
                          const value = e.target.value as string;
                          if (!value) return;
                          const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                          if (!year || !month || !day) return;
                          const next = new Date(fromDateTime);
                          next.setFullYear(year, month - 1, day);
                          handleFromDateSelected({}, next);
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
                        onChange={handleFromDateSelected}
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
                      onChange={handleFromTimeSelected}
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
                        value={toWebTimeString(fromDateTime)}
                        onChange={(e: any) => {
                          const value = e.target.value as string;
                          if (!value) return;
                          const [hours, minutes] = value.split(':').map((v) => parseInt(v, 10));
                          if (hours == null || minutes == null) return;
                          const next = new Date(fromDateTime);
                          next.setHours(hours, minutes, 0, 0);
                          handleFromTimeSelected({}, next);
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
                        onChange={handleFromTimeSelected}
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
                      minimumDate={new Date()}
                      onChange={handleUntilDateSelected}
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
                        value={toWebDateString(untilDateTime)}
                        min={toWebDateString(new Date())}
                        onChange={(e: any) => {
                          const value = e.target.value as string;
                          if (!value) return;
                          const [year, month, day] = value.split('-').map((v) => parseInt(v, 10));
                          if (!year || !month || !day) return;
                          const next = new Date(untilDateTime);
                          next.setFullYear(year, month - 1, day);
                          handleUntilDateSelected({}, next);
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
                        minimumDate={new Date()}
                        onChange={handleUntilDateSelected}
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
                      onChange={handleUntilTimeSelected}
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
                        value={toWebTimeString(untilDateTime)}
                        onChange={(e: any) => {
                          const value = e.target.value as string;
                          if (!value) return;
                          const [hours, minutes] = value.split(':').map((v) => parseInt(v, 10));
                          if (hours == null || minutes == null) return;
                          const next = new Date(untilDateTime);
                          next.setHours(hours, minutes, 0, 0);
                          handleUntilTimeSelected({}, next);
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
                        onChange={handleUntilTimeSelected}
                        style={inputStyles.picker}
                      />
                    </View>
                  )
                )}
              </View>

        {/* Zusammenfassung */}
        {!showFromDatePicker &&
          !showFromTimePicker &&
          !showUntilDatePicker &&
          !showUntilTimePicker && (
          <View
            style={[
              styles.summaryContainer,
              colors.isDark && {backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border},
            ]}>
            <Text style={[styles.summaryLabel, {color: colors.brand}]}>Zusammenfassung:</Text>
            <Text style={[styles.summaryText, {color: colors.brand}]}>
              {formatDateRange(fromDateTime, untilDateTime)}
            </Text>
          </View>
        )}

        {/* Kommentar */}
        <View style={inputStyles.inputGroup}>
          <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Kommentar (optional)</Text>
          <View
            style={[
              inputStyles.commentBox,
              {backgroundColor: colors.surface2, borderColor: colors.border},
            ]}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="z.B. ‚Ich brauche den Parkplatz wegen…‘"
              placeholderTextColor={colors.subtext}
              multiline
              style={[inputStyles.commentInput, {color: colors.text}]}
            />
          </View>
        </View>
      </ScrollView>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  // Modal, input, and button styles moved to src/styles/modals.ts, src/styles/inputs.ts, and src/styles/buttons.ts
  // All styles moved to src/styles/inputs.ts and src/styles/buttons.ts
  summaryContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  // Button and comment styles moved to src/styles/buttons.ts and src/styles/inputs.ts
});

export default NewRequestModal;

