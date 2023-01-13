import wsModule, { WebSocket } from "ws";
import http from "http";
import constants from "../constant/common-constants.js";
import { sleep, writeToStream } from "../utility/misc-utils.js";
import crypto from "crypto";
import {
  HisToHosMessage,
  HisToHosMessageType,
  HosToHisMessage,
  HosToHisMessageType,
  HosTransmission,
  HosTransmissionInternalState,
} from "../types/types.js";
import {
  parseAndValidateIncomingMessage,
  sendFirstMessage,
  sendSubsequentMessageNotifyingEndOfTransmission,
  sendSubsequentMessageRequestingMoreData,
  sendSubsequentMessageWithMoreData,
} from "../utility/transmission-helper.js";

export const handleTransmission = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ws: WebSocket
): Promise<void> => {
  return new Promise(async (accept, reject) => {
    ws.once("close", () => {
      accept();
    });

    ws.once("error", (err) => {
      reject(err);
    });

    req.once("error", (err) => {
      reject(err);
    });

    res.once("finish", () => {
      accept();
    });

    let hosTransmission: HosTransmission = {
      uuid: crypto.randomUUID(),
      serial: 0,
      hasMore: false,
      responseHeadersSent: false,
      hosTransmissionInternalState: HosTransmissionInternalState.Idle,
    };

    logger.debug("TRANSMISSION: established", hosTransmission.uuid);

    const closeTransaction = async () => {};

    const incomingMessageHandler = async (messageString: string) => {
      let message = await parseAndValidateIncomingMessage(
        messageString,
        hosTransmission
      );
      logger.debug("TRANSMISSION: hisToHos message received", message);
      if (!message) return;

      hosTransmission.serial = message.serial;

      if (message.type === HisToHosMessageType.TransmissionError) {
        if (hosTransmission.responseHeadersSent) {
          logger.log(
            "TRANSMISSION: Received TransmissionError from HIS after response headers were already sent. Closing response stream gracefully."
          );
        } else {
          logger.log(
            "TRANSMISSION: Received TransmissionError. Sending 500 and closing response stream."
          );
          res.statusCode = 500;
        }
        await writeToStream(res, "500 - Transmission Error");
        res.end();
        await closeTransaction();
        return;
      }

      if (message.type === HisToHosMessageType.WantsMoreRequestData) {
        await sendSubsequentMessageWithMoreData(hosTransmission, req, res, ws);
        return;
      }

      if (message.type === HisToHosMessageType.ContainsResponseData) {
        if (!hosTransmission.responseHeadersSent) {
          res.statusCode = message.statusCode || 500;
          if (message.headers) {
            for (let headerKey of Object.keys(message.headers)) {
              res.setHeader(headerKey, message.headers![headerKey]);
            }
          }
        }

        if (message.body && message.body.length) {
          let bodyBuffer = Buffer.from(message.body, "base64");
          await writeToStream(res, bodyBuffer);
        }

        if (message.hasMore) {
          await sendSubsequentMessageRequestingMoreData(
            hosTransmission,
            req,
            res,
            ws
          );
        } else {
          await sendSubsequentMessageNotifyingEndOfTransmission(
            hosTransmission,
            req,
            res,
            ws
          );
          res.end();
          await closeTransaction();
        }
      }
    };

    ws.on("message", incomingMessageHandler);

    await sendFirstMessage(hosTransmission, req, res, ws);
  });
};
