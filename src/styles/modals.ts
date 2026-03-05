import {StyleSheet} from 'react-native';

/**
 * Zentrale Modal-Styles für die gesamte App
 */
export const modalStyles = StyleSheet.create({
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
    paddingTop: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalHeaderContent: {
    flex: 1,
    marginTop: 10,
    marginBottom: 10,
    paddingRight: 32, // Platz für das Schließen-Icon rechts, damit der Titel nicht „unter“ das X läuft
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
    // maxHeight is set dynamically via props
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
});
