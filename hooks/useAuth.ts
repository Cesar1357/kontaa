import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
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

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState('');
  const [displayname, setDisplayName] = useState('');
  const [correo, setCorreo] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [metadata, setMetadata] = useState<AuthMetadata>({});

  useEffect(() => {
    let unsub: (() => void) | undefined;

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
          if (parsed.uid) {
            setUser(parsed as User);
            setUid(parsed.uid);
            setDisplayName(parsed.displayName || '');
            setCorreo(parsed.email || '');
            setEmailVerified(Boolean(parsed.emailVerified));
            setMetadata(parsed.metadata || {});
          }
        }
      } catch (err) {
        console.log('Error al leer usuario local:', err);
      }

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
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

          setUser(refreshedUser);
          setUid(userData.uid);
          setDisplayName(userData.displayName);
          setCorreo(userData.email);
          setEmailVerified(userData.emailVerified);
          setMetadata(userData.metadata as AuthMetadata);

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
          setUser(null);
          setUid('');
          setDisplayName('');
          setCorreo('');
          setEmailVerified(false);
          setMetadata({});
          await AsyncStorage.removeItem('localUser');
        }

        setLoading(false);
      });
    };

    init();

    return () => unsub && unsub();
  }, []);

  return { user, loading, uid, displayname, correo, emailVerified, metadata };
}