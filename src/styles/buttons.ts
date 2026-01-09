import {StyleSheet} from 'react-native';

/**
 * Zentrale Button-Styles für die gesamte App
 */
export const buttonStyles = StyleSheet.create({
  // Action Buttons (für RequestCard, AvailabilityCard, etc.)
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  actionBtnCompact: {
    alignSelf: 'flex-start',
  },
  actionTextWhite: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionPrimary: {
    backgroundColor: '#16A34A', // Green
  },
  actionBlue: {
    backgroundColor: '#2563EB', // Blue
  },
  actionDark: {
    backgroundColor: '#111827', // Dark gray
  },
  actionRed: {
    backgroundColor: '#DC2626', // Red
  },
  actionGray: {
    backgroundColor: '#6B7280', // Gray
  },
  actionDanger: {
    backgroundColor: '#DC2626', // Red (alias)
  },

  // Modal Footer Buttons
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF', // iOS Blue
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },

  // Input Buttons (für Date/Time Picker)
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
});
