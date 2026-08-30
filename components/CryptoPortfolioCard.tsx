import { fetchMarkets, normalizeCoinId } from '@/services/cryptoService';
import { useEffect, useMemo, useState } from 'react';
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
  const { cryptoHomeExpanded, setCryptoHomeExpanded } = useAppTheme();

  const totalValue = useMemo(
    () => holdings.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.currentPrice || 0), 0),
    [holdings],
  );
  const totalCost = useMemo(
    () => holdings.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.avgCost || item.currentPrice || 0), 0),
    [holdings],
  );
  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const topAssets = holdings.slice(0, 3);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);

  const [marketMap, setMarketMap] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (!holdings.length) {
      setMarketMap(new Map());
      return;
    }

    let mounted = true;
    const ids = Array.from(new Set(holdings.map((h) => normalizeCoinId(h.coinId || h.symbol)).filter(Boolean)));

    fetchMarkets(ids)
      .then((map) => {
        if (mounted) setMarketMap(map);
      })
      .catch(() => {
        if (mounted) setMarketMap(new Map());
      });

    return () => {
      mounted = false;
    };
  }, [holdings]);

  const totalWindowChange = useMemo(() => {
    let prevTotal = 0;
    let currTotal = 0;

    for (const h of holdings) {
      const qty = Number(h.quantity || 0);
      const resolvedId = normalizeCoinId(h.coinId || h.symbol);
      const market = marketMap.get(resolvedId);
      const currentPrice = Number(market?.current_price ?? h.currentPrice ?? 0);
      const pct = typeof market?.price_change_percentage_24h_in_currency === 'number'
        ? Number(market.price_change_percentage_24h_in_currency)
        : 0;
      const curr = qty * currentPrice;
      const divisor = Math.abs(pct) < 0.000001 ? 1 : 1 + pct / 100;
      const prev = curr / divisor;
      currTotal += curr;
      prevTotal += Number.isFinite(prev) && prev > 0 ? prev : curr;
    }

    const money = currTotal - prevTotal;
    const percent = prevTotal > 0 ? (money / prevTotal) * 100 : 0;
    return { money, percent };
  }, [holdings, marketMap]);

  const resolveHoldingWindow = (holding: any) => {
    const qty = Number(holding.quantity || 0);
    const resolvedId = normalizeCoinId(holding.coinId || holding.symbol);
    const market = marketMap.get(resolvedId);
    const currentPrice = Number(market?.current_price ?? holding.currentPrice ?? 0);
    const pct = typeof market?.price_change_percentage_24h_in_currency === 'number'
      ? Number(market.price_change_percentage_24h_in_currency)
      : 0;
    const value = qty * currentPrice;
    const divisor = Math.abs(pct) < 0.000001 ? 1 : 1 + pct / 100;
    const prevValue = value / divisor;
    const money = value - prevValue;
    return {
      currentPrice,
      value,
      money,
      pct,
    };
  };

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
      </View>

      <ThemedView style={{ backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>Valor total</ThemedText>
        <ThemedText style={{ fontSize: 22, fontWeight: '800', marginTop: 4 }}>
          {formatMoney(totalValue)}
        </ThemedText>
        <ThemedText style={{ fontSize: 12, opacity: 0.8, marginTop: 4, color: totalWindowChange.money >= 0 ? '#34d399' : '#f87171' }}>
          {totalWindowChange.money >= 0 ? '+' : '-'}{formatMoney(Math.abs(totalWindowChange.money))} ({totalWindowChange.percent.toFixed(2)}%)
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
          {topAssets.length === 0 ? (
            <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>Todavía no agregas activos cripto.</ThemedText>
          ) : (
            topAssets.map((holding: any) => {
              const value = Number(holding.quantity || 0) * Number(holding.currentPrice || 0);
              const cost = Number(holding.quantity || 0) * Number(holding.avgCost || holding.currentPrice || 0);
              const gain = value - cost;
              const { money: change24, pct: change24Pct } = resolveHoldingWindow(holding);

              return (
                <View
                  key={`crypto-summary-${holding.id}`}
                  style={{
                    backgroundColor: cardsMain,
                    borderRadius: 12,
                    borderColor,
                    borderWidth: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      {holding.icon ? (
                        <Image source={{ uri: holding.icon }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 8 }} />
                      ) : (
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: `${primaryColor}22`, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <ThemedText style={{ color: primaryColor, fontWeight: '700', fontSize: 9 }}>{String(holding.symbol || '').slice(0, 2)}</ThemedText>
                        </View>
                      )}

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText style={{ color: textColor, fontWeight: '700', fontSize: 12 }}>{holding.symbol}</ThemedText>
                        <ThemedText style={{ color: textColor, opacity: 0.7, fontSize: 10 }}>{Number(holding.quantity || 0).toFixed(5)}</ThemedText>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <ThemedText style={{ color: textColor, fontWeight: '800', fontSize: 12 }}>{formatMoney(value)}</ThemedText>
                      <ThemedText style={{ fontSize: 10, color: change24 >= 0 ? '#34d399' : '#f87171', fontWeight: '700', marginTop: 2 }}>
                        {change24 >= 0 ? '+' : '-'}{formatMoney(Math.abs(change24))} ({Number.isFinite(change24Pct) ? change24Pct.toFixed(2) : '0.00'}%)
                      </ThemedText>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </ThemedView>
  );
}
