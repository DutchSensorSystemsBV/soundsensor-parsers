const MEASUREMENT_WITH_DESCRIPTION = 0x01;

export function parseMeasurementPayload(hexPayload, options = {}) {
  const payload = hexToBytes(hexPayload);
  if (payload.length < 2) {
    throw new Error("Payload must contain at least two bytes.");
  }

  const messageType = payload[0] >> 6;
  if (messageType !== MEASUREMENT_WITH_DESCRIPTION) {
    throw new Error(`Unsupported message type: ${messageType}. This parser expects measurement payloads with description.`);
  }

  return parseMeasurementWithInfo(payload, options);
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

function parseMeasurementWithInfo(payload, options) {
  const context = {
    payloadIndex: 0,
    shift: 6
  };

  const info = (payload[0] << 8) | payload[1];
  let metadataStartIndex = payload.length;

  if (info & 0x08) {
    metadataStartIndex -= 1;
  }
  if (info & 0x04) {
    metadataStartIndex -= 8;
  }
  if (info & 0x02) {
    metadataStartIndex -= 2;
  }
  if (info & 0x01) {
    metadataStartIndex -= 2;
  }

  const unitCount = countSetBits(info & 0x3ff0);
  const bitsPerSample = unitCount * 10;
  if (bitsPerSample === 0) {
    throw new Error("Payload description does not contain measurement units.");
  }

  const sampleBits = (metadataStartIndex - 2) * 8;
  const sampleCount = Math.floor(sampleBits / bitsPerSample);
  context.payloadIndex = metadataStartIndex;

  const battery = info & 0x08 ? (payload[context.payloadIndex++] / 10).toFixed(1) : null;
  const location = readLocation(info, payload, context, options.location);
  const timing = readTiming(info, payload, context, sampleCount, options.receivedTimestamp);

  context.payloadIndex = 2;
  const measurements = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const measurement = {
      devEUI: options.devEUI ?? null,
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
      bat: battery,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: timing.timestamp ? new Date(timing.timestamp.getTime() + sampleIndex * timing.timeSpanSeconds * 1000) : null
    };

    if (info & 0x2000) {
      measurement.dBAf = decodeMeasurement(payload, context);
    }
    if (info & 0x1000) {
      measurement.dBAs = decodeMeasurement(payload, context);
    }
    if (info & 0x0800) {
      measurement.dBCf = decodeMeasurement(payload, context);
    }
    if (info & 0x0400) {
      measurement.dBCs = decodeMeasurement(payload, context);
    }
    if (info & 0x0200) {
      measurement.leqA = decodeMeasurement(payload, context);
    }
    if (info & 0x0100) {
      measurement.leqC = decodeMeasurement(payload, context);
    }
    if (info & 0x0080) {
      measurement.positivePeakHoldA = decodeMeasurement(payload, context);
    }
    if (info & 0x0040) {
      measurement.positivePeakHoldC = decodeMeasurement(payload, context);
    }
    if (info & 0x0020) {
      measurement.negativePeakHoldA = decodeMeasurement(payload, context);
    }
    if (info & 0x0010) {
      measurement.negativePeakHoldC = decodeMeasurement(payload, context);
    }

    measurements.push(measurement);
  }

  return measurements;
}

function readLocation(info, payload, context, fallbackLocation) {
  if (info & 0x04) {
    const latitude = readInt32(payload, context) / 10000000;
    const longitude = readInt32(payload, context) / 10000000;

    if ((latitude !== 0 || longitude !== 0) && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return {
    latitude: fallbackLocation?.latitude ? Number(fallbackLocation.latitude) : 0,
    longitude: fallbackLocation?.longitude ? Number(fallbackLocation.longitude) : 0
  };
}

function readTiming(info, payload, context, sampleCount, receivedTimestamp) {
  const firstTimestampUsed = (info & 0x02) !== 0;
  const lastTimestampUsed = (info & 0x01) !== 0;

  if (firstTimestampUsed && lastTimestampUsed) {
    const firstTimestamp = parseTimestamp(payload, context, receivedTimestamp);
    const lastTimestamp = parseTimestamp(payload, context, receivedTimestamp);
    const divisor = Math.max(sampleCount - 1, 1);

    return {
      timestamp: firstTimestamp,
      timeSpanSeconds: (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000 / divisor
    };
  }

  if (firstTimestampUsed || lastTimestampUsed) {
    return {
      timestamp: parseTimestamp(payload, context, receivedTimestamp),
      timeSpanSeconds: 0
    };
  }

  return {
    timestamp: receivedTimestamp ? new Date(receivedTimestamp) : new Date(),
    timeSpanSeconds: 0
  };
}

function decodeMeasurement(payload, context) {
  let measurement = (payload[context.payloadIndex] << 8) | payload[++context.payloadIndex];
  measurement = (measurement >> context.shift) & 0x03ff;
  measurement = measurement / 10 + 30;

  if (context.shift === 0) {
    context.payloadIndex++;
    context.shift = 6;
  } else {
    context.shift -= 2;
  }

  return measurement.toFixed(1);
}

function parseTimestamp(payload, context, receivedTimestamp) {
  const parsedTimestamp = (payload[context.payloadIndex++] << 8) | payload[context.payloadIndex++];
  if (parsedTimestamp === 0xffff) {
    return receivedTimestamp ? new Date(receivedTimestamp) : new Date();
  }

  const sensorHours = parsedTimestamp >> 12;
  const minutes = (parsedTimestamp >> 6) & 0x3f;
  const seconds = parsedTimestamp & 0x3f;
  const now = receivedTimestamp ? new Date(receivedTimestamp) : new Date();
  const utcNowHours = now.getUTCHours();
  let hours = sensorHours;

  if (utcNowHours < hours) {
    hours = hours - 12;
  } else if (utcNowHours > 12 && hours < 12) {
    hours = hours + 12;
  }

  const timestamp = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    seconds
  ));

  return timestamp;
}

function readInt32(payload, context) {
  const value =
    (payload[context.payloadIndex++] << 24) |
    (payload[context.payloadIndex++] << 16) |
    (payload[context.payloadIndex++] << 8) |
    payload[context.payloadIndex++];

  return value;
}

function countSetBits(value) {
  let count = 0;
  while (value !== 0) {
    count += value & 1;
    value >>= 1;
  }

  return count;
}
