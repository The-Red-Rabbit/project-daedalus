// Kleine WebSocket-Hilfe fuer Host und Controller, mit automatischem
// Wiederverbinden. Faellt die Verbindung im Klassenraum kurz aus, baut der
// Client sie mit wachsendem Abstand neu auf und meldet open/close.
import { encode, decode } from "/shared/protocol.js";

export function connect(handlers = {}) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}`;
  let ws = null;
  let closed = false;
  let retry = 0;

  function attach() {
    ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      retry = 0;
      if (handlers.open) handlers.open();
    });
    ws.addEventListener("close", () => {
      if (handlers.close) handlers.close();
      if (!closed) {
        const delay = Math.min(5000, 500 * 2 ** retry++);
        setTimeout(attach, delay);
      }
    });
    ws.addEventListener("message", (ev) => {
      const msg = decode(ev.data);
      if (msg && handlers.message) handlers.message(msg);
    });
  }
  attach();

  return {
    get raw() {
      return ws;
    },
    send(type, payload) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(type, payload));
    },
    close() {
      closed = true;
      if (ws) ws.close();
    },
  };
}
