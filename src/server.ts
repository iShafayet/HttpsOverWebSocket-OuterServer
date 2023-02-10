import http from "http";
import https from "https";
import { AddressInfo } from "net";
import wsModule, { WebSocketServer } from "ws";
import { Config } from "./lib/config.js";
import { ConnectionPool } from "./lib/connection-pool.js";
import { RequestHandler } from "./lib/request-handler.js";
import { prepareSslDetails } from "./utility/ssl-utils.js";

let wsPool: ConnectionPool;
let wss: wsModule.Server<wsModule.WebSocket>;
let httpServer: http.Server;

let usingSsl = false;

const createWebSocketServer = async () => {
  wss = new WebSocketServer({ server: httpServer });
};

const createWebServer = async (config: Config) => {
  if (usingSsl) {
    let sslDetails = prepareSslDetails(config);
    httpServer = https.createServer(sslDetails);
  } else {
    httpServer = http.createServer();
  }
};

export const startServer = async (config: Config) => {
  usingSsl = config.ssl.enabled;

  await createWebServer(config);
  await createWebSocketServer();

  wsPool = new ConnectionPool(wss, config);
  await wsPool.start();

  wss.on("connection", function connection(ws) {
    logger.log("WSS: New Connection. Adding to pool.");
    wsPool.addToPool(ws);
  });

  const onWebRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    logger.log(
      `WEBSERVER: New Request ${req.url}. Creating new <RequestHandler>.`
    );
    try {
      let requestHandler = new RequestHandler(wsPool, req, res, config);
      await requestHandler.initiateRequestHandling();
    } catch (ex) {
      logger.log(
        "WEBSERVER: Following excpetion while creating <RequestHandler>."
      );
      logger.error(ex as Error);

      if (!res.headersSent) {
        res.statusCode = 500;
      }
      let message =
        ex && "message" in (ex as any)
          ? (ex as any).message
          : "Internal Server Error";
      res.write(message);

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
