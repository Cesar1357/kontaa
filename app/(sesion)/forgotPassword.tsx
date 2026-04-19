import { router } from 'expo-router';
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { RFValue } from 'react-native-responsive-fontsize';
import { auth } from '../../config/firebase';

export default function Forgot() {
  const [email, setEmail] = useState('');

  const forgot = async() => {
    if(email.length !== 0){
    var email2 = email.trim()
      try { 
        // Enviar el correo electrónico de restablecimiento de contraseña
        await sendPasswordResetEmail(auth, email2);
        ToastAndroid.showWithGravity(
          `Enviado con éxito. Verifica tu bandeja de entrada(también en spam).`,
          ToastAndroid.SHORT,
          ToastAndroid.BOTTOM // Cambiado a la parte inferior de la pantalla
        );
        router.back();
        // El correo electrónico ha sido enviado con éxito
        console.log('Correo electrónico de restablecimiento de contraseña enviado con éxito. Verifica tu bandeja de entrada.');
      } catch (error) {
        // Manejar errores en caso de que el envío del correo electrónico falle
        Alert.alert(error.message)
        console.error('Error al enviar el correo electrónico de restablecimiento de contraseña:', error.message);
      }
    }
    
    // Llamar a la función con el correo electrónico del usuario
  };

  return (
     <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={{}}>
          <Text
            style={{
              fontSize: RFValue(40),
              fontWeight: 'bold',
              color: 'white',
              alignSelf: 'center',
              marginTop: 0,
            }}>
            Konta
          </Text>
        </View>
        <Text style={{ color: 'orange', marginTop: 10 }}>
          Estás a punto de restablecer tu contraseña.
        </Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          placeholder={'Email'}
          placeholderTextColor={'white'}
          keyboardType='email-address'
        />

        <View style={{ width: '100%', marginTop: 20 }}>
          <TouchableOpacity
            style={{
              width: '80%',
              height: 38,
              backgroundColor: '#6A6F66',
              borderRadius: 50,
              alignSelf: 'center',
            }}
            onPress={() => forgot()}>
            <Text
              style={{
                fontSize: 27,
                fontWeight: 'bold',
                alignSelf: 'center',
                marginTop: 0,
                color: '#111111',
              }}>
              Enviar correo
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#111111',
    justifyContent:"center"
  },
  input: {
    backgroundColor: '#323232',
    borderRadius: 20,
    width: '85%',
    color: 'white',
    paddingLeft: 10,
    height:50,
    marginTop:130
  },
});
