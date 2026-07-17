const MESSAGE_TYPE_MEASUREMENT_WITH_DESCRIPTION = 0x01;
const LOCATION_SCALE = 10000000;
const MEASUREMENT_OFFSET = 30;
const MEASUREMENT_SCALE = 10;

export const UPLINK_MESSAGE_TYPES = Object.freeze({
  MEASUREMENT_WITHOUT_DESCRIPTION: 0x00,
  MEASUREMENT_WITH_DESCRIPTION: MESSAGE_TYPE_MEASUREMENT_WITH_DESCRIPTION,
  SETTINGS_RESPONSE: 0x02,
  ACK: 0x03
});

export function decodeUplink(input, options = {}) {
  const payload = normalizePayloadInput(input);
  const messageType = getMessageType(payload);

  if (messageType !== MESSAGE_TYPE_MEASUREMENT_WITH_DESCRIPTION) {
    throw new Error(
      `Unsupported uplink message type: ${messageType}. This decoder expects measurement payloads with description.`
    );
  }

  return parseMeasurementWithDescription(payload, options);
}

export function parseMeasurementPayload(hexPayload, options = {}) {
  return decodeUplink(hexPayload, options);
}

export function getMessageType(input) {
  const payload = normalizePayloadInput(input);
  assertMinimumLength(payload, 1, "Payload");

  return payload[0] >> 6;
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

function parseMeasurementWithDescription(payload, options) {
  assertMinimumLength(payload, 2, "Measurement payload");

  const reader = createMeasurementReader();
  const descriptor = readPayloadDescriptor(payload);
  const sampleDataEndIndex = getSampleDataEndIndex(payload.length, descriptor);
  const fieldsPerSample = countSetBits(descriptor.measurementMask);
  const bitsPerSample = fieldsPerSample * 10;

  if (bitsPerSample === 0) {
    throw new Error("Payload description does not contain measurement fields.");
  }

  const sampleBitCount = (sampleDataEndIndex - 2) * 8;
  const sampleCount = Math.floor(sampleBitCount / bitsPerSample);

  reader.payloadIndex = sampleDataEndIndex;

  const battery = descriptor.useBattery
    ? formatDecimal(payload[reader.payloadIndex++] / MEASUREMENT_SCALE)
    : null;
  const location = readLocation(payload, reader, descriptor, options.location);
  const timing = readTiming(payload, reader, descriptor, sampleCount, options.receivedTimestamp);

  reader.payloadIndex = 2;

  return Array.from({ length: sampleCount }, (_, sampleIndex) =>
    readMeasurementSample(payload, reader, descriptor, {
      devEUI: options.devEUI ?? null,
      battery,
      location,
      timestamp: addSeconds(timing.timestamp, sampleIndex * timing.sampleIntervalSeconds)
    })
  );
}

function readPayloadDescriptor(payload) {
  const info = (payload[0] << 8) | payload[1];

  return {
    raw: info,
    measurementMask: info & 0x3ff0,
    useDBAf: (info & 0x2000) !== 0,
    useDBAs: (info & 0x1000) !== 0,
    useDBCf: (info & 0x0800) !== 0,
    useDBCs: (info & 0x0400) !== 0,
    useLeqA: (info & 0x0200) !== 0,
    useLeqC: (info & 0x0100) !== 0,
    usePositivePeakHoldA: (info & 0x0080) !== 0,
    usePositivePeakHoldC: (info & 0x0040) !== 0,
    useNegativePeakHoldA: (info & 0x0020) !== 0,
    useNegativePeakHoldC: (info & 0x0010) !== 0,
    useBattery: (info & 0x0008) !== 0,
    useLocation: (info & 0x0004) !== 0,
    useFirstTimestamp: (info & 0x0002) !== 0,
    useLastTimestamp: (info & 0x0001) !== 0
  };
}

function getSampleDataEndIndex(payloadLength, descriptor) {
  let endIndex = payloadLength;

  if (descriptor.useBattery) {
    endIndex -= 1;
  }
  if (descriptor.useLocation) {
    endIndex -= 8;
  }
  if (descriptor.useFirstTimestamp) {
    endIndex -= 2;
  }
  if (descriptor.useLastTimestamp) {
    endIndex -= 2;
  }

  if (endIndex < 2) {
    throw new Error("Payload is too short for the described metadata fields.");
  }

  return endIndex;
}

function readMeasurementSample(payload, reader, descriptor, metadata) {
  const sample = {
    devEUI: metadata.devEUI,
    dBAf: null,
    dBAs: null,
    dBCf: null,
    dBCs: null,
    leqA: null,
    leqC: null,
    positivePeakHoldA: null,
    positivePeakHoldC: null,
    negativePeakHoldA: null,
    negativePeakHoldC: null,
    bat: metadata.battery,
    latitude: metadata.location.latitude,
    longitude: metadata.location.longitude,
    timestamp: metadata.timestamp
  };

  if (descriptor.useDBAf) {
    sample.dBAf = readMeasurement(payload, reader);
  }
  if (descriptor.useDBAs) {
    sample.dBAs = readMeasurement(payload, reader);
  }
  if (descriptor.useDBCf) {
    sample.dBCf = readMeasurement(payload, reader);
  }
  if (descriptor.useDBCs) {
    sample.dBCs = readMeasurement(payload, reader);
  }
  if (descriptor.useLeqA) {
    sample.leqA = readMeasurement(payload, reader);
  }
  if (descriptor.useLeqC) {
    sample.leqC = readMeasurement(payload, reader);
  }
  if (descriptor.usePositivePeakHoldA) {
    sample.positivePeakHoldA = readMeasurement(payload, reader);
  }
  if (descriptor.usePositivePeakHoldC) {
    sample.positivePeakHoldC = readMeasurement(payload, reader);
  }
  if (descriptor.useNegativePeakHoldA) {
    sample.negativePeakHoldA = readMeasurement(payload, reader);
  }
  if (descriptor.useNegativePeakHoldC) {
    sample.negativePeakHoldC = readMeasurement(payload, reader);
  }

  return sample;
}

function readLocation(payload, reader, descriptor, fallbackLocation) {
  if (descriptor.useLocation) {
    const latitude = readInt32(payload, reader) / LOCATION_SCALE;
    const longitude = readInt32(payload, reader) / LOCATION_SCALE;

    if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) {
      return { latitude, longitude };
    }
  }

  return {
    latitude: fallbackLocation?.latitude ? Number(fallbackLocation.latitude) : 0,
    longitude: fallbackLocation?.longitude ? Number(fallbackLocation.longitude) : 0
  };
}

