/**
 * ============================================================================
 * SIGNALING CLIENT — WebSocket Wrapper for Peer Discovery
 * ============================================================================
 *
 * This is NOT part of WebRTC itself.
 *
 * WebRTC needs an external channel to exchange connection metadata (SDP offers,
 * SDP answers, and ICE candidates) between peers. This is called "signaling."
 *
 * WebRTC deliberately leaves signaling undefined — you can use:
 *   - WebSockets (what we use here — low latency, bidirectional)
 *   - HTTP polling (simple but slower)
 *   - Server-Sent Events (server → client only, would need HTTP for client → server)
 *   - Even copy-paste in a chat window (seriously, some demos do this!)
 *
 * We chose WebSockets because the SDP/ICE exchange is a rapid back-and-forth,
 * and WebSockets give us real-time bidirectional messaging.
 * ============================================================================
 */

/**
 * Creates a signaling client that connects to our WebSocket signaling server.
 *
 * @param {string} roomId - The room to join. Both peers must use the same room ID.
 * @param {object} callbacks - Event handlers:
 *   - onPeerJoined: The other peer entered the room (we should create an offer)
 *   - onPeerLeft: The other peer disconnected
 *   - onOffer: Received an SDP offer from the other peer
 *   - onAnswer: Received an SDP answer from the other peer
 *   - onIceCandidate: Received an ICE candidate from the other peer
 *   - onRoomFull: Room already has 2 peers
 *   - onJoined: Successfully joined the room
 *   - onLog: Every signaling event, for the educational event log
 */
export function createSignalingClient(roomId, callbacks) {
  /**
   * Connect to the signaling server.
   * In development, Vite proxies /ws to localhost:8080.
   * In production, you'd point this at your deployed server.
   */
  const wsUrl = import.meta.env.VITE_SIGNALING_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8080`;
  const socket = new WebSocket(wsUrl);

  function log(event, detail) {
    callbacks.onLog?.({ timestamp: new Date(), event, detail });
  }

  socket.onopen = () => {
    log("SIGNALING", "Connected to signaling server");

    // Tell the server which room we want to join
    send({ type: "join", roomId });
    log("SIGNALING", `Requesting to join room "${roomId}"`);
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case "joined":
        log("SIGNALING", `Joined room "${message.roomId}" (${message.peerCount}/2 peers)`);
        callbacks.onJoined?.(message);
        break;

      case "peer-joined":
        /**
         * Another peer entered our room.
         * WE are the initiator — we need to create the SDP offer.
         * The server sends this ONLY to the peer who was already in the room,
         * which prevents both peers from creating offers simultaneously.
         */
        log("SIGNALING", "A peer joined the room — we will create the offer");
        callbacks.onPeerJoined?.();
        break;

      case "peer-left":
        log("SIGNALING", "Peer left the room");
        callbacks.onPeerLeft?.();
        break;

      case "offer":
        /**
         * We received an SDP offer. This means we are the SECOND peer,
         * and we need to create an SDP answer.
         */
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

      case "room-full":
        log("ERROR", "Room is full (max 2 peers for 1:1 call)");
        callbacks.onRoomFull?.();
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
    }
  }

  function sendOffer(sdp) {
    log("SIGNALING", "Sending SDP offer to remote peer");
    send({ type: "offer", sdp });
  }

  function sendAnswer(sdp) {
    log("SIGNALING", "Sending SDP answer to remote peer");
    send({ type: "answer", sdp });
  }

  function sendIceCandidate(candidate) {
    log("ICE", `Sending local ICE candidate: ${candidate.candidate?.split(" ")[7] || "unknown"} ${candidate.candidate?.split(" ")[2] || ""}`);
    send({ type: "ice-candidate", candidate });
  }

  function disconnect() {
    socket.close();
  }

  return { send, sendOffer, sendAnswer, sendIceCandidate, disconnect };
}
