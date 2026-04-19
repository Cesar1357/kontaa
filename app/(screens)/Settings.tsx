import { NotificationTestPanel } from '@/components/NotificationTestPanel';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet/src';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigationState } from '@react-navigation/native';
import * as LocalAuthentication from "expo-local-authentication";
import { router } from 'expo-router';
import { getAuth, signOut, updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { Icon } from 'react-native-elements';
import { RFValue } from 'react-native-responsive-fontsize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../config/firebase';

export default function Settings() {

  const [togglePerfil, setTogglePerfil] = useState(false);
  const [togglePerfilE, setTogglePerfilE] = useState(false);

  const { uid, loading, displayname, correo, metadata, user } = useAuth();

  const modalRef4 = useRef<BottomSheetModal>(null);
  const modalRef5 = useRef<BottomSheetModal>(null);
  const modalRef6 = useRef<BottomSheetModal>(null);

  const snapPoints4 = useMemo(() => ['50%', '100%'], []);
  const snapPoints5 = useMemo(() => ['25%', '25%'], []);
  const snapPoints6 = useMemo(() => ['30%', '30%'], []);

  const [n,setN] = useState("")
  const nR = useRef(null)
  const auth = getAuth();

  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');

  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [toggleSeguridad, setToggleSeguridad] = useState(false);

  const [isTextVisible, setIsTextVisible] = useState(false);
  const state = useNavigationState(state => state);

  useEffect(() => {
    console.log("Settings mounted, setting up back handler",router.canGoBack()); 
    console.log(state);
    console.log("si?", );
    
      const backAction = () => {
        console.log("Back button pressed");
        if (togglePerfilE) {
          console.log("Closing edit profile modal");
          modalRef5.current?.dismiss();
          setTogglePerfilE(false);
          return true;
        }
        if (togglePerfil) {
          console.log("Closing profile modal");
          modalRef4.current?.dismiss();
          setTogglePerfil(false);
          return true;
        }
        if (toggleSeguridad) {
          console.log("Closing security modal");
          modalRef6.current?.dismiss();
          setToggleSeguridad(false);
          return true;
        }
        console.log("No modal open, allowing default back behavior");
        return false; // Permite el comportamiento por defecto (ir atrás)
      };
  
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
  
      return () => backHandler.remove();
    }, [togglePerfil, togglePerfilE, toggleSeguridad]);

    useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("localAuthEnabled");
      setLocalAuthEnabled(stored === "true");
      setChecking(false);
    })();
  }, []);

  
  const handleLogout = async () => {
  try {
    await signOut(auth);
    console.log("Sesión cerrada exitosamente ✅");
    router.dismissTo("/(sesion)/create");
    // Redirige o actualiza el estado según tu flujo de navegación
  } catch (error) {
    console.error("Error al cerrar sesión ❌", error);
  }
};

  const toggleOverlayPerfil = () => {
    if(!togglePerfil){
        modalRef4.current?.present();
        setTogglePerfil(true)
    }else{
        modalRef4.current?.dismiss();
        setTogglePerfil(false)
    }
  };

  const toggleOverlayPerfilE = () => {
    if(!togglePerfilE){
        modalRef5.current?.present();
        setTogglePerfilE(true)
    }else{
        modalRef5.current?.dismiss();
        setTogglePerfilE(false)
    }
  };

  const toggleOverlaySeguridad = () => {
    if (!toggleSeguridad) {
      modalRef6.current?.present();
      setToggleSeguridad(true);
    } else {
      modalRef6.current?.dismiss();
      setToggleSeguridad(false);
    }
  };

  const updateProfile1 =async () => {
    updateProfile(user, {
      displayName: n
    }).then(async(a) => {
      const ref = doc(db, "people", uid);
      await updateDoc(ref, {
        namep:n
      }).then(() => {
        console.log('Actualización exitosa');
        ToastAndroid.showWithGravity(
          `Actualizado con éxito.`,
          ToastAndroid.SHORT,
          ToastAndroid.BOTTOM // Cambiado a la parte inferior de la pantalla
        );      
        modalRef5.current?.close()
      })
      .catch((error) => {
          console.error('Error al actualizar:', error);
      });
    })   
  }

  const handleToggle = async (value) => {
    try {
      if (value) {
        // Verificar compatibilidad del dispositivo antes de activar
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        if (!compatible) {
          Alert.alert("No disponible", "Tu dispositivo no tiene autenticación biométrica.");
          return;
        }
        if (!enrolled) {
          Alert.alert("No configurada", "Configura tu huella o PIN en los ajustes del sistema.");
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Verifica para activar autenticación",
        });

        if (result.success) {
          await AsyncStorage.setItem("localAuthEnabled", "true");
          setLocalAuthEnabled(true);
          Alert.alert("Activado", "La autenticación biométrica se ha habilitado.");
        } else {
          Alert.alert("Cancelado", "No se activó la autenticación biométrica.");
        }
      } else {
        await AsyncStorage.setItem("localAuthEnabled", "false");
        setLocalAuthEnabled(false);
        Alert.alert("Desactivado", "La autenticación biométrica se ha deshabilitado.");
      }
    } catch (e) {
      console.error("Error al cambiar autenticación local:", e);
    }
  };

  
    return (
    <SafeAreaView style={{ backgroundColor: backgroundColor, flex: 1 }}> 
      <View style={{ marginTop: 30}}>
        <ThemedText onLongPress={() => router.push("/(screens)/Settings")} style={{ fontSize: 27, marginLeft: 5, height: 40, fontWeight: 'bold' }}>
            Ajustes
        </ThemedText>
        <NotificationTestPanel visible={isTextVisible} />
      </View>
        <View style={{ marginTop: 30 }}>
        <TouchableOpacity onPress={() => {toggleOverlayPerfil()}} style={{ borderTopWidth: 1, borderColor: "gray" }}>
            <ThemedText style={{ fontSize: 25, marginLeft: 5, height: 30, alignItems: "center", alignContent: "center", marginTop:5 }}>Cuenta</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {toggleOverlaySeguridad()}} style={{ borderTopWidth: 1, borderColor: "gray" }}>
          <ThemedText style={{ fontSize: 25, marginLeft: 5, height: 30, marginTop:5}}>Seguridad</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL("https://emperblack.wordpress.com/konta-politica-de-privacidad/")} style={{ borderTopWidth: 1, borderColor: "gray" }}>
          <ThemedText style={{ fontSize: 25, marginLeft: 5, height: 40, marginTop:5}}>Política de privacidad</ThemedText>
        </TouchableOpacity>
        <ThemedText style={{ fontSize: 20, marginLeft: 5, height: 40, alignItems: "center", alignContent: "center", alignSelf: "center", borderTopWidth: 1, borderColor: "gray", paddingTop:5 }}>Es todo por el momento</ThemedText>
        </View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <ThemedText onLongPress={() => setIsTextVisible(!isTextVisible)} style={{ fontSize: 10, height: 40, alignItems: "center", alignContent: "center", alignSelf: "center" }}>Emperblack | v1.3.0  </ThemedText>
      </View>

    <BottomSheetModal
        ref={modalRef4}
        index={1}
        snapPoints={snapPoints4}
        enableDynamicSizing={false}
        detached={false}
        containerStyle={{}}
        style={{}}
        keyboardBehavior='extend'
        backdropComponent={BottomSheetBackdrop}
        onDismiss={() => setTogglePerfil(false)}
        backgroundStyle={{ backgroundColor: backgroundColor }}
        handleIndicatorStyle={{ backgroundColor: 'gray' }}
        stackBehavior='switch'
    >
      <View style={{ paddingHorizontal: 16, flexDirection:"column" }}>
        <View style={{}}>
        <Text
          style={{
            fontSize: RFValue(40),
            fontWeight: 'bold',
            color: textColor,
            alignSelf: 'center',
            marginTop:"20%",
          }}>
          Perfil
        </Text>
      </View>
      <View style={{}}>
        <View style={{ marginTop:"30%" }}>
          <Text
            style={{
              color: textColor,
              fontSize: RFValue(40),
              fontWeight: 'bold',
              textAlign:"center"
            }}>
            {displayname}
          </Text>
          <TouchableOpacity
            style={{
              width: 80,
              height: 30,
              backgroundColor: 'gray',
              borderRadius: 20,
              marginTop: 5,
              alignSelf:"center"
            }}
            onPress={() => toggleOverlayPerfilE()}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: 'bold',
                alignSelf: 'center',
                marginTop: 3,
                color: 'black',
              }}>
              Editar
            </Text>
          </TouchableOpacity>
          <Text style={{
              color: 'gray',
              fontSize: RFValue(20),
              fontWeight: 'bold',
              marginTop:20,
              textAlign:"center"
            }}>
        {correo}
        </Text>
         <Text style={{
              color: 'gray',
              fontSize: RFValue(15),
              fontWeight: 'bold',
              marginTop:20,
              textAlign:"center"
            }}>
        {uid}
        </Text>
          <Text style={{
                color: 'gray',
                fontSize: RFValue(15),
                fontWeight: 'bold',
                marginTop:RFValue(150),
                textAlign:"center"
              }}>
           Cuenta creada el:{" "}
          {metadata?.createdAt
            ? new Date(Number(metadata.createdAt)).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "Fecha no disponible"}
          </Text>
        </View>

        </View>
        <TouchableOpacity
          onPress={() => Alert.alert("Cerrar sesión","¿Seguro que quieres cerrar sesión?", [
            {
              text: 'Si',
              color: 'red',
              onPress: () => handleLogout(),
            },{
              text: 'No',
              onPress: () => console.log('Cancel Pressed'),
              style: 'cancel',
            }],{cancelable: true})}
          style={{
            marginLeft: '86%',
          }}>
          <Icon type={'ionicon'} name={'log-out'} color={'red'} size={40} />
        </TouchableOpacity>  
        </View>
    </BottomSheetModal>
    <BottomSheetModal
        ref={modalRef5}
        index={1}
        snapPoints={snapPoints5}
        enableDynamicSizing={false}
        detached={true}
        containerStyle={{width:"80%",marginLeft:"10%"}}
        style={{marginTop:-330}}
        keyboardBehavior='extend'
        backdropComponent={BottomSheetBackdrop}
        onDismiss={() => setTogglePerfilE(false)}
        backgroundStyle={{ backgroundColor: '#111' }}
        handleIndicatorStyle={{ backgroundColor: 'gray' }}
        stackBehavior='push'
    >
      <View style={{ paddingHorizontal: 16, flexDirection:"column" }}>
        <Text
          style={{
            fontSize: RFValue(30),
            fontWeight:"bold",
            color: 'white',
            alignSelf: 'center',
          }}>
          Cambiar Nombre
        </Text>
        <TextInput
          style={{
            backgroundColor: 'white',
            fontWeight: 'bold',
            borderColor: 'white',
            color: '#666664',
            width: '95%',
            alignSelf: 'center',
            borderRadius: 5,
            height: 45,
            marginTop: 10,
            fontSize:17 ,
            paddingLeft:5
          }}
          onChangeText={(text) => setN(text)}
          placeholder={'Nuevo nombre'}
          maxLength={15}
          ref={nR}
          placeholderTextColor="#666664"
          keyboardAppearance={"dark"}
          keyboardType={"web-search"}
          clearButtonMode={"always"}
          returnKeyType={"search"} 
        />
        <TouchableOpacity
            style={{
              width: '60%',
              height: 40,
              backgroundColor: '#2E2E34',
              borderRadius: 30,
              alignSelf:"center",
              marginTop:30
            }}
            onPress={() => updateProfile1()}>  
            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                alignSelf: 'center',
                marginTop: 5,
                color: '#34904F',
              }}>
              Actualizar
            </Text>
          </TouchableOpacity>
      </View>
    </BottomSheetModal>
     <BottomSheetModal
        ref={modalRef6}
        index={1}
        snapPoints={snapPoints6}
        enableDynamicSizing={false}
        detached={true}
        style={{marginTop:-300}}
        containerStyle={{width:"80%",marginLeft:"10%"}}
        keyboardBehavior='extend'
        backdropComponent={BottomSheetBackdrop}
        onDismiss={() => setToggleSeguridad(false)}
        backgroundStyle={{ backgroundColor: '#111' }}
        handleIndicatorStyle={{ backgroundColor: 'gray' }}
        stackBehavior='push'
      >
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{
            fontSize: RFValue(30),
            fontWeight: 'bold',
            color: 'white',
            alignSelf: 'center'
          }}>Seguridad</Text>

          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 40
          }}>
            <Text style={{ color: 'white', fontSize: 20 }}>
              Autenticación biométrica
            </Text>
            <Switch
              value={localAuthEnabled}
              onValueChange={handleToggle}
              thumbColor={localAuthEnabled ? '#4CAF50' : '#888'}
            />
          </View>
        </View>
      </BottomSheetModal>
  </SafeAreaView>
)
}