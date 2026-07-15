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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  connectPrinter,
  print,
  openDrawer,
  isPrinterConnected,
} from './BluetoothManager';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { PermissionsAndroid, Platform } from 'react-native';

const keypad = [
  ['7', '4', '1', '0'],
  ['8', '5', '2', '00'],
  ['9', '6', '3', '<'],
  ['C', '-', '+', '='],
  ['SUB', 'CA'],
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
  const [showPrinterList, setShowPrinterList] = useState(false);

  const REPORT_PASSWORD = '1234';

  const getPreviewTotal = () => {
    if (paymentMode) {
      return formatCurrency(subtotal);
    }

    if (amount === '') {
      return formatCurrency(0);
    }

    const value = Number(amount || 0);

    if (operator === null) {
      return formatCurrency(value);
    }

    if (waitingForNewInput) {
      // User has pressed + or -, waiting for next number
      return formatCurrency(total);
    }

    const result = operator === '+' ? total + value : total - value;

    return formatCurrency(result);
  };

  const loadDevices = async () => {
    if (showPrinterList) {
      setShowPrinterList(false);
      return;
    }

    const bonded = await RNBluetoothClassic.getBondedDevices();
    setDevices(bonded);
    setShowPrinterList(true);
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

    report += '\x1B\x40'; // Initialize
    report += '\n\n\n';
    report += '\x1B\x61\x01'; // Center
    report += '\x1B\x45\x01'; // Bold ON
    report += '\x1D\x21\x11'; // Double width & height

    report += 'PINANG MODE\n';

    report += '\x1D\x21\x00'; // Normal size
    report += 'JAM TANGAN & ACCESSORIES\n\n';

    report += '\x1B\x45\x00'; // Bold OFF
    report += '\x1B\x61\x00'; // Left align

    report += '\x1B\x61\x00';

    report += `Date : ${now.toLocaleDateString('id-ID')}\n`;
    report += `Time : ${now.toLocaleTimeString('id-ID')}\n`;

    report += '--------------------------------\n';

    report += `TOTAL DAILY SALES\n`;
    report += `Rp ${todayTotal.toLocaleString('id-ID')}\n`;

    report += '--------------------------------\n\n\n\n\n';

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
      Alert.alert('Print Failed');
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

    receipt += '\x1B\x40'; // Initialize
    receipt += '\n\n\n';
    receipt += '\x1B\x61\x01'; // Center
    receipt += '\x1B\x45\x01'; // Bold ON
    receipt += '\x1D\x21\x11'; // Double width & height

    receipt += 'PINANG MODE\n';

    receipt += '\x1D\x21\x00'; // Normal size
    receipt += 'JAM TANGAN & ACCESSORIES\n\n';

    receipt += '\x1B\x45\x00'; // Bold OFF
    receipt += '\x1B\x61\x00'; // Left align

    receipt += '\x1B\x61\x00';
    receipt += `Date : ${now.toLocaleDateString('id-ID')}\n`;
    receipt += `Time : ${now.toLocaleTimeString('id-ID')}\n`;
    receipt += '--------------------------------\n';

    receipt += `TOTAL  : Rp ${Number(subtotal).toLocaleString('id-ID')}\n`;
    receipt += `CASH   : Rp ${Number(payment).toLocaleString('id-ID')}\n`;
    receipt += `CHANGE : Rp ${balance.toLocaleString('id-ID')}\n`;

    receipt += '--------------------------------\n';
    receipt += '\x1B\x61\x01';
    receipt += '\nThank you!\n\n\n\n\n';

    await print(receipt);
    await openDrawer();
  };

  const handleKeyPress = async key => {
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
        // User pressed "=" immediately after "+" or "-"
        if (waitingForNewInput) {
          setOperator(null);
          setTotal(0);
          setWaitingForNewInput(false);

          break;
        }

        // Already evaluated once
        if (operator === null) {
          break;
        }

        const value = Number(amount || 0);
        let result = total;

        if (operator === '+') {
          result = total + value;
        } else if (operator === '-') {
          result = total - value;
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

          Alert.alert(`Change: Rp ${balance.toLocaleString('id-ID')}`);

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
            <View style={styles.previewContainer}>
              <Text style={styles.previewText}>{getPreviewTotal()}</Text>
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

          <View style={styles.bottomLeftContainer}>
            <View style={styles.printDailyReportContainer}>
              <TouchableOpacity onPress={printDailyReport}>
                <Text style={styles.printDailyReportText}>
                  Print Daily Report
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.featureContainer}>
              <TouchableOpacity onPress={loadDevices}>
                <Text
                  style={[
                    styles.printerDeviceText,
                    { backgroundColor: connected ? 'lime' : 'red' },
                  ]}
                >
                  Connect To Printer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Modal visible={passwordModalVisible} transparent animationType="fade">
          <View style={styles.modalBackground}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitleText}>Enter Password</Text>

              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoFocus
                style={styles.modalTextInput}
              />

              <View style={styles.modalBottomLayout}>
                <TouchableOpacity
                  onPress={() => {
                    setPasswordModalVisible(false);
                    setPassword('');
                  }}
                >
                  <Text>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={verifyPasswordAndPrint}>
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showPrinterList} transparent animationType="fade">
          <View style={styles.modalBackground}>
            <View style={styles.printerModalContainer}>
              <Text style={styles.modalTitleText}>Select Printer</Text>

              <ScrollView>
                {devices.map(device => (
                  <TouchableOpacity
                    key={device.address}
                    style={styles.deviceList}
                    onPress={() => {
                      connect(device);
                      setShowPrinterList(false);
                    }}
                  >
                    <Text style={styles.deviceName}>{device.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowPrinterList(false)}
              >
                <Text>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.KeypadContainer}>
          {keypad.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                styles.KeypadRow,
                rowIndex === keypad.length - 1 && { marginTop: 'auto' },
              ]}
            >
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
    gap: '3%',
    marginHorizontal: '1%',
  },
  container: {
    flexDirection: 'row',
  },
  LeftContainer: {
    backgroundColor: 'black',
    width: '50%',
    padding: '1%',
  },
  AmountNumber: {
    textAlign: 'right',
    fontSize: 50,
  },
  KeypadContainer: {
    justifyContent: 'center',
    width: '50%',
    padding: '1%',
    backgroundColor: 'black',
    flexDirection: 'row',
  },
  KeypadButton: {
    minWidth: '18%',
    height: '23%',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderColor: 'grey',
    padding: '2%',
    borderWidth: 2,
    borderRadius: 5,
  },
  AmountContainer: {
    backgroundColor: 'white',
    padding: '3%',
    borderRadius: 10,
  },
  bottomLeftContainer: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    position: 'absolute',
    left: '2%',
    bottom: '1%',
    width: '100%',
    padding: '2%',
    borderRadius: 5,
    alignItems: 'center',
  },
  featureButtons: {
    backgroundColor: 'tomato',
    marginTop: '3%',
    borderRadius: 5,
    padding: '2%',
    width: '50%',
  },
  featureText: {
    fontSize: 24,
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
    width: '100%',
    marginBottom: '-5%',
  },
  CashDrawerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  cashGivenContainer: {
    backgroundColor: 'springgreen',
    marginVertical: '2%',
    borderRadius: 5,
    padding: '2%',
  },
  changeContainer: {
    backgroundColor: 'orange',
    borderRadius: 5,
    padding: '2%',
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
    padding: '2%',
    marginTop: '2%',
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
  printDailyReportContainer: {
    backgroundColor: 'cornflowerblue',
    borderRadius: 5,
    padding: '2%',
    width: '48%',
  },
  printDailyReportText: {
    textAlign: 'center',
    fontSize: 20,
    color: 'white',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '30%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitleText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: 'black',
  },
  modalBottomLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalConfirmText: {
    color: 'blue',
    fontWeight: 'bold',
  },
  featureContainer: {
    width: '48%',
    borderRadius: 5,
  },
  printerModalContainer: {
    width: '65%',
    height: '70%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  deviceList: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    marginTop: 15,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#eee',
    borderRadius: 8,
  },
  printerDeviceText: {
    color: 'white',
    fontSize: 20,
    textAlign: 'center',
    verticalAlign: 'middle',
    padding: '3%',
    height: '100%',
    borderRadius: 5,
  },
  allNumberContainer: {
    height: '75%',
    gap: '1%',
  },
  previewContainer: {
    backgroundColor: 'gray',
    height: '20%',
    alignItems: 'flex-end',
    borderRadius: 10,
    padding: '3%',
  },
  previewText: {
    fontSize: 24,
    color: 'white',
  },
});

export default App;
