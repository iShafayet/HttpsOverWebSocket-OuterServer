import { WebSocket } from "ws";
import { ErrorCode } from "../constant/error-codes.js";
import { HowsWebSocket } from "../types/types.js";
import { CodedError } from "../utility/coded-error.js";
import { sleep } from "../utility/misc-utils.js";
import wsModule, { WebSocketServer } from "ws";
import constants from "../constant/common-constants.js";

export class ConnectionPool {
  private uidSeed = 0;

  private availableConnectionMap!: Map<string, HowsWebSocket>;
  private occupiedConnectionMap!: Map<string, HowsWebSocket>;
  wss: wsModule.Server<WebSocket>;

  constructor(wss: wsModule.Server<wsModule.WebSocket>) {
    this.availableConnectionMap = new Map<string, HowsWebSocket>();
    this.occupiedConnectionMap = new Map<string, HowsWebSocket>();
    this.wss = wss;
  }

  private getNewUid(): string {
    return `ws${this.uidSeed++}`;
  }

  addToPool(_ws: WebSocket) {
    let ws: HowsWebSocket = _ws as HowsWebSocket;

    let uid = this.getNewUid();
    ws.uid = uid;
    ws.isAlive = true;

    ws.once("close", () => {
      logger.log(`CPOOL: ${uid}: Connection closed.`);
      this.availableConnectionMap.delete(uid);
      this.occupiedConnectionMap.delete(uid);
      this.reportConnectionStatus();
    });

    ws.once("error", (err: Error) => {
      logger.warn(err, { uid });
      ws.terminate();
    });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    logger.log(
      `CPOOL: ${uid}: Connection accepted from IP: ${
        (ws as any)._socket.remoteAddress
      }.`
    );
    this.availableConnectionMap.set(uid, ws as HowsWebSocket);
    this.reportConnectionStatus();
  }

  async getAnAvailableConnection(delayThreshold = 0): Promise<HowsWebSocket> {
    logger.log(`CPOOL: An available connection is requested.`);

    if (this.availableConnectionMap.size === 0) {
      await sleep(delayThreshold);
      if (this.availableConnectionMap.size === 0) {
        throw new CodedError(
          ErrorCode.NO_WORKER_AVAILABLE,
          `${ErrorCode.NO_WORKER_AVAILABLE}: No worker is available to handle the request`
        );
      }
    }

    let [uid, ws] = this.availableConnectionMap.entries().next().value;
    this.occupiedConnectionMap.set(uid, ws);
    this.availableConnectionMap.delete(uid);

    logger.log(`CPOOL: ${uid}: Leasing connection.`);
    this.reportConnectionStatus();

    return ws;
  }

  returnSocketBackToPoolIfOpen(ws: HowsWebSocket) {
    if (!ws) return;
    if (!ws.OPEN) return;

    logger.log(`CPOOL: ${ws.uid}: connection is being returned to the pool.`);
    if (!this.occupiedConnectionMap.has(ws.uid)) return;
    this.occupiedConnectionMap.delete(ws.uid);
    this.availableConnectionMap.set(ws.uid, ws);
    logger.log(`CPOOL: ${ws.uid}: connection has been returned.`);
    this.reportConnectionStatus();
  }

  reportConnectionStatus() {
    let message = `Available connections: ${this.availableConnectionMap.size}, occupied connections: ${this.occupiedConnectionMap.size}`;
    logger.debug(`CPOOL: ${message}`);
  }

  async start() {
    this.reportConnectionStatus();
    this.setUpAutomatedHearbeatTest();
  }

  private async setUpAutomatedHearbeatTest() {
    const interval = setInterval(() => {
      logger.log(`CPOOL: Starting dead connection detection round.`);
      this.wss.clients.forEach((_ws) => {
        let ws = _ws as HowsWebSocket;

        if (ws.isAlive === false) {
          logger.log(`CPOOL: ${ws.uid}: Pruning dead connection.`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, constants.socketPingTimeout);

    this.wss.on("close", function close() {
      clearInterval(interval);
    });
  }
}
