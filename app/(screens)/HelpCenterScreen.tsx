import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { db } from '@/config/firebase';
import { useThemeColor } from '@/hooks/useThemeColor';

type Faq = {
  id: string;
  pregunta: string;
  respuesta: string;
  categoria: string;
  palabrasClave: string[];
  orden: number;
  activo: boolean;
};

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function HelpCenterScreen() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [queryText, setQueryText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const cardColor = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const mutedColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'faqs'),
      (snapshot) => {
        const nextFaqs = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              pregunta: String(data.pregunta || data.question || ''),
              respuesta: String(data.respuesta || data.answer || ''),
              categoria: String(data.categoria || data.category || 'General'),
              palabrasClave: Array.isArray(data.palabrasClave)
                ? data.palabrasClave.map(String)
                : Array.isArray(data.keywords)
                  ? data.keywords.map(String)
                  : [],
              orden: Number(data.orden || data.order || 0),
              activo: data.activo !== false,
            };
          })
          .filter((item) => item.activo && item.pregunta && item.respuesta)
          .sort((a, b) => a.orden - b.orden || a.pregunta.localeCompare(b.pregunta, 'es'));
        setFaqs(nextFaqs);
        setLoadError(false);
        setLoading(false);
      },
      (error) => {
        console.error('No se pudieron cargar las preguntas frecuentes:', error);
        setLoadError(true);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const categories = useMemo(
    () => ['Todas', ...Array.from(new Set(faqs.map((faq) => faq.categoria)))],
    [faqs],
  );

  const visibleFaqs = useMemo(() => {
    const term = normalize(queryText.trim());
    return faqs.filter((faq) => {
      const matchesCategory = selectedCategory === 'Todas' || faq.categoria === selectedCategory;
      const searchableText = normalize(`${faq.pregunta} ${faq.respuesta} ${faq.categoria} ${faq.palabrasClave.join(' ')}`);
      return matchesCategory && (!term || searchableText.includes(term));
    });
  }, [faqs, queryText, selectedCategory]);

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View style={{ paddingTop: 58, paddingHorizontal: 20, paddingBottom: 18 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Regresar a Ajustes"
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
        >
          <Ionicons name="arrow-back" size={25} color={textColor} />
        </TouchableOpacity>
        <ThemedText style={{ fontSize: 30, fontWeight: '800' }}>Centro de ayuda</ThemedText>
        <ThemedText style={{ color: mutedColor, marginTop: 6 }}>
          Encuentra respuestas rápidas sobre cómo usar Konta.
        </ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor, borderRadius: 14, backgroundColor: cardColor, paddingHorizontal: 14, marginBottom: 14 }}>
          <Ionicons name="search-outline" size={21} color={mutedColor} />
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="¿Qué necesitas saber?"
            placeholderTextColor={`${mutedColor}99`}
            style={{ flex: 1, color: textColor, paddingVertical: 13, paddingHorizontal: 10, fontSize: 15 }}
            returnKeyType="search"
          />
          {queryText.length > 0 && (
            <Pressable onPress={() => setQueryText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={19} color={mutedColor} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
          {categories.map((category) => {
            const selected = category === selectedCategory;
            return (
              <TouchableOpacity
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={{ borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9, marginRight: 8, backgroundColor: selected ? primaryColor : cardColor, borderWidth: selected ? 0 : 1, borderColor }}
              >
                <ThemedText style={{ color: selected ? '#fff' : textColor, fontWeight: selected ? '700' : '500', fontSize: 13 }}>
                  {category}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={primaryColor} />
          </View>
        ) : loadError ? (
          <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            <Ionicons name="cloud-offline-outline" size={42} color={mutedColor} />
            <ThemedText style={{ textAlign: 'center', marginTop: 12, color: mutedColor }}>
              No pudimos cargar el centro de ayuda. Revisa tu conexión e inténtalo de nuevo.
            </ThemedText>
          </View>
        ) : visibleFaqs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            <Ionicons name="help-circle-outline" size={42} color={mutedColor} />
            <ThemedText style={{ textAlign: 'center', marginTop: 12, color: mutedColor }}>
              {faqs.length === 0 ? 'Todavía no hay preguntas publicadas.' : 'No encontramos una respuesta para esa búsqueda.'}
            </ThemedText>
          </View>
        ) : (
          <View>
            <ThemedText style={{ color: mutedColor, fontSize: 13, marginBottom: 10 }}>
              {visibleFaqs.length} {visibleFaqs.length === 1 ? 'respuesta disponible' : 'respuestas disponibles'}
            </ThemedText>
            {visibleFaqs.map((faq) => {
              const expanded = expandedId === faq.id;
              return (
                <TouchableOpacity
                  key={faq.id}
                  activeOpacity={0.85}
                  onPress={() => setExpandedId(expanded ? null : faq.id)}
                  style={{ backgroundColor: cardColor, borderRadius: 16, borderWidth: 1, borderColor, padding: 16, marginBottom: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${primaryColor}22`, marginRight: 11 }}>
                      <Ionicons name="help" size={17} color={primaryColor} />
                    </View>
                    <ThemedText style={{ flex: 1, fontSize: 15, fontWeight: '700' }}>{faq.pregunta}</ThemedText>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={mutedColor} />
                  </View>
                  {expanded && (
                    <ThemedText style={{ color: mutedColor, lineHeight: 21, marginTop: 14, paddingLeft: 43, fontSize: 14 }}>
                      {faq.respuesta}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
