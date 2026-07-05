import RNBluetoothClassic from 'react-native-bluetooth-classic';

let printer = null;

export const connectPrinter = async () => {
  const devices = await RNBluetoothClassic.getBondedDevices();

  const device = devices.find(d => d.name.includes('POS'));

  if (!device) {
    throw new Error('Printer not found');
  }

  printer = await RNBluetoothClassic.connectToDevice(device.address);

  return printer;
};

export const disconnectPrinter = async () => {
  if (printer) {
    await printer.disconnect();
    printer = null;
  }
};

export const print = async (printer, text) => {
  if (!printer) throw new Error('Printer not connected');

  try {
    await printer.write(text);
  } catch (e) {
    console.log(e);
    throw e;
  }
};

export const openDrawer = async printer => {
  if (!printer) return;

  await printer.write('\x1Bp\x00\x19\xFA');
};
