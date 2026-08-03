import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import {
    browserLocalPersistence,
    getAuth,
    getReactNativePersistence,
    inMemoryPersistence,
    initializeAuth,
} from 'firebase/auth';
import { getFirestore } from "firebase/firestore";
import { getFunctions } from 'firebase/functions';
import { getStorage } from "firebase/storage";
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyC5u-H2DdIzrmt3UFGM_dxBBKTJG8ojrdk",
  authDomain: "konta-81b61.firebaseapp.com",
  projectId: "konta-81b61",
  storageBucket: "konta-81b61.firebasestorage.app",
  messagingSenderId: "893828562759",
  appId: "1:893828562759:web:926669e40dac202c331662",
  measurementId: "G-L51NFK5GX5"
};

// 1. Initialize the App
const app = initializeApp(firebaseConfig);

// 2. Initialize Auth FIRST so all subsequent services can link to it
const auth = (() => {
  try {
    if (Platform.OS === 'web') {
      // Static rendering runs in Node (no window/localStorage), so use memory there.
      const isServer = typeof window === 'undefined';
      return initializeAuth(app, {
        persistence: isServer ? inMemoryPersistence : browserLocalPersistence,
      });
    }

    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Reuse existing auth instance during fast refresh/hot reload.
    return getAuth(app);
  }
})();

// 3. Initialize the other services
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
const storage = getStorage(app);

export { app, auth, db, functions, storage };

