import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { auth, db } from '../config/firebase';

export interface AuthMetadata {
  [key: string]: unknown;
}

export interface UseAuthResult {
  user: User | null;
  loading: boolean;
  uid: string;
  displayname: string;
  correo: string;
  emailVerified: boolean;
  metadata: AuthMetadata;
}

const initialSnapshot: UseAuthResult = {
  user: null,
  loading: true,
  uid: '',
  displayname: '',
  correo: '',
  emailVerified: false,
  metadata: {},
};

let snapshot = initialSnapshot;
let initialized = false;
const listeners = new Set<() => void>();

const emit = (next: Partial<UseAuthResult>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const initializeAuth = () => {
  if (initialized) return;
  initialized = true;

  const init = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('localUser');
        if (storedUser) {
          const parsed = JSON.parse(storedUser) as Partial<UseAuthResult['user']> & {
            uid?: string;
            displayName?: string;
            email?: string;
            emailVerified?: boolean;
            metadata?: AuthMetadata;
          };
          if (parsed.uid && !auth.currentUser) {
            emit({
              user: parsed as User,
              uid: parsed.uid,
              displayname: parsed.displayName || '',
              correo: parsed.email || '',
              emailVerified: Boolean(parsed.emailVerified),
              metadata: parsed.metadata || {},
            });
          }
        }
      } catch (err) {
        console.log('Error al leer usuario local:', err);
      }

      onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            await firebaseUser.reload();
          } catch (reloadError) {
            console.log('No se pudo refrescar el estado del usuario:', reloadError);
          }

          const refreshedUser = auth.currentUser || firebaseUser;
          const verified = Boolean(refreshedUser.emailVerified);

          const userData = {
            uid: refreshedUser.uid,
            displayName: refreshedUser.displayName || '',
            email: refreshedUser.email || '',
            emailVerified: verified,
            metadata: refreshedUser.metadata || {},
          };

          emit({
            user: refreshedUser,
            uid: userData.uid,
            displayname: userData.displayName,
            correo: userData.email,
            emailVerified: userData.emailVerified,
            metadata: userData.metadata as AuthMetadata,
          });

          await AsyncStorage.setItem('localUser', JSON.stringify(userData));

          await setDoc(
            doc(db, 'users', userData.uid),
            {
              email: userData.email,
              emailVerified: userData.emailVerified,
              updatedAt: new Date(),
            },
            { merge: true },
          );
        } else {
          emit({ user: null, uid: '', displayname: '', correo: '', emailVerified: false, metadata: {} });
          await AsyncStorage.removeItem('localUser');
        }

        emit({ loading: false });
      });
    };

    init();
};

  initializeAuth();

export function useAuth(): UseAuthResult {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}