import { WebSocket } from "ws";
import { ErrorCode } from "../constant/error-codes.js";
import { HosToHisMessageType, HowsWebSocket } from "../types/types.js";
import { CodedError } from "../utility/coded-error.js";
import { sleep } from "../utility/misc-utils.js";
import wsModule, { WebSocketServer } from "ws";
import constants from "../constant/common-constants.js";
import { prepareHosToHisMessage } from "../utility/transmission-helper.js";
import { Config } from "./config.js";
import { encryptText } from "../utility/crypto-utils.js";

export class ConnectionPool {
  private uidSeed = 0;

  private availableConnectionMap!: Map<string, HowsWebSocket>;
  private unverifiedConnectionMap!: Map<string, HowsWebSocket>;
  wss: wsModule.Server<WebSocket>;
  config: Config;

  constructor(wss: wsModule.Server<wsModule.WebSocket>, config: Config) {
    this.availableConnectionMap = new Map<string, HowsWebSocket>();
    this.unverifiedConnectionMap = new Map<string, HowsWebSocket>();
    this.wss = wss;
    this.config = config;
  }

  private getNewUid(): string {
    return `ws${this.uidSeed++}`;
  }

  public addToPool(_ws: WebSocket) {
    let ws: HowsWebSocket = _ws as HowsWebSocket;

    let uid = this.getNewUid();
    ws.uid = uid;
    ws.lastReceiveEpoch = 0;
    ws.hasPingBeenSentOut = false;

    ws.once("close", () => {
      logger.log(`CPOOL: ${uid}: Connection closed.`);
      this.availableConnectionMap.delete(uid);
      this.unverifiedConnectionMap.delete(uid);
      this.reportConnectionStatus();
    });

    ws.once("error", (err: Error) => {
      logger.warn(err, { uid });
      ws.terminate();
    });

    ws.on("message", () => {
      this.notifyMessageReceived(ws);
    });

    logger.log(
      `CPOOL: ${uid}: Connection accepted from IP: ${
        (ws as any)._socket.remoteAddress
      }.`
    );
    this.unverifiedConnectionMap.set(uid, ws as HowsWebSocket);
    this.reportConnectionStatus();
  }

  public async leaseAnAvailableConnection(
    delayThreshold = 0
  ): Promise<HowsWebSocket> {
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

    let [uid, ws] = this.availableConnectionMap.entries().next().value as [
      string,
      HowsWebSocket
    ];
    this.availableConnectionMap.delete(uid);

    ws.removeAllListeners("message");

    logger.log(`CPOOL: ${uid}: Leasing connection.`);
    this.reportConnectionStatus();

    return ws;
  }

  public reportConnectionStatus() {
    let message = `Available connections: ${this.availableConnectionMap.size}; Unverified connections: ${this.unverifiedConnectionMap.size}`;
    logger.debug(`CPOOL: ${message}`);
  }

  async start() {
    this.reportConnectionStatus();
    this.setUpAutomatedHearbeatTest();
  }

  public notifyMessageReceived(ws: HowsWebSocket) {
    logger.log(`CPOOL: ${ws.uid}: Was notified message received.`);
    if (this.unverifiedConnectionMap.has(ws.uid)) {
      this.unverifiedConnectionMap.delete(ws.uid);
      this.availableConnectionMap.set(ws.uid, ws);
    }
    this.reportConnectionStatus();

    ws.lastReceiveEpoch = Date.now();
    ws.hasPingBeenSentOut = false;
  }

  private async setUpAutomatedHearbeatTest() {
    const fn = async () => {
      logger.log(`CPOOL: Starting dead connection detection round.`);

      for (let _ws of this.wss.clients) {
        let ws = _ws as HowsWebSocket;
        try {
          if (
            ws.lastReceiveEpoch + constants.socketIdleRejectionThreshold <
              Date.now() &&
            ws.hasPingBeenSentOut
          ) {
            logger.log(`CPOOL: ${ws.uid}: Pruning dead connection.`);
            ws.terminate();
            continue;
          }

          if (
            ws.lastReceiveEpoch + constants.socketIdleCheckThreshold <
              Date.now() &&
            !ws.hasPingBeenSentOut
          ) {
            let messageString = prepareHosToHisMessage(
              this.config.pssk,
              "-1",
              -1,
              HosToHisMessageType.KeepAlivePing,
              {
                method: null,
                url: null,
                headers: null,
                body: null,
                hasMore: false,
              }
            );

            if (this.config.symmetricEncryption.enabled) {
              messageString = JSON.stringify(
                await encryptText(
                  messageString,
                  this.config.symmetricEncryption.secret
                )
              );
            }

            ws.send(messageString);

            ws.hasPingBeenSentOut = true;
          }
        } catch (ex) {
          ("pass");
        }
      }

      timeout = setTimeout(fn, constants.pruningAttemptInterval);
    };

    let timeout = setTimeout(fn, constants.pruningAttemptInterval);

    this.wss.on("close", function close() {
      clearTimeout(timeout);
    });
  }
}
