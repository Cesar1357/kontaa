import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';

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
      setItems(snapshot.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() })));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, [user]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const markAsRead = async (item: any) => {
    if (item.read || !(user as any)?.uid) return;
    await updateDoc(doc(db, `users/${(user as any).uid}/notificationEvents`, item.id), { read: true });
  };

  const navigateToItem = (item: any) => {
    router.back();
    router.navigate({ pathname: item.route as any, params: item.params });
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <ThemedText style={{ color: textColor, fontSize: 26, fontWeight: '800' }}>Actividad</ThemedText>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>
            {unreadCount > 0 ? `${unreadCount} novedades sin revisar` : 'Todo al día'}
          </ThemedText>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} accessibilityLabel="Cerrar actividad">
          <Ionicons name="close-outline" size={28} color={textColor} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
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
              <TouchableOpacity onPress={() => navigateToItem(item)} activeOpacity={0.8} style={{ backgroundColor: cardsMain, borderRadius: 16, borderWidth: 1, borderColor: item.read ? borderColor : `${primaryColor}66`, padding: 14, marginBottom: 10, flexDirection: 'row' }}>
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
            );
          }}
        />
      )}
    </View>
  );
}
