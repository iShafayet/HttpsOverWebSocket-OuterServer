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

let wsPool = new ConnectionPool();
let wss: wsModule.Server<wsModule.WebSocket>;
let httpServer: http.Server;

let usingSsl = false;

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
    logger.log("WSS New Connection");
    wsPool.addToPool(ws);
  });

  const onWebRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    logger.log(`WEB New Request ${req.url}`);

    try {
      let socket = wsPool.getAConnection();
      await handleTransmission(req, res, socket);
    } catch (ex) {
      if (
        ex instanceof CodedError &&
        ex.code === ErrorCode.NO_WORKER_AVAILABLE
      ) {
        res.write("Error: 503 - No worker is available to handle the request");
        res.statusCode = 503;
      } else {
        let message =
          ex && "message" in (ex as any)
            ? (ex as any).message
            : "Internal Server Error";
        res.write(message);
        res.statusCode = 400;
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
      console.log(
        `WEBSERVER running on http://${
          addressInfo.address || addressInfo.port
        }:${config.outerServer.port}`
      );
    }
  );
};
