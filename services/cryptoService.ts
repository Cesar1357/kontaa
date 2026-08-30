import { db } from '@/config/firebase';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';

const PRICE_WINDOWS = ['24h', '7d', '30d', '1y'] as const;

const SYMBOL_TO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  USDC: 'usd-coin',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
};

export function normalizeCoinId(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const known = SYMBOL_TO_ID_MAP[raw.toUpperCase()];
  if (known) return known;

  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export async function actualizarPreciosUsuario(userId: string, holdings?: any[]) {
  try {
    let local = holdings;
    if (!local) {
      const snap = await getDocs(collection(db, 'users', userId, 'criptos'));
      local = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (!Array.isArray(local) || local.length === 0) return [];

    const ids = Array.from(new Set(local.map((h: any) => normalizeCoinId(h.coinId || h.symbol)).filter(Boolean)));
    if (ids.length === 0) return [];

    const chunks: string[] = [];
    // CoinGecko supports many ids comma-separated; keep simple
    const idsParam = ids.join(',');
    const pctParam = PRICE_WINDOWS.join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=mxn&ids=${encodeURIComponent(idsParam)}&price_change_percentage=${encodeURIComponent(pctParam)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!Array.isArray(data)) return [];

    const byId = new Map<string, any>();
    for (const item of data) {
      if (!item?.id) continue;
      byId.set(item.id, item);
    }

    const now = Timestamp.now();
    const updated: any[] = [];

    await Promise.all(
      local.map(async (h: any) => {
        const resolvedId = normalizeCoinId(h.coinId || h.symbol);
        const market = byId.get(resolvedId);
        const next = { ...h };
        if (market) {
          next.currentPrice = Number(market.current_price ?? next.currentPrice ?? 0);
          // NOTE: Do NOT persist price change percentages to Firestore here.
          // The UI should compute windowed changes on-the-fly from market data.
        }

        // persist only the current price + updatedAt to avoid storing transient percent windows
        try {
          await setDoc(doc(db, `users/${userId}/criptos`, next.id), { currentPrice: next.currentPrice, updatedAt: now }, { merge: true });
        } catch (e) {
          // ignore per-item errors
          console.warn('No se pudo persistir precio cripto para', next.id, e);
        }

        // return the merged object for the caller
        updated.push(next);
      })
    );

    return updated;
  } catch (error) {
    console.error('actualizarPreciosUsuario error', error);
    return [];
  }
}

export async function fetchMarkets(ids: string[]) {
  try {
    if (!Array.isArray(ids) || ids.length === 0) return new Map();
    const idsParam = Array.from(new Set(ids.map(normalizeCoinId).filter(Boolean))).join(',');
    const pctParam = PRICE_WINDOWS.join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=mxn&ids=${encodeURIComponent(idsParam)}&price_change_percentage=${encodeURIComponent(pctParam)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!Array.isArray(data)) return new Map();
    const map = new Map<string, any>();
    for (const item of data) {
      if (item?.id) map.set(item.id, item);
    }
    return map;
  } catch (e) {
    console.error('fetchMarkets error', e);
    return new Map();
  }
}

export default { actualizarPreciosUsuario, fetchMarkets };
