import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface QuickAccessPanelProps {
  quickActions: any[];
  quickAccessPromoDismissed: boolean;
  primaryColor: string;
  borderColor: string;
  textColor: string;
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
  onDismissPromo,
  onCreatePress,
  onQuickPress,
  onQuickLongPress,
}: QuickAccessPanelProps) {
  if (quickActions.length === 0 && !quickAccessPromoDismissed) {
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
      <ThemedView style={{ width: '95%', marginTop: 10, marginBottom: 4, backgroundColor: 'transparent' }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '700', marginBottom: 8 }}>
          Accesos rapidos
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {quickActions.map((item: any) => {
            const typeBorderColor =
              item.tipo === 'egreso' ? '#EF4444' : item.tipo === 'ingreso' ? '#22C55E' : borderColor;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onQuickPress(item)}
                onLongPress={() => onQuickLongPress(item)}
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 39,
                  marginRight: 10,
                  padding: 8,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: `${primaryColor}16`,
                  borderWidth: 1,
                  borderColor: typeBorderColor,
                }}
              >
                <ThemedText style={{ fontSize: 18, marginBottom: 2 }}>
                  {item.icono || '⚡'}
                </ThemedText>
                <ThemedText style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
                  {item.nombre}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <ThemedText style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
          Toque rapido: registra al instante. Manten presionado para abrir el modal editable.
        </ThemedText>
      </ThemedView>
    );
  }

  return null;
}
