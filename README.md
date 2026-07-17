# DSS IoT SoundSensor JavaScript Examples

JavaScript examples for parsing DSS IoT SoundSensor LoRa payloads and composing or validating settings/downlink messages.

These examples are intended for DSS IoT SoundSensor firmware version 2.0.0.

## Contents

- `src/soundsensor-parser.js` - Parses measurement payloads with payload description.
- `src/soundsensor-downlink.js` - Parses settings responses, composes settings downlinks, and calculates ACK CRC values.
- `examples/parser.html` - Browser example for measurement payload parsing.
- `examples/downlink.html` - Browser example for settings payload parsing and downlink payload composition.

## Browser Usage

Serve this folder with any static web server and open one of the HTML files in the `examples` folder:

- `examples/parser.html`
- `examples/downlink.html`

The examples use plain JavaScript modules and do not require a build step.

For example:

```sh
npx serve .
```

## Parser Example

```js
import { parseMeasurementPayload } from "./src/soundsensor-parser.js";

const measurements = parseMeasurementPayload(
  "7fff0f03a13c5a14887405260d0411a46d1e4791d09959d670d0443f1f34966c03118669ae2ab06a"
);

console.log(measurements);
```

## Downlink Example

```js
import { composeSettingsPayload, calculateSettingsCrc } from "./src/soundsensor-downlink.js";

const settings = {
  transmitInterval: 60000,
  sampleCount: 1,
  correction: 0,
  useDBAf: true,
  useDBAs: true,
  useDBCf: true,
  useDBCs: true,
  useLeqA: true,
  useLeqC: true,
  usePositivePeakHoldA: true,
  usePositivePeakHoldC: true,
  useNegativePeakHoldA: true,
  useNegativePeakHoldC: true,
  useBat: true,
  useFirstTimestamp: true,
  useLastTimestamp: true,
  useMsgInfo: true,
  enableLed: true,
  enableHeadphone: false,
  gpsMode: 2,
  gpsInterval: 3600000
};

const payload = composeSettingsPayload(settings);
const crc = calculateSettingsCrc(settings);

console.log(payload, crc);
```

## Notes

- Provider-specific downlink transmission differs per LoRa network provider. This repository only contains generic payload examples.
- Do not commit real device credentials, AppKeys, AS keys, access tokens, or customer data.
- Timestamp parsing uses the current UTC date because the sensor timestamp format only contains time-of-day fields.

## License

MIT
