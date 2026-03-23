interface Action<Type, Payload> {
  type: Type;
  payload: Payload;
}

export enum ServiceWorkerMessageType {
  SEND_TO_SCL = "SEND_TO_SCL",
  GET_PROCESSED_DEMO = "GET_PROCESSED_DEMO",
  CHECK_SCL_STATUS = "CHECK_SCL_STATUS",
  CANCEL_UPLOADS = "CANCEL_UPLOADS",
}

export type ServiceWorkerMessage =
  | Action<
      ServiceWorkerMessageType.SEND_TO_SCL,
      { url: string; faceitId: string }
    >
  | Action<
      ServiceWorkerMessageType.GET_PROCESSED_DEMO,
      { faceitId: string }
    >
  | Action<
      ServiceWorkerMessageType.CHECK_SCL_STATUS,
      { matchId: string; mapIndex: number }
    >
  | Action<
      ServiceWorkerMessageType.CANCEL_UPLOADS,
      Record<string, never>
    >;

export enum FaceitErrors {
  NOT_LOGGED_IN_TO_SCL = "NOT_LOGGED_IN_TO_SCL",
  SCL_UPLOAD_FAILED = "SCL_UPLOAD_FAILED",
}
