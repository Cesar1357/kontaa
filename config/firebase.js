import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC5u-H2DdIzrmt3UFGM_dxBBKTJG8ojrdk",
  authDomain: "konta-81b61.firebaseapp.com",
  projectId: "konta-81b61",
  storageBucket: "konta-81b61.firebasestorage.app",
  messagingSenderId: "893828562759",
  appId: "1:893828562759:web:926669e40dac202c331662",
  measurementId: "G-L51NFK5GX5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
const storage = getStorage(app);

export { auth, db, storage };

