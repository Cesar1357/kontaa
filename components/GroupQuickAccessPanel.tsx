import { ScrollView, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface GroupQuickAccessPanelProps {
  groups: any[];
  primaryColor: string;
  textColor: string;
  onPress: (group: any) => void;
  onLongPress: (group: any) => void;
}

export default function GroupQuickAccessPanel({ groups, primaryColor, textColor, onPress, onLongPress }: GroupQuickAccessPanelProps) {
  if (groups.length === 0) return null;

  return (
    <ThemedView style={{ width: '95%', marginTop: 10, marginBottom: 4, backgroundColor: 'transparent' }}>
      <ThemedText style={{ fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Grupos rápidos</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {groups.map((group: any) => (
          <TouchableOpacity
            key={group.id}
            accessibilityLabel={`Grupo ${group.nombre}`}
            onPress={() => onPress(group)}
            onLongPress={() => onLongPress(group)}
            style={{
              width: 82,
              height: 82,
              borderRadius: 14,
              marginRight: 10,
              padding: 8,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: `${primaryColor}18`,
              borderWidth: 1,
              borderColor: primaryColor,
            }}
          >
            <ThemedText style={{ fontSize: 20, marginBottom: 2 }}>{group.icono || '📦'}</ThemedText>
            <ThemedText style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
              {group.nombre}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ThemedText style={{ fontSize: 11, color: textColor, opacity: 0.7, marginTop: 6 }}>
        Toca para registrar el grupo. Mantén presionado para elegir productos.
      </ThemedText>
    </ThemedView>
  );
}