function readTiming(payload, reader, descriptor, sampleCount, receivedTimestamp) {
  if (descriptor.useFirstTimestamp && descriptor.useLastTimestamp) {
    const firstTimestamp = readTimestamp(payload, reader, receivedTimestamp);
    const lastTimestamp = readTimestamp(payload, reader, receivedTimestamp);
    const intervalDivisor = Math.max(sampleCount - 1, 1);

    return {
      timestamp: firstTimestamp,
      sampleIntervalSeconds: (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000 / intervalDivisor
    };
  }

  if (descriptor.useFirstTimestamp || descriptor.useLastTimestamp) {
    return {
      timestamp: readTimestamp(payload, reader, receivedTimestamp),
      sampleIntervalSeconds: 0
    };
  }

  return {
    timestamp: receivedTimestamp ? new Date(receivedTimestamp) : new Date(),
    sampleIntervalSeconds: 0
  };
}

function readMeasurement(payload, reader) {
  let measurement = (payload[reader.payloadIndex] << 8) | payload[++reader.payloadIndex];
  measurement = ((measurement >> reader.shift) & 0x03ff) / MEASUREMENT_SCALE + MEASUREMENT_OFFSET;

  if (reader.shift === 0) {
    reader.payloadIndex++;
    reader.shift = 6;
  } else {
    reader.shift -= 2;
  }

  return formatDecimal(measurement);
}

function readTimestamp(payload, reader, receivedTimestamp) {
  const parsedTimestamp = (payload[reader.payloadIndex++] << 8) | payload[reader.payloadIndex++];
  if (parsedTimestamp === 0xffff) {
    return receivedTimestamp ? new Date(receivedTimestamp) : new Date();
  }

  const sensorHours = parsedTimestamp >> 12;
  const minutes = (parsedTimestamp >> 6) & 0x3f;
  const seconds = parsedTimestamp & 0x3f;
  const reference = receivedTimestamp ? new Date(receivedTimestamp) : new Date();
  const utcReferenceHours = reference.getUTCHours();
  let hours = sensorHours;

  if (utcReferenceHours < hours) {
    hours -= 12;
  } else if (utcReferenceHours > 12 && hours < 12) {
    hours += 12;
  }

  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
    hours,
    minutes,
    seconds
  ));
}

function normalizePayloadInput(input) {
  return typeof input === "string" ? hexToBytes(input) : Array.from(input);
}

function createMeasurementReader() {
  return {
    payloadIndex: 0,
    shift: 6
  };
}

function readInt32(payload, reader) {
  return (
    (payload[reader.payloadIndex++] << 24) |
    (payload[reader.payloadIndex++] << 16) |
    (payload[reader.payloadIndex++] << 8) |
    payload[reader.payloadIndex++]
  );
}

function addSeconds(date, seconds) {
  return date ? new Date(date.getTime() + seconds * 1000) : null;
}

function formatDecimal(value) {
  return value.toFixed(1);
}

function countSetBits(value) {
  let count = 0;
  while (value !== 0) {
    count += value & 1;
    value >>= 1;
  }

  return count;
}

function assertMinimumLength(payload, minimumLength, label) {
  if (payload.length < minimumLength) {
    throw new Error(`${label} must contain at least ${minimumLength} byte(s).`);
  }
}
