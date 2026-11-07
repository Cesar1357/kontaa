import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/ThemedText';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';

const notificationIcon = (type: string) => {
  if (type === 'presupuesto') return 'pie-chart-outline';
  if (type === 'ahorros') return 'wallet-outline';
  if (type === 'recurrente') return 'calendar-outline';
  if (type === 'transacciones') return 'receipt-outline';
  return 'notifications-outline';
};

export default function NotificationCenterScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const mutedColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  useEffect(() => {
    const uid = (user as any)?.uid;
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    const eventsRef = collection(db, `users/${uid}/notificationEvents`);
    const eventsQuery = query(eventsRef, orderBy('createdAt', 'desc'), limit(60));
    const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      const unique = new Map<string, any>();
      snapshot.docs.forEach((eventDoc) => {
        const event = { id: eventDoc.id, ...(eventDoc.data() as any) };
        const key = event.dedupeKey || event.id;
        if (!unique.has(key) && !deletingIds.includes(event.id)) unique.set(key, event);
      });
      setItems(Array.from(unique.values()));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, [user, deletingIds]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const orderedItems = useMemo(() => [...items].sort((a, b) => {
    if (Boolean(a.read) !== Boolean(b.read)) return a.read ? 1 : -1;
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  }), [items]);

  const markAsRead = async (item: any) => {
    if (item.read || !(user as any)?.uid) return;
    try {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      await updateDoc(doc(db, `users/${(user as any).uid}/notificationEvents`, item.id), { read: true, readAt: new Date() });
    } catch (error) {
      console.log('No se pudo marcar la notificación como leída:', error);
    }
  };

  const deleteNotification = async (item: any) => {
    if (!(user as any)?.uid) return;
    setDeletingIds((current) => [...current, item.id]);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try {
      await deleteDoc(doc(db, `users/${(user as any).uid}/notificationEvents`, item.id));
    } catch (error) {
      console.log('No se pudo eliminar la notificación:', error);
      setItems((current) => [item, ...current]);
    } finally {
      setDeletingIds((current) => current.filter((id) => id !== item.id));
    }
  };

  const markAllAsRead = async () => {
    const uid = (user as any)?.uid;
    const unread = items.filter((item) => !item.read);
    if (!uid || unread.length === 0) return;

    setItems((current) => current.map((item) => ({ ...item, read: true })));
    const batch = writeBatch(db);
    unread.forEach((item) => batch.update(doc(db, `users/${uid}/notificationEvents`, item.id), { read: true, readAt: new Date() }));
    try {
      await batch.commit();
    } catch (error) {
      console.log('No se pudieron marcar todas las notificaciones:', error);
    }
  };

  const deleteAll = () => {
    const uid = (user as any)?.uid;
    if (!uid || items.length === 0) return;

    Alert.alert('Borrar actividad', 'Se eliminarán todas tus notificaciones. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar todo',
        style: 'destructive',
        onPress: async () => {
          const currentItems = [...items];
          setDeletingIds(currentItems.map((item) => item.id));
          setItems([]);
          const batch = writeBatch(db);
          currentItems.forEach((item) => batch.delete(doc(db, `users/${uid}/notificationEvents`, item.id)));
          try {
            await batch.commit();
          } catch (error) {
            console.log('No se pudieron borrar todas las notificaciones:', error);
            setItems(currentItems);
          } finally {
            setDeletingIds([]);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ color: textColor, fontSize: 26, fontWeight: '800' }}>Actividad</ThemedText>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>
            {unreadCount > 0 ? `${unreadCount} novedades sin revisar` : 'Todo al día'}
          </ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <TouchableOpacity onPress={markAllAsRead} disabled={unreadCount === 0} style={{ padding: 7, opacity: unreadCount === 0 ? 0.35 : 1 }} accessibilityLabel="Marcar todo como leído">
            <Ionicons name="checkmark-done-outline" size={21} color={primaryColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteAll} disabled={items.length === 0} style={{ padding: 7, opacity: items.length === 0 ? 0.35 : 1 }} accessibilityLabel="Borrar toda la actividad">
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 7 }} accessibilityLabel="Cerrar actividad">
            <Ionicons name="close-outline" size={27} color={textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={orderedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100, flexGrow: items.length === 0 ? 1 : 0 }}
          ListEmptyComponent={(
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
              <Ionicons name="notifications-off-outline" size={36} color={mutedColor} />
              <ThemedText style={{ color: textColor, fontWeight: '700', marginTop: 12 }}>Aún no hay actividad</ThemedText>
              <ThemedText style={{ color: mutedColor, textAlign: 'center', fontSize: 12, marginTop: 6 }}>Aquí aparecerán tus alertas importantes y recordatorios.</ThemedText>
            </View>
          )}
          renderItem={({ item }) => {
            const date = item.createdAt?.toDate?.() || null;
            return (
              <Swipeable
                overshootRight={false}
                renderLeftActions={() => (
                  <TouchableOpacity onPress={() => deleteNotification(item)} style={{ width: 76, marginBottom: 10, borderRadius: 16, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Eliminar notificación">
                    <Ionicons name="trash-outline" size={21} color="#fff" />
                    <ThemedText style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 3 }}>Eliminar</ThemedText>
                  </TouchableOpacity>
                )}
              >
                <TouchableOpacity onPress={() => markAsRead(item)} activeOpacity={0.8} style={{ backgroundColor: item.read ? `${cardsMain}B8` : cardsMain, borderRadius: 16, borderWidth: 1, borderColor: item.read ? `${borderColor}99` : `${primaryColor}66`, padding: 14, marginBottom: 10, flexDirection: 'row', opacity: item.read ? 0.62 : 1 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: item.read ? `${borderColor}22` : `${primaryColor}1c` }}>
                    <Ionicons name={notificationIcon(item.type) as any} size={20} color={item.read ? mutedColor : primaryColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <ThemedText style={{ color: textColor, fontWeight: item.read ? '600' : '800', flex: 1 }}>{item.title || 'Notificación'}</ThemedText>
                      {date && <ThemedText style={{ color: mutedColor, fontSize: 10 }}>{format(date, 'dd/MM HH:mm')}</ThemedText>}
                    </View>
                    <ThemedText style={{ color: mutedColor, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{item.body || ''}</ThemedText>
                  </View>
                </TouchableOpacity>
              </Swipeable>
            );
          }}
        />
      )}
    </View>
  );
}
