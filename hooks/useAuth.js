import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../config/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState('');
  const [displayname, setDisplayName] = useState('');
  const [correo, setCorreo] = useState('');
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
          setMetadata(parsed.metadata || {});
        }
      } catch (err) {
        console.log('Error al leer usuario local:', err);
      }

      // 2️⃣ Luego escuchamos cambios en Firebase
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const userData = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || '',
            email: firebaseUser.email || '',
            metadata: firebaseUser.metadata || {},
          };

          setUser(firebaseUser);
          setUid(userData.uid);
          setDisplayName(userData.displayName);
          setCorreo(userData.email);
          setMetadata(userData.metadata);

          // Guardamos localmente
          await AsyncStorage.setItem('localUser', JSON.stringify(userData));
        } else {
          // Si Firebase dice que no hay sesión, limpiamos todo
          setUser(null);
          setUid('');
          setDisplayName('');
          setCorreo('');
          setMetadata({});
          await AsyncStorage.removeItem('localUser');
        }

        setLoading(false);
      });
    };

    init();

    return () => unsub && unsub();
  }, []);

  return { user, loading, uid, displayname, correo, metadata };
}
