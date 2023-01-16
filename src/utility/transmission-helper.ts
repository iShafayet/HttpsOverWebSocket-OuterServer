import http from "http";
import constants from "../constant/common-constants.js";
import {
  HisToHosMessage,
  HisToHosMessageType,
  HosToHisMessage,
  HosToHisMessageType,
} from "../types/types.js";
import { UserError } from "./coded-error.js";
import { sleep } from "./misc-utils.js";

export const readBodyChunk = (
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

export const parseHisToHosMessage = (
  rawMessage: string
): [string, number, HisToHosMessageType, HisToHosMessage] => {
  const MINIMUM_LENGTH = 20;
  if (rawMessage.length < MINIMUM_LENGTH) {
    throw new UserError("INVALID_MESSAGE", "Message is too short");
  }

  let index = rawMessage.indexOf("}");
  if (index === -1) {
    throw new UserError("INVALID_MESSAGE", "Message is malformatted. (Case 1)");
  }

  let lhs = rawMessage.slice(0, index + 1);
  let rhs = rawMessage.slice(index + 1);

  lhs = lhs.slice(1, lhs.length - 1);

  logger.debug({ lhs, rhs, rawMessage });

  let [uuid, serial, type] = lhs.split(",");

  let message = JSON.parse(rhs);

  return [uuid, parseInt(serial), type as HisToHosMessageType, message];
};

export const prepareHosToHisMessage = (
  uuid: string,
  serial: number,
  type: HosToHisMessageType,
  message: HosToHisMessage
): string => {
  let rawMessage = `{${uuid},${serial},${type}}` + JSON.stringify(message);
  return rawMessage;
};
