import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState('');
  const [displayname, setDisplayName] = useState('');
  const [correo, setCorreo] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [metadata, setMetadata] = useState({});

  useEffect(() => {
    let unsub;

    const init = async () => {
      try {
        // 1️⃣ Intentamos leer usuario local primero (por si no hay internet)
        const storedUser = await AsyncStorage.getItem('localUser');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          setUid(parsed.uid);
          setDisplayName(parsed.displayName || '');
          setCorreo(parsed.email || '');
          setEmailVerified(Boolean(parsed.emailVerified));
          setMetadata(parsed.metadata || {});
        }
      } catch (err) {
        console.log('Error al leer usuario local:', err);
      }

      // 2️⃣ Luego escuchamos cambios en Firebase
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            // Forzamos refresh del usuario para obtener emailVerified actualizado.
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
          setMetadata(userData.metadata);

          // Guardamos localmente
          await AsyncStorage.setItem('localUser', JSON.stringify(userData));

          // Sincronizamos estado de verificación en Firestore.
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
          // Si Firebase dice que no hay sesión, limpiamos todo
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
