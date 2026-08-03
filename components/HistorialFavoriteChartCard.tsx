import { useMemo } from 'react';
import { Dimensions, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { format } from 'date-fns';
import { LineChart as LineChartKit } from 'react-native-chart-kit';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

const screenWidth = Dimensions.get('window').width;

export type HistorialChartKey =
  | 'overview'
  | 'bars'
  | 'weekdayActivity'
  | 'amountRanges'
  | 'pieType'
  | 'pieCategory'
  | 'cumulative'
  | 'trend';

interface HistorialFavoriteChartCardProps {
  chartKey: HistorialChartKey;
  title: string;
  subtitle?: string;
  transactions: any[];
  onPress?: () => void;
}

const toDate = (tx: any): Date => {
  if (tx?.date instanceof Date) return tx.date;
  if (tx?.fecha?.toDate) return tx.fecha.toDate();
  if (tx?.fecha) return new Date(tx.fecha);
  return new Date();
};

export default function HistorialFavoriteChartCard({
  chartKey,
  title,
  subtitle,
  transactions,
  onPress,
}: HistorialFavoriteChartCardProps) {
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const iconColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const tintColor = useThemeColor({ light: '', dark: '' }, 'tint');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryDarkColor = useThemeColor({ light: '', dark: '' }, 'primaryDark');

  const sampled = useMemo(() => {
    const ordered = [...transactions]
      .filter((tx) => tx)
      .sort((a, b) => toDate(a).getTime() - toDate(b).getTime());

    if (ordered.length <= 28) return ordered;

    const out: any[] = [];
    const maxIndex = ordered.length - 1;
    const step = maxIndex / 27;
    for (let i = 0; i < 28; i++) {
      out.push(ordered[Math.min(maxIndex, Math.round(i * step))]);
    }
    return out;
  }, [transactions]);

  const summary = useMemo(() => {
    const dailyMap = new Map<string, { ingresos: number; egresos: number; movimientos: number }>();
    const monthlyMap = new Map<string, { ingresos: number; egresos: number }>();
    const categories = new Map<string, number>();
    const weekdayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const weekdayMovements = [0, 0, 0, 0, 0, 0, 0];
    const amountRangeLabels = ['0-99', '100-499', '500-999', '1000-4999', '5000+'];
    const amountRangeBuckets = [0, 0, 0, 0, 0];
    let ingresos = 0;
    let egresos = 0;

    for (const tx of sampled) {
      const d = toDate(tx);
      const amount = Number(tx?.monto || 0);
      const isIngreso = tx?.tipo === 'ingreso';
      const dayKey = format(d, 'dd/MM');
      const monthKey = format(d, 'MM/yy');

      if (isIngreso) ingresos += amount;
      else egresos += amount;

      const dayBase = dailyMap.get(dayKey) || { ingresos: 0, egresos: 0, movimientos: 0 };
      dayBase.ingresos += isIngreso ? amount : 0;
      dayBase.egresos += !isIngreso ? amount : 0;
      dayBase.movimientos += 1;
      dailyMap.set(dayKey, dayBase);

      const monthBase = monthlyMap.get(monthKey) || { ingresos: 0, egresos: 0 };
      monthBase.ingresos += isIngreso ? amount : 0;
      monthBase.egresos += !isIngreso ? amount : 0;
      monthlyMap.set(monthKey, monthBase);

      weekdayMovements[d.getDay()] += 1;

      if (amount < 100) amountRangeBuckets[0] += 1;
      else if (amount < 500) amountRangeBuckets[1] += 1;
      else if (amount < 1000) amountRangeBuckets[2] += 1;
      else if (amount < 5000) amountRangeBuckets[3] += 1;
      else amountRangeBuckets[4] += 1;

      if (!isIngreso) {
        const category = tx?.presupuestoCategoria || tx?.preestablecidoMainNombre || tx?.descripcion || 'Otros';
        categories.set(category, (categories.get(category) || 0) + amount);
      }
    }

    let running = 0;
    const cumulativeLineData = sampled.map((tx, index) => {
      const amount = Number(tx?.monto || 0);
      running += tx?.tipo === 'ingreso' ? amount : -amount;
      return {
        value: Number(running.toFixed(2)),
        label: index % 4 === 0 ? format(toDate(tx), 'dd/MM') : '',
      };
    });

    const trendLineData = sampled.map((tx, index) => ({
      value: Number((tx?.tipo === 'ingreso' ? tx?.monto : -tx?.monto).toFixed(2)),
      label: index % 4 === 0 ? format(toDate(tx), 'dd/MM') : '',
    }));

    const movementBars = Array.from(dailyMap.entries()).slice(-8).map(([label, d]) => ({
      value: d.movimientos,
      label,
      frontColor: tintColor,
    }));

    const monthlyFlowBars = Array.from(monthlyMap.entries()).slice(-6).map(([label, d]) => ({
      value: Number(Math.max(d.ingresos, d.egresos).toFixed(2)),
      label,
      frontColor: d.ingresos >= d.egresos ? primaryColor : '#fb7185',
    }));

    const typePieData = [
      { value: Number(ingresos.toFixed(2)), color: '#34d399', text: 'Ingresos' },
      { value: Number(egresos.toFixed(2)), color: '#f87171', text: 'Egresos' },
    ].filter((i) => i.value > 0);

    const palette = [tintColor, '#f59e0b', '#a78bfa', primaryColor, '#fb7185', iconColor];
    const categoryPieData = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], index) => ({
        value: Number(value.toFixed(2)),
        color: palette[index % palette.length],
        text: label.length > 12 ? `${label.slice(0, 12)}...` : label,
      }));

    const weekdayActivityBars = weekdayNames.map((label, index) => ({
      label,
      value: weekdayMovements[index],
      frontColor: tintColor,
    }));

    const amountRangeBars = amountRangeLabels.map((label, index) => ({
      label,
      value: amountRangeBuckets[index],
      frontColor: primaryDarkColor,
    }));

    return {
      cumulativeLineData,
      trendLineData,
      movementBars,
      monthlyFlowBars,
      weekdayActivityBars,
      amountRangeBars,
      typePieData,
      categoryPieData,
      sampled,
      ingresos,
      egresos,
    };
  }, [sampled, tintColor, primaryColor, primaryDarkColor, iconColor]);

  const chartWidth = Math.max(220, screenWidth - 96);

  const content = (() => {
    if (chartKey === 'overview') {
      return (
        <LineChartKit
          data={{
            labels: summary.sampled.map((tx, index) => {
              const step = Math.max(1, Math.ceil(summary.sampled.length / 5));
              return index % step === 0 || index === summary.sampled.length - 1 ? format(toDate(tx), 'dd/MM/yy') : '';
            }),
            datasets: [{ data: summary.sampled.map((tx) => Number(tx?.tipo === 'ingreso' ? tx?.monto : -tx?.monto)) }],
          }}
          width={chartWidth}
          height={170}
          chartConfig={{
            backgroundColor: cardsMain,
            backgroundGradientFrom: cardsMain,
            backgroundGradientTo: cardsMain,
            decimalPlaces: 0,
            color: () => tintColor,
            labelColor: () => iconColor,
            propsForDots: { r: '2', strokeWidth: '0', stroke: tintColor },
            propsForBackgroundLines: { strokeWidth: '0' },
            propsForLabels: { fontSize: 9 },
          }}
          bezier
          withInnerLines={false}
          withHorizontalLabels={false}
          withOuterLines={false}
          style={{ borderRadius: 0, paddingRight: 0 }}
        />
      );
    }

    if (chartKey === 'bars') {
      return (
        <View>
          <BarChart
            data={summary.movementBars}
            barWidth={10}
            spacing={12}
            roundedTop
            hideRules
            yAxisThickness={0}
            xAxisThickness={0}
            width={chartWidth}
          />
          <View style={{ height: 10 }} />
          <BarChart
            data={summary.monthlyFlowBars}
            barWidth={10}
            spacing={12}
            roundedTop
            hideRules
            yAxisThickness={0}
            xAxisThickness={0}
            width={chartWidth}
          />
        </View>
      );
    }

    if (chartKey === 'weekdayActivity') {
      return (
        <BarChart
          data={summary.weekdayActivityBars}
          barWidth={16}
          spacing={14}
          roundedTop
          hideRules
          yAxisThickness={0}
          xAxisThickness={0}
          width={chartWidth}
        />
      );
    }

    if (chartKey === 'amountRanges') {
      return (
        <BarChart
          data={summary.amountRangeBars}
          barWidth={16}
          spacing={14}
          roundedTop
          hideRules
          yAxisThickness={0}
          xAxisThickness={0}
          width={chartWidth}
        />
      );
    }

    if (chartKey === 'pieType') {
      return summary.typePieData.length > 0 ? (
        <PieChart data={summary.typePieData} donut radius={60} innerRadius={34} />
      ) : null;
    }

    if (chartKey === 'pieCategory') {
      return summary.categoryPieData.length > 0 ? (
        <PieChart data={summary.categoryPieData} donut radius={60} innerRadius={34} />
      ) : null;
    }

    if (chartKey === 'cumulative') {
      return (
        <LineChart
          data={summary.cumulativeLineData}
          thickness={2}
          color={tintColor}
          areaChart
          curved
          startFillColor={tintColor}
          endFillColor="transparent"
          yAxisThickness={0}
          xAxisColor="transparent"
          yAxisColor="transparent"
          noOfSections={3}
          width={chartWidth}
        />
      );
    }

    return (
      <LineChart
        data={summary.trendLineData}
        thickness={2}
        color={tintColor}
        hideDataPoints={false}
        dataPointsColor={tintColor}
        curved
        yAxisThickness={0}
        xAxisColor="transparent"
        yAxisColor="transparent"
        noOfSections={3}
        width={chartWidth}
      />
    );
  })();

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        backgroundColor: cardsMain,
        borderRadius: 14,
        borderWidth: 1,
        borderColor,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <ThemedText style={{ fontSize: 14, fontWeight: '700' }}>{title}</ThemedText>
      {!!subtitle && <ThemedText style={{ fontSize: 11, color: iconColor, marginTop: 2, marginBottom: 8 }}>{subtitle}</ThemedText>}
      <View style={{ alignItems: chartKey === 'pieType' || chartKey === 'pieCategory' ? 'center' : 'flex-start' }}>
        {content}
      </View>
      <ThemedText style={{ fontSize: 11, color: iconColor, marginTop: 8 }}>
        Toca para abrir en Historial
      </ThemedText>
    </TouchableOpacity>
  );
}
