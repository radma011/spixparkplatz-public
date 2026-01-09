import {StyleSheet} from 'react-native';

/**
 * Zentrale Input-Styles für die gesamte App
 */
export const inputStyles = StyleSheet.create({
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  inputLabelStandalone: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputHalf: {
    flex: 1,
  },
  commentBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 6,
  },
  commentInput: {
    minHeight: 72,
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  dateInputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  inputButtonIcon: {
    position: 'absolute',
    left: 0,
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
  // Spot picker styles
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
  spotText: {
    fontSize: 16,
    fontWeight: '900',
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
  // Text styles for modals
  requestRangeBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  requestRangeLabel: {
    fontWeight: '900',
    fontSize: 12,
  },
  requestRangeText: {
    fontWeight: '900',
    marginTop: 4,
  },
  summaryContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  summaryLabel: {
    fontWeight: '800',
    fontSize: 12,
  },
  summaryText: {
    fontWeight: '800',
    marginTop: 4,
  },
  pillText: {
    fontWeight: '900',
  },
});
