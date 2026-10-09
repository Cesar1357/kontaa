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
    <ThemedView style={{ width: '95%', marginTop: 8, marginBottom: 2, backgroundColor: 'transparent' }}>
      <ThemedView style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, backgroundColor: 'transparent' }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>Grupos rápidos</ThemedText>
        <ThemedView style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', opacity: 0.65 }}>
          <ThemedText style={{ fontSize: 10, marginLeft: 4 }}>Mantén presionado para editar</ThemedText>
        </ThemedView>
      </ThemedView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
        {groups.map((group: any) => (
          <TouchableOpacity
            key={group.id}
            accessibilityLabel={`Grupo ${group.nombre}`}
            onPress={() => onPress(group)}
            onLongPress={() => onLongPress(group)}
            style={{
              width: 112,
              height: 62,
              borderRadius: 14,
              marginRight: 8,
              paddingHorizontal: 9,
              paddingVertical: 7,
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              backgroundColor: `${primaryColor}18`,
              borderWidth: 1,
              borderColor: primaryColor,
            }}
          >
            <ThemedText style={{ fontSize: 19, marginRight: 7 }}>{group.icono || '📦'}</ThemedText>
            <ThemedText style={{ flex: 1, fontSize: 10, fontWeight: '700' }} numberOfLines={2}>
              {group.nombre}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ThemedView>
  );
}
