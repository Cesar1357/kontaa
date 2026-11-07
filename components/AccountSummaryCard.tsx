import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, ScrollView, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { db } from '@/config/firebase';
import { useAccounts } from '@/hooks/useAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { createAccount, DEFAULT_ACCOUNT_ID, deleteAccount, updateAccount, type Account, type AccountType } from '@/services/accounts';
import { RFValue } from 'react-native-responsive-fontsize';
import { router } from 'expo-router';
import Animated, { Layout } from 'react-native-reanimated';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import type { TextInputInstance } from 'react-native';

type Props = { expanded?: boolean };

const accountLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Cuenta bancaria',
  ahorro_interes: 'Cajita con intereses',
  otro: 'Otra cuenta',
};

export default function AccountSummaryCard({ expanded: initiallyExpanded = false }: Props) {
  const { user } = useAuth();
  const accounts = useAccounts(user?.uid);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [savings, setSavings] = useState<any[]>([]);
  const [cryptoHoldings, setCryptoHoldings] = useState<any[]>([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('efectivo');
  const [initialBalance, setInitialBalance] = useState('');
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AccountType>('efectivo');
  const [editInitialBalance, setEditInitialBalance] = useState('');
  const [editIncluded, setEditIncluded] = useState(true);
  const [editActive, setEditActive] = useState(true);
  const [editRate, setEditRate] = useState('');
  const [editAutomaticInterest, setEditAutomaticInterest] = useState(false);
  const [editFavorite, setEditFavorite] = useState(false);
  const [interestAmount, setInterestAmount] = useState('');
  const nameInputRef = useRef<TextInputInstance>(null);
  const initialBalanceInputRef = useRef<TextInputInstance>(null);
  const editNameInputRef = useRef<TextInputInstance>(null);
  const editInitialBalanceInputRef = useRef<TextInputInstance>(null);
  const editRateInputRef = useRef<TextInputInstance>(null);
  const transferAmountRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!createVisible && !editingAccount && !transferVisible) return;
    const timer = setTimeout(() => {
      if (createVisible) nameInputRef.current?.focus();
      else if (editingAccount) editNameInputRef.current?.focus();
      else transferAmountRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, [createVisible, editingAccount, transferVisible]);
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const resolvedTheme = useColorScheme();
  const themePrimaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryColor = resolvedTheme === 'grey' ? '#E5E7EB' : themePrimaryColor;
  const primaryButtonTextColor = resolvedTheme === 'grey' ? '#151718' : '#fff';
  const cardsColor = useThemeColor({ light: '', dark: '' }, 'cardsMain');

  useEffect(() => {
    if (!user?.uid) return;
    const transactionsQuery = query(
      collection(db, 'users', user.uid, 'transacciones'),
      orderBy('fecha', 'desc'),
    );
    return onSnapshot(
      transactionsQuery,
      (snapshot) => setTransactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error('Error al escuchar saldos por cuenta:', error),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(
      collection(db, 'users', user.uid, 'criptos'),
      (snapshot) => setCryptoHoldings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error('Error al escuchar el portafolio cripto:', error),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(
      collection(db, 'users', user.uid, 'ahorros'),
      (snapshot) => setSavings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error('Error al escuchar metas en el resumen:', error),
    );
  }, [user?.uid]);

  const balances = useMemo(() => {
    const result = new Map<string, number>();
    accounts.forEach((account) => result.set(account.id, Number(account.saldoInicial || 0)));

    transactions.forEach((transaction) => {
      const amount = Number(transaction.monto || 0);
      if (transaction.tipo === 'transferencia' && transaction.cuentaOrigenId) {
        result.set(transaction.cuentaOrigenId, (result.get(transaction.cuentaOrigenId) || 0) - amount);
        if (transaction.cuentaDestinoId) {
          result.set(transaction.cuentaDestinoId, (result.get(transaction.cuentaDestinoId) || 0) + amount);
        }
        return;
      }

      if (transaction.tipo === 'transferencia' && transaction.cuentaDestinoId) {
        result.set(transaction.cuentaDestinoId, (result.get(transaction.cuentaDestinoId) || 0) + amount);
        return;
      }

      const accountId = transaction.cuentaId || DEFAULT_ACCOUNT_ID;
      const current = result.get(accountId) || 0;
      result.set(accountId, current + (transaction.tipo === 'ingreso' ? amount : -amount));
    });

    return result;
  }, [accounts, transactions]);

  const accountsTotal = accounts
    .filter((account) => account.activo !== false && account.incluirEnTotal !== false)
    .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
  const savingsTotal = savings.reduce((sum, saving) => sum + Number(saving.cantidadActual || 0), 0);
  const cryptoTotal = cryptoHoldings.reduce(
    (sum, holding) => sum + Number(holding.quantity || 0) * Number(holding.currentPrice || 0),
    0,
  );
  const total = accountsTotal + savingsTotal + cryptoTotal;
  const money = (value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const accountIcon = (account: Account) => account.tipo === 'efectivo'
    ? 'cash-outline'
    : account.tipo === 'ahorro_interes' ? 'trending-up-outline' : 'wallet-outline';
  const sortedAccounts = [...accounts].sort((a, b) => (balances.get(b.id) || 0) - (balances.get(a.id) || 0));
  const transferValue = Number(transferAmount.replace(',', '.'));
  const transferSourceBalance = sourceAccountId ? (balances.get(sourceAccountId) || 0) : 0;
  const transferDestinationBalance = destinationAccountId ? (balances.get(destinationAccountId) || 0) : 0;
  const transferPreviewValid = Boolean(
    sourceAccountId
      && destinationAccountId
      && sourceAccountId !== destinationAccountId
      && Number.isFinite(transferValue)
      && transferValue > 0
      && transferValue <= transferSourceBalance,
  );

  return (
    <Animated.View layout={Layout.springify()} style={{ width: '95%', alignSelf: 'center', marginVertical: RFValue(10) }}>
      <ThemedView style={{ backgroundColor: cardsColor, borderRadius: 14, paddingVertical: RFValue(10), paddingHorizontal: RFValue(16), shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 12 }, shadowRadius: 22, elevation: 5 }}>
      <TouchableOpacity onPress={() => setExpanded((current) => !current)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>Dinero total</ThemedText>
          <ThemedText style={{ fontSize: 11, opacity: 0.58 }}>
            {accounts.find((account) => account.esFavorita)?.nombre || 'Todas tus cuentas'}
          </ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {accounts.length === 0 && <ActivityIndicator color={textColor} size="small" />}
          <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={textColor} />
        </View>
      </TouchableOpacity>
      <ThemedText style={{ fontSize: RFValue(25), fontWeight: '700', color: primaryColor, marginTop: 2, padding: 5 }}>
        ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
      </ThemedText>
      {!expanded && (
        <TouchableOpacity
          onPress={() => router.push('/(screens)/AccountsScreen')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: borderColor }}
        >
          <ThemedText style={{ color: primaryColor, fontWeight: '700', fontSize: 12 }}>Ver cuentas y patrimonio</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={primaryColor} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}
      {expanded && (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 4 }}>
          <TouchableOpacity
            onPress={() => {
              setSourceAccountId(accounts[0]?.id || '');
              setDestinationAccountId(accounts[1]?.id || '');
              setTransferVisible(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
          >
            <Ionicons name="swap-horizontal-outline" size={19} color={primaryColor} />
            <ThemedText style={{ color: primaryColor, fontWeight: '600', marginLeft: 8 }}>Transferir entre cuentas</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              if (!user?.uid || !accounts.length) return;
              const favorite = accounts.find((account) => account.esFavorita && account.tipo !== 'ahorro_interes') || accounts.find((account) => account.activo !== false && account.tipo !== 'ahorro_interes');
              if (!favorite) return;
              try {
                await Promise.all(accounts.map((account) => updateDoc(
                  doc(db, 'users', user.uid, 'cuentas', account.id),
                  { esFavorita: account.id === favorite.id },
                )));
              } catch (error) {
                console.error('Error al guardar la cuenta favorita:', error);
                Alert.alert('Error', 'No se pudo guardar la cuenta favorita.');
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
          >
            <Ionicons name="star-outline" size={19} color={primaryColor} />
            <ThemedText style={{ color: primaryColor, fontWeight: '600', marginLeft: 8 }}>
              Cuenta automática: {accounts.find((account) => account.esFavorita)?.nombre || 'elige una cuenta'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCreateVisible(true)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
          >
            <Ionicons name="add-circle-outline" size={19} color={primaryColor} />
            <ThemedText style={{ color: primaryColor, fontWeight: '600', marginLeft: 8 }}>Agregar cuenta</ThemedText>
          </TouchableOpacity>
          {sortedAccounts.slice(0, 3).map((account) => (
            <TouchableOpacity
              onPress={() => {
                setEditingAccount(account);
                setEditName(account.nombre);
                setEditType(account.tipo);
                setEditInitialBalance(String(account.saldoInicial || 0));
                setEditIncluded(account.incluirEnTotal !== false);
                setEditActive(account.activo !== false);
                setEditRate(String(account.tasaInteresAnual || ''));
                setEditAutomaticInterest(account.interesAutomatico === true);
                setEditFavorite(account.esFavorita === true);
              }}
              key={account.id}
              accessibilityLabel={`Ver saldo de ${account.nombre}`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, opacity: account.activo === false ? 0.55 : 1 }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${primaryColor}20`, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name={accountIcon(account) as any} size={18} color={primaryColor} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{account.nombre}</ThemedText>
                  <ThemedText style={{ fontSize: 11, opacity: 0.65 }}>{accountLabels[account.tipo] || accountLabels.otro}</ThemedText>
                  {account.tipo === 'ahorro_interes' && Number(account.tasaInteresAnual || 0) > 0 && (
                    <ThemedText style={{ fontSize: 10, color: primaryColor }}>Estimado: ${(Number(balances.get(account.id) || 0) * Number(account.tasaInteresAnual) / 12 / 100).toFixed(2)}/mes</ThemedText>
                  )}
              </View>
              <ThemedText style={{ fontWeight: '700' }}>
                ${(balances.get(account.id) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
              <TouchableOpacity
                onPress={async () => {
                  if (account.tipo === 'ahorro_interes') return;
                  if (!user?.uid) return;
                  try {
                    await Promise.all(accounts.map((item) => updateAccount(user.uid, item.id, { esFavorita: item.id === account.id })));
                    await updateDoc(doc(db, 'users', user.uid), { cuentaFavoritaId: account.id });
                  } catch (error) {
                    console.error('Error al elegir la cuenta automática:', error);
                    Alert.alert('Error', 'No se pudo elegir la cuenta automática.');
                  }
                }}
                hitSlop={8}
                style={{ marginLeft: 8 }}
              >
                <Ionicons name={account.esFavorita ? 'star' : 'star-outline'} size={18} color={account.esFavorita ? '#f59e0b' : textColor} />
              </TouchableOpacity>
              <Ionicons name="pencil-outline" size={16} color={textColor} style={{ marginLeft: 8, opacity: 0.7 }} />
            </TouchableOpacity>
          ))}
          {accounts.length > 3 && (
            <TouchableOpacity
              onPress={() => router.push('/(screens)/AccountsScreen')}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}
            >
              <ThemedText style={{ color: primaryColor, fontWeight: '700', fontSize: 12 }}>
                Ver {accounts.length - 3} cuenta{accounts.length - 3 === 1 ? '' : 's'} más
              </ThemedText>
              <Ionicons name="chevron-forward" size={15} color={primaryColor} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
          {savings.map((saving) => (
            <TouchableOpacity
              key={`saving-${saving.id}`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#c084fc20', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name="trophy-outline" size={18} color="#c084fc" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{saving.nombre}</ThemedText>
                <ThemedText style={{ fontSize: 11, opacity: 0.65 }}>Meta de ahorro</ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '700' }}>
                ${Number(saving.cantidadActual || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </TouchableOpacity>
          ))}
          {cryptoHoldings.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f59e0b20', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name="logo-bitcoin" size={18} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>Portafolio cripto</ThemedText>
                <ThemedText style={{ fontSize: 11, opacity: 0.65 }}>{cryptoHoldings.length} activo{cryptoHoldings.length === 1 ? '' : 's'}</ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '700' }}>
                ${cryptoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
          )}
        </View>
      )}
      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: cardsColor, borderRadius: 18, padding: 18 }}>
            <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Nueva cuenta</ThemedText>
            <TextInput
              ref={nameInputRef}
              value={name}
              onChangeText={setName}
              placeholder="Ej. Efectivo, Nu, Cajita..."
              placeholderTextColor="#999"
              style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 12 }}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => initialBalanceInputRef.current?.focus()}
            />
            <TextInput
              ref={initialBalanceInputRef}
              value={initialBalance}
              onChangeText={setInitialBalance}
              placeholder="Saldo inicial (opcional)"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 12 }}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {(['efectivo', 'debito', 'ahorro_interes', 'otro'] as AccountType[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setType(option)}
                  style={{ borderWidth: 1, borderColor, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, marginRight: 7, marginBottom: 7, backgroundColor: type === option ? `${primaryColor}30` : 'transparent' }}
                >
                  <ThemedText style={{ fontSize: 12, color: type === option ? primaryColor : textColor, fontWeight: type === option ? '700' : '400' }}>{accountLabels[option]}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setCreateVisible(false)} style={{ padding: 10, marginRight: 8 }}>
                <ThemedText>Cancelar</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!user?.uid || !name.trim()) {
                    Alert.alert('Falta el nombre', 'Escribe un nombre para la cuenta.');
                    return;
                  }
                  try {
                    const startingBalance = initialBalance.trim() ? Number(initialBalance.replace(',', '.')) : 0;
                    if (!Number.isFinite(startingBalance) || startingBalance < 0) {
                      Alert.alert('Saldo inválido', 'Escribe un saldo inicial válido.');
                      return;
                    }
                    await createAccount(user.uid, { nombre: name.trim(), tipo: type, saldoInicial: startingBalance, incluirEnTotal: true, activo: true });
                    setName('');
                    setInitialBalance('');
                    setType('efectivo');
                    setCreateVisible(false);
                  } catch (error) {
                    console.error('Error al crear cuenta:', error);
                    Alert.alert('Error', 'No se pudo crear la cuenta.');
                  }
                }}
                style={{ backgroundColor: primaryColor, borderRadius: 9, padding: 10 }}
              >
                <ThemedText style={{ color: primaryButtonTextColor, fontWeight: '700' }}>Crear</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(editingAccount)} transparent animationType="fade" onRequestClose={() => setEditingAccount(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: cardsColor, borderRadius: 18, padding: 18 }}>
            <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Personalizar cuenta</ThemedText>
            <TextInput
              ref={editNameInputRef}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nombre"
              placeholderTextColor="#999"
              style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 10 }}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => editInitialBalanceInputRef.current?.focus()}
            />
            <TextInput
              ref={editInitialBalanceInputRef}
              value={editInitialBalance}
              onChangeText={setEditInitialBalance}
              placeholder="Saldo inicial"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 10 }}
              returnKeyType="done"
              onSubmitEditing={() => editType === 'ahorro_interes' ? editRateInputRef.current?.focus() : Keyboard.dismiss()}
            />
            {editType === 'ahorro_interes' && (
              <>
                <TextInput
                  ref={editRateInputRef}
                  value={editRate}
                  onChangeText={setEditRate}
                  placeholder="Tasa anual (%)"
                  placeholderTextColor="#999"
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 10 }}
                />
                <TouchableOpacity onPress={() => setEditAutomaticInterest((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Ionicons name={editAutomaticInterest ? 'checkbox' : 'square-outline'} size={22} color={primaryColor} />
                  <ThemedText style={{ marginLeft: 8 }}>Mostrar estimación automática</ThemedText>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <TextInput
                    value={interestAmount}
                    onChangeText={setInterestAmount}
                    placeholder="Interés confirmado por el banco"
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                    style={{ flex: 1, borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor }}
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      const amount = Number(interestAmount.replace(',', '.'));
                      if (!user?.uid || !editingAccount || !Number.isFinite(amount) || amount <= 0) {
                        Alert.alert('Interés inválido', 'Ingresa un interés confirmado mayor a cero.');
                        return;
                      }
                      try {
                        await addDoc(collection(db, 'users', user.uid, 'transacciones'), {
                          descripcion: `Interés de ${editingAccount.nombre}`,
                          monto: amount,
                          tipo: 'ingreso',
                          tipoMovimiento: 'interes',
                          cuentaId: editingAccount.id,
                          fecha: new Date(),
                        });
                        setInterestAmount('');
                        Alert.alert('Interés registrado', 'Se agregó como ingreso en esta cuenta.');
                      } catch (error) {
                        console.error('Error al registrar interés:', error);
                        Alert.alert('Error', 'No se pudo registrar el interés.');
                      }
                    }}
                    style={{ backgroundColor: primaryColor, borderRadius: 10, padding: 11, marginLeft: 8 }}
                  >
                    <Ionicons name="add" size={20} color={primaryButtonTextColor} />
                  </TouchableOpacity>
                </View>
              </>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {(['efectivo', 'debito', 'ahorro_interes', 'otro'] as AccountType[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setEditType(option)}
                  style={{ borderWidth: 1, borderColor, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, marginRight: 7, marginBottom: 7, backgroundColor: editType === option ? `${primaryColor}30` : 'transparent' }}
                >
                  <ThemedText style={{ fontSize: 12, color: editType === option ? primaryColor : textColor, fontWeight: editType === option ? '700' : '400' }}>{accountLabels[option]}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <ThemedText>Incluir en patrimonio total</ThemedText>
              <TouchableOpacity onPress={() => setEditIncluded((value) => !value)}>
                <Ionicons name={editIncluded ? 'checkbox' : 'square-outline'} size={25} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <ThemedText>Usar para accesos automáticos</ThemedText>
              <TouchableOpacity disabled={editType === 'ahorro_interes'} onPress={() => setEditFavorite((value) => !value)} style={{ opacity: editType === 'ahorro_interes' ? 0.45 : 1 }}>
                <Ionicons name={editFavorite ? 'star' : 'star-outline'} size={25} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <ThemedText>Cuenta activa</ThemedText>
              <TouchableOpacity onPress={() => setEditActive((value) => !value)}>
                <Ionicons name={editActive ? 'checkbox' : 'square-outline'} size={25} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setEditingAccount(null)} style={{ padding: 10, marginRight: 8 }}>
                <ThemedText>Cancelar</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!user?.uid || !editingAccount || !editName.trim()) {
                    Alert.alert('Falta el nombre', 'Escribe un nombre para la cuenta.');
                    return;
                  }
                  const initialBalance = Number(editInitialBalance.replace(',', '.'));
                  if (!Number.isFinite(initialBalance)) {
                    Alert.alert('Saldo inválido', 'Escribe un saldo inicial válido.');
                    return;
                  }
                  try {
                    if (editFavorite && editType !== 'ahorro_interes') {
                      await Promise.all(accounts.map((account) => updateAccount(user.uid, account.id, { esFavorita: account.id === editingAccount.id })));
                      await updateDoc(doc(db, 'users', user.uid), { cuentaFavoritaId: editingAccount.id });
                    } else {
                      await updateAccount(user.uid, editingAccount.id, { esFavorita: false });
                      const remainingFavorite = accounts.find((account) => account.id !== editingAccount.id && account.esFavorita);
                      await updateDoc(doc(db, 'users', user.uid), { cuentaFavoritaId: remainingFavorite?.id || DEFAULT_ACCOUNT_ID });
                    }
                    await updateAccount(user.uid, editingAccount.id, {
                      nombre: editName.trim(),
                      tipo: editType,
                      saldoInicial: initialBalance,
                      incluirEnTotal: editIncluded,
                      activo: editActive,
                      tasaInteresAnual: editType === 'ahorro_interes' ? Number(editRate.replace(',', '.') || 0) : 0,
                      interesAutomatico: editType === 'ahorro_interes' && editAutomaticInterest,
                    });
                    setEditingAccount(null);
                  } catch (error) {
                    console.error('Error al actualizar cuenta:', error);
                    Alert.alert('Error', 'No se pudo actualizar la cuenta.');
                  }
                }}
                style={{ backgroundColor: primaryColor, borderRadius: 9, padding: 10 }}
              >
                <ThemedText style={{ color: primaryButtonTextColor, fontWeight: '700' }}>Guardar</ThemedText>
              </TouchableOpacity>
              {editingAccount && editingAccount.id !== DEFAULT_ACCOUNT_ID && (balances.get(editingAccount.id) || 0) === 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (transactions.some((transaction) => transaction.cuentaId === editingAccount.id || transaction.cuentaOrigenId === editingAccount.id || transaction.cuentaDestinoId === editingAccount.id)) {
                      Alert.alert('No se puede borrar', 'La cuenta tiene movimientos. Puedes desactivarla para conservar su historial.');
                      return;
                    }
                    Alert.alert('Borrar cuenta', 'Esta acción no se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Borrar', style: 'destructive', onPress: async () => {
                        try {
                          if (!user?.uid) return;
                          await deleteAccount(user.uid, editingAccount.id);
                          setEditingAccount(null);
                        } catch (error) {
                          console.error('Error al borrar cuenta:', error);
                          Alert.alert('Error', 'No se pudo borrar la cuenta.');
                        }
                      } },
                    ]);
                  }}
                  style={{ padding: 10, marginRight: 8 }}
                >
                  <ThemedText style={{ color: '#f87171' }}>Borrar</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={transferVisible} transparent animationType="fade" onRequestClose={() => setTransferVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setTransferVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
            <View
              onStartShouldSetResponder={() => true}
              style={{ backgroundColor: cardsColor, borderRadius: 18, padding: 18 }}
            >
            <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Transferencia interna</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Esta transferencia no cuenta como ingreso ni gasto.</ThemedText>
            <TextInput
              ref={transferAmountRef}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Monto"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 11, color: textColor, marginBottom: 12 }}
              returnKeyType="done"
              onSubmitEditing={() => undefined}
            />
            {(['origen', 'destino'] as const).map((field) => (
              <View key={field} style={{ marginBottom: 10 }}>
                <ThemedText style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  {field === 'origen' ? 'Desde' : 'Hacia'}
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {accounts
                    .filter((account) => account.activo !== false)
                    .filter((account) => {
                      const otherId = field === 'origen' ? destinationAccountId : sourceAccountId;
                      return account.id !== otherId;
                    })
                    .map((account) => {
                    const selectedId = field === 'origen' ? sourceAccountId : destinationAccountId;
                    return (
                      <TouchableOpacity
                        key={account.id}
                        onPress={() => {
                          if (field === 'origen') setSourceAccountId(account.id);
                          else setDestinationAccountId(account.id);
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: selectedId === account.id ? primaryColor : borderColor,
                          borderRadius: 9,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginRight: 7,
                          marginBottom: 7,
                          backgroundColor: selectedId === account.id ? `${primaryColor}30` : 'transparent',
                        }}
                      >
                        <ThemedText style={{ fontSize: 12 }}>{account.nombre}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {sourceAccountId && destinationAccountId && sourceAccountId !== destinationAccountId && (
              <View style={{ backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 14, borderWidth: 1, borderColor: `${primaryColor}35` }}>
                <ThemedText style={{ fontSize: 12, fontWeight: '700', marginBottom: 8 }}>Vista previa de saldos</ThemedText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText numberOfLines={1} style={{ fontSize: 11, opacity: 0.7 }}>{accounts.find((account) => account.id === sourceAccountId)?.nombre}</ThemedText>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>{money(transferSourceBalance)}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: transferPreviewValid ? '#dc2626' : textColor, opacity: 0.75 }}>
                      Después: {money(transferSourceBalance - (Number.isFinite(transferValue) && transferValue > 0 ? transferValue : 0))}
                    </ThemedText>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={primaryColor} style={{ marginTop: 16 }} />
                  <View style={{ flex: 1, marginLeft: 8, alignItems: 'flex-end' }}>
                    <ThemedText numberOfLines={1} style={{ fontSize: 11, opacity: 0.7 }}>{accounts.find((account) => account.id === destinationAccountId)?.nombre}</ThemedText>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>{money(transferDestinationBalance)}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: transferPreviewValid ? '#16a34a' : textColor, opacity: 0.75 }}>
                      Después: {money(transferDestinationBalance + (Number.isFinite(transferValue) && transferValue > 0 ? transferValue : 0))}
                    </ThemedText>
                  </View>
                </View>
                {transferAmount.trim() && transferValue > transferSourceBalance && (
                  <ThemedText style={{ color: '#dc2626', fontSize: 11, marginTop: 8 }}>El monto supera el saldo disponible de la cuenta de origen.</ThemedText>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setTransferVisible(false)} style={{ padding: 10, marginRight: 8 }}>
                <ThemedText>Cancelar</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!transferPreviewValid}
                onPress={async () => {
                  const amount = Number(transferAmount.replace(',', '.'));
                  const source = accounts.find((account) => account.id === sourceAccountId);
                  if (!user?.uid || !sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId || !Number.isFinite(amount) || amount <= 0) {
                    Alert.alert('Datos inválidos', 'Selecciona cuentas distintas e ingresa un monto válido.');
                    return;
                  }
                  if ((balances.get(sourceAccountId) || 0) < amount) {
                    Alert.alert('Saldo insuficiente', `No hay suficiente dinero en ${source?.nombre || 'la cuenta de origen'}.`);
                    return;
                  }
                  try {
                    await addDoc(collection(db, 'users', user.uid, 'transacciones'), {
                      descripcion: `Transferencia: ${source?.nombre || 'Cuenta'} → ${accounts.find((account) => account.id === destinationAccountId)?.nombre || 'Cuenta'}`,
                      monto: amount,
                      tipo: 'transferencia',
                      tipoMovimiento: 'transferencia_interna',
                      cuentaOrigenId: sourceAccountId,
                      cuentaDestinoId: destinationAccountId,
                      fecha: new Date(),
                    });
                    setTransferAmount('');
                    setTransferVisible(false);
                  } catch (error) {
                    console.error('Error al registrar transferencia interna:', error);
                    Alert.alert('Error', 'No se pudo registrar la transferencia.');
                  }
                }}
                style={{ backgroundColor: primaryColor, borderRadius: 9, padding: 10, opacity: transferPreviewValid ? 1 : 0.45 }}
              >
                <ThemedText style={{ color: primaryButtonTextColor, fontWeight: '700' }}>Transferir</ThemedText>
              </TouchableOpacity>
            </View>
              </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      </ThemedView>
    </Animated.View>
  );
}
