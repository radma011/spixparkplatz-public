import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../theme/colors';
import {RequestComment} from '../models/RequestComment';
import ParkingRequestService from '../services/ParkingRequestService';

interface Props {
  visible: boolean;
  requestId: string | null;
  currentUserId: string;
  publicUsers?: Record<string, {username?: string; phone?: string}>;
  onClose: () => void;
}

export default function CommentsModal({visible, requestId, currentUserId, publicUsers, onClose}: Props) {
  const colors = getColors(useColorScheme());
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [comments, setComments] = useState<RequestComment[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!visible || !requestId) return;
    const unsub = ParkingRequestService.watchComments(requestId).onSnapshot((snap: any) => {
      const items: RequestComment[] = (snap?.docs ?? []).map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          requestId,
          authorId: data.authorId,
          text: String(data.text ?? ''),
          createdAt: data.createdAt ? (data.createdAt as any).toDate() : undefined,
          editedAt: data.editedAt ? (data.editedAt as any).toDate() : undefined,
        };
      });
      setComments(items);
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 0);
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [visible, requestId]);

  const title = useMemo(() => 'Kommentare', []);

  const send = async () => {
    if (!requestId) return;
    const t = text.trim();
    if (!t) return;
    setText('');
    await ParkingRequestService.addComment(requestId, currentUserId, t);
  };

  const openEdit = (c: RequestComment) => {
    if (c.authorId !== currentUserId) return;
    setEditingId(c.id);
    setEditingText(String(c.text ?? ''));
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditingText('');
    setIsSavingEdit(false);
  };

  const saveEdit = async () => {
    if (!requestId || !editingId) return;
    const t = editingText.trim();
    if (!t) {
      Alert.alert('Fehler', 'Kommentar darf nicht leer sein');
      return;
    }
    setIsSavingEdit(true);
    try {
      await ParkingRequestService.updateComment(requestId, editingId, t);
      closeEdit();
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <View style={styles.overlay}>
          <View
            style={[
              styles.card,
              {backgroundColor: colors.surface, maxHeight: '90%'},
              colors.isDark && {borderColor: colors.border, borderWidth: 1, shadowOpacity: 0, elevation: 0},
            ]}>
            <View style={[styles.header, {borderBottomColor: colors.border, paddingTop: insets.top}]}>
              <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                <MaterialCommunityIcons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={(r) => (scrollRef.current = r)}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
              {comments.length === 0 ? (
                <Text style={[styles.empty, {color: colors.subtext}]}>Noch keine Kommentare</Text>
              ) : (
                comments.map((c) => {
                  const mine = c.authorId === currentUserId;
                  const username = publicUsers?.[c.authorId]?.username ?? 'Unbekannt';
                  const bubbleBg = mine ? colors.brand : (colors.isDark ? '#2F2F2F' : colors.surface2);
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.row,
                        mine ? styles.rowMine : styles.rowOther,
                        {justifyContent: mine ? 'flex-end' : 'flex-start'},
                      ]}>
                      <TouchableOpacity
                        activeOpacity={mine ? 0.8 : 1}
                        onLongPress={() => mine && openEdit(c)}
                        delayLongPress={350}
                        style={[
                          styles.bubble,
                          {backgroundColor: bubbleBg, borderColor: colors.border},
                        ]}>
                        <Text style={[styles.meta, {color: mine ? '#fff' : colors.subtext}]}>
                          {mine ? 'Du' : username}
                        </Text>
                        <Text style={[styles.msg, {color: mine ? '#fff' : colors.text}]}>{c.text}</Text>
                        {!!c.editedAt && (
                          <Text style={[styles.edited, {color: mine ? '#fff' : colors.subtext}]}>
                            bearbeitet
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={[styles.footer, {borderTopColor: colors.border, paddingBottom: insets.bottom}]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Nachricht…"
                placeholderTextColor={colors.subtext}
                multiline
                style={[styles.input, {backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border}]}
              />
              <TouchableOpacity onPress={send} style={[styles.sendBtn, {backgroundColor: colors.brand}]}>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!editingId} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.editOverlay}>
          <View style={[styles.editCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[styles.editTitle, {color: colors.text}]}>Kommentar bearbeiten</Text>
            <TextInput
              value={editingText}
              onChangeText={setEditingText}
              multiline
              placeholder="Kommentar…"
              placeholderTextColor={colors.subtext}
              style={[
                styles.editInput,
                {backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border},
              ]}
              editable={!isSavingEdit}
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={closeEdit} disabled={isSavingEdit} style={[styles.editBtn, styles.editBtnGhost, {borderColor: colors.border}]}>
                <Text style={[styles.editBtnText, {color: colors.text}]}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={isSavingEdit} style={[styles.editBtn, {backgroundColor: colors.brand, opacity: isSavingEdit ? 0.7 : 1}]}>
                <Text style={[styles.editBtnText, {color: '#fff'}]}>{isSavingEdit ? 'Speichern…' : 'Speichern'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  card: {borderRadius: 16, flex: 1, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 10},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1},
  title: {fontSize: 16, fontWeight: '900'},
  iconBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  body: {flex: 1},
  bodyContent: {padding: 14, paddingBottom: 10},
  empty: {fontWeight: '700'},
  row: {marginBottom: 10, width: '100%', flexDirection: 'row'},
  rowMine: {},
  rowOther: {},
  bubble: {maxWidth: '88%', borderRadius: 12, padding: 10, borderWidth: 1},
  meta: {fontSize: 11, fontWeight: '900', marginBottom: 4},
  msg: {fontSize: 14, fontWeight: '600'},
  edited: {marginTop: 4, fontSize: 10, fontWeight: '800', opacity: 0.85},
  footer: {flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, alignItems: 'flex-end'},
  input: {flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, maxHeight: 110},
  sendBtn: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},

  editOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16},
  editCard: {borderRadius: 14, borderWidth: 1, padding: 14},
  editTitle: {fontSize: 15, fontWeight: '900', marginBottom: 10},
  editInput: {borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 70, maxHeight: 180, fontWeight: '600'},
  editActions: {flexDirection: 'row', gap: 10, marginTop: 12},
  editBtn: {flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center'},
  editBtnGhost: {backgroundColor: 'transparent', borderWidth: 1},
  editBtnText: {fontWeight: '900'},
});


