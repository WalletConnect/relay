import WebSocket from "ws";

export type SocketData = WebSocket.Data;

export interface SocketConnection extends WebSocket {
  isAlive: boolean;
}

export interface Bucket {
  timestamp_seconds: number;
  counter: number;
}

export interface Socket {
  clientId: string;
  connection: SocketConnection;
  id: string;
}
