import https from "https";
import http from "http";
import fs from "fs";
import wsModule, { WebSocketServer } from "ws";
import { Config } from "./lib/config.js";
import { AddressInfo } from "net";
import { ConnectionPool } from "./lib/connection-pool.js";
import { handleTransmission } from "./lib/handle-transmission.js";
import { CodedError } from "./utility/coded-error.js";
import { ErrorCode } from "./constant/error-codes.js";
import { HowsWebSocket } from "./types/types.js";

let wsPool = new ConnectionPool();
let wss: wsModule.Server<wsModule.WebSocket>;
let httpServer: http.Server;

let usingSsl = false;

const DELAY_THRESHOLD = 5000;

const createWebSocketServer = async () => {
  wss = new WebSocketServer({ server: httpServer });
};

const createWebServer = async () => {
  if (usingSsl) {
    httpServer = https.createServer();
  } else {
    httpServer = http.createServer();
  }
};

export const startServer = async (config: Config) => {
  usingSsl = config.ssl.enabled;

  await createWebServer();
  await createWebSocketServer();

  wss.on("connection", function connection(ws) {
    logger.log("WSS: New Connection. Adding to pool.");
    wsPool.addToPool(ws);
  });

  const onWebRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    logger.log(`WEBSERVER: New Request ${req.url}. Creating new transmission.`);

    let socket: HowsWebSocket | null = null;
    try {
      socket = await wsPool.getAnAvailableConnection(DELAY_THRESHOLD);
      await handleTransmission(req, res, socket);
      wsPool.returnSocketBackToPoolIfOpen(socket);
    } catch (ex) {
      if (socket) {
        wsPool.returnSocketBackToPoolIfOpen(socket);
      }
      logger.log("WEBSERVER: Following excpetion while handling transmission.");
      logger.error(ex as Error);
      if (
        ex instanceof CodedError &&
        ex.code === ErrorCode.NO_WORKER_AVAILABLE
      ) {
        if (!res.headersSent) {
          res.statusCode = 503;
        }
        res.write("Error: 503 - No worker is available to handle the request");
      } else {
        if (!res.headersSent) {
          res.statusCode = 400;
        }
        let message =
          ex && "message" in (ex as any)
            ? (ex as any).message
            : "Internal Server Error";
        res.write(message);
      }
      res.end();
    }
  };

  httpServer.addListener("request", onWebRequest);

  httpServer.listen(
    config.outerServer.port,
    config.outerServer.hostname,
    () => {
      let addressInfo = httpServer.address() as AddressInfo;
      logger.log(
        `WEBSERVER: running on ${usingSsl ? "https" : "http"}://${
          addressInfo.address || addressInfo.port
        }:${config.outerServer.port}`
      );
      logger.log(
        `WSS: running on on ${usingSsl ? "wss" : "ws"}://${
          addressInfo.address || addressInfo.port
        }:${config.outerServer.port}`
      );
    }
  );
};
