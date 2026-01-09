import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  useColorScheme,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateLabel, formatDateRange, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';
import Button from './common/Button';
import {inputStyles} from '../styles/inputs';
import {buttonStyles} from '../styles/buttons';
import {modalStyles} from '../styles/modals';

interface Props {
  visible: boolean;
  request: ParkingRequest | null;
  mySpots: string[];
  onClose: () => void;
  onSubmit: (spotId: string, from: Date, until: Date, comment?: string) => Promise<void>;
  currentUserId?: string;
}

export default function OfferModal({visible, request, mySpots, onClose, onSubmit, currentUserId}: Props) {
  const colors = getColors(useColorScheme());

  const initial = useMemo(() => {
    if (!request) return {from: new Date(), until: new Date()};
    return {from: new Date(request.from), until: new Date(request.until)};
  }, [request?.id]);

  const [spotIdx, setSpotIdx] = useState(0);
  const [fromDateTime, setFromDateTime] = useState(initial.from);
  const [untilDateTime, setUntilDateTime] = useState(initial.until);
  const [isFull, setIsFull] = useState(true);
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showFromTimePicker, setShowFromTimePicker] = useState(false);
  const [showUntilDatePicker, setShowUntilDatePicker] = useState(false);
  const [showUntilTimePicker, setShowUntilTimePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSpotPicker, setShowSpotPicker] = useState(false);
  const [comment, setComment] = useState('');

  // Reset when opening a different request
  React.useEffect(() => {
    if (!request) return;
    console.log('[OfferModal] Resetting for request:', request.id);
    setSpotIdx(0);
    setIsFull(true);
    setFromDateTime(new Date(request.from));
    setUntilDateTime(new Date(request.until));
    setShowFromDatePicker(false);
    setShowFromTimePicker(false);
    setShowUntilDatePicker(false);
    setShowUntilTimePicker(false);
    setIsSubmitting(false);
    setShowSpotPicker(false);
    setComment('');
  }, [request?.id, visible]);

  React.useEffect(() => {
    console.log('[OfferModal] spotIdx changed to:', spotIdx);
    console.log('[OfferModal] selectedSpot:', selectedSpot);
  }, [spotIdx, selectedSpot]);

  const selectedSpot = mySpots[spotIdx] ?? mySpots[0];

  const requestMin = request?.from ?? new Date(0);
  const requestMax = request?.until ?? new Date(0);

  const clampToRequest = (d: Date) => {
    if (!request) return d;
    const min = request.from.getTime();
    const max = request.until.getTime();
    return new Date(Math.min(Math.max(d.getTime(), min), max));
  };

  const setFromClamped = (d: Date) => {
    const next = clampToRequest(d);
    setFromDateTime(next);
    // keep order
    setUntilDateTime((prev) => {
      const prevClamped = clampToRequest(prev);
      if (prevClamped <= next) return clampToRequest(new Date(next.getTime() + 15 * 60 * 1000));
      return prevClamped;
    });
  };

  const setUntilClamped = (d: Date) => {
    const next = clampToRequest(d);
    setUntilDateTime(next);
    setFromDateTime((prev) => {
      const prevClamped = clampToRequest(prev);
      if (next <= prevClamped) return clampToRequest(new Date(next.getTime() - 15 * 60 * 1000));
      return prevClamped;
    });
  };

  const handleFromDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowFromDatePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (date) setFromClamped(date);
  };

  const handleFromTimeChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowFromTimePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (date) setFromClamped(date);
  };

  const handleUntilDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowUntilDatePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (date) setUntilClamped(date);
  };

  const handleUntilTimeChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowUntilTimePicker(false);
      if (event.type === 'dismissed') {
        return; // User cancelled
      }
    }
    if (date) setUntilClamped(date);
  };

  const handleSubmit = async () => {
    if (!request) return;
    if (!selectedSpot) {
      Alert.alert('Fehler', 'Kein Parkplatz ausgewählt');
      return;
    }
    const offerFrom = isFull ? request.from : clampToRequest(fromDateTime);
    const offerUntil = isFull ? request.until : clampToRequest(untilDateTime);

    // Check for overlapping bookings
    setIsSubmitting(true);
    try {
      const ParkingRequestService = (await import('../services/ParkingRequestService')).default;
      const conflict = await ParkingRequestService.checkSpotAvailability(
        selectedSpot,
        request.facilityCode,
        offerFrom,
        offerUntil,
        request.id, // Exclude current request
      );

      if (conflict) {
        setIsSubmitting(false);
        const conflictRequest = conflict.request;
        const conflictRange = conflictRequest.requestedByUsername
          ? `${conflictRequest.requestedByUsername} (${formatDateRange(conflictRequest.from, conflictRequest.until)})`
          : formatDateRange(conflictRequest.from, conflictRequest.until);
        
        Alert.alert(
          '⚠️ Überschneidung erkannt',
          `Den Parkplatz ${selectedSpot} hast Du bereits für ${conflict.overlapMinutes} Minuten in diesem Zeitraum angeboten:\n\n${conflictRange}\n\nMöchtest du trotzdem fortfahren?`,
          [
            {text: 'Abbrechen', style: 'cancel'},
            {
              text: 'Trotzdem anbieten',
              style: 'destructive',
              onPress: async () => {
                setIsSubmitting(true);
                try {
                  await onSubmit(selectedSpot, offerFrom, offerUntil, comment.trim() || undefined);
                  onClose();
                } finally {
                  setIsSubmitting(false);
                }
              },
            },
          ],
        );
        return;
      }
    } catch (error) {
      console.error('Error checking spot availability:', error);
      // Continue with submission if check fails
    }
    if (offerUntil <= offerFrom) {
      Alert.alert('Fehler', 'Bis muss nach Von liegen');
      setIsSubmitting(false);
      return;
    }

    // If no conflict, proceed with submission
    try {
      await onSubmit(selectedSpot, offerFrom, offerUntil, comment.trim() || undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Early returns - check visible first, then request
  if (!visible) {
    return null;
  }
  
  if (!request) {
    return null;
  }

  return (
    <>
    <Modal 
      visible={visible} 
      animationType="slide" 
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%'}}>
          <View
            style={[
              styles.card,
              {backgroundColor: colors.surface},
              colors.isDark && {borderColor: colors.border, borderWidth: 1, shadowOpacity: 0, elevation: 0},
            ]}>
            <View style={[styles.header, {borderBottomColor: colors.border}]}>
              <Text style={[modalStyles.modalTitle, {color: colors.text}]}>Parkplatz anbieten</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={[styles.close, {color: colors.subtext}]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              if (showSpotPicker) {
                console.log('[OfferModal] Scroll started, closing picker');
                setShowSpotPicker(false);
              }
            }}>
            <View style={[inputStyles.requestRangeBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
              <Text style={[inputStyles.requestRangeLabel, {color: colors.subtext}]}>Anfrage-Zeitraum</Text>
              <Text style={[inputStyles.requestRangeText, {color: colors.text}]}>
                {formatDateRange(request.from, request.until)}
              </Text>
            </View>

            <View style={inputStyles.inputLabelRow}>
              <Text style={[inputStyles.inputLabel, {color: colors.text}]}>Parkplatz</Text>
              {mySpots.length > 1 ? (
                <View style={inputStyles.spotPickerContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[OfferModal] Opening spot picker, mySpots:', mySpots);
                      setShowSpotPicker(true);
                    }}
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
                          {mySpots.map((spot, index) => (
                            <TouchableOpacity
                              key={spot}
                              onPress={() => {
                                console.log('[OfferModal] Spot pressed:', spot, 'index:', index);
                                console.log('[OfferModal] Current spotIdx before:', spotIdx);
                                setSpotIdx(index);
                                console.log('[OfferModal] Setting spotIdx to:', index);
                                setShowSpotPicker(false);
                                console.log('[OfferModal] Closing picker');
                              }}
                              onPressIn={() => {
                                console.log('[OfferModal] onPressIn triggered for spot:', spot, 'index:', index);
                              }}
                              activeOpacity={0.7}
                              style={[
                                inputStyles.pickerItem,
                                {borderBottomColor: colors.border},
                                index === spotIdx && {backgroundColor: colors.surface2},
                              ]}>
                              <Text style={[inputStyles.pickerItemText, {color: colors.text}]}>P {spot}</Text>
                              {index === spotIdx && (
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
                <Text style={[inputStyles.spotText, {color: colors.text}]}>P {selectedSpot}</Text>
              )}
            </View>

            <View style={styles.switchRow}>
              <TouchableOpacity
                onPress={() => {
                  setIsFull(true);
                  setFromDateTime(new Date(request.from));
                  setUntilDateTime(new Date(request.until));
                }}
                style={[
                  styles.pill,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                  isFull && {backgroundColor: colors.brand, borderColor: colors.brand},
                ]}>
                <Text style={[inputStyles.pillText, {color: isFull ? '#fff' : colors.text}]}>
                  Vollständig
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsFull(false)}
                style={[
                  styles.pill,
                  {backgroundColor: colors.surface2, borderColor: colors.border},
                  !isFull && {backgroundColor: colors.brand, borderColor: colors.brand},
                ]}>
                <Text style={[inputStyles.pillText, {color: !isFull ? '#fff' : colors.text}]}>
                  Teilweise
                </Text>
              </TouchableOpacity>
            </View>

            {!isFull && (
              <>
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
                        minimumDate={requestMin}
                        maximumDate={requestMax}
                        onChange={handleFromDateChange}
                      />
                    ) : (
                      <View style={[inputStyles.pickerContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={fromDateTime}
                          mode="date"
                          display="spinner"
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setFromClamped(d)}
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
                        minimumDate={requestMin}
                        maximumDate={requestMax}
                        onChange={handleFromTimeChange}
                      />
                    ) : (
                      <View style={[inputStyles.pickerContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={fromDateTime}
                          mode="time"
                          display="spinner"
                          minuteInterval={15}
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setFromClamped(d)}
                          style={inputStyles.picker}
                        />
                      </View>
                    )
                  )}
                </View>

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
                        minimumDate={requestMin}
                        maximumDate={requestMax}
                        onChange={handleUntilDateChange}
                      />
                    ) : (
                      <View style={[inputStyles.pickerContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={untilDateTime}
                          mode="date"
                          display="spinner"
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setUntilClamped(d)}
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
                        minimumDate={requestMin}
                        maximumDate={requestMax}
                        onChange={handleUntilTimeChange}
                      />
                    ) : (
                      <View style={[inputStyles.pickerContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={untilDateTime}
                          mode="time"
                          display="spinner"
                          minuteInterval={15}
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setUntilClamped(d)}
                          style={inputStyles.picker}
                        />
                      </View>
                    )
                  )}
                </View>
              </>
            )}

            <View style={[inputStyles.summaryContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
              <Text style={[inputStyles.summaryLabel, {color: colors.subtext}]}>Dein Angebot</Text>
              <Text style={[inputStyles.summaryText, {color: colors.text}]}>
                {formatDateRange(isFull ? request.from : fromDateTime, isFull ? request.until : untilDateTime)}
              </Text>
            </View>

            <View style={inputStyles.inputGroup}>
              <Text style={[inputStyles.inputLabelStandalone, {color: colors.text}]}>Kommentar (optional)</Text>
              <View style={[inputStyles.commentBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Nachricht an den Anfragenden..."
                  placeholderTextColor={colors.subtext}
                  multiline
                  numberOfLines={3}
                  style={[
                    inputStyles.commentInput,
                    {color: colors.text},
                  ]}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, {borderTopColor: colors.border}]}>
            <Button
              variant="cancel"
              label="Abbrechen"
              onPress={onClose}
              disabled={isSubmitting}
              style={{backgroundColor: colors.surface2}}
              textStyle={{color: colors.subtext}}
            />
            <Button
              variant="primary"
              label="Anbieten"
              onPress={handleSubmit}
              disabled={isSubmitting}
              loading={isSubmitting}
              style={{backgroundColor: colors.brand}}
            />
          </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '95%',
    maxWidth: 600,
    borderRadius: 16, 
    shadowColor: '#000', 
    shadowOpacity: 0.25, 
    shadowRadius: 10, 
    elevation: 10
  },
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1},
  // Title style moved to src/styles/modals.ts (modalTitle)
  close: {fontSize: 22, fontWeight: '300'},
  body: {maxHeight: 600},
  bodyContent: {padding: 16, paddingBottom: 20},
  // Request range and summary styles moved to src/styles/inputs.ts

  footer: {flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1},
  btn: {flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  btnText: {fontWeight: '800'},

  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  // Label, text, and summary styles moved to src/styles/inputs.ts
  group: {marginTop: 14},

  iconBtn: {width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1},

  switchRow: {flexDirection: 'row', gap: 10, marginTop: 14},
  pill: {flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1},
  // pillText moved to src/styles/inputs.ts

  inputBtn: {flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8},
  // inputText moved to src/styles/buttons.ts (inputButtonText)
  pickerBox: {marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden'},
  // Comment styles moved to src/styles/inputs.ts

  // Spot picker styles moved to src/styles/inputs.ts
});


