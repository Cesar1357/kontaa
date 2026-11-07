import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export type AccountType = 'efectivo' | 'debito' | 'ahorro_interes' | 'otro';

export interface Account {
  id: string;
  nombre: string;
  tipo: AccountType;
  saldoInicial: number;
  incluirEnTotal: boolean;
  color?: string;
  activo: boolean;
  tasaInteresAnual?: number;
  interesAutomatico?: boolean;
  esFavorita?: boolean;
  creado?: unknown;
}

export const DEFAULT_ACCOUNT_ID = 'principal';

export const DEFAULT_ACCOUNT: Omit<Account, 'id'> = {
  nombre: 'Cuenta principal',
  tipo: 'debito',
  saldoInicial: 0,
  incluirEnTotal: true,
  activo: true,
};

export function accountsCollection(userId: string) {
  return collection(db, 'users', userId, 'cuentas');
}

export async function ensureDefaultAccount(userId: string) {
  const accountRef = doc(db, 'users', userId, 'cuentas', DEFAULT_ACCOUNT_ID);
  const snapshot = await getDocs(accountsCollection(userId));

  if (snapshot.empty) {
    await setDoc(accountRef, {
      ...DEFAULT_ACCOUNT,
      creado: serverTimestamp(),
    });
  }

  const transactionsSnapshot = await getDocs(collection(db, 'users', userId, 'transacciones'));
  const unassignedTransactions = transactionsSnapshot.docs.filter((transactionDoc) => !transactionDoc.data().cuentaId);
  for (let offset = 0; offset < unassignedTransactions.length; offset += 500) {
    const batch = writeBatch(db);
    unassignedTransactions.slice(offset, offset + 500).forEach((transactionDoc) => {
      batch.update(transactionDoc.ref, { cuentaId: DEFAULT_ACCOUNT_ID });
    });
    await batch.commit();
  }

  return DEFAULT_ACCOUNT_ID;
}

export async function createAccount(
  userId: string,
  account: Omit<Account, 'id' | 'creado'>,
) {
  return addDoc(accountsCollection(userId), {
    ...account,
    creado: serverTimestamp(),
  });
}

export async function updateAccount(
  userId: string,
  accountId: string,
  changes: Partial<Omit<Account, 'id' | 'creado'>>,
) {
  await updateDoc(doc(db, 'users', userId, 'cuentas', accountId), changes);
}

export async function deleteAccount(userId: string, accountId: string) {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    throw new Error('La cuenta principal no se puede eliminar.');
  }
  await deleteDoc(doc(db, 'users', userId, 'cuentas', accountId));
}
