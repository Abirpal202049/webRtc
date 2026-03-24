/**
 * ============================================================================
 * SIGNALING + SFU SERVER — mediasoup-powered Multi-Party WebRTC (Phase 3)
 * ============================================================================
 *
 * ARCHITECTURE SHIFT (Phase 2 → Phase 3):
 *
 * Phase 2: Pure signaling relay — 2-person P2P mesh, media flows directly
 *          between browsers. Server never touches audio/video.
 *
 * Phase 3: SFU (Selective Forwarding Unit) — the server receives each
 *          participant's media (via mediasoup) and forwards it to all others.
 *          Each client uploads once, downloads N-1 times. Supports up to 10.
 *
 * WHY SFU?
 * Mesh P2P requires N*(N-1)/2 connections. At 10 people that's 45 connections,
 * each uploading video 9 times. SFU keeps it at N connections total.
 *
 * mediasoup concepts:
 * - Worker: C++ process that handles RTP media forwarding
 * - Router: Per-room media routing table (connects producers to consumers)
 * - Transport: WebRTC connection between a client and the server
 * - Producer: A client sending a media track (audio/video) into the server
 * - Consumer: A client receiving another participant's media from the server
 * ============================================================================
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { randomBytes } from "crypto";
import * as mediasoup from "mediasoup";
import os from "os";

const PORT = process.env.PORT || 8080;
const ANNOUNCED_IP = process.env.ANNOUNCED_IP || null;
const MAX_PARTICIPANTS = 10;

// TURN server config (optional, for NAT traversal reliability)
const TURN_URL = process.env.TURN_URL || null;
const TURN_USERNAME = process.env.TURN_USERNAME || null;
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || null;

function getIceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  if (TURN_URL) {
    servers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }
  return servers;
}

/**
 * mediasoup codec configuration.
 * Opus for audio (48kHz stereo), VP8 and H264 for video.
 */
const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

/**
 * WebRTC transport configuration for mediasoup.
 * listenIps: The server's IP(s) that clients connect to.
 * announcedIp: The public IP if behind NAT (set via ANNOUNCED_IP env var).
 */
