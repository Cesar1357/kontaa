import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAppTheme } from '@/hooks/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

interface CryptoPortfolioCardProps {
  holdings: any[];
}

export default function CryptoPortfolioCard({ holdings }: CryptoPortfolioCardProps) {
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const { cryptoListViewMode, setCryptoListViewMode, cryptoHomeExpanded, setCryptoHomeExpanded } = useAppTheme();
  const [period, setPeriod] = useState<'semanal' | 'mensual'>('semanal');

  const totalValue = holdings.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.currentPrice || 0), 0);
  const totalCost = holdings.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.avgCost || item.currentPrice || 0), 0);
  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const topAssets = holdings.slice(0, 3);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);

  return (
    <ThemedView
      style={{
        width: '95%',
        borderRadius: 16,
        padding: 14,
        marginTop: 12,
        marginBottom: 8,
        backgroundColor: cardsMain,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 22,
        elevation: 5,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>Portafolio cripto</ThemedText>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => setCryptoHomeExpanded(!cryptoHomeExpanded)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: `${primaryColor}14`,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: `${primaryColor}33`,
            }}
          >
            <ThemedText style={{ fontSize: 11, fontWeight: '700', color: textColor }}>
              {cryptoHomeExpanded ? 'Contraer' : 'Expandir'}
            </ThemedText>
          </Pressable>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: `${primaryColor}14`,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: `${primaryColor}33`,
              padding: 4,
              gap: 4,
            }}
          >
            {(['semanal', 'mensual'] as const).map((option) => {
              const active = period === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setPeriod(option)}
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: active ? primaryColor : 'transparent',
                  }}
                >
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : textColor }}>
                    {option === 'semanal' ? 'Semanal' : 'Mensual'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <ThemedText style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
        Rendimiento {period === 'semanal' ? 'septimal' : 'mensual'} del portafolio.
      </ThemedText>

      <ThemedView style={{ backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>Valor total</ThemedText>
        <ThemedText style={{ fontSize: 22, fontWeight: '800', marginTop: 4 }}>
          {formatMoney(totalValue)}
        </ThemedText>
      </ThemedView>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <ThemedView style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: `${totalGain >= 0 ? '#22c55e' : '#ef4444'}14`, borderWidth: 1, borderColor: `${totalGain >= 0 ? '#22c55e' : '#ef4444'}44` }}>
          <ThemedText style={{ fontSize: 11, opacity: 0.72 }}>{totalGain >= 0 ? 'Ganancia' : 'Pérdida'}</ThemedText>
          <ThemedText style={{ fontSize: 15, fontWeight: '800', color: totalGain >= 0 ? '#22c55e' : '#ef4444', marginTop: 4 }}>
            {formatMoney(Math.abs(totalGain))}
          </ThemedText>
          <ThemedText style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {Math.abs(totalGainPercent).toFixed(1)}%
          </ThemedText>
        </ThemedView>

        <ThemedView style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: `${primaryColor}10`, borderWidth: 1, borderColor: `${borderColor}66` }}>
          <ThemedText style={{ fontSize: 11, opacity: 0.72 }}>Costo total</ThemedText>
          <ThemedText style={{ fontSize: 15, fontWeight: '800', marginTop: 4 }}>
            {formatMoney(totalCost)}
          </ThemedText>
          <ThemedText style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {holdings.length} activo{holdings.length === 1 ? '' : 's'}
          </ThemedText>
        </ThemedView>
      </View>

      {cryptoHomeExpanded && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <ThemedText style={{ fontSize: 12, opacity: 0.75 }}>Vista</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${primaryColor}14`, borderRadius: 999, borderWidth: 1, borderColor: `${primaryColor}33`, padding: 4, gap: 4 }}>
              {(['normal', 'compact'] as const).map((option) => {
                const active = cryptoListViewMode === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setCryptoListViewMode(option)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: active ? primaryColor : 'transparent',
                    }}
                  >
                    <ThemedText style={{ fontSize: 10, fontWeight: '700', color: active ? '#fff' : textColor }}>
                      {option === 'normal' ? 'Normal' : 'Compacto'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {topAssets.length === 0 ? (
            <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>Todavía no agregas activos cripto.</ThemedText>
          ) : (
            topAssets.map((holding: any) => {
              const value = Number(holding.quantity || 0) * Number(holding.currentPrice || 0);
              const cost = Number(holding.quantity || 0) * Number(holding.avgCost || holding.currentPrice || 0);
              const gain = value - cost;

              return (
                <ThemedView
                  key={`crypto-summary-${holding.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: `${primaryColor}10`,
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 8,
                    borderColor: `${borderColor}66`,
                    borderWidth: 1,
                  }}
                >
                  <ThemedView style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' }}>
                    {holding.icon ? (
                      <Image source={{ uri: holding.icon }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 8 }} />
                    ) : null}
                    <View>
                      <ThemedText style={{ fontWeight: '700', color: textColor }}>{holding.symbol}</ThemedText>
                      <ThemedText style={{ fontSize: 11, opacity: 0.7 }}>
                        {gain >= 0 ? '+' : '-'}{formatMoney(Math.abs(gain))}
                      </ThemedText>
                    </View>
                  </ThemedView>
                  <ThemedText style={{ fontWeight: '700', color: textColor }}>
                    {formatMoney(value)}
                  </ThemedText>
                </ThemedView>
              );
            })
          )}
        </>
      )}
    </ThemedView>
  );
}
