import { Ionicons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface QuickAccessPanelProps {
  quickActions: any[];
  quickAccessPromoDismissed: boolean;
  primaryColor: string;
  borderColor: string;
  textColor: string;
  loaded: boolean;
  onDismissPromo: () => void;
  onCreatePress: () => void;
  onQuickPress: (item: any) => void;
  onQuickLongPress: (item: any) => void;
}

export default function QuickAccessPanel({
  quickActions,
  quickAccessPromoDismissed,
  primaryColor,
  borderColor,
  textColor,
  loaded,
  onDismissPromo,
  onCreatePress,
  onQuickPress,
  onQuickLongPress,
}: QuickAccessPanelProps) {
  if (quickActions.length === 0 && !quickAccessPromoDismissed && loaded) {
    return (
      <ThemedView
        style={{
          width: '95%',
          marginTop: 10,
          marginBottom: 6,
          borderRadius: 16,
          padding: 14,
          backgroundColor: `${primaryColor}14`,
        }}
      >
        <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: 'transparent' }}>
          <ThemedView style={{ flex: 1, marginRight: 8, backgroundColor: 'transparent' }}>
            <ThemedText style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
              Activa tus accesos rapidos
            </ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
              Crea acciones como Quincena o Transporte y registralas en un toque desde inicio.
            </ThemedText>
          </ThemedView>
          <TouchableOpacity onPress={onDismissPromo} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
            <Ionicons name="close" size={18} color={textColor} />
          </TouchableOpacity>
        </ThemedView>

        <TouchableOpacity
          onPress={onCreatePress}
          style={{ marginTop: 10, backgroundColor: primaryColor, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        >
          <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            Crear mi primer acceso rapido
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (quickActions.length > 0) {
    return (
      <ThemedView style={{ width: '95%', marginTop: 8, marginBottom: 2, backgroundColor: 'transparent' }}>
        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, backgroundColor: 'transparent' }}>
          <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>Accesos rápidos</ThemedText>
          <TouchableOpacity onPress={onCreatePress} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 4 }}>
            <Ionicons name="add-circle-outline" size={15} color={primaryColor} />
            <ThemedText style={{ fontSize: 11, color: primaryColor, fontWeight: '700' }}>Crear</ThemedText>
          </TouchableOpacity>
        </ThemedView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
          {quickActions.map((item: any) => {
            const typeBorderColor =
              item.tipo === 'egreso' ? '#EF4444' : item.tipo === 'ingreso' ? '#22C55E' : borderColor;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onQuickPress(item)}
                onLongPress={() => onQuickLongPress(item)}
                style={{
                  width: 112,
                  height: 62,
                  borderRadius: 14,
                  marginRight: 8,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: `${primaryColor}16`,
                  borderWidth: 1,
                  borderColor: typeBorderColor,
                }}
              >
                <ThemedText style={{ fontSize: 18, marginRight: 7 }}>
                  {item.icono || '⚡'}
                </ThemedText>
                <ThemedText style={{ flex: 1, fontSize: 10, fontWeight: '700' }} numberOfLines={2}>
                  {item.nombre}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </ThemedView>
    );
  }

  return null;
}
