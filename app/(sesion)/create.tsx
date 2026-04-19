import { router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Icon } from 'react-native-elements';
import { RFValue } from 'react-native-responsive-fontsize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebase';

import { doc, setDoc } from "firebase/firestore";


export default function CreateIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorPassword, setErrorPassword] = useState("");

  const checkPassword = (value) => {
  // Mínimo 6 caracteres
  if (value.length < 6) {
    setErrorPassword("La contraseña debe de tener mínimo 6 carácteres")
    return false;
  }

  // Al menos un número
  const regex = /[0-9]/;
  if (!regex.test(value)) {
    setErrorPassword("La contraseña debe contener al menos un número");
    return false;
  }
  setErrorPassword("");
  // Puedes agregar más reglas aquí (mayúsculas, símbolos, etc.)

  return true; // ✅ contraseña válida
};
  const handleCreate = async () => {
    var email2 = email.trimEnd();
    if (name !== '' && email2 !== '' && password !== '') {
        createUserWithEmailAndPassword(auth, email2, password)
        .then((userCredential) => {
            // Signed up 
            const user = userCredential.user;
            updateProfile(user, {
                displayName: name
              }).then(async() => {
                const p = doc(db, "users", user.uid);
                await setDoc(p,{
                    uid: user.uid,
                    presupuestos: {
                      dia: 100,
                      semana: 1000,
                      mes: 10000
                    }
                })

                router.dismissTo("/(tabs)");

              }).catch((error) => {
                // An error occurred
                // ...
                console.log(error)
              });

        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            Alert.alert(errorMessage)
            Alert.alert('Error', errorMessage);
            // ..
        });
        
    } else {
      Alert.alert('Te falta completar un campo');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={{width:"100%",alignItems:"center",flex:1,justifyContent:"center"}}>
      <View style={styles.appTitleTextContainer}>
        <Text style={styles.appTitleText}>Konta</Text>
      </View>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          placeholder={'Email'}
          placeholderTextColor={'white'}
          keyboardType='email-address'
        />
        <View style={{flexDirection:'row',alignItems:'center', width:'85%', backgroundColor:"#323232",marginTop: 10,borderRadius:20}}>
        <TextInput
          style={[styles.input2]}
          onChangeText={(text) => setPassword(text)}
          onBlur={() => checkPassword(password)}
          maxLength={15}
          placeholder={'Contraseña'}
          placeholderTextColor={'white'}
          secureTextEntry={!passwordVisible}
          textContentType={'password'}
        />
        <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
          <Icon
            name={passwordVisible ? 'eye-off' : 'eye'}
            type='ionicon'
            size={24}
            color="white"
            style={{marginLeft:10}}
          />
        </TouchableOpacity>
      </View>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setName(text)}
          placeholder={'Nombre'}
          maxLength={15}
          placeholderTextColor={'white'}
          textContentType={"nickname"}
        />
        <Text adjustsFontSizeToFit style={{color:"red",marginTop:5,width:"80%"}}>{errorPassword}</Text>
        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => handleCreate()}>
          <Text style={styles.buttonText2}>Crear Cuenta</Text>
        </TouchableOpacity>
        
      </KeyboardAvoidingView>
      <View style={styles.loginLinkContainer}>
        <Text style={styles.loginText}>¿Ya tienes cuenta?</Text>
        <TouchableOpacity onPress={() => router.push("/(sesion)/login")}>
          <Text style={styles.loginLink}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  appTitleTextContainer: {
    justifyContent: 'center',
    marginBottom: 20,
  },
  appTitleText: {
    fontSize: RFValue(40),
    fontWeight: 'bold',
    color: 'white',
  },
  input: {
    backgroundColor: '#323232',
    borderRadius: 20,
    width: '85%',
    color: 'white',
    paddingLeft: 10,
    height:50,
    marginTop:10
  },
  input2: {
    backgroundColor: '#323232',
    borderRadius: 20,
    width: '85%',
    color: 'white',
    paddingLeft: 10,
    height:50,
  },
  createAccountButton: {
    width: '70%',
    height: 50,
    backgroundColor: '#074A12',
    borderRadius: 50,
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    paddingBottom: 10,
    alignSelf: 'center',
    marginBottom: 0,
  },
  loginText: {
    fontSize: 16,
    color: 'white',
    marginRight: 5,
  },
  loginLink: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'green',
  },
  buttonText2: {
    fontSize: 25,
    fontWeight: 'bold',
    color: 'white',
    alignSelf: 'center',
  },
  checkboxContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginTop: 5,
  },
  checkboxText: {
    color: 'white',
    fontSize: 14,
  },
  linkText: {
    color: '#57BBE3',
    fontSize: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 15,
  },
});
