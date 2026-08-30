// AhorrosScreen.tsx
import { ThemedText } from "@/components/ThemedText";
import { db } from "@/config/firebase";
import { useAppTheme } from "@/hooks/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from "@/hooks/useThemeColor";
import { actualizarPreciosUsuario, fetchMarkets, normalizeCoinId } from '@/services/cryptoService';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import Animated, { Layout } from "react-native-reanimated";
import { RFValue } from "react-native-responsive-fontsize";
/**
 * AhorrosScreen
 * - Lista de metas de ahorro (cards)
 * - Modal para crear nueva meta
 * - Modal de detalle (depositar / retirar / ver movimientos rápidos)
 *
 * Notas:
 * - Puede registrar transferencias entre ahorro y transacciones.
 * - Guarda movimientos en subcollection "movimientos".
 */

export default function AhorrosScreen() {
  const { user } = useAuth();
  type PlazoAhorro = "corto" | "mediano" | "largo";
  const PLAZO_DIAS: Record<PlazoAhorro, number> = {
    corto: 30,
    mediano: 365,
    largo: 730,
  };
  const [ahorros, setAhorros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const {
    savingsViewMode: viewMode,
    setSavingsViewMode,
    cryptoListViewMode,
    setCryptoListViewMode,
  } = useAppTheme();
  const [displayCurrency, setDisplayCurrency] = useState<"MXN" | "USD">("MXN");
  const [cryptoHoldings, setCryptoHoldings] = useState<any[]>([]);
  const [showCryptoForm, setShowCryptoForm] = useState(false);
  const [cryptoSymbol, setCryptoSymbol] = useState("");
  const [cryptoName, setCryptoName] = useState("");
  const [cryptoIcon, setCryptoIcon] = useState<string | null>(null);
  const [cryptoSearch, setCryptoSearch] = useState("");
  const [cryptoSearchResults, setCryptoSearchResults] = useState<any[]>([]);
  const [cryptoCantidad, setCryptoCantidad] = useState("");
  const [cryptoPrecioCompra, setCryptoPrecioCompra] = useState("");
  const [cryptoCoinId, setCryptoCoinId] = useState("");
  const [cryptoFechaCompra, setCryptoFechaCompra] = useState<Date>(new Date());
  const [isCryptoDatePickerVisible, setCryptoDatePickerVisible] = useState(false);
  const [cryptoLedger, setCryptoLedger] = useState<'local' | 'global'>('local');
  const cryptoActionLock = useRef(false);
  const [savingCryptoAction, setSavingCryptoAction] = useState(false);
  const [cryptoSearchFilter, setCryptoSearchFilter] = useState("");
  const cryptoListView = cryptoListViewMode;
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [quickTrade, setQuickTrade] = useState<{
    visible: boolean;
    holding: any | null;
    mode: 'buy' | 'sell';
    inputType: 'money' | 'crypto';
    amount: string;
    ledger: 'local' | 'global';
    balance: {
      cash: number;
      crypto: number;
    };
  }>({
    visible: false,
    holding: null,
    mode: 'buy',
    inputType: 'money',
    amount: '',
    ledger: 'global',
    balance: { cash: 0, crypto: 0 },
  });

  const FREE_LIMIT = 2;
  const VIEW_MODE_STORAGE_KEY = "@kontaa:savings-view-mode";
  const CURRENCY_STORAGE_KEY = "@kontaa:portfolio-display-currency";
  const CRYPTO_PORTFOLIO_STORAGE_KEY = "@kontaa:crypto-portfolio";
  const FX_RATE_USD_TO_MXN = 17.2;
  const CRYPTO_ID_MAP: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    ADA: "cardano",
    XRP: "ripple",
    DOGE: "dogecoin",
    USDC: "usd-coin",
    MATIC: "matic-network",
    BNB: "binancecoin",
    AVAX: "avalanche-2",
  };

  const CRYPTO_OPTIONS = [
    { symbol: "BTC", name: "Bitcoin", thumb: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png", id: "bitcoin" },
    { symbol: "ETH", name: "Ethereum", thumb: "https://assets.coingecko.com/coins/images/279/large/ethereum.png", id: "ethereum" },
    { symbol: "SOL", name: "Solana", thumb: "https://assets.coingecko.com/coins/images/4128/large/solana.png", id: "solana" },
    { symbol: "ADA", name: "Cardano", thumb: "https://assets.coingecko.com/coins/images/975/large/cardano.png", id: "cardano" },
    { symbol: "XRP", name: "XRP", thumb: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png", id: "ripple" },
    { symbol: "DOGE", name: "Dogecoin", thumb: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png", id: "dogecoin" },
    { symbol: "USDC", name: "USD Coin", thumb: "https://assets.coingecko.com/coins/images/6319/large/usdc.png", id: "usd-coin" },
    { symbol: "MATIC", name: "Polygon", thumb: "https://assets.coingecko.com/coins/images/4713/large/polygon.png", id: "matic-network" },
    { symbol: "BNB", name: "BNB", thumb: "https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png", id: "binancecoin" },
    { symbol: "AVAX", name: "Avalanche", thumb: "https://assets.coingecko.com/coins/images/12559/large/avax.png", id: "avalanche-2" },
  ];

  // UI modal/new
  const [showNuevo, setShowNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [plazo, setPlazo] = useState<PlazoAhorro | null>(null);
  const [sinPlazo, setSinPlazo] = useState(false);
  const [fechaLimite, setFechaLimite] = useState<string | null>(null); // ISO string optional
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

  // detalle modal
  const [showDetalle, setShowDetalle] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [historyType, setHistoryType] = useState<'saving' | 'crypto'>('saving');
  const [transaccionesData, setTransaccionesData] = useState<any[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  const [selected, setSelected] = useState<any>(null); // ahorro seleccionado
  const [movimientoMonto, setMovimientoMonto] = useState("");
  const [movimientoTipo, setMovimientoTipo] = useState<"deposito" | "retiro" | "transferencia" | "pasarATransacciones">("deposito");

  const [editando, setEditando] = useState(false);
  const [cantidadActual, setCantidadActual] = useState(0);
  const nombreInputRef = useRef<TextInput>(null);
  const movimientoInputRef = useRef<TextInput>(null);

  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const backgroundColor2 = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const cardMain = useThemeColor({ light: '', dark: '' }, 'cardMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryDarkColor = useThemeColor({ light: '', dark: '' }, 'primaryDark');
  const modalOverlayColor = useThemeColor({ light: '', dark: '' }, 'transaccionModal');
  const iconColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const headerColors: [string, string] = [primaryColor, primaryDarkColor || primaryColor];

  const styles = StyleSheet.create({
  headerCard: {
    padding: 18,
    borderRadius: 20,
  },
  headerTitle: { color: "white", fontSize: RFValue(20), fontWeight: "700" },
  headerSubtitle: { color: "rgba(255,255,255,0.88)", marginTop: 6 },

  emptyContainer: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },

  card: {
    backgroundColor: graficaFondoColor,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: RFValue(16), fontWeight: "700" },
  cardDesc: { color: textColor, marginTop: 4, opacity: 0.7 },
  cardSmall: { color: textColor, marginTop: 6, opacity: 0.65 },

  progressBg: {
    height: 8,
    backgroundColor: progressBg,
    borderRadius: 10,
    overflow: "hidden",
  },
  progressFg: {
    height: "100%",
    backgroundColor: primaryColor,
    borderRadius: 10,
  },

  iconBtn: {
    backgroundColor: cardsMain,
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBack: {
    flex: 1,
    backgroundColor: "rgba(4, 8, 18, 0.72)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: backgroundColor2,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: `${borderColor}88`,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },

  input: {
    backgroundColor: cardsMain,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    color: textColor,
    borderWidth: 1,
    borderColor: `${borderColor}aa`,
    fontSize: 14,
  },

  btn: {
    paddingVertical: 12,
    borderRadius: 12,
  },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    width: "48%",
  },
   modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: backgroundColor,
    borderRadius: 14,
    padding: 16,
    maxHeight: "76%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: textColor,
  },
  movCard: {
    backgroundColor: cardsMain,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: borderColor,
  },
});

  // efectos: escuchar ahorros
  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    const ref = collection(db, `users/${userId}/ahorros`);
    const q = query(ref, orderBy("creado", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAhorros(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error al leer ahorros:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, `users/${userId}`);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() || {};
      setSubscriptionActive(Boolean((data as any).supportSubscription?.active));
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    const loadPersistedCurrency = async () => {
      try {
        const savedCurrency = await AsyncStorage.getItem(CURRENCY_STORAGE_KEY);
        if (savedCurrency === "MXN" || savedCurrency === "USD") {
          setDisplayCurrency(savedCurrency);
        }
      } catch (error) {
        console.error("Error loading display currency:", error);
      }
    };

    loadPersistedCurrency();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(CURRENCY_STORAGE_KEY, displayCurrency).catch(() => undefined);
  }, [displayCurrency]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setCryptoHoldings([]);
      return;
    }

    const ref = collection(db, `users/${userId}/criptos`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCryptoHoldings(data);
      },
      (error) => {
        console.error("Error al leer criptos:", error);
      }
    );

    return () => unsub();
  }, [user]);

  useEffect(() => {
    setSavingsViewMode(viewMode).catch(() => undefined);
  }, [viewMode, setSavingsViewMode]);

  const toDisplayCurrency = (amount: number) => {
    if (displayCurrency === "USD") {
      return amount / FX_RATE_USD_TO_MXN;
    }
    return amount;
  };

  const formatDisplayMoney = (amount: number) => {
    const value = toDisplayCurrency(amount);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: displayCurrency === "USD" ? "USD" : "MXN",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getCryptoCurrentPrice = (symbol: string) => {
    const normalized = symbol.toUpperCase();
    const option = CRYPTO_OPTIONS.find((coin) => coin.symbol === normalized);
    if (option?.thumb) {
      return 1;
    }
    return 0;
  };

  const fetchCryptoSearchResults = async (searchText: string) => {
    const query = searchText.trim();
    if (!query) {
      setCryptoSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      const items = Array.isArray(data.coins) ? data.coins.slice(0, 8) : [];
      setCryptoSearchResults(items);
    } catch (error) {
      console.error("Error buscando criptos:", error);
      setCryptoSearchResults([]);
    }
  };

  const fetchCurrentCryptoPrice = async (coinId: string) => {
    const mappedId = normalizeCoinId(coinId);

    if (!mappedId) {
      return 0;
    }

    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(mappedId)}&vs_currencies=mxn`);
      const data = await response.json();
      const price = Number(data?.[mappedId]?.mxn ?? 0);
      return Number.isFinite(price) ? price : 0;
    } catch (error) {
      console.error("Error obteniendo precio de cripto:", error);
      return 0;
    }
  };

  const filteredCryptoHoldings = cryptoHoldings.filter((holding) => {
    const term = cryptoSearchFilter.trim().toLowerCase();
    if (!term) return true;
    return `${holding.name || ""} ${holding.symbol || ""}`.toLowerCase().includes(term);
  });

  const portfolioStats = cryptoHoldings.reduce(
    (acc, item) => {
      const currentPrice = Number(item.currentPrice ?? getCryptoCurrentPrice(item.symbol) ?? 0);
      const quantity = Number(item.quantity ?? 0);
      const avgCost = Number(item.avgCost ?? item.currentPrice ?? currentPrice ?? 0);
      const value = quantity * currentPrice;
      const cost = quantity * avgCost;
      acc.totalValue += value;
      acc.totalCost += cost;
      acc.totalQuantity += quantity;
      return acc;
    },
    { totalValue: 0, totalCost: 0, totalQuantity: 0 }
  );

  const cryptoGain = portfolioStats.totalValue - portfolioStats.totalCost;
  const cryptoGainPercent = portfolioStats.totalCost > 0 ? (cryptoGain / portfolioStats.totalCost) * 100 : 0;

  const resetCryptoForm = () => {
    setCryptoSymbol("");
    setCryptoName("");
    setCryptoIcon(null);
    setCryptoCoinId("");
    setCryptoSearch("");
    setCryptoSearchResults([]);
    setCryptoCantidad("");
    setCryptoPrecioCompra("");
    setCryptoFechaCompra(new Date());
    setCryptoLedger('local');
    setEditingHoldingId(null);
    setShowCryptoForm(false);
  };

  const [marketMap, setMarketMap] = useState<Map<string, any> | null>(null);
  const [cryptoWindowChange, setCryptoWindowChange] = useState<{ money: number; percent: number }>({ money: 0, percent: 0 });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ids = cryptoHoldings.map((h) => normalizeCoinId(h.coinId || h.symbol)).filter(Boolean);
        if (ids.length === 0) {
          setMarketMap(new Map());
          setCryptoWindowChange({ money: 0, percent: 0 });
          return;
        }
        const map = await fetchMarkets(ids as string[]);
        if (!mounted) return;
        setMarketMap(map);

        let prevTotal = 0;
        let currTotal = 0;
        for (const h of cryptoHoldings) {
          const qty = Number(h.quantity || 0);
          const resolvedId = normalizeCoinId(h.coinId || h.symbol);
          const market = map.get(resolvedId);
          const currPrice = Number(market?.current_price ?? h.currentPrice ?? 0);
          const pct = typeof market?.price_change_percentage_24h_in_currency === 'number' ? Number(market.price_change_percentage_24h_in_currency) : 0;
          const curr = qty * currPrice;
          const divisor = Math.abs(pct) < 0.000001 ? 1 : 1 + pct / 100;
          const prev = curr / divisor;
          currTotal += curr;
          prevTotal += Number.isFinite(prev) && prev > 0 ? prev : curr;
        }

        const money = currTotal - prevTotal;
        const percent = prevTotal > 0 ? (money / prevTotal) * 100 : 0;
        setCryptoWindowChange({ money, percent });
      } catch (e) {
        console.error('Error fetching crypto markets in AhorrosScreen', e);
      }
    })();
    return () => { mounted = false; };
  }, [cryptoHoldings]);

  const selectCryptoOption = (option: { symbol: string; name: string; thumb?: string; id?: string }) => {
    setCryptoSymbol(option.symbol);
    setCryptoName(option.name);
    setCryptoIcon(option.thumb || null);
    setCryptoCoinId(option.id || CRYPTO_ID_MAP[option.symbol.toUpperCase()] || "");
    setCryptoSearch("");
    setCryptoSearchResults([]);
  };

  const guardarCryptoHolding = async () => {
    const userId = (user as any)?.uid;
    const symbol = cryptoSymbol.trim().toUpperCase();
    const name = cryptoName.trim() || symbol || "Activo";
    const quantity = parseNumericInput(cryptoCantidad);
    const resolvedCoinId = cryptoCoinId || CRYPTO_ID_MAP[cryptoSymbol] || cryptoSymbol.toLowerCase();
    const marketPrice = await fetchCurrentCryptoPrice(resolvedCoinId);
    const avgCost = parseNumericInput(cryptoPrecioCompra);
    const safeAvgCost = Number.isFinite(avgCost) && avgCost > 0 ? avgCost : marketPrice;

    if (!symbol) {
      Alert.alert("Error", "Selecciona una cripto de la lista.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert("Error", "La cantidad debe ser mayor a 0.");
      return;
    }

    if (!Number.isFinite(safeAvgCost) || safeAvgCost <= 0) {
      Alert.alert("Error", "No se pudo obtener el precio de compra; ingresa un valor válido o intenta de nuevo.");
      return;
    }

    const priceForRecord = Number.isFinite(marketPrice) && marketPrice > 0 ? marketPrice : safeAvgCost;
    const now = Timestamp.now();
    const purchaseDate = Timestamp.fromDate(cryptoFechaCompra);
    const transactionId = !editingHoldingId && cryptoLedger === 'global' && userId ? `${Date.now()}-crypto` : null;
    const nextItem = {
      id: editingHoldingId || `${Date.now()}`,
      symbol,
      name,
      quantity,
      avgCost: safeAvgCost,
      currentPrice: priceForRecord,
      icon: cryptoIcon || null,
      coinId: resolvedCoinId,
      createdAt: purchaseDate,
      updatedAt: now,
    };

    if (userId) {
      const existingRef = doc(db, `users/${userId}/criptos`, nextItem.id);
      const existingSnap = await getDoc(existingRef);
      const docData = existingSnap.exists() ? existingSnap.data() : null;

      await setDoc(existingRef, {
        ...nextItem,
        createdAt: docData?.createdAt ?? purchaseDate,
        updatedAt: now,
      });

      if (transactionId) {
        await setDoc(doc(db, `users/${userId}/transacciones`, transactionId), {
          tipo: 'egreso',
          monto: Number(nextItem.quantity) * Number(nextItem.currentPrice || 0),
          descripcion: `Compra inicial de ${nextItem.name} (${nextItem.symbol})`,
          categoria: 'crypto',
          fecha: purchaseDate,
          createdAt: now,
          crypto: {
            symbol: nextItem.symbol,
            name: nextItem.name,
            quantity: Number(nextItem.quantity),
            price: Number(nextItem.currentPrice || 0),
          },
          origen: 'movimiento-cripto',
          cryptoLedger: 'global',
        });
      }

      // Registrar movimiento inicial en subcollection 'movimientos' si la cantidad es mayor a 0 y es creación nueva
      try {
        if (!editingHoldingId && (Number(nextItem.quantity) || 0) > 0) {
          await addDoc(collection(db, `users/${userId}/criptos`, nextItem.id, 'movimientos'), {
            tipo: 'compra',
            descripcion: 'Registro inicial de activo',
            cantidad: Number(nextItem.quantity),
            precio: Number(nextItem.currentPrice || 0),
            monto: Number(nextItem.quantity) * Number(nextItem.currentPrice || 0),
            fecha: purchaseDate,
            createdAt: now,
            originTransactionId: transactionId,
            ledger: cryptoLedger,
          });
        }
      } catch (e) {
        console.warn('No se pudo registrar movimiento inicial de cripto:', e);
      }
    } else {
      setCryptoHoldings((prev) => {
        if (editingHoldingId) {
          return prev.map((item) => (item.id === editingHoldingId ? { ...item, ...nextItem, updatedAt: now } : item));
        }
        return [
          {
            ...nextItem,
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ];
      });
    }

    resetCryptoForm();
    ToastAndroid.show(editingHoldingId ? "Activo actualizado" : "Activo agregado", ToastAndroid.SHORT);
  };

  const handleGuardarCryptoHolding = async () => {
    if (cryptoActionLock.current) return;
    cryptoActionLock.current = true;
    setSavingCryptoAction(true);
    try {
      await guardarCryptoHolding();
    } finally {
      cryptoActionLock.current = false;
      setSavingCryptoAction(false);
    }
  };

  const actualizarPreciosCripto = async () => {
    try {
      const userId = (user as any)?.uid;
      const updated = userId
        ? await actualizarPreciosUsuario(userId, cryptoHoldings)
        : [];

      // merge local state with updated values when available
      if (Array.isArray(updated) && updated.length > 0) {
        setCryptoHoldings((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
      } else {
        ToastAndroid.show("No hay precios nuevos para actualizar", ToastAndroid.SHORT);
      }

      ToastAndroid.show("Precios actualizados", ToastAndroid.SHORT);
    } catch (error) {
      console.error("Error actualizando precios:", error);
      Alert.alert("Error", "No se pudieron actualizar los precios en este momento.");
    }
  };

  const editarHolding = (holding: any) => {
    setEditingHoldingId(holding.id);
    setCryptoSymbol(holding.symbol);
    setCryptoName(holding.name);
    setCryptoIcon(holding.icon || null);
    setCryptoCoinId(holding.coinId || "");
    setCryptoCantidad(String(holding.quantity ?? ""));
    setCryptoPrecioCompra(String(holding.avgCost ?? ""));
    setCryptoFechaCompra(holding.createdAt?.seconds ? new Date(holding.createdAt.seconds * 1000) : new Date());
    setShowCryptoForm(true);
  };

  const abrirQuickTrade = async (holding: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;

    let cashBalance = 0;
    try {
      const snap = await getDocs(collection(db, `users/${userId}/transacciones`));
      cashBalance = snap.docs.reduce((total: number, docItem: any) => {
        const item = docItem.data() as any;
        const amount = Number(item?.monto ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) return total;
        return total + (item?.tipo === 'ingreso' ? amount : -amount);
      }, 0);
    } catch (error) {
      console.error('Error calculando saldo disponible:', error);
    }

    setQuickTrade({
      visible: true,
      holding,
      mode: 'buy',
      inputType: 'money',
      amount: '',
      ledger: 'global',
      balance: {
        cash: cashBalance,
        crypto: Number(holding.quantity ?? 0),
      },
    });
  };

  const guardarQuickTrade = async () => {
    const userId = (user as any)?.uid;
    const currentHolding = quickTrade.holding;

    if (!userId || !currentHolding) {
      return;
    }

    const currentPrice = Number(currentHolding.currentPrice ?? 0);
    const parsedAmount = parseNumericInput(quickTrade.amount);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      Alert.alert('Error', 'El precio actual de la cripto no está disponible.');
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Ingresa un valor válido para la operación rápida.');
      return;
    }

    const quantityBefore = Number(currentHolding.quantity ?? 0);
    const cryptoAmount = quickTrade.inputType === 'money' ? parsedAmount / currentPrice : parsedAmount;
    const moneyAmount = quickTrade.inputType === 'money' ? parsedAmount : parsedAmount * currentPrice;

    if (quickTrade.mode === 'sell' && quantityBefore < cryptoAmount) {
      Alert.alert('Error', 'No tienes suficiente cantidad de cripto para vender esa operación.');
      return;
    }

    if (quickTrade.mode === 'buy' && quickTrade.balance.cash < moneyAmount) {
      Alert.alert('Error', `No tienes suficiente dinero en tus transacciones para comprar ${moneyAmount.toFixed(2)} MXN de ${currentHolding.symbol}.`);
      return;
    }

    const ref = doc(db, `users/${userId}/criptos`, currentHolding.id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const prevQty = Number(data.quantity ?? currentHolding.quantity ?? 0);
    const prevAvg = Number(data.avgCost ?? currentHolding.avgCost ?? currentPrice);
    const nextQty = quickTrade.mode === 'buy' ? prevQty + cryptoAmount : prevQty - cryptoAmount;

    const nextAvg = quickTrade.mode === 'buy'
      ? (prevQty * prevAvg + moneyAmount) / Math.max(prevQty + cryptoAmount, Number.EPSILON)
      : prevAvg;

    const nextData = {
      ...data,
      quantity: Math.max(0, nextQty),
      avgCost: nextAvg,
      currentPrice,
      updatedAt: Timestamp.now(),
    };

    await setDoc(ref, nextData);

    const transactionId = quickTrade.ledger === 'global' ? `${Date.now()}-crypto-trade` : null;
    if (transactionId) {
      await setDoc(doc(db, `users/${userId}/transacciones`, transactionId), {
        tipo: quickTrade.mode === 'buy' ? 'egreso' : 'ingreso',
        monto: moneyAmount,
        descripcion: `${quickTrade.mode === 'buy' ? 'Compra rápida' : 'Venta rápida'} ${currentHolding.symbol}`,
        categoria: 'crypto',
        fecha: Timestamp.now(),
        createdAt: Timestamp.now(),
        crypto: {
          symbol: currentHolding.symbol,
          name: currentHolding.name,
          quantity: cryptoAmount,
          price: currentPrice,
        },
        origen: 'movimiento-cripto',
        cryptoLedger: 'global',
      });
    }

    // Registrar movimiento en subcollection 'movimientos' del activo
    try {
      await addDoc(collection(db, `users/${userId}/criptos`, currentHolding.id, 'movimientos'), {
        tipo: quickTrade.mode === 'buy' ? 'compra' : 'venta',
        descripcion: `${quickTrade.mode === 'buy' ? 'Compra rápida' : 'Venta rápida'}`,
        cantidad: cryptoAmount,
        precio: currentPrice,
        monto: moneyAmount,
        fecha: Timestamp.now(),
        createdAt: Timestamp.now(),
        originTransactionId: transactionId,
        ledger: quickTrade.ledger,
        cryptoLedger: quickTrade.ledger,
      });
    } catch (e) {
      console.warn('No se pudo registrar movimiento rapido en subcollection movimientos:', e);
    }

    setQuickTrade({
      visible: false,
      holding: null,
      mode: 'buy',
      inputType: 'money',
      amount: '',
      ledger: 'global',
      balance: { cash: 0, crypto: 0 },
    });
    ToastAndroid.show(quickTrade.mode === 'buy' ? 'Compra rápida registrada' : 'Venta rápida registrada', ToastAndroid.SHORT);
  };

  const handleGuardarQuickTrade = async () => {
    if (cryptoActionLock.current) return;
    cryptoActionLock.current = true;
    setSavingCryptoAction(true);
    try {
      await guardarQuickTrade();
    } finally {
      cryptoActionLock.current = false;
      setSavingCryptoAction(false);
    }
  };

  const eliminarHolding = async (holdingId: string) => {
    const target = cryptoHoldings.find((item) => item.id === holdingId);
    const symbol = target?.symbol || "este activo";

    Alert.alert(
      "Eliminar activo",
      `¿Quieres borrar ${symbol} de tu portafolio? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            const userId = (user as any)?.uid;
            if (userId) {
              await deleteDoc(doc(db, `users/${userId}/criptos`, holdingId));
            } else {
              setCryptoHoldings((prev) => prev.filter((item) => item.id !== holdingId));
            }
            ToastAndroid.show("Activo eliminado", ToastAndroid.SHORT);
          },
        },
      ]
    );
  };

  // util: formatea número con comas (sin decimales)
  const fmt = (n: number) =>
    n?.toLocaleString?.("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) ?? "0";

  const labelPlazo = (p?: string | null) => {
    if (p === "corto") return "Corto plazo";
    if (p === "mediano") return "Mediano plazo";
    if (p === "largo") return "Largo plazo";
    return "Sin plazo";
  };

  const parseFecha = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const parseNumericInput = (value: string | number) => {
    const sanitized = String(value ?? "")
      .replace(/\s+/g, "")
      .replace(/[$€]/g, "")
      .replace(/,/g, "");

    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const abrirNuevo = () => {
    setSelected(null);
    setNombre("");
    setMeta("");
    setDescripcion("");
    setPlazo(null);
    setSinPlazo(false);
    setFechaLimite(null);
    setCantidadActual(0);
    setEditando(false);
    setShowNuevo(true);
  };

  const openFechaPicker = () => {
    setDatePickerVisible(true);
  };

  const handleFechaConfirm = (date: Date) => {
    setDatePickerVisible(false);
    setSinPlazo(false);
    setFechaLimite(toIsoDate(date));
  };

  const handleCryptoFechaConfirm = (date: Date) => {
    setCryptoDatePickerVisible(false);
    setCryptoFechaCompra(date);
  };

  const formatDate = (date: Date) => date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Crear nuevo ahorro
  const guardarNuevo = async () => {
    const userId = (user as any)?.uid;
    if (!userId) return;

    if (!editando && !subscriptionActive && ahorros.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 metas de ahorro sin suscripcion.");
      return;
    }

    if (!nombre.trim()) {
      Alert.alert("Error", "Pon un nombre para la meta.");
      return;
    }

    if (!sinPlazo && !plazo && !fechaLimite) {
      Alert.alert("Error", "Selecciona un plazo (corto, mediano o largo) o una fecha probable.");
      return;
    }

    const now = new Date();
    let fechaObjetivo: Date | null = null;
    if (!sinPlazo && fechaLimite) {
      const parsed = parseFecha(fechaLimite);
      if (!parsed) {
        Alert.alert("Error", "La fecha probable debe estar en formato AAAA-MM-DD.");
        return;
      }
      if (parsed <= now) {
        Alert.alert("Error", "La fecha probable debe ser futura.");
        return;
      }
      fechaObjetivo = parsed;
    } else if (!sinPlazo && plazo) {
      const objetivo = new Date(now);
      objetivo.setDate(objetivo.getDate() + PLAZO_DIAS[plazo]);
      fechaObjetivo = objetivo;
    }

    var metaNum = 0;
    if(meta !== ""){
        metaNum = parseFloat(meta.toString().replace(/,/g, ""));
        if (isNaN(metaNum) || metaNum <= 0) {
            Alert.alert("Error", "Ingresa una meta válida.");
            return;
        }
    }
    
    try {
      if (editando) {
        const ref = doc(db, `users/${userId}/ahorros`, selected.id);
        await updateDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: cantidadActual,
          descripcion: descripcion || "",
          plazo: sinPlazo ? null : plazo,
          fechaLimite: fechaObjetivo ? Timestamp.fromDate(fechaObjetivo) : null,
        });
        ToastAndroid.show("Meta actualizada", ToastAndroid.SHORT);
      } else {
        const ref = collection(db, `users/${userId}/ahorros`);
        await addDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: 0,
          descripcion: descripcion || "",
          plazo: sinPlazo ? null : plazo,
          creado: serverTimestamp(),
          fechaLimite: fechaObjetivo ? Timestamp.fromDate(fechaObjetivo) : null,
        });
        ToastAndroid.show("Meta creada", ToastAndroid.SHORT);
      }
      
      // limpiar
      setNombre("");
      setMeta("");
      setDescripcion("");
      setPlazo(null);
      setSinPlazo(false);
      setFechaLimite(null);
      setShowNuevo(false);
      setEditando(false);
    } catch (e) {
      console.error("Error guardar ahorro:", e);
      Alert.alert("Error", "No se pudo crear la meta.");
    }
  };

  useEffect(() => {
    if (!showNuevo) return;

    const timer = setTimeout(() => {
      nombreInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [showNuevo, editando]);

  // Abrir detalle
  const abrirDetalle = (a: any) => {
    setSelected(a);
    setMovimientoMonto("");
    setMovimientoTipo("deposito");
    setShowDetalle(true);
  };

  useEffect(() => {
    if (!showDetalle) return;

    const timer = setTimeout(() => {
      movimientoInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [showDetalle]);

  const abrirTransacciones = async (a: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    setSelected(a);
    setHistoryType('saving');
    setShowTransacciones(true);
    setCargandoMovimientos(true);

    try {
      const ref = doc(db, `users/${userId}/ahorros`, a.id);
      const q = query(collection(ref, "movimientos"), orderBy("creado", "desc"));
      let balanceSynced = false;

      const unsub = onSnapshot(q, (snap) => {
        const allData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const balance = allData.reduce((total, movement: any) => {
          const amount = Number(movement.monto || 0);
          const adds = movement.tipo === "deposito" || movement.tipo === "transferencia";
          return total + (adds ? amount : -amount);
        }, 0);
        setTransaccionesData(allData);
        setSelected((current: any) => current ? { ...current, cantidadActual: balance } : current);
        if (!balanceSynced && Math.abs(Number(a.cantidadActual || 0) - balance) > 0.005) {
          balanceSynced = true;
          updateDoc(ref, { cantidadActual: balance });
        }
        setCargandoMovimientos(false);
      });

      return unsub;
    } catch (e) {
      console.error("Error al obtener movimientos:", e);
      Alert.alert("Error", "No se pudieron cargar las transacciones.");
      setCargandoMovimientos(false);
    }
  };

  const abrirCryptoMovimientos = async (holding: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    setSelected(holding);
    setHistoryType('crypto');
    setShowTransacciones(true);
    setCargandoMovimientos(true);

    try {
      const ref = doc(db, `users/${userId}/criptos`, holding.id);
      const q = query(collection(ref, 'movimientos'), orderBy('fecha', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        setTransaccionesData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCargandoMovimientos(false);
      });
      return unsub;
    } catch (error) {
      console.error('Error al obtener movimientos de cripto:', error);
      setCargandoMovimientos(false);
    }
  };

  const eliminarCryptoMovimiento = (movement: any) => {
    if (!selected || historyType !== 'crypto') return;

    Alert.alert(
      'Eliminar movimiento',
      'Se eliminará de la cartera y, si es Global, también de Transacciones.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const userId = (user as any)?.uid;
            if (!userId) return;

            try {
              const movementsRef = collection(db, `users/${userId}/criptos/${selected.id}/movimientos`);
              const movementRef = doc(movementsRef, movement.id);
              const snapshot = await getDocs(movementsRef);
              const remaining = snapshot.docs.filter((item) => item.id !== movement.id);
              const quantity = remaining.reduce((total, item) => {
                const data = item.data() as any;
                const amount = Number(data.cantidad || 0);
                return total + (data.tipo === 'venta' ? -amount : amount);
              }, 0);
              const buys = remaining.reduce((total, item) => {
                const data = item.data() as any;
                return data.tipo === 'compra' ? total + Number(data.cantidad || 0) * Number(data.precio || 0) : total;
              }, 0);
              const boughtQuantity = remaining.reduce((total, item) => {
                const data = item.data() as any;
                return data.tipo === 'compra' ? total + Number(data.cantidad || 0) : total;
              }, 0);
              const transactionId = movement.originTransactionId || null;
              const transactionRef = transactionId ? doc(db, `users/${userId}/transacciones`, transactionId) : null;
              const shouldRemoveMirror = movement.ledger !== 'local';
              const transactionsSnap = shouldRemoveMirror && !transactionRef
                ? await getDocs(collection(db, `users/${userId}/transacciones`))
                : null;
              const legacyMirror = transactionsSnap?.docs.find((item) => {
                const data = item.data() as any;
                const sameAsset = data.crypto?.symbol === selected.symbol;
                const sameAmount = Math.abs(Number(data.monto || 0) - Number(movement.monto || 0)) < 0.005;
                const sameType = movement.tipo === 'venta' ? data.tipo === 'ingreso' : data.tipo === 'egreso';
                return sameAsset && sameAmount && sameType && data.origen === 'movimiento-cripto';
              });
              const mirrorRef = transactionRef || (legacyMirror ? legacyMirror.ref : null);

              await runTransaction(db, async (transaction) => {
                transaction.delete(movementRef);
                if (mirrorRef) transaction.delete(mirrorRef);
                transaction.update(doc(db, `users/${userId}/criptos`, selected.id), {
                  quantity: Math.max(0, quantity),
                  avgCost: boughtQuantity > 0 ? buys / boughtQuantity : 0,
                  updatedAt: Timestamp.now(),
                });
              });

              ToastAndroid.show('Movimiento eliminado', ToastAndroid.SHORT);
            } catch (error) {
              console.error('Error eliminando movimiento cripto:', error);
              Alert.alert('Error', 'No se pudo eliminar el movimiento cripto.');
            }
          },
        },
      ],
    );
  };

  // Depositar / retirar (transactional)
  const ejecutarMovimiento = async () => {
    if (!selected) return;
    const userId = (user as any)?.uid;
    if (!userId) return;
    const montoNum = parseFloat(movimientoMonto.toString().replace(/,/g, ""));
    if (isNaN(montoNum) || montoNum <= 0) {
      Alert.alert("Error", "Ingresa un monto válido.");
      return;
    }

    const ahorroRef = doc(db, `users/${userId}/ahorros`, selected.id);
    const movsRef = collection(db, `users/${userId}/ahorros`, selected.id, "movimientos");
    const transaccionesRef = collection(db, `users/${userId}/transacciones`);

    try {
      const movementsSnap = await getDocs(movsRef);
      const current = movementsSnap.docs.reduce((total, movementDoc) => {
        const movement = movementDoc.data() as any;
        const amount = Number(movement.monto || 0);
        const adds = movement.tipo === "deposito" || movement.tipo === "transferencia";
        return total + (adds ? amount : -amount);
      }, 0);
      const addsToSavings = movimientoTipo === "deposito" || movimientoTipo === "transferencia";
      const newAmount = current + (addsToSavings ? montoNum : -montoNum);

      if (!addsToSavings && newAmount < 0) {
        throw new Error("No hay suficiente en la meta para retirar esa cantidad.");
      }

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ahorroRef);
        if (!snap.exists()) throw new Error("Meta no encontrada");

        const transactionRef = movimientoTipo === "transferencia" || movimientoTipo === "pasarATransacciones"
          ? doc(transaccionesRef)
          : null;

        if (movimientoTipo === "transferencia") {
          tx.set(transactionRef!, {
            descripcion: `Transferencia a ahorro: ${selected.nombre}`,
            monto: montoNum,
            tipo: "egreso",
            fecha: serverTimestamp(),
            creadoAutomaticamente: false,
            origen: "transferencia-ahorro",
            ahorroId: selected.id,
            ahorroNombre: selected.nombre,
          });
        }

        if (movimientoTipo === "pasarATransacciones") {
          tx.set(transactionRef!, {
            descripcion: `Retiro de ahorro: ${selected.nombre}`,
            monto: montoNum,
            tipo: "ingreso",
            fecha: serverTimestamp(),
            creadoAutomaticamente: false,
            origen: "retiro-ahorro",
            ahorroId: selected.id,
            ahorroNombre: selected.nombre,
          });
        }

        // actualizar ahorro
        tx.update(ahorroRef, {
          cantidadActual: newAmount,
          actualizadoEn: serverTimestamp(),
        });

        // registrar movimiento en subcollection
        const movimientoDoc = {
          transaccionId: transactionRef?.id || null,
          tipo: movimientoTipo,
          monto: montoNum,
          creado: serverTimestamp(),
          nota:
            movimientoTipo === "deposito"
              ? "Depósito manual (sin transacciones)"
              : movimientoTipo === "retiro"
                ? "Retiro manual (sin transacciones)"
                : movimientoTipo === "transferencia"
                  ? "Transferencia desde transacciones"
                  : "Transferencia hacia transacciones",
        };
        tx.set(doc(movsRef), movimientoDoc);
      });

      ToastAndroid.show("Movimiento registrado", ToastAndroid.SHORT);
      setShowDetalle(false);
    } catch (e: any) {
      console.error("Error movimiento:", e);
      Alert.alert("Error", e?.message || "No se pudo procesar el movimiento.");
    }
  };

  const eliminarTransferenciaAhorro = (movement: any) => {
    if (!selected) return;
    const isTransfer = movement.tipo === "transferencia" || movement.tipo === "pasarATransacciones";

    Alert.alert(
      isTransfer ? "Eliminar transferencia" : "Eliminar movimiento",
      isTransfer
        ? "Se eliminará de este ahorro y de Transacciones, y se recalculará el saldo de la meta."
        : "Se eliminará este movimiento manual y se recalculará el saldo de la meta.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            const userId = (user as any)?.uid;
            if (!userId) return;

            try {
              const ahorroRef = doc(db, `users/${userId}/ahorros`, selected.id);
              const movementsRef = collection(db, `users/${userId}/ahorros/${selected.id}/movimientos`);
              const transactionRef = isTransfer && movement.transaccionId
                ? doc(db, `users/${userId}/transacciones`, movement.transaccionId)
                : null;
              const allMovementsSnap = await getDocs(movementsRef);
              const allTransactionsSnap = isTransfer && !transactionRef
                ? await getDocs(collection(db, `users/${userId}/transacciones`))
                : null;
              const legacyTransaction = isTransfer ? allTransactionsSnap?.docs.find((item) => {
                const data = item.data() as any;
                const expectedOrigin = movement.tipo === "transferencia" ? "transferencia-ahorro" : "retiro-ahorro";
                return data.ahorroId === selected.id && data.origen === expectedOrigin && Math.abs(Number(data.monto || 0) - Number(movement.monto || 0)) < 0.005;
              }) : undefined;
              const resolvedTransactionRef = transactionRef || (legacyTransaction ? legacyTransaction.ref : null);
              const remainingBalance = allMovementsSnap.docs
                .filter((item) => item.id !== movement.id)
                .reduce((total, item) => {
                  const data = item.data() as any;
                  const amount = Number(data.monto || 0);
                  return total + (data.tipo === "deposito" || data.tipo === "transferencia" ? amount : -amount);
                }, 0);

              await runTransaction(db, async (tx) => {
                tx.delete(doc(movementsRef, movement.id));
                if (resolvedTransactionRef) tx.delete(resolvedTransactionRef);
                tx.update(ahorroRef, { cantidadActual: remainingBalance, actualizadoEn: serverTimestamp() });
              });

              setTransaccionesData((current) => current.filter((item) => item.id !== movement.id));
              ToastAndroid.show(isTransfer ? "Transferencia eliminada" : "Movimiento eliminado", ToastAndroid.SHORT);
            } catch (error) {
              console.error("Error eliminando transferencia:", error);
              Alert.alert("Error", "No se pudo eliminar la transferencia.");
            }
          },
        },
      ],
    );
  };

  // Eliminar meta
  const confirmarEliminar = (a: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    Alert.alert("Eliminar meta", `¿Eliminar "${a.nombre}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${userId}/ahorros`, a.id));
            ToastAndroid.show("Meta eliminada", ToastAndroid.SHORT);
          } catch (e) {
            console.error("Error eliminar meta:", e);
            Alert.alert("Error", "No se pudo eliminar la meta.");
          }
        },
      },
    ]);
  };

  // Editar meta (solo nombre/meta/desc/fecha)
  const editarMeta = async (a: any) => {
    // abrimos modal tipo nuevo con los valores (simple flow)
    setSelected(a);
    setNombre(a.nombre || "");
    setMeta(String(a.meta || ""));
    setDescripcion(a.descripcion || "");
    const hasFechaLimite = Boolean(a.fechaLimite?.seconds);
    const hasPlazo = Boolean(a.plazo);
    setPlazo(a.plazo || null);
    setSinPlazo(!hasPlazo && !hasFechaLimite);
    setFechaLimite(hasFechaLimite ? new Date(a.fechaLimite.seconds * 1000).toISOString().slice(0, 10) : null);
    setShowNuevo(true);
    setEditando(true);
    setCantidadActual(a.cantidadActual || 0);
  };

  // UI
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor2 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 80 }}>
        <Animated.View layout={Layout.springify()}>
          <LinearGradient
            colors={headerColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{viewMode === "cripto" ? "Criptos" : "Ahorros"}</Text>
                <Text style={styles.headerSubtitle}>
                  {viewMode === "cripto"
                    ? "Gestiona tus monedas y revisa el rendimiento de tu cartera en tiempo real."
                    : "Crea metas, aporta y registra movimientos. Puedes transferir desde y hacia Transacciones."}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.14)",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.2)"
                }}
              >
                <Ionicons name={viewMode === "cripto" ? "logo-bitcoin" : "wallet-outline"} size={22} color="white" />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 18 }} />

        <View
          style={{
            flexDirection: "row",
            backgroundColor: cardsMain,
            borderRadius: 14,
            padding: 4,
            borderWidth: 1,
            borderColor: borderColor,
            marginBottom: 16,
          }}
        >
          {[
            { key: "ahorros", label: "Ahorro", icon: "wallet-outline" },
            { key: "cripto", label: "Cripto", icon: "logo-bitcoin" },
          ].map((option) => {
            const active = viewMode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => setSavingsViewMode(option.key as "ahorros" | "cripto")}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 10,
                  paddingVertical: 10,
                  backgroundColor: active ? primaryColor : "transparent",
                }}
              >
                <Ionicons name={option.icon as any} size={16} color={active ? "white" : iconColor} />
                <Text style={{ color: active ? "white" : iconColor, fontWeight: "700", marginLeft: 8 }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

{viewMode === "cripto" ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: cardsMain,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: borderColor,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: textColor, fontWeight: "700" }}>Mostrar en</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {(["MXN", "USD"] as const).map((currency) => (
                <TouchableOpacity
                  key={currency}
                  onPress={() => setDisplayCurrency(currency)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: displayCurrency === currency ? primaryColor : "transparent",
                    borderWidth: 1,
                    borderColor: displayCurrency === currency ? primaryColor : borderColor,
                  }}
                >
                  <Text style={{ color: displayCurrency === currency ? "white" : iconColor, fontWeight: "700" }}>{currency}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {viewMode === "cripto" ? (
          <Animated.View layout={Layout.springify()}>
            <View style={[styles.card, { backgroundColor: cardsMain, borderColor: borderColor, borderWidth: 1 }]}> 
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <View>
                  <Text style={{ color: textColor, fontSize: 12, opacity: 0.7 }}>Portafolio total</Text>
                  <Text style={{ color: textColor, fontSize: 28, fontWeight: "800" }}>
                    {formatDisplayMoney(portfolioStats.totalValue)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={actualizarPreciosCripto}
                    style={{ backgroundColor: cardsMain, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor }}
                  >
                    <Text style={{ color: iconColor, fontWeight: "700" }}>Actualizar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingHoldingId(null);
                      setCryptoFechaCompra(new Date());
                      setShowCryptoForm(true);
                    }}
                    style={{ backgroundColor: primaryColor, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>+ activo</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 8, backgroundColor: backgroundColor2, borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: textColor, opacity: 0.7, fontSize: 11 }}>Costo total</Text>
                  <Text style={{ color: textColor, fontWeight: "700" }}>{formatDisplayMoney(portfolioStats.totalCost)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 8, backgroundColor: backgroundColor2, borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: textColor, opacity: 0.7, fontSize: 11 }}>Ganancia</Text>
                  <Text style={{ color: cryptoGain >= 0 ? "#34d399" : "#f87171", fontWeight: "700" }}>
                    {formatDisplayMoney(cryptoGain)} ({fmt(cryptoGainPercent)}%)
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: cardsMain,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: borderColor,
                }}
              >
                <Ionicons name="search-outline" size={16} color={iconColor} />
                <TextInput
                  placeholder="Buscar activo"
                  placeholderTextColor={textColor}
                  value={cryptoSearchFilter}
                  onChangeText={setCryptoSearchFilter}
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    color: textColor,
                    fontSize: 13,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: cardsMain,
                  borderRadius: 12,
                  padding: 4,
                  borderWidth: 1,
                  borderColor: borderColor,
                }}
              >
                {(["normal", "compact"] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setCryptoListViewMode(mode)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: cryptoListView === mode ? primaryColor : "transparent",
                    }}
                  >
                    <Text style={{ color: cryptoListView === mode ? "white" : iconColor, fontWeight: "700", fontSize: 11 }}>
                      {mode === "normal" ? "Normal" : "Compacto"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {filteredCryptoHoldings.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: cardsMain, borderColor: borderColor, borderWidth: 1 }]}> 
                <Text style={{ color: textColor, opacity: 0.7, textAlign: "center" }}>
                  No encontré activos con ese nombre o símbolo.
                </Text>
              </View>
            ) : (
              filteredCryptoHoldings.map((holding) => {
                const currentPrice = Number(holding.currentPrice ?? getCryptoCurrentPrice(holding.symbol) ?? 0);
                const quantity = Number(holding.quantity ?? 0);
                const value = quantity * currentPrice;
                const cost = quantity * Number(holding.avgCost ?? holding.currentPrice ?? currentPrice ?? 0);
                const gain = value - cost;
                const gainPercent = cost > 0 ? (gain / cost) * 100 : 0;
                const resolvedId = normalizeCoinId(holding.coinId || holding.symbol);
                const market = marketMap?.get?.(resolvedId);
                const windowPct = market && typeof market.price_change_percentage_24h_in_currency === 'number'
                  ? Number(market.price_change_percentage_24h_in_currency)
                  : 0;
                const windowMoney = value * (windowPct / 100);

                if (cryptoListView === "compact") {
                  return (
                    <View key={holding.id} style={[styles.card, { backgroundColor: cardsMain, borderColor: borderColor, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12 }]}> 
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}>
                          {holding.icon ? (
                            <Image source={{ uri: holding.icon }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 8 }} />
                          ) : (
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: `${primaryColor}22`, marginRight: 8, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: primaryColor, fontWeight: "700", fontSize: 9 }}>{holding.symbol.slice(0, 2)}</Text>
                            </View>
                          )}

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: textColor, fontWeight: "700", fontSize: 12 }}>{holding.symbol}</Text>
                            <Text style={{ color: textColor, opacity: 0.7, fontSize: 10 }}>{quantity.toFixed(5)}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => abrirQuickTrade(holding)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                          <Ionicons name="swap-horizontal-outline" size={14} color="white" />
                        </TouchableOpacity>
                        <View style={{ alignItems: "flex-end", marginLeft: 8, minWidth: 70 }}>
                          <Text style={{ color: textColor, fontWeight: "800", fontSize: 12 }}>{formatDisplayMoney(value)}</Text>
                          <Text style={{ fontSize: 10, color: windowMoney >= 0 ? "#34d399" : "#f87171", marginTop: 2 }}>
                            {windowMoney >= 0 ? '+' : '-'}{formatDisplayMoney(Math.abs(windowMoney))} ({windowPct.toFixed(2)}%)
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                return (
                  <View key={holding.id} style={[styles.card, { backgroundColor: cardsMain, borderColor: borderColor, borderWidth: 1 }]}> 
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        {holding.icon ? (
                          <Image source={{ uri: holding.icon }} style={{ width: 26, height: 26, borderRadius: 13, marginRight: 10 }} />
                        ) : (
                          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${primaryColor}22`, marginRight: 10, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: primaryColor, fontWeight: "700", fontSize: 10 }}>{holding.symbol.slice(0, 2)}</Text>
                          </View>
                        )}
                        <View>
                          <ThemedText style={styles.cardTitle}>{holding.name}</ThemedText>
                          <ThemedText style={styles.cardSmall}>{holding.symbol} • {quantity.toFixed(4)} unidades</ThemedText>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <ThemedText style={{ fontSize: 11, color: gain >= 0 ? "#34d399" : "#f87171", marginRight: 6 }}>
                            {gain >= 0 ? "+" : "-"}{formatDisplayMoney(Math.abs(gain))}
                          </ThemedText>
                          <ThemedText style={{ color: textColor }}>{formatDisplayMoney(value)}</ThemedText>
                        </View>
                        <ThemedText style={{ fontSize: 11, color: windowMoney >= 0 ? "#34d399" : "#f87171", marginTop: -7 }}>
                          {windowMoney >= 0 ? '+' : '-'}{formatDisplayMoney(Math.abs(windowMoney))} ({windowPct.toFixed(2)}%)
                        </ThemedText>
                      </View>
                    </View>

                    <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: textColor, opacity: 0.7 }}>Precio actual</Text>
                      <Text style={{ color: textColor, fontWeight: "700" }}>{formatDisplayMoney(currentPrice)}</Text>
                    </View>
                    <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: textColor, opacity: 0.7 }}>Precio promedio</Text>
                      <Text style={{ color: textColor, fontWeight: "700" }}>{formatDisplayMoney(Number(holding.avgCost ?? 0))}</Text>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
                      <TouchableOpacity onPress={() => editarHolding(holding)} style={[styles.iconBtn, { backgroundColor: primaryColor }]}>
                        <Ionicons name="create-outline" size={16} color="white" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirCryptoMovimientos(holding)} accessibilityLabel="Ver historial de cripto" style={[styles.iconBtn, { backgroundColor: primaryColor }]}> 
                        <Ionicons name="time-outline" size={16} color="white" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirQuickTrade(holding)} style={[styles.iconBtn, { backgroundColor: "#3b82f6" }]}>
                        <Ionicons name="swap-horizontal-outline" size={16} color="white" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => eliminarHolding(holding.id)} style={[styles.iconBtn, { backgroundColor: "#ef4444" }]}>
                        <Ionicons name="trash-outline" size={16} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </Animated.View>
        ) : (
          <Animated.View layout={Layout.springify()}>
            {ahorros.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={{ color: textColor, opacity: 0.7 }}>No hay metas todavía. Crea una.</Text>
              </View>
            ) : (
              ahorros.map((a) => {
                const progreso = a.meta && a.meta > 0 ? Math.min((a.cantidadActual / a.meta) * 100, 100) : 0;
                return (
                  <TouchableOpacity onPress={() => abrirTransacciones(a)} key={a.id} style={styles.card}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.cardTitle}>{a.nombre}</ThemedText>
                        {a.descripcion ? <ThemedText style={styles.cardDesc}>{a.descripcion}</ThemedText> : null}
                        <ThemedText style={styles.cardSmall}>
                          {fmt(a.cantidadActual || 0)} / {a.meta === "" ? "∞" : fmt(a.meta || 0)}
                        </ThemedText>
                        <ThemedText style={styles.cardSmall}>
                          {labelPlazo(a.plazo)}
                          {a.fechaLimite?.seconds
                            ? ` • Fecha probable: ${new Date(a.fechaLimite.seconds * 1000).toLocaleDateString("es-MX")}`
                            : ""}
                        </ThemedText>
                      </View>

                      <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                        <TouchableOpacity onPress={() => abrirDetalle(a)} style={styles.iconBtn}>
                          <Ionicons name="chevron-forward" size={20} color={iconColor} />
                        </TouchableOpacity>
                        <View style={{ height: 8 }} />
                        <TouchableOpacity onPress={() => editarMeta(a)} style={[styles.iconBtn, { backgroundColor: primaryColor }]}>
                          <Ionicons name="create-outline" size={18} color="white" />
                        </TouchableOpacity>
                        <View style={{ height: 8 }} />
                        <TouchableOpacity onPress={() => confirmarEliminar(a)} style={[styles.iconBtn, { backgroundColor: "#ef4444" }]}>
                          <Ionicons name="trash-outline" size={18} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ marginTop: 12 }}>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFg, { width: `${progreso}%` }]} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Botón flotante crear */}
      {viewMode === "ahorros" ? (
        <TouchableOpacity
          onPress={abrirNuevo}
          style={{
            position: "absolute",
            bottom: 30,
            right: 20,
            backgroundColor: primaryColor,
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: "center",
            alignItems: "center",
            elevation: 8,
          }}
        >
          <Ionicons name="add" size={30} color={iconColor} />
        </TouchableOpacity>
      ) : null}

      <Modal visible={showCryptoForm} transparent animationType="fade">
        
        <TouchableWithoutFeedback onPress={resetCryptoForm}>
          <View style={styles.modalBack}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ justifyContent: "center", paddingVertical: 20 }}
              >
                <View style={styles.modalCard}>
                  <ThemedText style={{ fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
                    {editingHoldingId ? "Editar activo" : "Nuevo activo"}
                  </ThemedText>
                  <ThemedText style={{ color: textColor, opacity: 0.62, fontSize: 12, marginBottom: 18 }}>
                    Registra tu posición y conserva su punto de partida.
                  </ThemedText>

                  <Text style={{ color: textColor, opacity: 0.72, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>
                    ACTIVO
                  </Text>

                  <TextInput
                    placeholder="Buscar por nombre o símbolo"
                    placeholderTextColor={textColor}
                    value={cryptoSearch}
                    onChangeText={(value) => {
                      setCryptoSearch(value);
                      fetchCryptoSearchResults(value);
                    }}
                    style={styles.input}
                  />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 }}>
                    {cryptoSearchResults.length > 0 ? (
                      cryptoSearchResults.map((option) => {
                        const symbol = option.symbol?.toUpperCase() || "";
                        const thumb = option.thumb || option.large || null;
                        const isSelected = cryptoSymbol === symbol;
                        return (
                          <TouchableOpacity
                            key={`${option.id}-${symbol}`}
                            onPress={() => selectCryptoOption({ symbol, name: option.name, thumb, id: option.id })}
                            style={{
                              backgroundColor: isSelected ? primaryColor : cardsMain,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderWidth: 1,
                              borderColor: isSelected ? primaryColor : borderColor,
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            {thumb ? <Image source={{ uri: thumb }} style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6 }} /> : null}
                            <Text style={{ color: isSelected ? "white" : iconColor, fontWeight: "700" }}>
                              {symbol}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      CRYPTO_OPTIONS.map((option) => {
                        const isSelected = cryptoSymbol === option.symbol;
                        return (
                          <TouchableOpacity
                            key={option.symbol}
                            onPress={() => selectCryptoOption(option)}
                            style={{
                              backgroundColor: isSelected ? primaryColor : cardsMain,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderWidth: 1,
                              borderColor: isSelected ? primaryColor : borderColor,
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            {option.thumb ? <Image source={{ uri: option.thumb }} style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6 }} /> : null}
                            <Text style={{ color: isSelected ? "white" : iconColor, fontWeight: "700" }}>
                              {option.symbol}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>

                  {cryptoSymbol ? (
                    <View
                      style={{
                        backgroundColor: cardsMain,
                        borderRadius: 10,
                        padding: 10,
                        borderWidth: 1,
                        borderColor: borderColor,
                        marginBottom: 12,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      {cryptoIcon ? <Image source={{ uri: cryptoIcon }} style={{ width: 26, height: 26, borderRadius: 13, marginRight: 10 }} /> : null}
                      <View>
                        <Text style={{ color: textColor, fontWeight: "700" }}>{cryptoName || cryptoSymbol}</Text>
                        <Text style={{ color: textColor, opacity: 0.7 }}>{cryptoSymbol}</Text>
                      </View>
                    </View>
                  ) : null}

                  <Text style={{ color: textColor, opacity: 0.72, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>
                    POSICIÓN
                  </Text>

                  <TextInput
                    placeholder="Cantidad de unidades"
                    placeholderTextColor={textColor}
                    keyboardType="decimal-pad"
                    value={cryptoCantidad}
                    onChangeText={setCryptoCantidad}
                    style={styles.input}
                  />

                  <TextInput
                    placeholder="Precio de compra por unidad"
                    placeholderTextColor={textColor}
                    keyboardType="decimal-pad"
                    value={cryptoPrecioCompra}
                    onChangeText={setCryptoPrecioCompra}
                    style={styles.input}
                  />

                  <TouchableOpacity
                    onPress={() => setCryptoDatePickerVisible(true)}
                    style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                  >
                    <View>
                      <Text style={{ color: textColor, fontSize: 11, opacity: 0.62, marginBottom: 2 }}>FECHA DE COMPRA</Text>
                      <Text style={{ color: textColor, fontWeight: "600" }}>{formatDate(cryptoFechaCompra)}</Text>
                    </View>
                    <Ionicons name="calendar-outline" size={19} color={primaryColor} />
                  </TouchableOpacity>

                  <Text style={{ color: textColor, opacity: 0.72, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>REGISTRAR COMO</Text>
                  <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    {(["local", "global"] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setCryptoLedger(option)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          marginRight: option === "local" ? 8 : 0,
                          backgroundColor: cryptoLedger === option ? primaryColor : cardsMain,
                          borderWidth: 1,
                          borderColor: primaryColor,
                        }}
                      >
                        <Text style={{ color: cryptoLedger === option ? "white" : iconColor, textAlign: "center", fontWeight: "700" }}>
                          {option === "local" ? "Local" : "Global"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={resetCryptoForm}
                      style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}
                    >
                      <Text style={{ color: iconColor, textAlign: "center" }}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleGuardarCryptoHolding}
                      disabled={savingCryptoAction}
                      style={[styles.btn, { backgroundColor: primaryColor, flex: 1, opacity: savingCryptoAction ? 0.65 : 1 }]}
                    >
                      {savingCryptoAction ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", textAlign: "center" }}>Guardar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

       <Modal visible={showTransacciones} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowTransacciones(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <ThemedText style={styles.modalTitle}>
                  Historial de {selected?.name || selected?.nombre || selected?.symbol || ""}
                </ThemedText>
                <TouchableOpacity onPress={() => setShowTransacciones(false)}>
                  <Ionicons name="close" size={24} color={iconColor} />
                </TouchableOpacity>
              </View>

              {cargandoMovimientos ? (
                <ActivityIndicator
                  size="large"
                  color={primaryColor}
                  style={{ marginTop: 20 }}
                />
              ) : transaccionesData.length === 0 ? (
                <Text
                  style={{
                    color: textColor,
                    opacity: 0.7,
                    textAlign: "center",
                    marginTop: 30,
                  }}
                >
                  No hay movimientos registrados.
                </Text>
              ) : (
                <FlatList
                  data={transaccionesData}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 420 }}
                  contentContainerStyle={{ marginTop: 10, paddingBottom: 2 }}
                  renderItem={({ item }) => (
                    <View style={[styles.movCard, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText
                          style={{
                            color: historyType === 'crypto'
                              ? (item.tipo === 'compra' ? "#4ade80" : "#f87171")
                              : (item.tipo === "deposito" || item.tipo === "transferencia" ? "#4ade80" : "#f87171"),
                            fontWeight: "600",
                          }}
                        >
                          {historyType === 'crypto'
                            ? (item.tipo === 'compra' ? "+" : "-")
                            : (item.tipo === "deposito" || item.tipo === "transferencia" ? "+" : "-")}
                          ${Number(item.monto || 0).toFixed(2)}
                        </ThemedText>
                        <Text style={{ color: textColor, fontSize: 12, opacity: 0.75 }}>
                          {historyType === 'crypto'
                            ? (item.descripcion || (item.tipo === 'compra' ? 'Compra de cripto' : 'Venta de cripto'))
                            : (item.nota || "Sin descripción")}
                        </Text>
                        {(item.creado?.seconds || item.fecha?.seconds) ? (
                          <Text style={{ color: textColor, fontSize: 11, marginTop: 2, opacity: 0.55 }}>
                            {new Date((item.creado || item.fecha).seconds * 1000).toLocaleDateString("es-MX")}
                          </Text>
                        ) : null}
                      </View>
                      {historyType === 'saving' ? (
                        <TouchableOpacity
                          onPress={() => eliminarTransferenciaAhorro(item)}
                          accessibilityLabel={item.tipo === "transferencia" || item.tipo === "pasarATransacciones" ? "Eliminar transferencia" : "Eliminar movimiento"}
                          style={{ marginLeft: 10, width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#f87171" />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => eliminarCryptoMovimiento(item)}
                          accessibilityLabel="Eliminar movimiento cripto"
                          style={{ marginLeft: 10, width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#f87171" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* Modal Nuevo (reutilizable para edición básica) */}
      <Modal visible={showNuevo} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowNuevo(false)}>
          <View style={styles.modalBack}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
              <ThemedText style={{ fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
                {editando ? "Editar meta" : "Nueva meta"}
              </ThemedText>
              <ThemedText style={{ color: textColor, opacity: 0.62, fontSize: 12, marginBottom: 18 }}>
                Define un objetivo claro para darle dirección a tus ahorros.
              </ThemedText>

              <Text style={{ color: textColor, opacity: 0.72, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>DETALLES</Text>
              <TextInput
                ref={nombreInputRef}
                placeholder="Nombre de la meta"
                placeholderTextColor={textColor}
                value={nombre}
                onChangeText={setNombre}
                style={styles.input}
              />

              <TextInput
                placeholder="Objetivo en MXN (opcional)"
                placeholderTextColor={textColor}
                keyboardType="numeric"
                value={meta}
                onChangeText={setMeta}
                style={styles.input}
              />

              <TextInput
                placeholder="Descripción breve (opcional)"
                placeholderTextColor={textColor}
                value={descripcion}
                onChangeText={setDescripcion}
                style={styles.input}
              />
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, justifyContent: "space-between" }}>
                <ThemedText style={{ fontSize: 13, fontWeight: "600", marginBottom: 6 }}>
                  PLAZO
                </ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo((prev) => {
                      const next = !prev;
                      if (next) {
                        setPlazo(null);
                        setFechaLimite(null);
                      }
                      return next;
                    });
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: sinPlazo ? primaryColor : borderColor,
                    backgroundColor: sinPlazo ? primaryColor : cardsMain,
                  }}
                >
                  <Text style={{ color: iconColor, fontSize: 12, fontWeight: "600" }}>Sin plazo</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("corto");
                  }}
                  style={[
                    styles.smallBtn,
                    { flex: 1, minWidth: 0, width: undefined },
                    plazo === "corto" ? { backgroundColor: "#3edc81" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "corto" ? "black" : iconColor, textAlign: "center", fontSize: 11 }}>Corto (1 mes)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("mediano");
                  }}
                  style={[
                    styles.smallBtn,
                    { flex: 1, minWidth: 0, width: undefined },
                    plazo === "mediano" ? { backgroundColor: "#93c5fd" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "mediano" ? "black" : iconColor, textAlign: "center", fontSize: 11 }}>Mediano (1 año)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("largo");
                  }}
                  style={[
                    styles.smallBtn,
                    { flex: 1, minWidth: 0, width: undefined },
                    plazo === "largo" ? { backgroundColor: "#c084fc" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "largo" ? "black" : iconColor, textAlign: "center", fontSize: 11 }}>Largo (2 años)</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={openFechaPicker}
                disabled={sinPlazo}
                style={[
                  styles.input,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: sinPlazo ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={{ color: fechaLimite ? iconColor : textColor, opacity: fechaLimite ? 1 : 0.65 }}>
                  {sinPlazo ? "Sin plazo seleccionado" : (fechaLimite || "Fecha probable (opcional)")}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={textColor} />
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    // reset form
                    setNombre("");
                    setMeta("");
                    setDescripcion("");
                    setPlazo(null);
                    setSinPlazo(false);
                    setFechaLimite(null);
                    setShowNuevo(false);
                    setEditando(false);
                    setCantidadActual(0);
                    setSelected(null);
                  }}
                  style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}
                >
                  <Text style={{ color: iconColor, textAlign: "center" }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={guardarNuevo}
                  style={[styles.btn, { backgroundColor: primaryColor, flex: 1 }]}
                >
                  <Text style={{ color: iconColor, textAlign: "center" }}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={quickTrade.visible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setQuickTrade((prev) => ({ ...prev, visible: false }))}>
          <View style={styles.modalBack}>
            <View style={styles.modalCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <ThemedText style={{ fontSize: 20, fontWeight: '700' }}>
                  {quickTrade.holding ? `${quickTrade.mode === 'buy' ? 'Compra' : 'Venta'} rápida` : 'Transacción rápida'}
                </ThemedText>
                <TouchableOpacity onPress={() => setQuickTrade((prev) => ({ ...prev, visible: false }))}>
                  <Ionicons name="close" size={22} color={iconColor} />
                </TouchableOpacity>
              </View>

              {quickTrade.holding ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 12 }}>
                    {quickTrade.holding.icon ? (
                      <Image source={{ uri: quickTrade.holding.icon }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 10 }} />
                    ) : null}
                    <View>
                      <Text style={{ color: textColor, fontWeight: '700' }}>{quickTrade.holding.name}</Text>
                      <Text style={{ color: textColor, opacity: 0.7 }}>{quickTrade.holding.symbol}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    {(['buy', 'sell'] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setQuickTrade((prev) => ({ ...prev, mode: option }))}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: quickTrade.mode === option ? (option === 'buy' ? '#22c55e' : '#ef4444') : cardsMain,
                          marginRight: option === 'buy' ? 8 : 0,
                          borderWidth: 1,
                          borderColor: option === 'buy' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        <Text style={{ color: quickTrade.mode === option ? '#fff' : iconColor, textAlign: 'center', fontWeight: '700' }}>
                          {option === 'buy' ? 'Comprar' : 'Vender'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    {(['money', 'crypto'] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setQuickTrade((prev) => ({ ...prev, inputType: option, amount: '' }))}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: quickTrade.inputType === option ? primaryColor : cardsMain,
                          marginRight: option === 'money' ? 8 : 0,
                          borderWidth: 1,
                          borderColor: primaryColor,
                        }}
                      >
                        <Text style={{ color: quickTrade.inputType === option ? '#fff' : iconColor, textAlign: 'center', fontWeight: '700' }}>
                          {option === 'money' ? 'En dinero' : 'En cripto'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ color: textColor, opacity: 0.65, fontSize: 11, fontWeight: '700', marginBottom: 7 }}>REGISTRAR COMO</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    {(['local', 'global'] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setQuickTrade((prev) => ({ ...prev, ledger: option }))}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: quickTrade.ledger === option ? primaryColor : cardsMain,
                          marginRight: option === 'local' ? 8 : 0,
                          borderWidth: 1,
                          borderColor: primaryColor,
                        }}
                      >
                        <Text style={{ color: quickTrade.ledger === option ? '#fff' : iconColor, textAlign: 'center', fontWeight: '700' }}>
                          {option === 'local' ? 'Local' : 'Global'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    placeholder={quickTrade.inputType === 'money' ? 'Monto en MXN' : `Cantidad de ${quickTrade.holding.symbol}`}
                    placeholderTextColor={textColor}
                    keyboardType="decimal-pad"
                    value={quickTrade.amount}
                    onChangeText={(value) => setQuickTrade((prev) => ({ ...prev, amount: value }))}
                    style={styles.input}
                  />

                  <View style={{ backgroundColor: cardsMain, borderRadius: 10, padding: 10, borderWidth: 1, borderColor }}>
                    <Text style={{ color: textColor, opacity: 0.7, fontSize: 12 }}>
                      Precio actual: {formatDisplayMoney(Number(quickTrade.holding.currentPrice ?? 0))}
                    </Text>
                    <Text style={{ color: textColor, opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                      Disponible en efectivo: {formatDisplayMoney(quickTrade.balance.cash)}
                    </Text>
                    <Text style={{ color: textColor, opacity: 0.7, fontSize: 12, marginTop: 2 }}>
                      Disponible en cripto: {quickTrade.balance.crypto.toFixed(6)} {quickTrade.holding.symbol}
                    </Text>
                    <Text style={{ color: textColor, fontWeight: '700', marginTop: 8 }}>
                      {quickTrade.amount && !Number.isNaN(parseNumericInput(quickTrade.amount))
                        ? quickTrade.inputType === 'money'
                          ? `Equivale a ${(parseNumericInput(quickTrade.amount) / Number(quickTrade.holding.currentPrice ?? 1)).toFixed(6)} ${quickTrade.holding.symbol}`
                          : `Equivale a ${formatDisplayMoney(parseNumericInput(quickTrade.amount) * Number(quickTrade.holding.currentPrice ?? 0))}`
                        : 'Ingresa un valor para ver el equivalente'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity onPress={() => setQuickTrade((prev) => ({ ...prev, visible: false }))} style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}>
                      <Text style={{ color: iconColor, textAlign: 'center' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleGuardarQuickTrade} disabled={savingCryptoAction} style={[styles.btn, { backgroundColor: primaryColor, flex: 1, opacity: savingCryptoAction ? 0.65 : 1 }]}> 
                      {savingCryptoAction ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', textAlign: 'center' }}>Guardar</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        minimumDate={new Date()}
        onConfirm={handleFechaConfirm}
        onCancel={() => setDatePickerVisible(false)}
      />

      <DateTimePickerModal
        isVisible={isCryptoDatePickerVisible}
        mode="date"
        maximumDate={new Date()}
        date={cryptoFechaCompra}
        onConfirm={handleCryptoFechaConfirm}
        onCancel={() => setCryptoDatePickerVisible(false)}
      />

      {/* Modal detalle: depositar / retirar */}
      <Modal visible={showDetalle} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowDetalle(false)}>
          <View style={styles.modalBack}>
            <View style={styles.modalCard}>
              <ThemedText style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
                {selected?.nombre || "Detalle"}
              </ThemedText>

              <ThemedText style={{ color: textColor, opacity: 0.7, marginBottom: 12 }}>
                Disponible: ${fmt(selected?.cantidadActual || 0)} • Objetivo: ${fmt(selected?.meta || 0)}
              </ThemedText>

              <Text style={{ color: textColor, opacity: 0.65, fontSize: 11, fontWeight: "700", marginBottom: 7 }}>MOVIMIENTO LOCAL · SOLO AHORRO</Text>
              <View style={{ flexDirection: "row", marginBottom: 12, width: "100%", justifyContent: "space-between" }}>
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("deposito")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "deposito" ? { backgroundColor: "#3edc81" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "deposito" ? "black" : iconColor, textAlign: "center", fontSize: 12 }}>Depósito manual</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setMovimientoTipo("retiro")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "retiro" ? { backgroundColor: "#ff8b8b" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "retiro" ? "black" : iconColor, textAlign: "center", fontSize: 12 }}>Retiro manual</Text>
                </TouchableOpacity>  
              </View>

              <Text style={{ color: textColor, opacity: 0.65, fontSize: 11, fontWeight: "700", marginBottom: 7 }}>MOVIMIENTO GLOBAL · ENTRE CUENTAS</Text>
              <View style={{ flexDirection: "row", marginBottom: 8, width: "100%", justifyContent: "space-between" }}>
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("transferencia")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "transferencia" ? { backgroundColor: "#c084fc" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "transferencia" ? "black" : iconColor, textAlign: "center", fontSize: 12 }}>Desde transacciones</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("pasarATransacciones")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "pasarATransacciones" ? { backgroundColor: "#f59e0b" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "pasarATransacciones" ? "black" : iconColor, textAlign: "center" }}>
                    Hacia transacciones
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                ref={movimientoInputRef}
                placeholder="Monto"
                placeholderTextColor={textColor}
                keyboardType="numeric"
                value={movimientoMonto}
                onChangeText={setMovimientoMonto}
                style={styles.input}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setShowDetalle(false); setEditando(false); setSelected(null); }} style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}>
                  <Text style={{ color: iconColor, textAlign: "center" }}>Cerrar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={ejecutarMovimiento} style={[styles.btn, { backgroundColor: primaryColor, flex: 1 }]}>
                  <Text style={{ color: iconColor, textAlign: "center" }}>
                    {movimientoTipo === "deposito"
                      ? "Registrar depósito"
                      : movimientoTipo === "retiro"
                        ? "Registrar retiro"
                        : movimientoTipo === "transferencia"
                          ? "Transferir al ahorro"
                          : "Transferir a transacciones"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// estilos

