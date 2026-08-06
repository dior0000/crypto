export const QUEUE_NAMES = {
  VISION: "vision",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
