/**
 * ============================================================================
 * SIGNALING SERVER — The Matchmaker for WebRTC Peers (Phase 2)
 * ============================================================================
 *
 * WHY THIS EXISTS:
 * WebRTC is peer-to-peer, but peers need a way to FIND each other first.
 * WebRTC does NOT define how peers exchange connection info (SDP, ICE candidates).
 * That's OUR job — this signaling server is the "introduction service."
 *
 * PHASE 2 ADDITIONS:
 * - Meeting rooms are now CREATED by a host (creator), not auto-created on join
 * - Joiners must REQUEST admission; the creator accepts or declines
 * - This mimics Google Meet's "someone is asking to join" flow
 *
 * WHAT IT DOES:
 * 1. Manages "rooms" with a creator (host) and admission control
 * 2. Relays join requests from joiners to the creator
 * 3. On admission, relays SDP offers/answers and ICE candidates between peers
 *
 * WHAT IT DOES NOT DO:
 * - It NEVER touches audio/video data. That flows directly peer-to-peer.
 * ============================================================================
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { randomBytes } from "crypto";

const PORT = process.env.PORT || 8080;

/**
 * Room storage — refactored from Phase 1.
 *
 * Phase 1: Map<roomId, Set<WebSocket>>
 * Phase 2: Map<roomId, {
 *   creator: WebSocket,
 *   admitted: Set<WebSocket>,
 *   pending: Map<pendingId, { socket: WebSocket, displayName?: string }>
 * }>
 *
 * The creator is the person who generated the meeting code.
 * "admitted" holds sockets that are fully in the call (starts with creator).
 * "pending" holds joiners waiting for the creator to accept/decline.
 */
const rooms = new Map();

