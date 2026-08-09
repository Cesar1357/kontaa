import { Ionicons } from '@expo/vector-icons';
import { Modal, ScrollView, Switch, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export type HomeSectionKey =
  | 'quick-access'
  | 'favorite-charts'
  | 'weekly'
  | 'health'
  | 'upcoming'
  | 'budget-risk'
  | 'leaks'
  | 'goal'
  | 'budget'
  | 'summary'
  | 'compare';
export interface HomeSectionConfig {
  key: HomeSectionKey;
  visible: boolean;
}

export const HOME_SECTIONS_CONFIG_DEFAULT: HomeSectionConfig[] = [
  { key: 'quick-access', visible: true },
  { key: 'favorite-charts', visible: true },
  { key: 'weekly', visible: true },
  { key: 'health', visible: true },
  { key: 'upcoming', visible: true },
  { key: 'budget-risk', visible: true },
  { key: 'leaks', visible: true },
  { key: 'goal', visible: true },
  { key: 'budget', visible: true },
  { key: 'summary', visible: true },
  { key: 'compare', visible: true },
];

const SECTION_LABELS: Record<HomeSectionKey, string> = {
  'favorite-charts': 'Gráficas favoritas',
  'quick-access': 'Accesos rápidos',
  weekly: 'Racha y resumen',
  health: 'Salud financiera semanal',
  upcoming: 'Próximos recurrentes',
  'budget-risk': 'Riesgo de presupuesto',
  leaks: 'Top fugas de gasto',
  goal: 'Meta del mes',
  budget: 'Encabezado presupuesto',
  summary: 'Resumen rápido',
  compare: 'Comparativa semanal',
};

interface HomeSectionsOrderModalProps {
  visible: boolean;
  sections: HomeSectionConfig[];
  onClose: () => void;
  onChangeSections: (nextSections: HomeSectionConfig[]) => void;
}

export default function HomeSectionsOrderModal({
  visible,
  sections,
  onClose,
  onChangeSections,
}: HomeSectionsOrderModalProps) {
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const toggleVisibility = (key: HomeSectionKey, value: boolean) => {
    onChangeSections(sections.map((item) => (item.key === key ? { ...item, visible: value } : item)));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...sections];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChangeSections(next);
  };

  const moveDown = (index: number) => {
    if (index === sections.length - 1) return;
    const next = [...sections];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChangeSections(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />

        <ThemedView style={{ width: '88%', maxHeight: '80%', borderRadius: 16, padding: 16, backgroundColor: cardsMain }}>
              <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Personalizar inicio</ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
                Usa las flechas para reordenar y el switch para mostrar u ocultar cada seccion.
              </ThemedText>

              <ScrollView
                nestedScrollEnabled
                style={{ flexGrow: 0, maxHeight: 420, marginBottom: 12 }}
                contentContainerStyle={{ paddingBottom: 4 }}
                showsVerticalScrollIndicator={false}
              >
              {sections.map((item, index) => (
                <View
                  key={item.key}
                  style={{
                    backgroundColor: `${primaryColor}14`,
                    borderWidth: 1,
                    borderColor: `${primaryColor}40`,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <ThemedText style={{ fontWeight: '700', fontSize: 13, flex: 1 }}>
                    {SECTION_LABELS[item.key]}
                  </ThemedText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Switch
                      value={item.visible}
                      onValueChange={(value) => toggleVisibility(item.key, value)}
                      trackColor={{ false: '#6b7280', true: `${primaryColor}88` }}
                      thumbColor={item.visible ? primaryColor : '#f3f4f6'}
                    />
                    <TouchableOpacity
                      onPress={() => moveUp(index)}
                      disabled={index === 0}
                      style={{ padding: 4, opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <Ionicons name="arrow-up" size={18} color={textColor} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveDown(index)}
                      disabled={index === sections.length - 1}
                      style={{ padding: 4, opacity: index === sections.length - 1 ? 0.3 : 1 }}
                    >
                      <Ionicons name="arrow-down" size={18} color={textColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              </ScrollView>

              <TouchableOpacity
                onPress={() => onChangeSections(HOME_SECTIONS_CONFIG_DEFAULT)}
                style={{ marginTop: 6, marginBottom: 8, paddingVertical: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: `${primaryColor}50` }}
              >
                <ThemedText style={{ fontSize: 12, color: primaryColor, width: 'auto', textAlign: 'center' }}>Restablecer orden por defecto</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={{ backgroundColor: primaryColor, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Listo</ThemedText>
              </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );
}
