
type Tx = any;

const toDate = (tx: Tx): Date => {
  if (tx?.date instanceof Date) return tx.date;
  if (tx?.fecha?.toDate) return tx.fecha.toDate();
  if (tx?.fecha) return new Date(tx.fecha);
  return new Date();
};

export function buildCryptoValueSeries(transactions: Tx[]) {
  const cryptoMovements = (transactions || []).filter((t) => t?.origen === 'movimiento-cripto');
  const source = cryptoMovements.length > 0
    ? cryptoMovements
    : (transactions || []);
  const rows = source
    .filter((t) => t && t.crypto && Number.isFinite(Number(t.monto)))
    .map((t) => ({
      date: toDate(t),
      value: Number(t.monto) * (t.tipo === 'egreso' ? 1 : -1),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const series: { date: Date; value: number }[] = [];
  for (const r of rows) {
    running += r.value;
    series.push({ date: r.date, value: Number(running.toFixed(8)) });
  }

  return series;
}

export function buildSavingsTotalSeries(transactions: Tx[]) {
  const savingsMovements = (transactions || []).filter((t) => t?.origen === 'movimiento-ahorro');
  const legacyTransactions = (transactions || []).filter((t) => t?.origen === 'transferencia-ahorro' || t?.origen === 'retiro-ahorro');
  const source = savingsMovements.length > 0 ? savingsMovements : legacyTransactions;
  const rows = source
    .filter((t) => t && (t.origen === 'movimiento-ahorro' || t.origen === 'transferencia-ahorro' || t.origen === 'retiro-ahorro'))
    .map((t) => ({
      date: toDate(t),
      change: Number(t.monto || 0) * (
        t.origen === 'transferencia-ahorro' || t.movimientoTipo === 'transferencia' ? 1 : -1
      ),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const series: { date: Date; value: number }[] = [];
  for (const r of rows) {
    running += r.change;
    series.push({ date: r.date, value: Number(running.toFixed(2)) });
  }

  return series;
}

export default {
  buildCryptoValueSeries,
  buildSavingsTotalSeries,
};
