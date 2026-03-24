/**
 * ============================================================================
 * SIGNALING SERVER — The Matchmaker for WebRTC Peers
 * ============================================================================
 *
 * WHY THIS EXISTS:
 * WebRTC is peer-to-peer, but peers need a way to FIND each other first.
 * WebRTC does NOT define how peers exchange connection info (SDP, ICE candidates).
 * That's OUR job — this signaling server is the "introduction service."
 *
 * WHAT IT DOES:
 * 1. Manages "rooms" — two peers join the same room ID to connect
 * 2. Relays SDP offers/answers between peers (the media negotiation)
 * 3. Relays ICE candidates between peers (the network path discovery)
 *
 * WHAT IT DOES NOT DO:
 * - It NEVER touches audio/video data. That flows directly peer-to-peer.
 * - Once the WebRTC connection is established, this server could go offline
 *   and the call would continue (until new ICE candidates are needed).
 *
 * PROTOCOL:
 * We use WebSockets because they provide low-latency bidirectional messaging,
 * which is perfect for the rapid back-and-forth of SDP/ICE exchange.
 * We could also use HTTP polling, Server-Sent Events, or any other transport.
 * WebRTC doesn't care HOW signaling happens — just that it does.
 * ============================================================================
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

/**
 * Room storage: Maps roomId -> Set of WebSocket connections.
 * Each room holds at most 2 peers (this is a 1:1 video call app).
 */
const rooms = new Map();

/**
 * We create an HTTP server and attach the WebSocket server to it.
 * This lets us serve a /health endpoint for Render's health checks
 * on the same port as the WebSocket server.
 */
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

wss.on("connection", (socket) => {
  let currentRoom = null;

  console.log("New client connected");

  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      console.error("Invalid JSON received");
      return;
    }

    switch (message.type) {
      /**
       * JOIN — A peer wants to enter a room.
       * If the room doesn't exist, create it. If it has 1 peer, add this one.
       * If it already has 2 peers, reject with "room-full".
       */
      case "join": {
        const { roomId } = message;

        if (!roomId) {
          socket.send(JSON.stringify({ type: "error", message: "roomId is required" }));
          return;
        }

        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }

        const room = rooms.get(roomId);

        // Enforce 2-peer limit (1:1 calls only)
        if (room.size >= 2) {
          socket.send(JSON.stringify({ type: "room-full" }));
          return;
        }

        /**
         * IMPORTANT: Notify the EXISTING peer that someone new joined.
         * This is how we decide who creates the SDP offer:
         * - The peer who was already in the room (the one receiving "peer-joined")
         *   becomes the INITIATOR and creates the offer.
         * - The new peer waits for the offer.
         *
         * This avoids "glare" — a situation where both peers simultaneously
         * create offers, which breaks the WebRTC negotiation.
         */
        for (const peer of room) {
          peer.send(JSON.stringify({ type: "peer-joined" }));
        }

        room.add(socket);
        currentRoom = roomId;

        socket.send(JSON.stringify({
          type: "joined",
          roomId,
          peerCount: room.size,
        }));

        console.log(`Client joined room "${roomId}" (${room.size}/2 peers)`);
        break;
      }

      /**
       * OFFER / ANSWER / ICE-CANDIDATE — Relay to the other peer.
       *
       * These messages contain WebRTC connection data:
       * - "offer": SDP describing what media the initiator wants to send/receive
       * - "answer": SDP response from the other peer
       * - "ice-candidate": A potential network path discovered by ICE
       *
       * We relay them verbatim — the signaling server is a dumb pipe.
       * It doesn't need to understand SDP or ICE; it just forwards messages.
       */
      case "offer":
      case "answer":
      case "ice-candidate": {
        if (!currentRoom) return;
        relayToOtherPeer(socket, currentRoom, message);
        break;
      }

      default:
        console.log("Unknown message type:", message.type);
    }
  });

  /**
   * When a peer disconnects, clean up and notify the remaining peer.
   * The remaining peer should close its RTCPeerConnection.
   */
  socket.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(socket);

      // Notify the remaining peer that their partner left
      for (const peer of room) {
        if (peer.readyState === 1) {
          peer.send(JSON.stringify({ type: "peer-left" }));
        }
      }

      // Clean up empty rooms — also clean rooms with only dead sockets
      const alivePeers = [...room].filter((p) => p.readyState === 1);
      if (alivePeers.length === 0) {
        rooms.delete(currentRoom);
      }

      console.log(`Client left room "${currentRoom}" (${alivePeers.length} peers remaining)`);
    }
    currentRoom = null;
  });
});

/**
 * Relay a message to the OTHER peer in the room.
 * Since rooms have exactly 2 peers, we send to everyone except the sender.
 */
function relayToOtherPeer(sender, roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;

  const data = JSON.stringify(message);

  for (const peer of room) {
    if (peer !== sender && peer.readyState === 1) {
      peer.send(data);
    }
  }
}
