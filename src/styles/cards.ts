import {StyleSheet} from 'react-native';

/**
 * Zentrale Card-Styles für die gesamte App
 */
export const cardStyles = StyleSheet.create({
  // Basis Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHighlight: {
    borderWidth: 2,
    borderColor: '#16A34A',
  },
  cardInactive: {
    opacity: 0.6,
  },

  // Card Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  headerContactBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
});
