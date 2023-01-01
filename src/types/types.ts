import { type } from "os";
import wsModule, { WebSocket } from "ws";

export type HowsWebSocket = { uid: string } & WebSocket;

export enum HosTransmissionInternalState {
  Idle,
  AtLeastOneRequestTransmissionSent,
  ResponseHeadersSent,
  ResponseCleanlyEnded,
  HisError,
  ConnectionError,
}

export type HosTransmission = {
  uuid: string;
  serial: number;
  hasMore: boolean;
  responseHeadersSent: boolean;
  hosTransmissionInternalState: HosTransmissionInternalState;
};

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
  uuid: string;
  serial: number;

  type: HosToHisMessageType;

  method: string | null;
  url: string | null;
  headers: Record<string, string> | null;

  body: string | null;
  hasMore: boolean;
};

export type HisToHosMessage = {
  uuid: string;
  serial: number;

  type: HisToHosMessageType;

  statusCode: number | null;
  headers: Record<string, string> | null;

  body: string | null;
  hasMore: boolean;
};
