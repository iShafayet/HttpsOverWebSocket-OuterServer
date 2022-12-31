import { type } from "os";
import wsModule, { WebSocket } from "ws";

export type HowsWebSocket = { uid: string } & WebSocket;

export type HosToHisMessage = {
  uuid: string;
  serial: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  hasMore: boolean;
};

export type HisToHosMessage = {
  uuid: string;
  serial: number;

  type: string; // "acknowledgement", "response", "error"

  statusCode: number; // http status code. Only matters when type === "response" && serial == 0
  headers: Record<string, string>; // only matters when serial == 0

  body: string; // base64
  hasMore: boolean;
};

export enum HisToHosMessageType {
  ACKNOWLEDGEMENT = "acknowledgement",
  RESPONSE = "response",
  ERROR = "error",
}
