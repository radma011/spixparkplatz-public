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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateLabel, formatDateRange, formatTime} from '../utils/dateUtils';
import {getColors} from '../theme/colors';

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
        <View
          style={[
            styles.card,
            {backgroundColor: colors.surface},
            colors.isDark && {borderColor: colors.border, borderWidth: 1, shadowOpacity: 0, elevation: 0},
          ]}>
          <View style={[styles.header, {borderBottomColor: colors.border}]}>
            <Text style={[styles.title, {color: colors.text}]}>Parkplatz anbieten</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.close, {color: colors.subtext}]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.body}
            onScrollBeginDrag={() => {
              if (showSpotPicker) {
                console.log('[OfferModal] Scroll started, closing picker');
                setShowSpotPicker(false);
              }
            }}>
            <View style={[styles.requestRangeBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
              <Text style={[styles.requestRangeLabel, {color: colors.subtext}]}>Anfrage-Zeitraum</Text>
              <Text style={[styles.requestRangeText, {color: colors.text}]}>
                {formatDateRange(request.from, request.until)}
              </Text>
            </View>

            <View style={styles.rowBetween}>
              <Text style={[styles.label, {color: colors.text}]}>Parkplatz</Text>
              {mySpots.length > 1 ? (
                <View style={styles.spotPickerContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[OfferModal] Opening spot picker, mySpots:', mySpots);
                      setShowSpotPicker(true);
                    }}
                    style={[styles.spotPickerButton, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                    <Text style={[styles.spot, {color: colors.text}]}>P {selectedSpot}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text} />
                  </TouchableOpacity>
                  {showSpotPicker && (
                    <View 
                      style={[styles.pickerCard, {backgroundColor: colors.surface, borderColor: colors.border}]}
                      pointerEvents="box-none">
                      <View pointerEvents="auto">
                        <ScrollView style={styles.pickerBody}>
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
                                styles.pickerItem,
                                {borderBottomColor: colors.border},
                                index === spotIdx && {backgroundColor: colors.surface2},
                              ]}>
                              <Text style={[styles.pickerItemText, {color: colors.text}]}>P {spot}</Text>
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
                <Text style={[styles.spot, {color: colors.text}]}>P {selectedSpot}</Text>
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
                <Text style={[styles.pillText, {color: isFull ? '#fff' : colors.text}]}>
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
                <Text style={[styles.pillText, {color: !isFull ? '#fff' : colors.text}]}>
                  Teilweise
                </Text>
              </TouchableOpacity>
            </View>

            {!isFull && (
              <>
                <View style={styles.group}>
                  <Text style={[styles.label, {color: colors.text}]}>Von</Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.inputBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                      onPress={() => {
                        const next = !showFromDatePicker;
                        setShowFromDatePicker(next);
                        if (next) {
                          setShowFromTimePicker(false);
                          setShowUntilDatePicker(false);
                          setShowUntilTimePicker(false);
                        }
                      }}>
                      <MaterialCommunityIcons name="calendar" size={16} color={colors.text} />
                      <Text style={[styles.inputText, {color: colors.brand}]}>
                        {formatDateLabel(fromDateTime)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inputBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                      onPress={() => {
                        const next = !showFromTimePicker;
                        setShowFromTimePicker(next);
                        if (next) {
                          setShowFromDatePicker(false);
                          setShowUntilDatePicker(false);
                          setShowUntilTimePicker(false);
                        }
                      }}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} />
                      <Text style={[styles.inputText, {color: colors.brand}]}>
                        {formatTime(fromDateTime)}
                      </Text>
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
                      <View style={[styles.pickerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={fromDateTime}
                          mode="date"
                          display="spinner"
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setFromClamped(d)}
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
                      <View style={[styles.pickerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={fromDateTime}
                          mode="time"
                          display="spinner"
                          minuteInterval={15}
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setFromClamped(d)}
                        />
                      </View>
                    )
                  )}
                </View>

                <View style={styles.group}>
                  <Text style={[styles.label, {color: colors.text}]}>Bis</Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.inputBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                      onPress={() => {
                        const next = !showUntilDatePicker;
                        setShowUntilDatePicker(next);
                        if (next) {
                          setShowFromDatePicker(false);
                          setShowFromTimePicker(false);
                          setShowUntilTimePicker(false);
                        }
                      }}>
                      <MaterialCommunityIcons name="calendar" size={16} color={colors.text} />
                      <Text style={[styles.inputText, {color: colors.brand}]}>
                        {formatDateLabel(untilDateTime)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inputBtn, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                      onPress={() => {
                        const next = !showUntilTimePicker;
                        setShowUntilTimePicker(next);
                        if (next) {
                          setShowFromDatePicker(false);
                          setShowFromTimePicker(false);
                          setShowUntilDatePicker(false);
                        }
                      }}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text} />
                      <Text style={[styles.inputText, {color: colors.brand}]}>
                        {formatTime(untilDateTime)}
                      </Text>
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
                      <View style={[styles.pickerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={untilDateTime}
                          mode="date"
                          display="spinner"
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setUntilClamped(d)}
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
                      <View style={[styles.pickerBox, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
                        <DateTimePicker
                          value={untilDateTime}
                          mode="time"
                          display="spinner"
                          minuteInterval={15}
                          minimumDate={requestMin}
                          maximumDate={requestMax}
                          onChange={(_, d) => d && setUntilClamped(d)}
                        />
                      </View>
                    )
                  )}
                </View>
              </>
            )}

            <View style={[styles.summary, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
              <Text style={[styles.summaryLabel, {color: colors.subtext}]}>Dein Angebot</Text>
              <Text style={[styles.summaryText, {color: colors.text}]}>
                {formatDateRange(isFull ? request.from : fromDateTime, isFull ? request.until : untilDateTime)}
              </Text>
            </View>

            <View style={styles.commentGroup}>
              <Text style={[styles.label, {color: colors.text}]}>Kommentar (optional)</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Nachricht an den Anfragenden..."
                placeholderTextColor={colors.subtext}
                multiline
                numberOfLines={3}
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={[styles.footer, {borderTopColor: colors.border}]}>
            <TouchableOpacity style={[styles.btn, {backgroundColor: colors.surface2}]} onPress={onClose} disabled={isSubmitting}>
              <Text style={[styles.btnText, {color: colors.subtext}]}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, {backgroundColor: colors.brand}]} onPress={handleSubmit} disabled={isSubmitting}>
              <Text style={[styles.btnText, {color: '#fff'}]}>{isSubmitting ? 'Sende…' : 'Anbieten'}</Text>
            </TouchableOpacity>
          </View>
        </View>

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
  title: {fontSize: 18, fontWeight: '900'},
  close: {fontSize: 22, fontWeight: '300'},
  body: {padding: 16, maxHeight: 520},
  requestRangeBox: {borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12},
  requestRangeLabel: {fontWeight: '900', fontSize: 12},
  requestRangeText: {fontWeight: '900', marginTop: 4},

  footer: {flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1},
  btn: {flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  btnText: {fontWeight: '800'},

  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  label: {fontWeight: '800', marginBottom: 8},
  group: {marginTop: 14},

  iconBtn: {width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1},
  spot: {fontSize: 16, fontWeight: '900'},

  switchRow: {flexDirection: 'row', gap: 10, marginTop: 14},
  pill: {flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1},
  pillText: {fontWeight: '900'},

  inputBtn: {flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8},
  inputText: {fontWeight: '700'},
  pickerBox: {marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden'},

  summary: {marginTop: 14, borderRadius: 12, borderWidth: 1, padding: 12},
  summaryLabel: {fontWeight: '800', fontSize: 12},
  summaryText: {fontWeight: '800', marginTop: 4},
  commentGroup: {marginTop: 14},
  commentInput: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 80,
    maxHeight: 120,
    fontSize: 14,
    fontWeight: '500',
  },

  spotPickerContainer: {
    position: 'relative',
    zIndex: 10,
    alignItems: 'flex-end',
  },
  spotPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerCard: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1002,
    maxHeight: 300,
    overflow: 'hidden',
    pointerEvents: 'box-none',
  },
  pickerBody: {
    maxHeight: 300,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: '700',
  },
});