function getWebRtcTransportOptions() {
  return {
    listenIps: [
      {
        ip: "0.0.0.0",
        announcedIp: ANNOUNCED_IP || getLocalIp(),
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  };
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

// ── mediasoup Workers ──

const workers = [];
let nextWorkerIdx = 0;

async function createWorkers() {
  const numWorkers = Math.min(os.cpus().length, 2);
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    worker.on("died", () => {
      console.error(`mediasoup worker ${worker.pid} died — exiting`);
      process.exit(1);
    });
    workers.push(worker);
    console.log(`mediasoup worker ${worker.pid} created`);
  }
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

// ── Room storage ──

/**
 * Room structure (Phase 3):
 * {
 *   router: mediasoup.Router,
 *   peers: Map<peerId, {
 *     socket: WebSocket,
 *     displayName: string,
 *     role: "creator" | "joiner",
 *     transports: Map<transportId, Transport>,
 *     producers: Map<producerId, Producer>,
 *     consumers: Map<consumerId, Consumer>,
 *   }>,
 *   pending: Map<pendingId, { socket, displayName }>,
 *   creatorPeerId: string,
 * }
 */
const rooms = new Map();

// ── HTTP health check ──

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      rooms: rooms.size,
      workers: workers.length,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

// ── Helper: send JSON to a socket ──

function sendTo(socket, message) {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

// ── Helper: broadcast to all peers in a room except sender ──

function broadcastToRoom(room, senderPeerId, message) {
  const data = JSON.stringify(message);
  for (const [peerId, peer] of room.peers) {
    if (peerId !== senderPeerId && peer.socket.readyState === 1) {
      peer.socket.send(data);
    }
  }
}

// ── WebSocket connection handler ──

wss.on("connection", (socket) => {
  let currentRoom = null;
  let peerId = null;
  let pendingId = null;

  console.log("New client connected");

  socket.on("message", async (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      console.error("Invalid JSON received");
      return;
    }

    try {
      switch (message.type) {
        // ==================================================================
        // ROOM MANAGEMENT (admission control preserved from Phase 2)
        // ==================================================================

        case "create": {
          const { roomId } = message;
          if (!roomId) {
            sendTo(socket, { type: "error", message: "roomId is required" });
            return;
          }

          if (rooms.has(roomId)) {
            sendTo(socket, { type: "room-exists" });
            return;
          }

          const worker = getNextWorker();
          const router = await worker.createRouter({ mediaCodecs });

          peerId = randomBytes(8).toString("hex");
          currentRoom = roomId;

          // Per-room max participants (chosen by creator, default 10, capped at 50)
          const roomMax = Math.min(Math.max(parseInt(message.maxParticipants) || 10, 2), 50);

          const room = {
            router,
            peers: new Map(),
            pending: new Map(),
            creatorPeerId: peerId,
            maxParticipants: roomMax,
          };

          room.peers.set(peerId, {
            socket,
            displayName: message.displayName || "Host",
            role: "creator",
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
          });

          rooms.set(roomId, room);

          sendTo(socket, { type: "created", roomId, peerId, maxParticipants: roomMax });
          console.log(`Room "${roomId}" created (peerId: ${peerId})`);
          break;
        }

        case "join-request": {
          const { roomId, displayName } = message;
          if (!roomId) {
            sendTo(socket, { type: "error", message: "roomId is required" });
            return;
          }

          if (!rooms.has(roomId)) {
            sendTo(socket, { type: "room-not-found" });
            return;
          }

          const room = rooms.get(roomId);

          if (room.peers.size >= (room.maxParticipants || MAX_PARTICIPANTS)) {
            sendTo(socket, { type: "room-full" });
            return;
          }

          const id = randomBytes(8).toString("hex");
          pendingId = id;
          currentRoom = roomId;

          room.pending.set(id, { socket, displayName });

          // Notify the creator
          const creatorPeer = room.peers.get(room.creatorPeerId);
          if (creatorPeer) {
            sendTo(creatorPeer.socket, {
              type: "join-request",
              pendingId: id,
              displayName: displayName || null,
            });
          }

          sendTo(socket, { type: "waiting", roomId });
          console.log(`Join request for room "${roomId}" (pending: ${id})`);
          break;
        }

        case "admit": {
          const { pendingId: pid } = message;
          if (!currentRoom) return;

          const room = rooms.get(currentRoom);
          if (!room || peerId !== room.creatorPeerId) return;

          const pendingEntry = room.pending.get(pid);
          if (!pendingEntry) return;

          room.pending.delete(pid);

          if (room.peers.size >= (room.maxParticipants || MAX_PARTICIPANTS)) {
            sendTo(pendingEntry.socket, { type: "room-full" });
            return;
          }

          // Generate peerId for the new participant
          const joinerPeerId = pid; // reuse pendingId as peerId
          const joinerSocket = pendingEntry.socket;

          room.peers.set(joinerPeerId, {
            socket: joinerSocket,
            displayName: pendingEntry.displayName || "Guest",
            role: "joiner",
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
          });

          // Update joiner's connection state
          // We need to communicate to the joiner's socket handler
          joinerSocket.__peerId = joinerPeerId;
          joinerSocket.__currentRoom = currentRoom;

          // Tell the joiner they're admitted
          sendTo(joinerSocket, {
            type: "admitted",
            roomId: currentRoom,
            peerId: joinerPeerId,
            peerCount: room.peers.size,
          });

          // Build a list of existing peers and their producers for the joiner
          const existingPeers = [];
          for (const [pid, peer] of room.peers) {
            if (pid !== joinerPeerId) {
              const producers = [];
              for (const [producerId, producer] of peer.producers) {
                producers.push({
                  producerId,
                  kind: producer.kind,
                  appData: producer.appData,
                });
              }
              existingPeers.push({
                peerId: pid,
                displayName: peer.displayName,
                producers,
              });
            }
          }

          sendTo(joinerSocket, {
            type: "existing-peers",
            peers: existingPeers,
          });

          // Notify all existing peers about the new participant
          broadcastToRoom(room, joinerPeerId, {
            type: "peer-joined",
            peerId: joinerPeerId,
            displayName: pendingEntry.displayName || "Guest",
          });

          console.log(`Joiner admitted to room "${currentRoom}" (${room.peers.size}/${room.maxParticipants})`);
          break;
        }

        case "deny": {
          const { pendingId: pid } = message;
          if (!currentRoom) return;

          const room = rooms.get(currentRoom);
          if (!room || peerId !== room.creatorPeerId) return;

          const pendingEntry = room.pending.get(pid);
          if (!pendingEntry) return;

          sendTo(pendingEntry.socket, { type: "denied" });
          room.pending.delete(pid);
          console.log(`Joiner denied from room "${currentRoom}"`);
          break;
        }

        // ==================================================================
        // mediasoup SIGNALING — Transport, Producer, Consumer management
        // ==================================================================

        case "get-router-rtp-capabilities": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          sendTo(socket, {
            type: "router-rtp-capabilities",
            rtpCapabilities: room.router.rtpCapabilities,
            iceServers: getIceServers(),
          });
          break;
        }

        case "create-transport": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          // Use peerId from socket if this is an admitted joiner
          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const transport = await room.router.createWebRtcTransport(
            getWebRtcTransportOptions()
          );

          transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "closed") {
              transport.close();
            }
          });

          peer.transports.set(transport.id, transport);

          sendTo(socket, {
            type: "transport-created",
            transportId: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            direction: message.direction, // echo back "send" or "recv"
          });
          break;
        }

        case "connect-transport": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const transport = peer.transports.get(message.transportId);
          if (!transport) return;

          await transport.connect({ dtlsParameters: message.dtlsParameters });

          sendTo(socket, {
            type: "transport-connected",
            transportId: message.transportId,
          });
          break;
        }

        case "produce": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const transport = peer.transports.get(message.transportId);
          if (!transport) return;

          const producer = await transport.produce({
            kind: message.kind,
            rtpParameters: message.rtpParameters,
            appData: message.appData || {},
          });

          peer.producers.set(producer.id, producer);

          producer.on("transportclose", () => {
            peer.producers.delete(producer.id);
          });

          sendTo(socket, {
            type: "produced",
            producerId: producer.id,
          });

          // Notify all other peers about this new producer
          broadcastToRoom(room, effectivePeerId, {
            type: "new-producer",
            peerId: effectivePeerId,
            producerId: producer.id,
            kind: producer.kind,
            appData: producer.appData,
          });

          break;
        }

        case "consume": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const { producerId, rtpCapabilities } = message;

          if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            sendTo(socket, {
              type: "consume-failed",
              producerId,
              reason: "cannot consume",
            });
            return;
          }

          // Find the receive transport
          let recvTransport = null;
          for (const [, t] of peer.transports) {
            // The recv transport is the one that hasn't produced anything
            // We identify it by checking if it's the transport the client told us about
            if (message.transportId) {
              if (t.id === message.transportId) {
                recvTransport = t;
                break;
              }
            }
          }

          if (!recvTransport) {
            // Fallback: use the transport specified or first available
            for (const [, t] of peer.transports) {
              recvTransport = t;
              break;
            }
          }

          if (!recvTransport) return;

          const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // start paused, client resumes after setup
          });

          peer.consumers.set(consumer.id, consumer);

          consumer.on("transportclose", () => {
            peer.consumers.delete(consumer.id);
          });

          consumer.on("producerclose", () => {
            peer.consumers.delete(consumer.id);
            sendTo(socket, {
              type: "producer-closed",
              consumerId: consumer.id,
              producerId,
            });
          });

          consumer.on("producerpause", () => {
            sendTo(socket, {
              type: "producer-paused",
              consumerId: consumer.id,
              producerId,
            });
          });

          consumer.on("producerresume", () => {
            sendTo(socket, {
              type: "producer-resumed",
              consumerId: consumer.id,
              producerId,
            });
          });

          sendTo(socket, {
            type: "consumed",
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
          });

          break;
        }

        case "resume-consumer": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const consumer = peer.consumers.get(message.consumerId);
          if (!consumer) return;

          await consumer.resume();
          break;
        }

        case "pause-producer": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const producer = peer.producers.get(message.producerId);
          if (producer) await producer.pause();
          break;
        }

        case "resume-producer": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const producer = peer.producers.get(message.producerId);
          if (producer) await producer.resume();
          break;
        }

        case "set-preferred-layers": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const consumer = peer.consumers.get(message.consumerId);
          if (consumer) {
            await consumer.setPreferredLayers({
              spatialLayer: message.spatialLayer ?? 2,
              temporalLayer: message.temporalLayer ?? undefined,
            });
            sendTo(socket, {
              type: "preferred-layers-set",
              consumerId: message.consumerId,
              spatialLayer: message.spatialLayer,
            });
          }
          break;
        }

        case "close-producer": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          const peer = room.peers.get(effectivePeerId);
          if (!peer) return;

          const producer = peer.producers.get(message.producerId);
          if (producer) {
            producer.close();
            peer.producers.delete(message.producerId);
          }
          break;
        }

        // ==================================================================
        // MEDIA STATE — relayed to all peers (unchanged semantics)
        // ==================================================================

        case "media-state": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          broadcastToRoom(room, effectivePeerId, {
            ...message,
            peerId: effectivePeerId,
          });
          break;
        }

        case "screen-share-state": {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const effectivePeerId = peerId || socket.__peerId;
          broadcastToRoom(room, effectivePeerId, {
            ...message,
            peerId: effectivePeerId,
          });
          break;
        }

        default:
          console.log("Unknown message type:", message.type);
      }
    } catch (err) {
      console.error(`Error handling "${message.type}":`, err.message);
      sendTo(socket, { type: "error", message: err.message });
    }
  });

  /**
   * Disconnect cleanup — close all mediasoup transports (which auto-closes
   * producers and consumers), notify remaining peers.
   */
  socket.on("close", () => {
    const effectivePeerId = peerId || socket.__peerId;
    const effectiveRoom = currentRoom || socket.__currentRoom;

    if (!effectiveRoom || !rooms.has(effectiveRoom)) return;

    const room = rooms.get(effectiveRoom);

    // Check if this is a pending joiner
    if (pendingId && room.pending.has(pendingId)) {
      room.pending.delete(pendingId);
      console.log(`Pending joiner left room "${effectiveRoom}"`);
      return;
    }

    const peer = room.peers.get(effectivePeerId);
    if (!peer) return;

    // Close all transports (auto-closes producers and consumers)
    for (const [, transport] of peer.transports) {
      transport.close();
    }

    room.peers.delete(effectivePeerId);

    // Notify remaining peers
    broadcastToRoom(room, effectivePeerId, {
      type: "peer-left",
      peerId: effectivePeerId,
    });

    const isCreator = effectivePeerId === room.creatorPeerId;

    if (isCreator) {
      // Deny all pending joiners
      for (const [, entry] of room.pending) {
        sendTo(entry.socket, { type: "denied" });
      }

      // If creator leaves, close the room entirely
      for (const [, p] of room.peers) {
        sendTo(p.socket, { type: "room-closed" });
        for (const [, transport] of p.transports) {
          transport.close();
        }
      }

      room.router.close();
      rooms.delete(effectiveRoom);
      console.log(`Creator left, room "${effectiveRoom}" destroyed`);
    } else if (room.peers.size === 0) {
      room.router.close();
      rooms.delete(effectiveRoom);
      console.log(`Room "${effectiveRoom}" empty — destroyed`);
    } else {
      console.log(`Peer left room "${effectiveRoom}" (${room.peers.size} remaining)`);
    }
  });
});

// ── Start server ──

async function main() {
  await createWorkers();
  server.listen(PORT, () => {
    console.log(`Signaling + SFU server running on port ${PORT}`);
    console.log(`Local IP: ${getLocalIp()}`);
    console.log(`Announced IP: ${ANNOUNCED_IP || getLocalIp()}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
