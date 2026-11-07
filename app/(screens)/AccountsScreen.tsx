import { ThemedText } from '@/components/ThemedText';
import { db } from '@/config/firebase';
import { DEFAULT_ACCOUNT_ID, deleteAccount, updateAccount, type Account, type AccountType } from '@/services/accounts';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '@/hooks/useAccounts';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, deleteField, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AccountsScreen() {
  const { user } = useAuth();
  const accounts = useAccounts(user?.uid);
  const background = useThemeColor({ light: '', dark: '' }, 'background2');
  const cards = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [savings, setSavings] = useState<any[]>([]);
  const [crypto, setCrypto] = useState<any[]>([]);
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
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = query(collection(db, 'users', user.uid, 'transacciones'), orderBy('fecha', 'desc'));
    return onSnapshot(ref, (snapshot) => setTransactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  }, [user?.uid]);
  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = [
      onSnapshot(collection(db, 'users', user.uid, 'ahorros'), (snapshot) => setSavings(snapshot.docs.map((item) => item.data()))),
      onSnapshot(collection(db, 'users', user.uid, 'criptos'), (snapshot) => setCrypto(snapshot.docs.map((item) => item.data()))),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user?.uid]);

  const balances = useMemo(() => {
    const result = new Map<string, number>();
    accounts.forEach((account) => result.set(account.id, Number(account.saldoInicial || 0)));
    transactions.forEach((transaction) => {
      const amount = Number(transaction.monto || 0);
      if (transaction.tipo === 'transferencia') {
        if (transaction.cuentaOrigenId) result.set(transaction.cuentaOrigenId, (result.get(transaction.cuentaOrigenId) || 0) - amount);
        if (transaction.cuentaDestinoId) result.set(transaction.cuentaDestinoId, (result.get(transaction.cuentaDestinoId) || 0) + amount);
        return;
      }
      const id = transaction.cuentaId || DEFAULT_ACCOUNT_ID;
      result.set(id, (result.get(id) || 0) + (transaction.tipo === 'ingreso' ? amount : -amount));
    });
    return result;
  }, [accounts, transactions]);
  const savingsTotal = savings.reduce((sum, item) => sum + Number(item.cantidadActual || 0), 0);
  const cryptoTotal = crypto.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.currentPrice || 0), 0);
  const accountTotal = accounts.filter((account) => account.activo !== false && account.incluirEnTotal !== false)
    .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
  const total = accountTotal + savingsTotal + cryptoTotal;
  const chartColors = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626'];
  const sortedAccounts = [...accounts].sort((a, b) => (balances.get(b.id) || 0) - (balances.get(a.id) || 0));
  const parts = [
    ...sortedAccounts.filter((account) => account.activo !== false && account.incluirEnTotal !== false).map((account, index) => ({ label: account.nombre, value: Math.max(0, balances.get(account.id) || 0), color: chartColors[index % chartColors.length] })),
    { label: 'Metas', value: savingsTotal, color: '#9333ea' },
    { label: 'Cripto', value: cryptoTotal, color: '#b45309' },
  ].filter((part) => part.value > 0);
  const money = (value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const formatTransactionDate = (value: any) => {
    if (!value) return 'Fecha no disponible';
    const date = typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : value?.seconds
            ? new Date(value.seconds * 1000)
            : null;
    if (!date || Number.isNaN(date.getTime())) return 'Fecha no disponible';
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };
  const transactionLabel = (transaction: any, accountId: string) => {
    if (transaction.tipo === 'transferencia') {
      return transaction.cuentaDestinoId === accountId ? 'Transferencia recibida' : 'Transferencia enviada';
    }
    return transaction.tipo === 'ingreso' ? 'Ingreso' : 'Egreso';
  };
  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setEditName(account.nombre);
    setEditType(account.tipo);
    setEditInitialBalance(String(account.saldoInicial || 0));
    setEditIncluded(account.incluirEnTotal !== false);
    setEditActive(account.activo !== false);
    setEditRate(String(account.tasaInteresAnual || ''));
    setEditAutomaticInterest(account.interesAutomatico === true);
    setEditFavorite(account.esFavorita === true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, marginRight: 10 }}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 24, fontWeight: '800' }}>Patrimonio</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>Una vista clara de dónde está tu dinero</ThemedText>
          </View>
          <Ionicons name="card-outline" size={25} color={primaryColor} />
        </View>

        <View style={{ backgroundColor: primaryColor, borderRadius: 24, padding: 22, marginBottom: 16 }}>
          <ThemedText style={{ color: '#fff', opacity: 0.78, fontSize: 13 }}>Patrimonio total</ThemedText>
          <ThemedText style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 6 }}>{money(total)}</ThemedText>
          <ThemedText style={{ color: '#fff', opacity: 0.75, fontSize: 12, marginTop: 10 }}>Cuentas · metas · portafolio cripto</ThemedText>
        </View>

        <View style={{ backgroundColor: cards, borderRadius: 18, padding: 18, marginBottom: 16 }}>
          <ThemedText style={{ fontSize: 16, fontWeight: '800', marginBottom: 16 }}>Distribución</ThemedText>
          {parts.length === 0 ? <ThemedText style={{ opacity: 0.65 }}>Aún no hay saldos para mostrar.</ThemedText> : (
            <>
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <PieChart
                  data={parts.map((part) => ({ value: part.value, color: part.color, text: `${Math.round((part.value / Math.max(total, 1)) * 100)}%` }))}
                  donut
                  radius={78}
                  innerRadius={48}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <ThemedText style={{ fontSize: 11, opacity: 0.65 }}>Total</ThemedText>
                      <ThemedText style={{ fontSize: 16, fontWeight: '800' }}>{money(total)}</ThemedText>
                    </View>
                  )}
                />
              </View>
              {parts.map((part) => (
            <View key={part.label} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: part.color, marginRight: 8 }} />
                  <ThemedText style={{ fontSize: 13 }}>{part.label}</ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText style={{ fontSize: 13, fontWeight: '700' }}>{money(part.value)}</ThemedText>
                  <ThemedText style={{ fontSize: 11, opacity: 0.6 }}>{((part.value / Math.max(total, 1)) * 100).toFixed(1)}%</ThemedText>
                </View>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: `${borderColor}66`, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, (part.value / Math.max(total, 1)) * 100)}%`, height: '100%', backgroundColor: part.color }} />
              </View>
            </View>
              ))}
            </>
          )}
        </View>

        <View style={{ backgroundColor: cards, borderRadius: 18, padding: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <ThemedText style={{ fontSize: 16, fontWeight: '800' }}>Tus cuentas</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>{accounts.filter((account) => account.activo !== false).length} activas</ThemedText>
          </View>
          {sortedAccounts.map((account: Account) => (
            <View key={account.id} style={{ borderTopWidth: 1, borderTopColor: `${borderColor}55`, opacity: account.activo === false ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${primaryColor}18`, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name={account.tipo === 'efectivo' ? 'cash-outline' : account.tipo === 'ahorro_interes' ? 'trending-up-outline' : 'card-outline'} size={19} color={primaryColor} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '700' }}>{account.nombre}</ThemedText>
                <ThemedText style={{ fontSize: 11, opacity: 0.6 }}>{account.esFavorita ? 'Cuenta para accesos automáticos' : account.tipo}</ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '800' }}>{money(balances.get(account.id) || 0)}</ThemedText>
              <TouchableOpacity onPress={() => openEdit(account)} hitSlop={8} style={{ marginLeft: 10 }}>
                <Ionicons name={account.esFavorita ? 'star' : 'create-outline'} size={18} color={account.esFavorita ? '#f59e0b' : textColor} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExpandedAccountId((current) => current === account.id ? null : account.id)} hitSlop={8} style={{ marginLeft: 10 }}>
                <Ionicons name={expandedAccountId === account.id ? 'chevron-up' : 'list-outline'} size={19} color={primaryColor} />
              </TouchableOpacity>
            </View>
            {expandedAccountId === account.id && (
              <View style={{ paddingBottom: 12, paddingLeft: 50 }}>
                <ThemedText style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Movimientos recientes</ThemedText>
                {transactions.filter((transaction) => transaction.cuentaId === account.id || transaction.cuentaOrigenId === account.id || transaction.cuentaDestinoId === account.id).slice(0, 8).map((transaction, index) => {
                  const isPositive = transaction.tipo === 'ingreso' || transaction.cuentaDestinoId === account.id;
                  return (
                  <View key={`${transaction.id || index}-${account.id}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${borderColor}33` }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <ThemedText numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '700' }}>{transaction.descripcion || transaction.concepto || 'Movimiento'}</ThemedText>
                      <ThemedText style={{ fontSize: 13, fontWeight: '800', color: isPositive ? '#16a34a' : '#dc2626', marginLeft: 8 }}>
                        {isPositive ? '+' : '-'}{money(Number(transaction.monto || 0))}
                      </ThemedText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                      <ThemedText style={{ fontSize: 11, opacity: 0.62 }}>{transactionLabel(transaction, account.id)}</ThemedText>
                      {transaction.categoria ? <ThemedText style={{ fontSize: 11, opacity: 0.62 }}> · {transaction.categoria}</ThemedText> : null}
                      <ThemedText style={{ fontSize: 11, opacity: 0.62 }}> · {formatTransactionDate(transaction.fecha || transaction.creado || transaction.createdAt)}</ThemedText>
                    </View>
                  </View>
                  );
                })}
                {transactions.filter((transaction) => transaction.cuentaId === account.id || transaction.cuentaOrigenId === account.id || transaction.cuentaDestinoId === account.id).length === 0 && (
                  <ThemedText style={{ fontSize: 12, opacity: 0.6 }}>Sin movimientos registrados.</ThemedText>
                )}
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(tabs)/HistorialScreen', params: { accountId: account.id } })}
                  style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 10 }}
                >
                  <ThemedText style={{ color: primaryColor, fontSize: 12, fontWeight: '700' }}>Ver historial completo</ThemedText>
                  <Ionicons name="arrow-forward" size={15} color={primaryColor} style={{ marginLeft: 5 }} />
                </TouchableOpacity>
              </View>
            )}
            </View>
          ))}
        </View>
      </ScrollView>
      <Modal visible={Boolean(editingAccount)} transparent animationType="slide" onRequestClose={() => setEditingAccount(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <View style={{ backgroundColor: cards, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 }}>
            <ThemedText style={{ fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Editar cuenta</ThemedText>
            <TextInput value={editName} onChangeText={setEditName} placeholder="Nombre" placeholderTextColor={`${textColor}66`} style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 12, color: textColor, marginBottom: 10 }} returnKeyType="next" />
            <TextInput value={editInitialBalance} onChangeText={setEditInitialBalance} placeholder="Saldo inicial" placeholderTextColor={`${textColor}66`} keyboardType="decimal-pad" style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 12, color: textColor, marginBottom: 14 }} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            {editType === 'ahorro_interes' && (
              <>
                <TextInput value={editRate} onChangeText={setEditRate} placeholder="Tasa anual (%)" placeholderTextColor={`${textColor}66`} keyboardType="decimal-pad" style={{ borderWidth: 1, borderColor, borderRadius: 10, padding: 12, color: textColor, marginBottom: 10 }} />
                <TouchableOpacity onPress={() => setEditAutomaticInterest((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Ionicons name={editAutomaticInterest ? 'checkbox' : 'square-outline'} size={22} color={primaryColor} />
                  <ThemedText style={{ marginLeft: 8 }}>Mostrar estimación automática</ThemedText>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <TextInput value={interestAmount} onChangeText={setInterestAmount} placeholder="Interés confirmado" placeholderTextColor={`${textColor}66`} keyboardType="decimal-pad" style={{ flex: 1, borderWidth: 1, borderColor, borderRadius: 10, padding: 12, color: textColor }} />
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
                    style={{ backgroundColor: primaryColor, borderRadius: 10, padding: 12, marginLeft: 8 }}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {(['efectivo', 'debito', 'ahorro_interes', 'otro'] as AccountType[]).map((type) => (
                <TouchableOpacity key={type} onPress={() => setEditType(type)} style={{ borderWidth: 1, borderColor, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, backgroundColor: editType === type ? `${primaryColor}25` : 'transparent' }}>
                  <ThemedText style={{ color: editType === type ? primaryColor : textColor }}>{type === 'ahorro_interes' ? 'Cajita' : type === 'debito' ? 'Banco' : type === 'efectivo' ? 'Efectivo' : 'Otra'}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity disabled={editType === 'ahorro_interes'} onPress={() => setEditFavorite((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, opacity: editType === 'ahorro_interes' ? 0.45 : 1 }}>
              <Ionicons name={editFavorite ? 'star' : 'star-outline'} size={22} color={editFavorite ? '#f59e0b' : textColor} />
              <ThemedText style={{ marginLeft: 8 }}>Usar como cuenta favorita</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditIncluded((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name={editIncluded ? 'checkbox' : 'square-outline'} size={22} color={primaryColor} />
              <ThemedText style={{ marginLeft: 8 }}>Incluir en patrimonio total</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditActive((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name={editActive ? 'checkbox' : 'square-outline'} size={22} color={primaryColor} />
              <ThemedText style={{ marginLeft: 8 }}>Cuenta activa</ThemedText>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              {editingAccount && editingAccount.id !== DEFAULT_ACCOUNT_ID && (balances.get(editingAccount.id) || 0) === 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (transactions.some((transaction) => transaction.cuentaId === editingAccount.id || transaction.cuentaOrigenId === editingAccount.id || transaction.cuentaDestinoId === editingAccount.id)) {
                      Alert.alert('No se puede borrar', 'La cuenta tiene movimientos. Puedes desactivarla para conservar su historial.');
                      return;
                    }
                    Alert.alert('Borrar cuenta', 'Esta acción no se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Borrar',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            if (!user?.uid) return;
                            await deleteAccount(user.uid, editingAccount.id);
                            setEditingAccount(null);
                          } catch (error) {
                            console.error('Error al borrar cuenta:', error);
                            Alert.alert('Error', 'No se pudo borrar la cuenta.');
                          }
                        },
                      },
                    ]);
                  }}
                  style={{ padding: 12, marginRight: 'auto' }}
                >
                  <ThemedText style={{ color: '#f87171' }}>Borrar</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setEditingAccount(null)} style={{ padding: 12, marginRight: 8 }}><ThemedText>Cancelar</ThemedText></TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!user?.uid || !editingAccount || !editName.trim()) return;
                  const balance = Number(editInitialBalance.replace(',', '.'));
                  if (!Number.isFinite(balance)) {
                    Alert.alert('Saldo inválido', 'Ingresa un saldo válido.');
                    return;
                  }
                  try {
                    if (editFavorite && editType !== 'ahorro_interes') {
                      await Promise.all(accounts.map((account) => updateAccount(user.uid, account.id, { esFavorita: account.id === editingAccount.id })));
                      await updateDoc(doc(db, 'users', user.uid), { cuentaFavoritaId: editingAccount.id });
                    } else if (editingAccount.esFavorita) {
                      await updateDoc(doc(db, 'users', user.uid), { cuentaFavoritaId: deleteField() });
                    }
                    await updateAccount(user.uid, editingAccount.id, {
                      nombre: editName.trim(),
                      tipo: editType,
                      saldoInicial: balance,
                      incluirEnTotal: editIncluded,
                      activo: editActive,
                      tasaInteresAnual: editType === 'ahorro_interes' ? Number(editRate.replace(',', '.') || 0) : 0,
                      interesAutomatico: editType === 'ahorro_interes' && editAutomaticInterest,
                      esFavorita: editFavorite && editType !== 'ahorro_interes',
                    });
                    setEditingAccount(null);
                  } catch (error) {
                    console.error('Error actualizando cuenta:', error);
                    Alert.alert('Error', 'No se pudo actualizar la cuenta.');
                  }
                }}
                style={{ backgroundColor: primaryColor, borderRadius: 10, padding: 12 }}
              ><ThemedText style={{ color: '#fff', fontWeight: '700' }}>Guardar</ThemedText></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
