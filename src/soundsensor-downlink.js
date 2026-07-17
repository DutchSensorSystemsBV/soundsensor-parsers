const SETTINGS_RESPONSE = 0x02;

export function parseSettingsPayload(hexPayload) {
  const payload = hexToBytes(hexPayload);
  if (payload.length !== 14) {
    throw new Error("Settings payload must contain exactly 14 bytes.");
  }

  const messageType = payload[0] >> 6;
  if (messageType !== SETTINGS_RESPONSE) {
    throw new Error(`Unsupported message type: ${messageType}. This parser expects a settings response payload.`);
  }

  return {
    transmitInterval: readUInt32(payload, 1),
    sampleCount: payload[5],
    correction: ((payload[6] & 127) - (payload[6] & 128)) / 10,
    useDBAf: (payload[7] & 0x80) !== 0,
    useDBAs: (payload[7] & 0x40) !== 0,
    useDBCf: (payload[7] & 0x20) !== 0,
    useDBCs: (payload[7] & 0x10) !== 0,
    useLeqA: (payload[7] & 0x08) !== 0,
    useLeqC: (payload[7] & 0x04) !== 0,
    usePositivePeakHoldA: (payload[7] & 0x02) !== 0,
    usePositivePeakHoldC: (payload[7] & 0x01) !== 0,
    useNegativePeakHoldA: (payload[8] & 0x80) !== 0,
    useNegativePeakHoldC: (payload[8] & 0x40) !== 0,
    useBat: (payload[8] & 0x20) !== 0,
    useFirstTimestamp: (payload[8] & 0x10) !== 0,
    useLastTimestamp: (payload[8] & 0x08) !== 0,
    useMsgInfo: (payload[8] & 0x04) !== 0,
    enableLed: (payload[8] & 0x02) !== 0,
    enableHeadphone: (payload[8] & 0x01) !== 0,
    gpsMode: payload[9],
    gpsInterval: readUInt32(payload, 10)
  };
}

export function composeSettingsPayload(settings) {
  validateSettings(settings);

  const correction = Math.round(settings.correction * 10);
  const payload = new Uint8Array(14);

  payload[0] = 0x02;
  writeUInt32(payload, 1, settings.transmitInterval);
  payload[5] = settings.sampleCount;
  payload[6] = (correction & 127) - (correction & 128);
  payload[7] =
    boolBit(settings.useDBAf, 7) |
    boolBit(settings.useDBAs, 6) |
    boolBit(settings.useDBCf, 5) |
    boolBit(settings.useDBCs, 4) |
    boolBit(settings.useLeqA, 3) |
    boolBit(settings.useLeqC, 2) |
    boolBit(settings.usePositivePeakHoldA, 1) |
    boolBit(settings.usePositivePeakHoldC, 0);
  payload[8] =
    boolBit(settings.useNegativePeakHoldA, 7) |
    boolBit(settings.useNegativePeakHoldC, 6) |
    boolBit(settings.useBat, 5) |
    boolBit(settings.useFirstTimestamp, 4) |
    boolBit(settings.useLastTimestamp, 3) |
    boolBit(settings.useMsgInfo, 2) |
    boolBit(settings.enableLed, 1) |
    boolBit(settings.enableHeadphone, 0);
  payload[9] = settings.gpsMode;
  writeUInt32(payload, 10, settings.gpsInterval);

  return bytesToHex(payload);
}

export function calculateSettingsCrc(settings) {
  const settingsPayload = hexToBytes(composeSettingsPayload(settings));
  return calculateCrc(settingsPayload.slice(1));
}

export function validateAckPayload(hexAckPayload, settings) {
  const payload = hexToBytes(hexAckPayload);
  if (payload.length !== 3 || payload[0] !== 0xc0) {
    throw new Error("ACK payload must contain message type 0xC0 followed by two CRC bytes.");
  }

  const receivedCrc = (payload[1] << 8) | payload[2];
  const calculatedCrc = calculateSettingsCrc(settings);

  return {
    valid: receivedCrc === calculatedCrc,
    receivedCrc,
    calculatedCrc
  };
}

export function calculateCrc(bytes) {
  let crc = 0xffff;
  for (const value of bytes) {
    crc = crcUpdate(crc, value);
  }

  return crc & 0xffff;
}

export function hexToBytes(hex) {
  const normalized = String(hex).trim();
  if (!/^[0-9a-fA-F]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Payload must be an even-length hexadecimal string.");
  }

  const bytes = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(parseInt(normalized.slice(index, index + 2), 16));
  }

  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function validateSettings(settings) {
  if (!Number.isInteger(settings.transmitInterval) || settings.transmitInterval < 60000 || settings.transmitInterval > 3600000) {
    throw new Error("transmitInterval must be an integer between 60000 and 3600000 milliseconds.");
  }
  if (!Number.isInteger(settings.sampleCount) || settings.sampleCount < 1 || settings.sampleCount > 255) {
    throw new Error("sampleCount must be an integer between 1 and 255.");
  }
  if (!Number.isFinite(settings.correction) || settings.correction < -6 || settings.correction > 6) {
    throw new Error("correction must be between -6.0 and 6.0.");
  }
  if (![0, 1, 2].includes(settings.gpsMode)) {
    throw new Error("gpsMode must be 0 (OFF), 1 (ONCE), or 2 (INTERVAL).");
  }
  if (!Number.isInteger(settings.gpsInterval) || settings.gpsInterval < 3600000 || settings.gpsInterval > 43200000) {
    throw new Error("gpsInterval must be an integer between 3600000 and 43200000 milliseconds.");
  }
}

function readUInt32(payload, index) {
  return (
    payload[index] * 0x1000000 +
    (payload[index + 1] << 16) +
    (payload[index + 2] << 8) +
    payload[index + 3]
  );
}

function writeUInt32(payload, index, value) {
  payload[index] = (value >>> 24) & 0xff;
  payload[index + 1] = (value >>> 16) & 0xff;
  payload[index + 2] = (value >>> 8) & 0xff;
  payload[index + 3] = value & 0xff;
}

function boolBit(value, shift) {
  return value ? 1 << shift : 0;
}

function crcUpdate(crc, data) {
  crc = crc ^ (data << 8);

  for (let index = 0; index < 8; index++) {
    if (crc & 0x8000) {
      crc = (crc << 1) ^ 0x8005;
    } else {
      crc <<= 1;
    }
  }

  return crc;
}
