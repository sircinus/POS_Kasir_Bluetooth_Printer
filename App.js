import React, { useState, useEffect } from 'react';
import {
  View,
  Alert,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  connectPrinter,
  print,
  openDrawer,
  isPrinterConnected,
} from './BluetoothManager';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { PermissionsAndroid, Platform } from 'react-native';

Sound.setCategory('Playback');

const keypad = [
  ['7', '4', '1', '0'],
  ['8', '5', '2', '00'],
  ['9', '6', '3', '<'],
  ['C', '-', '+', '='],
  ['REP', 'SUB', 'CA'],
];

const formatCurrency = value => {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
};

function App() {
  const requestBluetoothPermissions = async () => {
    if (Platform.OS !== 'android') return;

    if (Platform.Version >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
    } else {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    }
  };

  useEffect(() => {
    requestBluetoothPermissions();

    loadTodayTotal();

    const interval = setInterval(async () => {
      setConnected(await isPrinterConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState(0);
  const [operator, setOperator] = useState(null);
  const [waitingForNewInput, setWaitingForNewInput] = useState(false);

  const [subtotal, setSubtotal] = useState('');
  const [payment, setPayment] = useState('');
  const [change, setChange] = useState(0);

  const [paymentMode, setPaymentMode] = useState(false);
  const [todayTotal, setTodayTotal] = useState(0);

  const [devices, setDevices] = useState([]);
  const [printing, setPrinting] = useState(false);
  const [connected, setConnected] = useState(false);

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [password, setPassword] = useState('');

  const REPORT_PASSWORD = '5678'; // Change this to your desired password

  const loadDevices = async () => {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    setDevices(bonded);
  };

  const connect = async device => {
    try {
      await connectPrinter(device);

      setDevices([]);

      Alert.alert('Printer Connected');
    } catch {
      Alert.alert('Connection Failed');
    }
  };

  const doPrintDailyReport = async () => {
    const now = new Date();

    let report = '';

    report += '\x1B\x61\x01';
    report += 'DAILY REPORT\n\n';

    report += '\x1B\x61\x00';

    report += `Date : ${now.toLocaleDateString('id-ID')}\n`;
    report += `Time : ${now.toLocaleTimeString('id-ID')}\n`;

    report += '------------------------------\n';

    report += `TOTAL SALES\n`;
    report += `Rp ${todayTotal.toLocaleString('id-ID')}\n`;

    report += '------------------------------\n\n\n';

    await print(report);
    await openDrawer();
    await resetTodayTotal();
  };

  const verifyPasswordAndPrint = async () => {
    if (password !== REPORT_PASSWORD) {
      Alert.alert(
        'Incorrect Password',
        'The password you entered is incorrect.',
      );
      return;
    }

    setPasswordModalVisible(false);

    try {
      await doPrintDailyReport();
    } catch (e) {
      Alert.alert('Print Failed', 'Report could not be printed.');
    }
  };

  const printDailyReport = () => {
    if (todayTotal === 0) {
      Alert.alert('No Sales', 'There are no sales to print today.');
      return;
    }

    Alert.alert(
      'Print Daily Report',
      `Print today's report?\n\nTotal Sales: Rp ${todayTotal.toLocaleString(
        'id-ID',
      )}\n\nToday's total will be reset after printing.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Print',
          onPress: () => {
            setPassword('');
            setPasswordModalVisible(true);
          },
        },
      ],
      { cancelable: true },
    );
  };

  const printReceipt = async balance => {
    const now = new Date();

    let receipt = '';

    receipt += '\x1B\x61\x01';
    receipt += 'PINANG MODE\n';
    receipt += 'SALES RECEIPT\n\n';

    receipt += '\x1B\x61\x00';

    receipt += `Date : ${now.toLocaleDateString('id-ID')}\n`;
    receipt += `Time : ${now.toLocaleTimeString('id-ID')}\n`;
    receipt += '------------------------------\n';

    receipt += `TOTAL  : Rp ${Number(subtotal).toLocaleString('id-ID')}\n`;
    receipt += `CASH   : Rp ${Number(payment).toLocaleString('id-ID')}\n`;
    receipt += `CHANGE : Rp ${balance.toLocaleString('id-ID')}\n`;

    receipt += '------------------------------\n';
    receipt += '\nThank you!\n\n\n';

    await print(receipt);
    await openDrawer();
  };

  const handleKeyPress = async key => {
    playKeypadBeep();
    switch (key) {
      case '<':
        if (paymentMode) {
          setPayment(prev => prev.slice(0, -1));
        } else {
          setAmount(prev => prev.slice(0, -1));
        }
        break;
      case 'C':
        if (paymentMode) {
          resetTransaction(); // start a completely new sale
        } else {
          setAmount('');
          setTotal(0);
          setOperator(null);
        }
        break;

      case 'REP':
        printDailyReport();
        break;

      case 'SUB':
        {
          if (amount === '') return;

          const value = Number(amount || 0);
          let result = value;

          if (operator === '+') {
            result = total + value;
          } else if (operator === '-') {
            result = total - value;
          }

          setAmount(result.toString()); // Update display
          setSubtotal(result.toString()); // Use calculated subtotal

          setPayment('');
          setChange(0);

          setTotal(0);
          setOperator(null);
          setWaitingForNewInput(false);

          setPaymentMode(true);
          break;
        }
        if (amount === '') return;

        setSubtotal(amount);
        setPayment('');
        setChange(0);
        setPaymentMode(true);
        break;

      case '+':
      case '-': {
        if (waitingForNewInput) {
          setOperator(key);
          break;
        }

        const value = Number(amount || 0);

        if (operator === null) {
          setTotal(value);
        } else if (operator === '+') {
          setTotal(prev => prev + value);
        } else if (operator === '-') {
          setTotal(prev => prev - value);
        }

        setOperator(key);
        setWaitingForNewInput(true);
        break;
      }

      case '=': {
        const value = Number(amount || 0);
        let result = total;

        if (operator === '+') {
          result = total + value;
        } else if (operator === '-') {
          result = total - value;
        } else {
          result = value;
        }

        setAmount(result.toString());
        setTotal(0);
        setOperator(null);
        setWaitingForNewInput(false);
        break;
      }

      case 'CA': {
        if (payment === '') {
          Alert.alert('Enter payment amount');
          return;
        }

        if (!paymentMode) return;

        const subtotalAmount = Number(subtotal);
        const paid = Number(payment);

        if (paid < subtotalAmount) {
          Alert.alert('Insufficient payment');
          return;
        }

        const balance = paid - subtotalAmount;
        setChange(balance);

        if (printing) return;
        setPrinting(true);

        try {
          await printReceipt(balance);

          const newTodayTotal = todayTotal + subtotalAmount;
          setTodayTotal(newTodayTotal);
          await saveTodayTotal(newTodayTotal);

          Alert.alert(
            'Transaction Complete',
            `Change: Rp ${balance.toLocaleString('id-ID')}`,
          );

          resetTransaction();
        } catch (e) {
          Alert.alert(
            'Print Failed',
            e.message || 'Receipt could not be printed.',
          );
        } finally {
          setPrinting(false);
        }
        break;
      }
      default:
        if (paymentMode) {
          // Edit payment
          if (payment === '' && (key === '0' || key === '00')) return;

          setPayment(prev => prev + key);
        } else {
          // Edit amount
          if (amount === '' && (key === '0' || key === '00')) return;

          if (waitingForNewInput) {
            setAmount(key === '00' ? '0' : key);
            setWaitingForNewInput(false);
          } else {
            setAmount(prev => prev + key);
          }
        }
        break;
    }
  };

  const saveTodayTotal = async value => {
    try {
      await AsyncStorage.setItem('todayTotal', value.toString());
    } catch (e) {
      console.log(e);
    }
  };

  const loadTodayTotal = async () => {
    try {
      const value = await AsyncStorage.getItem('todayTotal');

      if (value !== null) {
        setTodayTotal(Number(value));
      }
    } catch (e) {
      console.log(e);
    }
  };

  const resetTodayTotal = async () => {
    setTodayTotal(0);

    try {
      await AsyncStorage.setItem('todayTotal', '0');
    } catch (e) {
      console.log(e);
    }
  };

  const playKeypadBeep = () => {
    const sound = new Sound('keypadbeep.mp3', Sound.MAIN_BUNDLE, error => {
      if (!error) {
        sound.play(() => {
          sound.release();
        });
      }
    });
  };

  const resetTransaction = () => {
    setAmount('');
    setSubtotal('');
    setPayment('');
    setChange(0);

    setOperator(null);
    setTotal(0);
    setWaitingForNewInput(false);

    setPaymentMode(false);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.LeftContainer}>
          <View style={styles.allNumberContainer}>
            <View style={styles.AmountContainer}>
              <Text style={styles.AmountNumber}>{formatCurrency(amount)}</Text>
            </View>

            {paymentMode && (
              <>
                <View style={styles.cashGivenContainer}>
                  <Text style={styles.cashGivenText}>
                    Payment: {formatCurrency(payment)}
                  </Text>
                </View>

                <View style={styles.changeContainer}>
                  <Text style={styles.changeText}>
                    Change: {formatCurrency(change)}
                  </Text>
                </View>
              </>
            )}
          </View>
          <ScrollView>
            <View style={styles.featureContainer}>
              <TouchableOpacity
                style={styles.featureButtons}
                onPress={loadDevices}
              >
                <Text style={styles.featureText}>Connect Printer</Text>
              </TouchableOpacity>
              {devices.map(device => (
                <TouchableOpacity
                  key={device.address}
                  style={styles.deviceList}
                  onPress={() => connect(device)}
                >
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceAddress}>{device.address}</Text>
                </TouchableOpacity>
              ))}
              <Text style={{ color: connected ? 'lime' : 'red' }}>
                {connected ? 'Printer Connected' : 'Printer Not Connected'}
              </Text>
            </View>
          </ScrollView>
        </View>

        <Modal visible={passwordModalVisible} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          >
            <View
              style={{
                width: '85%',
                backgroundColor: 'white',
                borderRadius: 10,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  marginBottom: 15,
                }}
              >
                Enter Password
              </Text>

              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoFocus
                style={{
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  marginBottom: 20,
                }}
              />

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setPasswordModalVisible(false);
                    setPassword('');
                  }}
                  style={{ marginRight: 15 }}
                >
                  <Text>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={verifyPasswordAndPrint}>
                  <Text
                    style={{
                      color: 'blue',
                      fontWeight: 'bold',
                    }}
                  >
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.KeypadContainer}>
          {keypad.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.KeypadRow}>
              {row.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.KeypadButton,
                    key === 'C' && styles.ClearButton,
                    key === 'CA' && styles.CashDrawerButton,
                    key === 'SUB' && styles.SubTotalButton,
                    key === 'REP' && styles.ClearButton,
                  ]}
                  onPress={() => handleKeyPress(key)}
                >
                  <Text
                    style={[
                      styles.KeypadNumber,
                      key === 'CA' && styles.CashDrawerText,
                      key === 'SUB' && styles.CashDrawerText,
                    ]}
                  >
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  KeypadNumber: {
    color: '#000',
    fontSize: 40,
    textAlign: 'center',
  },
  KeypadRow: {
    flexDirection: 'column',
    gap: 10,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  LeftContainer: {
    backgroundColor: 'black',
    width: '45%',
    padding: 20,
    justifyContent: 'space-between',
  },
  AmountNumber: {
    textAlign: 'right',
    fontSize: 40,
  },
  KeypadContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: '55%',
    padding: 10,
    backgroundColor: 'black',
    flexDirection: 'row',
  },
  KeypadButton: {
    marginHorizontal: 5,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderColor: 'grey',
    borderWidth: 2,
    borderRadius: 5,
  },
  AmountContainer: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 10,
  },
  featureButtons: {
    backgroundColor: 'tomato',
    marginTop: 10,
    borderRadius: 5,
    padding: 5,
    width: '70%',
  },
  featureText: {
    fontSize: 16,
    textAlign: 'center',
  },
  OperatorButton: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },

  ClearButton: {
    backgroundColor: '#FFEBEE',
    borderColor: '#C62828',
  },

  CashDrawerButton: {
    backgroundColor: 'orange',
    borderColor: 'white',
  },
  OperatorText: {
    fontSize: 20,
  },
  ClearText: {
    fontSize: 20,
  },

  CashDrawerText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
  },
  cashGivenContainer: {
    backgroundColor: 'springgreen',
    marginTop: 10,
    borderRadius: 5,
    padding: 10,
  },
  changeContainer: {
    backgroundColor: 'orange',
    marginVertical: 10,
    borderRadius: 5,
    padding: 10,
  },
  cashGivenText: {
    fontSize: 24,
  },
  changeText: {
    fontSize: 24,
  },
  SubTotalButton: {
    backgroundColor: 'green',
    borderColor: 'white',
  },
  deviceList: {
    backgroundColor: '#666',
    padding: 10,
    marginTop: 5,
    borderRadius: 5,
  },
  deviceName: {
    color: 'white',
    fontSize: 18,
  },
  deviceAddress: {
    color: '#ccc',
    fontSize: 12,
  },
});

export default App;
