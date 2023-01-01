import {
  HisToHosMessage,
  HisToHosMessageType,
  HosToHisMessage,
  HosToHisMessageType,
  HosTransmission,
  HosTransmissionInternalState,
} from "../types/types.js";
import http from "http";
import constants from "../constant/common-constants.js";
import { sleep } from "./misc-utils.js";
import wsModule, { WebSocket } from "ws";

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

export const packMessage = (message: HosToHisMessage): string => {
  return JSON.stringify(message);
};

export const unpackHisToHosMessage = (message: string): HisToHosMessage => {
  return JSON.parse(message);
};

export const parseAndValidateIncomingMessage = async (
  messageString: string,
  hosTransmission: HosTransmission
): Promise<HisToHosMessage | null> => {
  let message: HisToHosMessage;
  try {
    message = JSON.parse(messageString);
  } catch (ex) {
    return null;
  }

  if (
    message.type === HisToHosMessageType.ContainsResponseData ||
    message.type === HisToHosMessageType.WantsMoreRequestData
  ) {
    if (message.uuid !== hosTransmission.uuid) {
      logger.warn(
        new Error(
          `UUID mismatch found. Socket connection unexpected reuse detected.` +
            `Related message UUID: ${message.uuid}, handler UUID: ${hosTransmission.uuid}`
        )
      );
      return null;
    }

    if (message.serial > hosTransmission.serial) {
      logger.warn(
        new Error(
          `Serial mismatch found. HisToHosMessage.serial cannot be greater than serial of latest HosToHisMessage.` +
            `Related message serial: ${message.serial}, handler serial: ${hosTransmission.serial}`
        )
      );
      return null;
    }

    if (message.serial < hosTransmission.serial) {
      logger.warn(
        new Error(
          `Unexpectedly received reply to an earlier message AFTER a new message have been sent.` +
            `Related message serial: ${message.serial}, handler serial: ${hosTransmission.serial}`
        )
      );
      return null;
    }
  }

  return message;
};

export const sendFirstMessage = async (
  hosTransmission: HosTransmission,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ws: WebSocket
) => {
  let method = req.method!;
  let url = req.url!;
  let headers = req.headers!;
  let hasMore: boolean;
  let bodyBuffer: Buffer;
  [bodyBuffer, hasMore] = await readBodyChunk(req);

  let body = bodyBuffer.toString("base64");

  let message: HosToHisMessage = {
    uuid: hosTransmission.uuid,
    serial: hosTransmission.serial,
    type: HosToHisMessageType.ContainsRequestData,

    method,
    url,
    headers: headers as Record<string, string>,

    body,
    hasMore,
  };

  logger.debug("TRANSMISSION: hosToHis message (first)", message);

  let messageString = JSON.stringify(message);
  ws.send(messageString);
};

export const sendSubsequentMessageWithMoreData = async (
  hosTransmission: HosTransmission,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ws: WebSocket
) => {
  let hasMore: boolean;
  let bodyBuffer: Buffer;
  [bodyBuffer, hasMore] = await readBodyChunk(req);

  let body = bodyBuffer.toString("base64");

  let message: HosToHisMessage = {
    uuid: hosTransmission.uuid,
    serial: hosTransmission.serial,
    type: HosToHisMessageType.ContainsRequestData,

    method: null,
    url: null,
    headers: null,

    body,
    hasMore,
  };

  logger.debug("TRANSMISSION: hosToHis message (subsequent)", message);

  let messageString = JSON.stringify(message);
  ws.send(messageString);
};

export const sendSubsequentMessageRequestingMoreData = async (
  hosTransmission: HosTransmission,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ws: WebSocket
) => {
  let message: HosToHisMessage = {
    uuid: hosTransmission.uuid,
    serial: hosTransmission.serial,
    type: HosToHisMessageType.WantsMoreResponseData,

    method: null,
    url: null,
    headers: null,

    body: null,
    hasMore: false,
  };

  logger.debug("TRANSMISSION: hosToHis message (subsequent)", message);

  let messageString = JSON.stringify(message);
  ws.send(messageString);
};
