import assert from "node:assert/strict";

import {
  calculateSettingsCrc,
  composeSettingsPayload,
  decodeUplink,
  parseSettingsPayload
} from "../src/index.js";

const uplinkPayload = "7fff0f03a13c5a14887405260d0411a46d1e4791d09959d670d0443f1f34966c03118669ae2ab06a";
const measurements = decodeUplink(uplinkPayload, {
  receivedTimestamp: "2026-07-17T10:00:00.000Z"
});

assert.equal(measurements.length, 2);
assert.equal(measurements[0].dBAf, "36.0");
assert.equal(measurements[0].bat, "6.3");
assert.equal(measurements[0].latitude, 52.3540076);
assert.equal(measurements[0].longitude, 5.1480169);

const settingsPayload = "800000ea600100fff6020036ee80";
const settings = parseSettingsPayload(settingsPayload);

assert.equal(settings.transmitInterval, 60000);
assert.equal(settings.sampleCount, 1);
assert.equal(settings.gpsMode, 2);
assert.equal(settings.gpsInterval, 3600000);
assert.equal(composeSettingsPayload(settings), "020000ea600100fff6020036ee80");
assert.equal(calculateSettingsCrc(settings), 7599);

console.log("All parser examples passed.");
