import { db } from '@/config/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useSyncExternalStore } from 'react';

type Transaction = Record<string, any> & { id: string; date: Date | null };

type Store = {
  data: Transaction[];
  listeners: Set<() => void>;
  unsubscribe?: () => void;
};

const stores = new Map<string, Store>();
const emptyTransactions: Transaction[] = [];

function getStore(userId: string): Store {
  const existing = stores.get(userId);
  if (existing) return existing;

  const store: Store = { data: [], listeners: new Set() };
  stores.set(userId, store);
  return store;
}

function ensureSubscription(userId: string, store: Store) {
  if (store.unsubscribe) return;

  const transactionsRef = collection(db, 'users', userId, 'transacciones');
  const transactionsQuery = query(transactionsRef, orderBy('fecha', 'desc'));
  store.unsubscribe = onSnapshot(
    transactionsQuery,
    (snapshot) => {
      store.data = snapshot.docs.map((transactionDoc) => {
        const data = transactionDoc.data() as Record<string, any>;
        return {
          id: transactionDoc.id,
          ...data,
          date: data.fecha?.toDate?.() || null,
        };
      });
      store.listeners.forEach((listener) => listener());
    },
    () => {
      store.data = [];
      store.listeners.forEach((listener) => listener());
    },
  );
}

function subscribe(userId: string | undefined, listener: () => void) {
  if (!userId) return () => undefined;

  const store = getStore(userId);
  store.listeners.add(listener);
  ensureSubscription(userId, store);

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      store.unsubscribe?.();
      stores.delete(userId);
    }
  };
}

export function useTransactions(userId?: string) {
  const subscribeToTransactions = useCallback(
    (listener: () => void) => subscribe(userId, listener),
    [userId],
  );
  const getTransactionsSnapshot = useCallback(
    () => userId ? stores.get(userId)?.data ?? emptyTransactions : emptyTransactions,
    [userId],
  );

  return useSyncExternalStore(
    subscribeToTransactions,
    getTransactionsSnapshot,
    () => emptyTransactions,
  );
}
