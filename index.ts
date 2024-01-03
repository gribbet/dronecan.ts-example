import type { Message as CanMessage } from "*can.node";
import {
  CanPayload,
  Message,
  biguint,
  byteArray,
  createDronecan,
  enumeration,
  message,
  reference,
  service,
  string,
  uint,
  variableByteArray,
} from "dronecan.ts";
import { createRawChannel } from "socketcan";

const nodeId = 99;

const uavcan_protocol_HardwareVersion = message({
  type: "uavcan.protocol.HardwareVersion",
  definition: {
    major: uint(8),
    minor: uint(8),
    uniqueId: byteArray(16),
    certificateOfAuthenticity: variableByteArray(255),
  },
});

const uavcan_protocol_SoftwareVersion = message({
  type: "uavcan.protocol.SoftwareVersion",
  definition: {
    major: uint(8),
    minor: uint(8),
    optionalFieldFlags: uint(8),
    vcsCommit: uint(32),
    imageCrc: biguint(64),
  },
});

const uavcan_protocol_NodeStatus = message({
  id: 341,
  type: "uavcan.protocol.NodeStatus",
  definition: {
    uptimeSec: uint(32),
    health: enumeration(2, ["ok", "warning", "error", "critical"] as const),
    mode: enumeration(3, [
      "operational",
      "initialization",
      "maintenance",
      "software update",
      4,
      5,
      6,
      "offline",
    ] as const),
    subMode: uint(3),
    vendorSpecificStatusCode: uint(16),
  },
});

export const schema = {
  messages: [uavcan_protocol_NodeStatus],
  services: [
    service({
      type: "uavcan.protocol.GetNodeInfo",
      id: 1,
      request: {},
      response: {
        status: reference(uavcan_protocol_NodeStatus),
        softwareVersion: reference(uavcan_protocol_SoftwareVersion),
        hardwareVersion: reference(uavcan_protocol_HardwareVersion),
        name: string(80),
      },
    }),
  ],
} as const;

const channel = createRawChannel("vcan0");

async function* reader() {
  const queue: CanPayload[] = [];
  channel.addListener("onMessage", ({ id, data }: CanMessage) =>
    queue.push({ id, data })
  );
  while (true)
    if (queue.length > 0) yield queue.shift()!;
    else await new Promise((resolve) => setTimeout(resolve));
}
const read = reader();

const write = ({ id, data }: CanPayload) =>
  channel.send({ id, data: Buffer.from(data), ext: false, rtr: false });

const dronecan = createDronecan({ read, write }, schema, nodeId);

const start = Date.now();
const nodeStatus: () => Message<
  typeof schema,
  "uavcan.protocol.NodeStatus"
> = () => ({
  uptimeSec: Math.floor((Date.now() - start) / 1000),
  health: "ok",
  mode: "operational",
  subMode: 0,
  vendorSpecificStatusCode: 0,
});

setInterval(
  () => dronecan.broadcast("uavcan.protocol.NodeStatus", nodeStatus()),
  1000
);

dronecan.onRequest("uavcan.protocol.GetNodeInfo", () => {
  return {
    status: nodeStatus(),
    softwareVersion: {
      major: 1,
      minor: 0,
      optionalFieldFlags: 0,
      vcsCommit: 0,
      imageCrc: 0n,
    },
    hardwareVersion: {
      major: 1,
      minor: 0,
      uniqueId: new Uint8Array(new Array(16)),
      certificateOfAuthenticity: new Uint8Array(),
    },
    name: "",
  };
});

channel.start();
