import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';

const normalize = (value: any) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const formatAmount = (value: any) => `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GlobalSearchScreen() {
  const { user } = useAuth();
  const [queryText, setQueryText] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const cardColor = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const mutedColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  useEffect(() => {
    const uid = (user as any)?.uid;
    if (!uid) {
      setCatalog([]);
      setLoading(false);
      return;
    }

    const loadCatalog = async () => {
      try {
        const [transactions, groups, actions, goals, recurringExpenses, recurringIncome] = await Promise.all([
          getDocs(collection(db, `users/${uid}/transacciones`)),
          getDocs(collection(db, `users/${uid}/preestablecidosMain`)),
          getDocs(collection(db, `users/${uid}/preestablecidosSubs`)),
          getDocs(collection(db, `users/${uid}/ahorros`)),
          getDocs(collection(db, `users/${uid}/gastosRecurrentes`)),
          getDocs(collection(db, `users/${uid}/ingresosRecurrentes`)),
        ]);

        const results = [
          ...transactions.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'transaction', label: data.descripcion || 'Movimiento', detail: `${data.tipo === 'ingreso' ? '+' : '-'}${formatAmount(data.monto)}`, search: `${data.descripcion || ''} ${data.presupuestoCategoria || ''} ${data.preestablecidoMainNombre || ''}`, route: '/(tabs)/HistorialScreen' };
          }),
          ...groups.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'group', label: data.nombre || 'Grupo', detail: 'Grupo', search: data.nombre, route: '/(tabs)/PresupuestosScreen', params: { section: 'preestablecidos' } };
          }),
          ...actions.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'action', label: data.nombre || 'Acción', detail: data.mainNombre || 'Acción de grupo', search: `${data.nombre || ''} ${data.mainNombre || ''} ${data.presupuestoCategoria || ''}`, route: '/(tabs)/PresupuestosScreen', params: { section: 'preestablecidos' } };
          }),
          ...goals.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'goal', label: data.nombre || 'Meta', detail: `${formatAmount(data.cantidadActual)} / ${formatAmount(data.meta)}`, search: data.nombre, route: '/(tabs)/AhorrosScreen' };
          }),
          ...recurringExpenses.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'recurring', label: data.nombre || 'Gasto recurrente', detail: `Gasto · ${formatAmount(data.monto)}`, search: `${data.nombre || ''} ${data.categoria || ''}`, route: '/(tabs)/PresupuestosScreen', params: { section: 'recurrentes' } };
          }),
          ...recurringIncome.docs.map((item) => {
            const data = item.data() as any;
            return { id: item.id, kind: 'recurring', label: data.nombre || 'Ingreso recurrente', detail: `Ingreso · ${formatAmount(data.monto)}`, search: `${data.nombre || ''} ${data.categoria || ''}`, route: '/(tabs)/PresupuestosScreen', params: { section: 'recurrentes' } };
          }),
        ];

        setCatalog(results);
      } catch (error) {
        console.log('No se pudo cargar la búsqueda global:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCatalog();
  }, [user]);

  const results = useMemo(() => {
    const term = normalize(queryText.trim());
    if (!term) return [];
    return catalog.filter((item) => normalize(item.search).includes(term)).slice(0, 80);
  }, [catalog, queryText]);

  const sectionLabel: Record<string, string> = {
    transaction: 'Transacciones',
    group: 'Grupos',
    action: 'Acciones de grupo',
    goal: 'Metas',
    recurring: 'Recurrentes',
  };

  const sectionIcon: Record<string, any> = {
    transaction: 'receipt-outline',
    group: 'layers-outline',
    action: 'flash-outline',
    goal: 'flag-outline',
    recurring: 'repeat-outline',
  };

  const navigateToItem = (item: any) => {
    router.back();
    router.navigate({ pathname: item.route as any, params: item.params });
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }} accessibilityLabel="Cerrar búsqueda">
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: cardColor, borderColor, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 }}>
          <Ionicons name="search-outline" size={19} color={mutedColor} />
          <TextInput autoFocus value={queryText} onChangeText={setQueryText} placeholder="Buscar en Konta" placeholderTextColor={mutedColor} style={{ flex: 1, color: textColor, paddingVertical: 11, paddingHorizontal: 8 }} />
          {queryText.length > 0 && <TouchableOpacity onPress={() => setQueryText('')} style={{ padding: 3 }}><Ionicons name="close-circle" size={18} color={mutedColor} /></TouchableOpacity>}
        </View>
      </View>

      {loading ? <ActivityIndicator color={primaryColor} style={{ marginTop: 30 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          {!queryText.trim() ? (
            <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 }}>
              <Ionicons name="search-outline" size={42} color={mutedColor} />
              <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800', marginTop: 14 }}>Busca en toda tu cuenta</ThemedText>
              <ThemedText style={{ color: mutedColor, textAlign: 'center', fontSize: 12, marginTop: 6 }}>Encuentra transacciones, grupos, metas y movimientos recurrentes.</ThemedText>
            </View>
          ) : results.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 }}>
              <Ionicons name="file-tray-outline" size={38} color={mutedColor} />
              <ThemedText style={{ color: textColor, fontWeight: '800', marginTop: 12 }}>Sin resultados</ThemedText>
              <ThemedText style={{ color: mutedColor, textAlign: 'center', fontSize: 12, marginTop: 6 }}>Prueba con otro nombre, categoría o descripción.</ThemedText>
            </View>
          ) : results.map((item) => (
            <TouchableOpacity key={`${item.kind}-${item.id}`} onPress={() => navigateToItem(item)} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cardColor, borderColor, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${primaryColor}18` }}><Ionicons name={sectionIcon[item.kind]} size={20} color={primaryColor} /></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={{ color: textColor, fontWeight: '700' }} numberOfLines={1}>{item.label}</ThemedText>
                <ThemedText style={{ color: mutedColor, fontSize: 11, marginTop: 3 }}>{sectionLabel[item.kind]} · {item.detail}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={mutedColor} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
