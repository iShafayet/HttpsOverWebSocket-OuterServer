import { WebSocket } from "ws";

export type HowsWebSocket = {
  uid: string;
  isAlive: boolean;
} & WebSocket;

export enum HosToHisMessageType {
  ContainsRequestData = "ContainsRequestData",
  WantsMoreResponseData = "WantsMoreResponseData",
  NotifyingEndOfTransmission = "NotifyingEndOfTransmission",
}

export enum HisToHosMessageType {
  WantsMoreRequestData = "WantsMoreRequestData",
  ContainsResponseData = "ContainsResponseData",
  TransmissionError = "TransmissionError",
}

export type HosToHisMessage = {
  method: string | null;
  url: string | null;
  headers: Record<string, string> | null;

  body: string | null;
  hasMore: boolean;
};

export type HisToHosMessage = {
  statusCode: number | null;
  headers: Record<string, string> | null;

  body: string | null;
  hasMore: boolean;
};
