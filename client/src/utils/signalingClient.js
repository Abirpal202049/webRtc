/**
 * ============================================================================
 * SIGNALING CLIENT — WebSocket Wrapper for SFU Signaling (Phase 3)
 * ============================================================================
 *
 * Phase 3 changes:
 * - Added mediasoup signaling messages: transport creation, produce, consume
 * - Admission control messages (create, join-request, admit, deny) unchanged
 * - Removed raw SDP offer/answer relay (mediasoup handles WebRTC internally)
 * ============================================================================
 */

/**
 * Creates a signaling client that connects to the WebSocket signaling server.
 *
 * @param {object} callbacks - Event handlers for all message types.
 */
export function createSignalingClient(callbacks) {
  // In production (HTTPS), connect to the same host without port (443 is default).
  // In development (HTTP), use port 8080 for the local signaling server.
  const wsUrl = import.meta.env.VITE_SIGNALING_URL
    || (window.location.protocol === "https:"
      ? `wss://${window.location.host}`
      : `ws://${window.location.hostname}:8080`);
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
      // ── Room management ──

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

      case "waiting":
        log("SIGNALING", "Join request sent — waiting for host approval");
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
        log("ERROR", "Room is full (max 10 people)");
        callbacks.onRoomFull?.();
        break;

      case "room-closed":
        log("SIGNALING", "Room was closed by the host");
        callbacks.onRoomClosed?.();
        break;

      // ── Peer events ──

      case "peer-joined":
        log("SIGNALING", `${message.displayName || "Someone"} joined the meeting`);
        callbacks.onPeerJoined?.(message);
        break;

      case "peer-left":
        log("SIGNALING", "A participant left the meeting");
        callbacks.onPeerLeft?.(message);
        break;

      case "existing-peers":
        log("SIGNALING", `${message.peers.length} participant(s) already in the meeting`);
        callbacks.onExistingPeers?.(message);
        break;

      // ── mediasoup signaling ──

      case "router-rtp-capabilities":
        log("MEDIASOUP", "Received router RTP capabilities");
        callbacks.onRouterRtpCapabilities?.(message);
        break;

      case "transport-created":
        log("MEDIASOUP", `Transport created (${message.direction})`);
        callbacks.onTransportCreated?.(message);
        break;

      case "transport-connected":
        log("MEDIASOUP", "Transport connected");
        callbacks.onTransportConnected?.(message);
        break;

      case "produced":
        log("MEDIASOUP", `Producer created: ${message.producerId}`);
        callbacks.onProduced?.(message);
        break;

      case "consumed":
        log("MEDIASOUP", `Consumer created: ${message.consumerId}`);
        callbacks.onConsumed?.(message);
        break;

      case "consume-failed":
        log("ERROR", `Cannot consume producer: ${message.reason}`);
        callbacks.onConsumeFailed?.(message);
        break;

      case "new-producer":
        log("MEDIASOUP", `New producer from peer ${message.peerId} (${message.kind})`);
        callbacks.onNewProducer?.(message);
        break;

      case "producer-closed":
        log("MEDIASOUP", "A producer was closed");
        callbacks.onProducerClosed?.(message);
        break;

      case "producer-paused":
        callbacks.onProducerPaused?.(message);
        break;

      case "producer-resumed":
        callbacks.onProducerResumed?.(message);
        break;

      case "preferred-layers-set":
        log("MEDIASOUP", `Layer switched to spatial=${message.spatialLayer}`);
        callbacks.onPreferredLayersSet?.(message);
        break;

      // ── Media state (relayed with peerId) ──

      case "media-state":
        log("MEDIA", `Peer ${message.peerId}: camera ${message.video ? "ON" : "OFF"}`);
        callbacks.onMediaState?.(message);
        break;

      case "screen-share-state":
        log("MEDIA", `Peer ${message.peerId}: screen share ${message.sharing ? "STARTED" : "STOPPED"}`);
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

  // ── Room management ──

  function sendCreate(roomId, displayName, maxParticipants) {
    log("SIGNALING", `Creating room "${roomId}" (max: ${maxParticipants || 10})`);
    send({ type: "create", roomId, displayName, maxParticipants });
  }

  function sendJoinRequest(roomId, displayName) {
    log("SIGNALING", `Requesting to join room "${roomId}"`);
    send({ type: "join-request", roomId, displayName });
  }

  function sendAdmit(pendingId) {
    log("SIGNALING", "Admitting joiner");
    send({ type: "admit", pendingId });
  }

  function sendDeny(pendingId) {
    log("SIGNALING", "Denying joiner");
    send({ type: "deny", pendingId });
  }

  // ── mediasoup signaling ──

  function sendGetRouterRtpCapabilities() {
    send({ type: "get-router-rtp-capabilities" });
  }

  function sendCreateTransport(direction) {
    send({ type: "create-transport", direction });
  }

  function sendConnectTransport(transportId, dtlsParameters) {
    send({ type: "connect-transport", transportId, dtlsParameters });
  }

  function sendProduce(transportId, kind, rtpParameters, appData) {
    send({ type: "produce", transportId, kind, rtpParameters, appData });
  }

  function sendConsume(producerId, rtpCapabilities, transportId) {
    send({ type: "consume", producerId, rtpCapabilities, transportId });
  }

  function sendResumeConsumer(consumerId) {
    send({ type: "resume-consumer", consumerId });
  }

  function sendPauseProducer(producerId) {
    send({ type: "pause-producer", producerId });
  }

  function sendResumeProducer(producerId) {
    send({ type: "resume-producer", producerId });
  }

  function sendCloseProducer(producerId) {
    send({ type: "close-producer", producerId });
  }

  function sendSetPreferredLayers(consumerId, spatialLayer, temporalLayer) {
    send({ type: "set-preferred-layers", consumerId, spatialLayer, temporalLayer });
  }

  // ── Media state ──

  function sendMediaState(video, audio) {
    log("MEDIA", `Sending media state: camera ${video ? "ON" : "OFF"}`);
    send({ type: "media-state", video, audio });
  }

  function sendScreenShareState(sharing) {
    log("MEDIA", `Sending screen share state: ${sharing ? "STARTED" : "STOPPED"}`);
    send({ type: "screen-share-state", sharing });
  }

  function disconnect() {
    socket.close();
  }

  return {
    // Room management
    sendCreate,
    sendJoinRequest,
    sendAdmit,
    sendDeny,
    // mediasoup
    sendGetRouterRtpCapabilities,
    sendCreateTransport,
    sendConnectTransport,
    sendProduce,
    sendConsume,
    sendResumeConsumer,
    sendPauseProducer,
    sendResumeProducer,
    sendCloseProducer,
    sendSetPreferredLayers,
    // Media state
    sendMediaState,
    sendScreenShareState,
    // Connection
    disconnect,
  };
}
