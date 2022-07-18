import { RelayJsonRpc } from "@walletconnect/relay-api";

export type OnCallback = ({
  params,
  socketId,
}: {
  params: RelayJsonRpc.PublishParams;
  socketId: string;
}) => void;
