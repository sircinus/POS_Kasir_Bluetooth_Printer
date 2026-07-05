import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

let printer = null;

export const connectPrinter = async device => {
  printer = await RNBluetoothClassic.connectToDevice(device.address);

  await AsyncStorage.setItem('printerAddress', device.address);

  return true;
};

export const autoConnect = async () => {
  try {
    if (printer) {
      const connected = await printer.isConnected();

      if (connected) {
        return true;
      }

      printer = null;
    }

    const address = await AsyncStorage.getItem('printerAddress');

    if (!address) return false;

    printer = await RNBluetoothClassic.connectToDevice(address);

    return true;
  } catch (e) {
    printer = null;
    return false;
  }
};

export const isPrinterConnected = async () => {
  try {
    if (!printer) return false;

    return await printer.isConnected();
  } catch {
    printer = null;
    return false;
  }
};

export const print = async text => {
  const ok = await autoConnect();

  if (!ok) {
    throw new Error('Printer not connected');
  }

  await printer.write(text);
};

export const openDrawer = async () => {
  const ok = await autoConnect();

  if (!ok) {
    throw new Error('Printer not connected');
  }

  await printer.write('\x1Bp\x00\x19\xFA');
};

export const disconnectPrinter = async () => {
  try {
    if (printer) {
      await printer.disconnect();
    }
  } catch {}

  printer = null;
};
