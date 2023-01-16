import {
  HisToHosMessage,
  HisToHosMessageType,
  HosToHisMessage,
  HosToHisMessageType,
} from "../types/types.js";
import http from "http";
import { readBodyChunk } from "../utility/transmission-helper.js";
import { writeToStream } from "../utility/misc-utils.js";
import { UserError } from "../utility/coded-error.js";

export interface SendMessageFn {
  (type: HosToHisMessageType, message: HosToHisMessage): Promise<void>;
}

export interface EndTransmissionFn {
  (hasError: boolean, error: Error | null): Promise<void>;
}

export class Transmission {
  sendMessageFn: SendMessageFn;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  endTransmissionFn: EndTransmissionFn;

  constructor(
    sendMessageFn: SendMessageFn,
    endTransmissionFn: EndTransmissionFn,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    this.sendMessageFn = sendMessageFn;
    this.endTransmissionFn = endTransmissionFn;
    this.req = req;
    this.res = res;
  }

  private async sendTheFirstMessage() {
    let method = this.req.method!;
    let url = this.req.url!;
    let headers = this.req.headers!;
    let hasMore: boolean;
    let bodyBuffer: Buffer;

    [bodyBuffer, hasMore] = await readBodyChunk(this.req);
    let body = bodyBuffer.toString("base64");

    let message: HosToHisMessage = {
      method,
      url,
      headers: headers as Record<string, string>,

      body,
      hasMore,
    };

    logger.debug("TRANSMISSION: hosToHis message (first)", message);

    await this.sendMessageFn(HosToHisMessageType.ContainsRequestData, message);
  }

  private async sendSubsequentMessageWithMoreData() {
    let hasMore: boolean;
    let bodyBuffer: Buffer;
    [bodyBuffer, hasMore] = await readBodyChunk(this.req);

    let body = bodyBuffer.toString("base64");

    let message: HosToHisMessage = {
      method: null,
      url: null,
      headers: null,

      body,
      hasMore,
    };

    logger.debug("TRANSMISSION: hosToHis message (subsequent)", message);

    await this.sendMessageFn(HosToHisMessageType.ContainsRequestData, message);
  }

  private async sendSubsequentMessageRequestingMoreData() {
    let hasMore: boolean;
    let bodyBuffer: Buffer;
    [bodyBuffer, hasMore] = await readBodyChunk(this.req);

    let body = bodyBuffer.toString("base64");

    let message: HosToHisMessage = {
      method: null,
      url: null,
      headers: null,

      body,
      hasMore,
    };

    logger.debug("TRANSMISSION: hosToHis message (subsequent)", message);

    await this.sendMessageFn(
      HosToHisMessageType.WantsMoreResponseData,
      message
    );
  }

  private async sendSubsequentMessageNotifyingEndOfTransmission() {
    let hasMore: boolean;
    let bodyBuffer: Buffer;
    [bodyBuffer, hasMore] = await readBodyChunk(this.req);

    let body = bodyBuffer.toString("base64");

    let message: HosToHisMessage = {
      method: null,
      url: null,
      headers: null,

      body,
      hasMore,
    };

    logger.debug("TRANSMISSION: hosToHis message (subsequent)", message);

    await this.sendMessageFn(
      HosToHisMessageType.NotifyingEndOfTransmission,
      message
    );
  }

  public async start() {
    await this.sendTheFirstMessage();
  }

  public async onMessage(
    uuid: string,
    serial: number,
    type: HisToHosMessageType,
    message: HisToHosMessage
  ) {
    if (type === HisToHosMessageType.TransmissionError) {
      if (this.res.headersSent) {
        logger.log(
          "TRANSMISSION: Received TransmissionError from HIS after response headers were already sent. Closing response stream gracefully."
        );
      } else {
        logger.log(
          "TRANSMISSION: Received TransmissionError. Sending 500 and closing response stream."
        );
        this.res.statusCode = 500;
      }
      await writeToStream(this.res, "500 - Transmission Error");
      this.res.end();
      await this.endTransmissionFn(
        true,
        new UserError("HIS_TERMINATED", "His informed of error")
      );
      return;
    }

    if (type === HisToHosMessageType.WantsMoreRequestData) {
      await this.sendSubsequentMessageWithMoreData();
      return;
    }

    if (type === HisToHosMessageType.ContainsResponseData) {
      if (!this.res.headersSent) {
        this.res.statusCode = message.statusCode || 500;
        if (message.headers) {
          for (let headerKey of Object.keys(message.headers)) {
            this.res.setHeader(headerKey, message.headers![headerKey]);
          }
        }
      }

      if (message.body && message.body.length) {
        let bodyBuffer = Buffer.from(message.body, "base64");
        await writeToStream(this.res, bodyBuffer);
      }

      if (message.hasMore) {
        await this.sendSubsequentMessageRequestingMoreData();
      } else {
        await this.sendSubsequentMessageNotifyingEndOfTransmission();
        this.res.end();
        await this.endTransmissionFn(false, null);
      }
    }
  }
}
