import { WebSocket } from "ws";

export type HowsWebSocket = {
  uid: string;
  hasPingBeenSentOut: boolean;
  lastReceiveEpoch: number;
} & WebSocket;

export enum HosToHisMessageType {
  ContainsRequestData = "ContainsRequestData",
  WantsMoreResponseData = "WantsMoreResponseData",
  NotifyingEndOfTransmission = "NotifyingEndOfTransmission",
  KeepAlivePing = "KeepAlivePing",
}

export enum HisToHosMessageType {
  WantsMoreRequestData = "WantsMoreRequestData",
  ContainsResponseData = "ContainsResponseData",
  TransmissionError = "TransmissionError",
  KeepAlivePong = "KeepAlivePong",
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
