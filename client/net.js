// Kleine WebSocket-Hilfe fuer Host und Controller.
import { encode, decode } from "/shared/protocol.js";

export function connect(handlers = {}) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener("open", () => handlers.open && handlers.open());
  ws.addEventListener("close", () => handlers.close && handlers.close());
  ws.addEventListener("message", (ev) => {
    const msg = decode(ev.data);
    if (msg && handlers.message) handlers.message(msg);
  });
  return {
    raw: ws,
    send(type, payload) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encode(type, payload));
    },
  };
}
