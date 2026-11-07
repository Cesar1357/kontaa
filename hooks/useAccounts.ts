import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { accountsCollection, ensureDefaultAccount, type Account } from '@/services/accounts';

type AccountStore = {
  data: Account[];
  listeners: Set<() => void>;
  unsubscribe?: () => void;
};

const stores = new Map<string, AccountStore>();
const emptyAccounts: Account[] = [];

function getStore(userId: string): AccountStore {
  const existing = stores.get(userId);
  if (existing) return existing;

  const store: AccountStore = { data: [], listeners: new Set() };
  stores.set(userId, store);
  return store;
}

function subscribe(userId: string | undefined, listener: () => void) {
  if (!userId) return () => undefined;

  const store = getStore(userId);
  store.listeners.add(listener);

  if (!store.unsubscribe) {
    const accountsQuery = query(accountsCollection(userId), orderBy('creado', 'asc'));
    store.unsubscribe = onSnapshot(
      accountsQuery,
      (snapshot) => {
        store.data = snapshot.docs.map((accountDoc) => ({
          id: accountDoc.id,
          ...(accountDoc.data() as Omit<Account, 'id'>),
        }));
        store.listeners.forEach((currentListener) => currentListener());
      },
      (error) => {
        console.error('Error al escuchar cuentas:', error);
        store.listeners.forEach((currentListener) => currentListener());
      },
    );
  }

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      store.unsubscribe?.();
      stores.delete(userId);
    }
  };
}

export function useAccounts(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    ensureDefaultAccount(userId).catch((error) => {
      console.error('Error al crear la cuenta principal:', error);
    });
  }, [userId]);

  const subscribeToAccounts = useCallback(
    (listener: () => void) => subscribe(userId, listener),
    [userId],
  );
  const getSnapshot = useCallback(
    () => (userId ? stores.get(userId)?.data ?? emptyAccounts : emptyAccounts),
    [userId],
  );

  return useSyncExternalStore(subscribeToAccounts, getSnapshot, () => emptyAccounts);
}
