import wsModule, { WebSocket } from "ws";
import { ErrorCode } from "../constant/error-codes.js";
import { HowsWebSocket } from "../types/types.js";
import { CodedError } from "../utility/coded-error.js";
import { sleep } from "../utility/misc-utils.js";

export class ConnectionPool {
  private uidSeed = 0;

  private availableConnectionMap!: Map<string, HowsWebSocket>;
  private occupiedConnectionMap!: Map<string, HowsWebSocket>;

  constructor() {
    this.availableConnectionMap = new Map<string, HowsWebSocket>();
    this.occupiedConnectionMap = new Map<string, HowsWebSocket>();
  }

  private getNewUid(): string {
    return `ws${this.uidSeed++}`;
  }

  addToPool(ws: WebSocket) {
    let uid = this.getNewUid();
    (ws as HowsWebSocket).uid = uid;

    ws.once("close", () => {
      logger.log(`CPOOL: ${uid}: Connection closed.`);
      this.availableConnectionMap.delete(uid);
      this.occupiedConnectionMap.delete(uid);
      this.reportConnectionStatus();
    });

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
}
