import * as Polyfill from "node-datachannel/polyfill";
import * as PeerJs from "peerjs";

export function ensureWebRtcGlobals() {
  for (const entry of Object.entries(Polyfill.default)) {
    const key = entry[0];
    if (key.startsWith("RTC")) {
      Object.assign(globalThis, Object.fromEntries([entry]));
    }
  }

  // @ts-ignore
  PeerJs.util.supports = {
    browser: false,
    webRTC: true,
    audioVideo: true,
    data: true,
    binaryBlob: true,
    reliable: true,
  };
}
