import wsModule, { WebSocket } from "ws";
import { ErrorCode } from "../constant/error-codes.js";
import { HowsWebSocket } from "../types/types.js";
import { CodedError } from "../utility/coded-error.js";

export class ConnectionPool {
  private uidSeed = 0;
  private connectionMap!: Record<string, HowsWebSocket>;

  constructor() {
    this.connectionMap = {};
  }

  private getNewUid(): string {
    return `ws${this.uidSeed++}`;
  }

  // TODO: implement roundrobin
  getAConnection(): WebSocket {
    let keys = Object.keys(this.connectionMap);

    if (keys.length === 0) {
      throw new CodedError(ErrorCode.NO_WORKER_AVAILABLE);
    }

    let randomUidIndex = Math.floor(Math.random() * keys.length - 1);
    let randomUid = `ws${keys[randomUidIndex]}`;
    return this.connectionMap[randomUid];
  }

  addToPool(ws: WebSocket) {
    let uid = this.getNewUid();
    this.connectionMap[uid] = ws as HowsWebSocket;
    (ws as HowsWebSocket).uid = uid;
  }
}