/**
 * HTTP server for health checks (Render deployment).
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
  let role = null; // "creator" or "joiner"
  let pendingId = null; // only set for pending joiners

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
       * CREATE — The creator (host) creates a new meeting room.
       * They are immediately added to the "admitted" set.
       */
      case "create": {
        const { roomId } = message;

        if (!roomId) {
          socket.send(JSON.stringify({ type: "error", message: "roomId is required" }));
          return;
        }

        // Check if room already exists
        if (rooms.has(roomId)) {
          socket.send(JSON.stringify({ type: "room-exists" }));
          return;
        }

        const room = {
          creator: socket,
          admitted: new Set([socket]),
          pending: new Map(),
        };

        rooms.set(roomId, room);
        currentRoom = roomId;
        role = "creator";

        socket.send(JSON.stringify({ type: "created", roomId }));
        console.log(`Room "${roomId}" created`);
        break;
      }

      /**
       * JOIN-REQUEST — A joiner wants to enter a room.
       * They are placed in the "pending" queue and the creator is notified.
       * The joiner must wait for the creator to accept or decline.
       */
      case "join-request": {
        const { roomId, displayName } = message;

        if (!roomId) {
          socket.send(JSON.stringify({ type: "error", message: "roomId is required" }));
          return;
        }

        // Room doesn't exist yet — creator hasn't started
        if (!rooms.has(roomId)) {
          socket.send(JSON.stringify({ type: "room-not-found" }));
          return;
        }

        const room = rooms.get(roomId);

        // Room already has 2 admitted people
        if (room.admitted.size >= 2) {
          socket.send(JSON.stringify({ type: "room-full" }));
          return;
        }

        // Generate a unique ID for this pending request
        const id = randomBytes(8).toString("hex");
        pendingId = id;
        currentRoom = roomId;
        role = "joiner";

        room.pending.set(id, { socket, displayName });

        // Notify the creator that someone wants to join
        if (room.creator && room.creator.readyState === 1) {
          room.creator.send(JSON.stringify({
            type: "join-request",
            pendingId: id,
            displayName: displayName || null,
          }));
        }

        // Tell the joiner their request is pending
        socket.send(JSON.stringify({ type: "waiting", roomId }));
        console.log(`Join request for room "${roomId}" (pending: ${id})`);
        break;
      }

      /**
       * ADMIT — The creator accepts a pending joiner.
       * Move the joiner from "pending" to "admitted" and start the WebRTC flow.
       */
      case "admit": {
        const { pendingId: pid } = message;

        if (!currentRoom || role !== "creator") return;

        const room = rooms.get(currentRoom);
        if (!room) return;

        const pendingEntry = room.pending.get(pid);
        if (!pendingEntry) return;

        const joinerSocket = pendingEntry.socket;
        room.pending.delete(pid);

        // Check if room still has space
        if (room.admitted.size >= 2) {
          if (joinerSocket.readyState === 1) {
            joinerSocket.send(JSON.stringify({ type: "room-full" }));
          }
          return;
        }

        // Add joiner to admitted
        room.admitted.add(joinerSocket);

        // Tell the joiner they've been admitted
        if (joinerSocket.readyState === 1) {
          joinerSocket.send(JSON.stringify({
            type: "admitted",
            roomId: currentRoom,
            peerCount: room.admitted.size,
          }));
        }

        /**
         * Tell the creator that a peer has joined (triggers WebRTC offer creation).
         * This is the same "peer-joined" message from Phase 1 — the WebRTC
         * handshake flow is unchanged from this point on.
         */
        socket.send(JSON.stringify({ type: "peer-joined" }));

        console.log(`Joiner admitted to room "${currentRoom}" (${room.admitted.size}/2)`);
        break;
      }

      /**
       * DENY — The creator rejects a pending joiner.
       */
      case "deny": {
        const { pendingId: pid } = message;

        if (!currentRoom || role !== "creator") return;

        const room = rooms.get(currentRoom);
        if (!room) return;

        const pendingEntry = room.pending.get(pid);
        if (!pendingEntry) return;

        // Notify the joiner they were denied
        if (pendingEntry.socket.readyState === 1) {
          pendingEntry.socket.send(JSON.stringify({ type: "denied" }));
        }

        room.pending.delete(pid);
        console.log(`Joiner denied from room "${currentRoom}"`);
        break;
      }

      /**
       * OFFER / ANSWER / ICE-CANDIDATE — Relay to the other admitted peer.
       * This is unchanged from Phase 1 — once both peers are admitted,
       * the WebRTC handshake proceeds exactly the same way.
       */
      case "offer":
      case "answer":
      case "ice-candidate": {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const data = JSON.stringify(message);
        for (const peer of room.admitted) {
          if (peer !== socket && peer.readyState === 1) {
            peer.send(data);
          }
        }
        break;
      }

      /**
       * MEDIA-STATE — Explicit notification that a peer toggled their camera/mic.
       * Relayed to the other admitted peer so they can update their UI.
       * This is separate from the WebRTC track mute/unmute events, which
       * are unreliable across browsers.
       */
      case "media-state": {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        console.log(`media-state from room "${currentRoom}": video=${message.video}`);

        const stateData = JSON.stringify(message);
        for (const peer of room.admitted) {
          if (peer !== socket && peer.readyState === 1) {
            peer.send(stateData);
          }
        }
        break;
      }

      /**
       * SCREEN-SHARE-STATE — Notification that a peer started/stopped screen sharing.
       * Relayed to the other peer so they can update their UI layout.
       */
      case "screen-share-state": {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        console.log(`screen-share-state from room "${currentRoom}": sharing=${message.sharing}`);

        const shareData = JSON.stringify(message);
        for (const peer of room.admitted) {
          if (peer !== socket && peer.readyState === 1) {
            peer.send(shareData);
          }
        }
        break;
      }

      default:
        console.log("Unknown message type:", message.type);
    }
  });

  /**
   * When a socket disconnects, handle cleanup based on their role.
   */
  socket.on("close", () => {
    if (!currentRoom || !rooms.has(currentRoom)) {
      currentRoom = null;
      return;
    }

    const room = rooms.get(currentRoom);

    if (role === "creator") {
      /**
       * Creator disconnected — deny all pending joiners and notify admitted peers.
       * The room can't continue without a creator, so clean up everything.
       */
      for (const [, entry] of room.pending) {
        if (entry.socket.readyState === 1) {
          entry.socket.send(JSON.stringify({ type: "denied" }));
        }
      }

      for (const peer of room.admitted) {
        if (peer !== socket && peer.readyState === 1) {
          peer.send(JSON.stringify({ type: "peer-left" }));
        }
      }

      rooms.delete(currentRoom);
      console.log(`Creator left, room "${currentRoom}" destroyed`);
    } else if (role === "joiner") {
      // If joiner was pending, just remove from pending
      if (pendingId && room.pending.has(pendingId)) {
        room.pending.delete(pendingId);
        console.log(`Pending joiner left room "${currentRoom}"`);
      }

      // If joiner was admitted, notify the other peer
      if (room.admitted.has(socket)) {
        room.admitted.delete(socket);
        for (const peer of room.admitted) {
          if (peer.readyState === 1) {
            peer.send(JSON.stringify({ type: "peer-left" }));
          }
        }
        console.log(`Admitted joiner left room "${currentRoom}" (${room.admitted.size} remaining)`);
      }

      // Clean up room if empty
      if (room.admitted.size === 0) {
        rooms.delete(currentRoom);
      }
    }

    currentRoom = null;
  });
});
