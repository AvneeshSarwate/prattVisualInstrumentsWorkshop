// MIDI input (Web MIDI — works in Chrome and Edge).
//
// Knob numbering on the BeatStep: knobs 1-8 = top row left to right, 9-16 = bottom row.
// These are the CC numbers the BeatStep's default Control Mode preset sends for knobs 1-16.
// The knobs send relative values (63 = down, 65 = up); controls.js turns those into slider moves.
// If yours sends other CCs, click "learn knobs" in the panel and turn knobs 1..16 in order;
// the learned list is saved to config.json and replaces this one.
const DEFAULT_KNOB_CCS = [10, 74, 71, 76, 77, 93, 73, 75, 114, 18, 19, 16, 17, 91, 79, 72];

// onCC(cc, value, channel) is called for every Control Change message from any connected device.
// onDevices(names, error) is called whenever the list of connected devices changes.
async function setupMidi(onCC, onDevices) {
  if (!navigator.requestMIDIAccess) {
    onDevices([], "Web MIDI isn't available in this browser — use Chrome or Edge");
    return;
  }

  // The browser may ask for permission first; say so instead of looking stuck.
  onDevices([], "MIDI: waiting for permission (check the address bar)");
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (err) {
    onDevices([], `MIDI access blocked (${err.message}) — allow MIDI for this site and reload`);
    return;
  }

  const handleMessage = (msg) => {
    const [status, cc, value] = msg.data;
    const isControlChange = (status & 0xf0) === 0xb0;
    if (isControlChange) onCC(cc, value, (status & 0x0f) + 1);
  };

  // Attach to every input. The device list isn't always complete when access is first
  // granted (and change events aren't always sent), so besides listening for changes
  // we also re-check once a second. It's cheap, and it also catches plugging in later.
  let lastNames = null;
  const connect = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      if (input.state !== "connected") continue;
      if (input.onmidimessage !== handleMessage) input.onmidimessage = handleMessage; // also opens the port
      names.push(input.name);
    }
    const key = names.join("|");
    if (key !== lastNames) {
      lastNames = key;
      onDevices(names);
    }
  };
  access.onstatechange = connect;
  connect();
  setInterval(connect, 1000);
}
