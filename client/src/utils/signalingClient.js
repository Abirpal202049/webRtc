/**
 * ============================================================================
 * SIGNALING CLIENT — WebSocket Wrapper for Peer Discovery (Phase 2)
 * ============================================================================
 *
 * This is NOT part of WebRTC itself.
 *
 * Phase 2 changes:
 * - No longer auto-joins on socket open — the caller decides whether to
 *   send "create" (host) or "join-request" (joiner) after connecting.
 * - New message types for admission control: create, join-request, admit, deny.
 * - The existing offer/answer/ice-candidate relay is unchanged.
 * ============================================================================
 */

/**
 * Creates a signaling client that connects to the WebSocket signaling server.
 *
 * @param {object} callbacks - Event handlers:
 *   - onConnected: WebSocket connection established
 *   - onCreated: Room created successfully (creator)
 *   - onRoomExists: Room already exists (creator)
 *   - onJoinRequest: Someone wants to join (creator receives { pendingId, displayName })
 *   - onWaiting: Join request is pending (joiner)
 *   - onAdmitted: Creator let you in (joiner)
 *   - onDenied: Creator rejected you (joiner)
 *   - onRoomNotFound: No such room exists
 *   - onRoomFull: Room already has 2 people
 *   - onPeerJoined: Peer was admitted, start WebRTC (creator)
 *   - onPeerLeft: Other peer disconnected
 *   - onOffer: Received SDP offer
 *   - onAnswer: Received SDP answer
 *   - onIceCandidate: Received ICE candidate
 *   - onLog: Every event, for the educational log panel
 */
export function createSignalingClient(callbacks) {
  const wsUrl = import.meta.env.VITE_SIGNALING_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8080`;
  const socket = new WebSocket(wsUrl);

  function log(event, detail) {
    callbacks.onLog?.({ timestamp: new Date(), event, detail });
  }

  socket.onopen = () => {
    log("SIGNALING", "Connected to signaling server");
    callbacks.onConnected?.();
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      // ── Creator messages ──

      case "created":
        log("SIGNALING", `Room "${message.roomId}" created — waiting for participants`);
        callbacks.onCreated?.(message);
        break;

      case "room-exists":
        log("ERROR", "Room already exists");
        callbacks.onRoomExists?.();
        break;

      case "join-request":
        log("SIGNALING", `Someone wants to join (${message.displayName || "Anonymous"})`);
        callbacks.onJoinRequest?.(message);
        break;

      // ── Joiner messages ──

      case "waiting":
        log("SIGNALING", `Join request sent — waiting for host approval`);
        callbacks.onWaiting?.(message);
        break;

      case "admitted":
        log("SIGNALING", `Admitted to room "${message.roomId}"`);
        callbacks.onAdmitted?.(message);
        break;

      case "denied":
        log("SIGNALING", "Join request was denied by the host");
        callbacks.onDenied?.();
        break;

      case "room-not-found":
        log("SIGNALING", "Room not found — host hasn't started the meeting yet");
        callbacks.onRoomNotFound?.();
        break;

      case "room-full":
        log("ERROR", "Room is full (max 2 people)");
        callbacks.onRoomFull?.();
        break;

      // ── Shared messages (unchanged from Phase 1) ──

      case "peer-joined":
        log("SIGNALING", "Peer joined — creating WebRTC offer");
        callbacks.onPeerJoined?.();
        break;

      case "peer-left":
        log("SIGNALING", "Peer left the room");
        callbacks.onPeerLeft?.();
        break;

      case "offer":
        log("SIGNALING", "Received SDP offer from remote peer");
        callbacks.onOffer?.(message);
        break;

      case "answer":
        log("SIGNALING", "Received SDP answer from remote peer");
        callbacks.onAnswer?.(message);
        break;

      case "ice-candidate":
        log("ICE", `Received remote ICE candidate: ${message.candidate?.candidate?.split(" ")[7] || "unknown"} ${message.candidate?.candidate?.split(" ")[2] || ""}`);
        callbacks.onIceCandidate?.(message);
        break;

      case "media-state":
        log("MEDIA", `Remote peer camera: ${message.video ? "ON" : "OFF"}`);
        callbacks.onMediaState?.(message);
        break;

      case "screen-share-state":
        log("MEDIA", `Remote peer screen share: ${message.sharing ? "STARTED" : "STOPPED"}`);
        callbacks.onScreenShareState?.(message);
        break;

      case "error":
        log("ERROR", message.message);
        break;
    }
  };

  socket.onclose = () => {
    log("SIGNALING", "Disconnected from signaling server");
  };

  socket.onerror = () => {
    log("ERROR", "WebSocket connection error — is the signaling server running?");
  };

  function send(message) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn(`[SignalingClient] Cannot send "${message.type}" — WebSocket state: ${socket.readyState}`);
    }
  }

  // ── Creator actions ──

  function sendCreate(roomId) {
    log("SIGNALING", `Creating room "${roomId}"`);
    send({ type: "create", roomId });
  }

  function sendAdmit(pendingId) {
    log("SIGNALING", "Admitting joiner");
    send({ type: "admit", pendingId });
  }

  function sendDeny(pendingId) {
    log("SIGNALING", "Denying joiner");
    send({ type: "deny", pendingId });
  }

  // ── Joiner actions ──

  function sendJoinRequest(roomId, displayName) {
    log("SIGNALING", `Requesting to join room "${roomId}"`);
    send({ type: "join-request", roomId, displayName });
  }

  // ── WebRTC relay (unchanged from Phase 1) ──

  function sendOffer(sdp) {
    log("SIGNALING", "Sending SDP offer to remote peer");
    send({ type: "offer", sdp });
  }

  function sendAnswer(sdp) {
    log("SIGNALING", "Sending SDP answer to remote peer");
    send({ type: "answer", sdp });
  }

  function sendMediaState(video, audio) {
    log("MEDIA", `Sending media state: camera ${video ? "ON" : "OFF"}`);
    send({ type: "media-state", video, audio });
  }

  function sendScreenShareState(sharing) {
    log("MEDIA", `Sending screen share state: ${sharing ? "STARTED" : "STOPPED"}`);
    send({ type: "screen-share-state", sharing });
  }

  function sendIceCandidate(candidate) {
    log("ICE", `Sending local ICE candidate: ${candidate.candidate?.split(" ")[7] || "unknown"} ${candidate.candidate?.split(" ")[2] || ""}`);
    send({ type: "ice-candidate", candidate });
  }

  function disconnect() {
    socket.close();
  }

  return {
    sendCreate,
    sendJoinRequest,
    sendAdmit,
    sendDeny,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendMediaState,
    sendScreenShareState,
    disconnect,
  };
}
