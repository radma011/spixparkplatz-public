import {StyleSheet} from 'react-native';

/**
 * Zentrale Chip/Badge-Styles für die gesamte App
 */
export const chipStyles = StyleSheet.create({
  // Basis Chip
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextWhite: {
    color: '#fff',
  },

  // Status Chips
  myRequestChip: {
    backgroundColor: '#E3F2FD',
  },
  offerChip: {
    backgroundColor: '#4CAF50', // Green
  },
  openChip: {
    backgroundColor: '#FF9800', // Orange
  },
  partialChip: {
    backgroundColor: '#FB8C00', // Slightly softer orange for partial
  },
  fulfilledChip: {
    backgroundColor: '#2196F3', // Blue
  },
  archivedChip: {
    backgroundColor: '#DC2626', // Red
  },

  // Day Badge
  dayBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  dayBadgeText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
  },

  // Standby Badge
  standbyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  standbyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },

  // Comment Chip
  commentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    maxWidth: '100%',
    minHeight: 32,
    justifyContent: 'center',
  },
  commentChipText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  commentChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
    gap: 6,
  },
  commentIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badges Row
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
