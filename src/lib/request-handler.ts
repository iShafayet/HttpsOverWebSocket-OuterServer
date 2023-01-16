import http from "http";
import { ErrorCode } from "../constant/error-codes.js";
import {
  HosToHisMessage,
  HosToHisMessageType,
  HowsWebSocket,
} from "../types/types.js";
import { CodedError, DeveloperError } from "../utility/coded-error.js";
import {
  parseHisToHosMessage,
  prepareHosToHisMessage,
} from "../utility/transmission-helper.js";
import { ConnectionPool } from "./connection-pool.js";
import { Transmission } from "./transmission.js";

const INITIAL_WEBSOCKET_ACQUISITION_DELAY_THRESHOLD = 5000;

enum RequestHandlerState {
  INITIAL,
  SOCKET_ESTABLISHED,
  ENDED_WITH_SUCCESS,
  ENDED_WITH_FAILURE,
}

export class RequestHandler {
  wsPool: ConnectionPool;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  uuid: string;
  state: RequestHandlerState;
  socket!: HowsWebSocket;
  transmission!: Transmission;
  serial: number = 0;

  constructor(
    wsPool: ConnectionPool,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    this.wsPool = wsPool;
    this.req = req;
    this.res = res;

    this.uuid = crypto.randomUUID();
    this.state = RequestHandlerState.INITIAL;
  }

  private async sendMessage(
    type: HosToHisMessageType,
    message: HosToHisMessage
  ) {
    this.serial += 1;
    let messageString = prepareHosToHisMessage(
      this.uuid,
      this.serial,
      type,
      message
    );
    logger.debug(messageString);
    this.socket.send(messageString);
  }

  private async handleIncomingMessage(rawMessage: string) {
    if (!this.transmission) return;
    let [uuid, serial, type, message] = parseHisToHosMessage(rawMessage);

    if (this.uuid !== uuid) {
      logger.warn(
        new DeveloperError(
          "RECEIVED_MESSAGE_WITH_INVALID_UUID",
          "This is completely unexpected"
        )
      );
      return;
    }

    if (this.serial + 1 !== serial) {
      logger.warn(
        new DeveloperError(
          "RECEIVED_MESSAGE_OUT_OF_ORDER",
          "This is completely unexpected"
        )
      );
      return;
    }

    this.serial = serial;

    this.transmission.onMessage(uuid, serial, type, message);
  }

  public async initiateRequestHandling() {
    try {
      this.socket = await this.wsPool.getAnAvailableConnection(
        INITIAL_WEBSOCKET_ACQUISITION_DELAY_THRESHOLD
      );

      logger.log(
        `REQUEST_HANDLER: ${this.uuid}: Leased socket ${this.socket.uid}`
      );

      this.state = RequestHandlerState.SOCKET_ESTABLISHED;

      this.socket.on("message", (rawMessage: string, isBinary) => {
        rawMessage = isBinary ? rawMessage : rawMessage.toString();
        this.handleIncomingMessage(rawMessage);
      });

      this.socket.once("close", () => {
        this.end(false, null);
      });

      this.socket.once("error", (ex) => {
        logger.warn(ex as Error);
        this.end(true, ex);
      });

      this.req.on("error", (ex) => {
        logger.warn(ex as Error);
        this.end(true, ex);
      });

      this.res.on("error", (ex) => {
        logger.warn(ex as Error);
        this.end(true, ex);
      });

      this.transmission = new Transmission(
        (...args) => this.sendMessage(...args),
        (...args) => this.end(...args),
        this.req,
        this.res
      );
      this.transmission.start();
    } catch (ex) {
      if (this.socket) {
        this.wsPool.returnSocketBackToPoolIfOpen(this.socket);
      }

      logger.log(
        `REQUEST_HANDLER: ${this.uuid}: Following excpetion while handling transmission.`
      );
      logger.error(ex as Error);

      if (
        ex instanceof CodedError &&
        ex.code === ErrorCode.NO_WORKER_AVAILABLE
      ) {
        if (!this.res.headersSent) {
          this.res.statusCode = 503;
        }
        this.res.write(
          "Error: 503 - No worker is available to handle the request"
        );
        this.res.end();
      } else {
        throw ex;
      }
    }
  }

  private async end(hasError: boolean, error: Error | null = null) {
    if (
      this.state === RequestHandlerState.ENDED_WITH_FAILURE ||
      this.state === RequestHandlerState.ENDED_WITH_SUCCESS
    ) {
      return;
    }

    logger.log(
      `REQUEST_HANDLER: ${this.uuid}: Ending transmission. hasError: ${hasError}, error: `,
      error
    );

    this.state = hasError
      ? RequestHandlerState.ENDED_WITH_FAILURE
      : RequestHandlerState.ENDED_WITH_SUCCESS;

    if (this.socket) {
      this.wsPool.returnSocketBackToPoolIfOpen(this.socket);
    }

    try {
      this.socket.removeAllListeners("message");
    } catch (error) {
      logger.warn(error as Error);
    }

    try {
      if (hasError) {
        if (!this.res.headersSent) {
          this.res.statusCode = 500;
        }
        let message =
          error && "message" in (error as any)
            ? (error as any).message
            : "Internal Server Error";
        this.res.write(message);
      }
    } catch (error) {
      logger.warn(error as Error);
    }

    try {
      if (this.res.writable) {
        this.res.end();
      }
    } catch (error) {
      logger.warn(error as Error);
    }
  }
}
