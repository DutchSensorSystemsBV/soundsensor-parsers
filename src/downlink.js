const MESSAGE_TYPE_SETTINGS_DOWNLINK = 0x02;
const MESSAGE_TYPE_SETTINGS_RESPONSE = 0x02;
const MESSAGE_TYPE_ACK = 0xc0;
const CRC_INITIAL_VALUE = 0xffff;
const CRC_POLYNOMIAL = 0x8005;

export const GPS_MODES = Object.freeze({
  OFF: 0,
  ONCE: 1,
  INTERVAL: 2
});

export function parseSettingsPayload(input) {
  const payload = normalizePayloadInput(input);

  if (payload.length !== 14) {
    throw new Error("Settings payload must contain exactly 14 bytes.");
  }

  const messageType = payload[0] >> 6;
  if (messageType !== MESSAGE_TYPE_SETTINGS_RESPONSE) {
    throw new Error(
      `Unsupported message type: ${messageType}. This parser expects a settings response payload.`
    );
  }

  return {
    transmitInterval: readUInt32(payload, 1),
    sampleCount: payload[5],
    correction: decodeSignedDecimal(payload[6]),
    useDBAf: hasBit(payload[7], 7),
    useDBAs: hasBit(payload[7], 6),
    useDBCf: hasBit(payload[7], 5),
    useDBCs: hasBit(payload[7], 4),
    useLeqA: hasBit(payload[7], 3),
    useLeqC: hasBit(payload[7], 2),
    usePositivePeakHoldA: hasBit(payload[7], 1),
    usePositivePeakHoldC: hasBit(payload[7], 0),
    useNegativePeakHoldA: hasBit(payload[8], 7),
    useNegativePeakHoldC: hasBit(payload[8], 6),
    useBat: hasBit(payload[8], 5),
    useFirstTimestamp: hasBit(payload[8], 4),
    useLastTimestamp: hasBit(payload[8], 3),
    useMsgInfo: hasBit(payload[8], 2),
    enableLed: hasBit(payload[8], 1),
    enableHeadphone: hasBit(payload[8], 0),
    gpsMode: payload[9],
    gpsInterval: readUInt32(payload, 10)
  };
}

export function composeSettingsPayload(settings) {
  validateSettings(settings);

  const payload = new Uint8Array(14);

  payload[0] = MESSAGE_TYPE_SETTINGS_DOWNLINK;
  writeUInt32(payload, 1, settings.transmitInterval);
  payload[5] = settings.sampleCount;
  payload[6] = encodeSignedDecimal(settings.correction);
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

export function composeSettingsRequestPayload() {
  return "04";
}

export function calculateSettingsCrc(settings) {
  const settingsPayload = hexToBytes(composeSettingsPayload(settings));

  return calculateCrc(settingsPayload.slice(1));
}

export function validateAckPayload(ackPayload, settings) {
  const payload = normalizePayloadInput(ackPayload);

  if (payload.length !== 3 || payload[0] !== MESSAGE_TYPE_ACK) {
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
  let crc = CRC_INITIAL_VALUE;

  for (const value of bytes) {
    crc = updateCrc(crc, value);
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
  if (![GPS_MODES.OFF, GPS_MODES.ONCE, GPS_MODES.INTERVAL].includes(settings.gpsMode)) {
    throw new Error("gpsMode must be 0 (OFF), 1 (ONCE), or 2 (INTERVAL).");
  }
  if (!Number.isInteger(settings.gpsInterval) || settings.gpsInterval < 3600000 || settings.gpsInterval > 43200000) {
    throw new Error("gpsInterval must be an integer between 3600000 and 43200000 milliseconds.");
  }
}

function normalizePayloadInput(input) {
  return typeof input === "string" ? hexToBytes(input) : Array.from(input);
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

function decodeSignedDecimal(value) {
  return ((value & 127) - (value & 128)) / 10;
}

function encodeSignedDecimal(value) {
  const scaledValue = Math.round(value * 10);

  return (scaledValue & 127) - (scaledValue & 128);
}

function hasBit(value, shift) {
  return (value & (1 << shift)) !== 0;
}

function boolBit(value, shift) {
  return value ? 1 << shift : 0;
}

function updateCrc(crc, data) {
  crc ^= data << 8;

  for (let index = 0; index < 8; index++) {
    crc = crc & 0x8000
      ? (crc << 1) ^ CRC_POLYNOMIAL
      : crc << 1;
  }

  return crc;
}
