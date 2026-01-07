import React, {useState} from 'react';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {formatDateLabel, formatDateRange, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';

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

  const ensureUntilAfterFrom = (from: Date, until: Date) => {
    if (until <= from) {
      return new Date(from.getTime() + 2 * 60 * 60 * 1000);
    }
    return until;
  };

  const handleFromDateSelected = (event: any, date?: Date) => {
    // On Android, close the picker when user confirms (type === 'set') or cancels (type === 'dismissed')
    if (Platform.OS === 'android') {
      setShowFromDatePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (!date) return;
    const next = new Date(fromDateTime);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setFromDateTime(next);
    setUntilDateTime((prev) => ensureUntilAfterFrom(next, prev));
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
    const next = new Date(fromDateTime);
    next.setHours(time.getHours(), time.getMinutes(), 0, 0);
    setFromDateTime(next);
    setUntilDateTime((prev) => ensureUntilAfterFrom(next, prev));
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
    setUntilDateTime(ensureUntilAfterFrom(fromDateTime, next));
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
    setUntilDateTime(ensureUntilAfterFrom(fromDateTime, next));
  };

  const handleSubmit = async () => {
    if (untilDateTime <= fromDateTime) {
      Alert.alert('Fehler', 'Bis muss nach Von liegen');
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
    } catch (error) {
      Alert.alert('Fehler', 'Anfrage konnte nicht erstellt werden');
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
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {backgroundColor: colors.surface},
              colors.isDark && {borderWidth: 1, borderColor: colors.border, shadowOpacity: 0, elevation: 0},
            ]}>
            <View style={[styles.modalHeader, {borderBottomColor: colors.border}]}>
              <Text style={[styles.modalTitle, {color: colors.text}]}>Neue Parkplatz-Anfrage</Text>
              <TouchableOpacity onPress={handleClose}>
                <Text style={[styles.modalCloseButton, {color: colors.subtext}]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
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
                    <View style={styles.inputButtonInner}>
                      <MaterialCommunityIcons name="calendar" size={16} color={colors.text} />
                      <Text style={[styles.inputButtonText, {color: colors.brand}]}>
                        {formatDateLabel(fromDateTime)}
                      </Text>
                    </View>
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
                    <View style={styles.inputButtonInner}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} />
                      <Text style={[styles.inputButtonText, {color: colors.brand}]}>
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
                  ) : (
                    <View
                      style={[
                        styles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={fromDateTime}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={handleFromDateSelected}
                        style={styles.picker}
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
                  ) : (
                    <View
                      style={[
                        styles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={fromDateTime}
                        mode="time"
                        display="spinner"
                        minuteInterval={15}
                        onChange={handleFromTimeSelected}
                        style={styles.picker}
                      />
                    </View>
                  )
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
                    <View style={styles.inputButtonInner}>
                      <MaterialCommunityIcons name="calendar" size={16} color={colors.text} />
                      <Text style={[styles.inputButtonText, {color: colors.brand}]}>
                        {formatDateLabel(untilDateTime)}
                      </Text>
                    </View>
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
                    <View style={styles.inputButtonInner}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} />
                      <Text style={[styles.inputButtonText, {color: colors.brand}]}>
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
                  ) : (
                    <View
                      style={[
                        styles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={untilDateTime}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={handleUntilDateSelected}
                        style={styles.picker}
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
                  ) : (
                    <View
                      style={[
                        styles.pickerContainer,
                        {backgroundColor: colors.surface2, borderColor: colors.border},
                      ]}>
                      <DateTimePicker
                        value={untilDateTime}
                        mode="time"
                        display="spinner"
                        minuteInterval={15}
                        onChange={handleUntilTimeSelected}
                        style={styles.picker}
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
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, {color: colors.text}]}>Kommentar (optional)</Text>
                <View
                  style={[
                    styles.commentBox,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder="z.B. ‚Ich brauche den Parkplatz wegen…‘"
                    placeholderTextColor={colors.subtext}
                    multiline
                    style={[styles.commentInput, {color: colors.text}]}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, {borderTopColor: colors.border}]}>
              <TouchableOpacity
                style={[styles.cancelButton, {backgroundColor: colors.surface2}]}
                onPress={handleClose}
                disabled={isSubmitting}>
                <Text style={[styles.cancelButtonText, {color: colors.subtext}]}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}>
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? 'Erstelle...' : 'Anfragen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    color: '#666',
    fontWeight: '300',
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  picker: {
    width: '100%',
    height: 200,
  },
  inputButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputButtonHalf: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  inputButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputButtonText: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '500',
  },
  summaryContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  commentBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  commentInput: {
    minHeight: 72,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default NewRequestModal;

