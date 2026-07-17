# DSS Ranos SoundSensor Parsers

JavaScript examples for parsing DSS Ranos SoundSensor LoRaWAN uplinks and composing settings downlinks.

These examples are intended for DSS Ranos SoundSensor firmware version 2.0.0.

## Contents

- `src/index.js` - Public entrypoint for the parser functions.
- `src/uplink.js` - Decodes measurement uplinks with payload description.
- `src/downlink.js` - Parses settings responses, composes settings downlinks, and validates ACK payloads.
- `examples/uplink.html` - Browser example for measurement uplink parsing.
- `examples/downlink.html` - Browser example for settings payload parsing and downlink payload composition.
- `test/examples.test.js` - Node.js smoke tests for the sample payloads.

## Install

No package installation is required. The source files are plain JavaScript ES modules.

To run the smoke tests:

```sh
npm test
```

## Browser Usage

Serve this folder with any static web server and open one of the HTML files in the `examples` folder:

- `examples/uplink.html`
- `examples/downlink.html`

For example:

```sh
npm run serve
```

Then open:

- `http://localhost:8080/examples/uplink.html`
- `http://localhost:8080/examples/downlink.html`

Opening the HTML files directly from disk can cause browser CORS errors because the examples import JavaScript modules from `src`.

## Uplink Example

Use `decodeUplink` for measurement payloads sent from the sensor to the LoRaWAN network.

```js
import { decodeUplink } from "./src/index.js";

const measurements = decodeUplink(
  "7fff0f03a13c5a14887405260d0411a46d1e4791d09959d670d0443f1f34966c03118669ae2ab06a"
);

console.log(measurements);
```

## Downlink Example

Use `composeSettingsPayload` to create a settings payload that can be sent to the sensor through your LoRaWAN provider.

```js
import {
  calculateSettingsCrc,
  composeSettingsPayload,
  parseSettingsPayload
} from "./src/index.js";

const settings = parseSettingsPayload("800000ea600100fff6020036ee80");
const payload = composeSettingsPayload(settings);
const crc = calculateSettingsCrc(settings);

console.log(payload, crc);
```

## Settings Request Example

Use `composeSettingsRequestPayload` to request the current settings from the sensor.

```js
import { composeSettingsRequestPayload } from "./src/index.js";

const payload = composeSettingsRequestPayload();

console.log(payload); // "04"
```

## Notes

- Uplinks are messages from the sensor to the LoRaWAN network.
- Downlinks are messages from the LoRaWAN network to the sensor.
- Provider-specific downlink transmission differs per LoRaWAN network provider. This repository only contains generic payload examples.
- Do not commit real device credentials, AppKeys, AS keys, access tokens, or customer data.
- Timestamp parsing uses the current UTC date because the sensor timestamp format only contains time-of-day fields.

## License

MIT
