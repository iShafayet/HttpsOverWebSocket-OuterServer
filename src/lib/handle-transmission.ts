import wsModule, { WebSocket } from "ws";
import http from "http";
import constants from "../constant/common-constants.js";
import { sleep } from "../utility/misc-utils.js";
import crypto from "crypto";
import {
  HisToHosMessage,
  HisToHosMessageType,
  HosToHisMessage,
} from "../types/types.js";

const readBodyChunk = (
  req: http.IncomingMessage
): Promise<[Buffer, boolean]> => {
  return new Promise(async (accept, reject) => {
    let chunks: Buffer[] = [];

    let times = 10;
    while (times--) {
      if (!req.readable) break;
      let chunk = req.read(constants.data.CHUNK_SIZE_BYTES);
      if (chunk) {
        chunks.push(chunk);
      }
      await sleep(10);
    }

    accept([Buffer.concat(chunks), req.readable]);
  });
};

export const handleTransmission = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ws: WebSocket
) => {
  let uuid = crypto.randomUUID();
  let serial = 0;
  let hasMore: boolean = false;

  const sendFirstMessage = async () => {
    let method = req.method!;
    let url = req.url!;
    let headers = req.headers!;

    let bodyBuffer: Buffer;
    [bodyBuffer, hasMore] = await readBodyChunk(req);

    let body = bodyBuffer.toString("base64");

    let message: HosToHisMessage = {
      uuid,
      serial,
      method,
      url,
      headers: headers as Record<string, string>,
      body,
      hasMore,
    };

    let messageString = JSON.stringify(message);

    ws.send(messageString);
  };

  const sendSubsequentMessage = async () => {};

  const closeTransaction = async ()=>{}

  const incomingMessageHandler = async (messageString: string) => {
    let message: HisToHosMessage = JSON.parse(messageString);

    if (message.uuid !== uuid) {
      logger.warn(
        new Error(
          `UUID mismatch found. Socket connection unexpected reuse detected.` +
            `Related message UUID: ${message.uuid}, handler UUID: ${uuid}`
        )
      );
      return;
    }

    if (message.serial > serial) {
      logger.warn(
        new Error(
          `Serial mismatch found. HisToHosMessage.serial cannot be greater than serial of latest HosToHisMessage.` +
            `Related message serial: ${message.serial}, handler serial: ${serial}`
        )
      );
      return;
    }

    if (message.serial < serial) {
      logger.warn(
        new Error(
          `Unexpectedly received reply to an earlier message AFTER a new message have been sent.` +
            `Related message serial: ${message.serial}, handler serial: ${serial}`
        )
      );
      return;
    }

    if (message.serial === 0) {
      res.statusCode = message.statusCode;
      for (let headerKey of Object.keys(message.headers)) {
        res.setHeader(headerKey, message.headers[headerKey]);
      }
    }

    let bodyBuffer = Buffer.from(message.body, "base64");
    res.write(bodyBuffer);

    if (hasMore){
      sendSubsequentMessage()
    }
  };

  ws.on("message", incomingMessageHandler);

  await sendFirstMessage();
};
