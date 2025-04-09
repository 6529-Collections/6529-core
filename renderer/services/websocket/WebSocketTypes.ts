/**
 * WebSocket message structure for type-safe message handling
 */
export interface WebSocketMessage<T = any> {
  type: string;
  data: T;
}

/**
 * Connection status for the WebSocket
 */
export enum WebSocketStatus {
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected'
}

/**
 * Callback type for message subscribers
 */
export type MessageCallback<T = any> = (data: T) => void;

/**
 * Map of message types to their callback sets
 */
export type SubscriberMap = Map<string, Set<MessageCallback>>;

/**
 * Config options for WebSocket connection
 */
export interface WebSocketConfig {
  url: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}