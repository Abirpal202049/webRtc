/**
 * ============================================================================
 * useWebRTC — The Core WebRTC Hook (THE MAIN EDUCATIONAL FILE)
 * ============================================================================
 *
 * This hook encapsulates the entire WebRTC peer-to-peer connection lifecycle.
 * Each step is heavily commented to explain what's happening and WHY.
 *
 * ── THE BIG PICTURE ──
 *
 * WebRTC (Web Real-Time Communication) enables browsers to exchange audio,
 * video, and data DIRECTLY between each other — no media server in the middle.
 *
 * But setting up that direct connection is complex because of how the internet
 * works. Most devices are behind NAT (Network Address Translation) and firewalls.
 * Your computer knows its local IP (like 192.168.1.10), but the other peer needs
 * your PUBLIC IP and port to reach you.
 *
 * ── WHY UDP? ──
 *
 * WebRTC sends media over UDP (User Datagram Protocol), not TCP.
 *
 * TCP guarantees delivery: if a packet is lost, it retransmits and waits.
 * This is great for web pages and file downloads, but TERRIBLE for live video.
 * Imagine if your video froze for 200ms every time a packet was lost, waiting
 * for the retransmission — the call would feel broken.
 *
 * UDP has NO delivery guarantee. If a packet is lost, it's gone.
 * For video, this means you might see a brief glitch, but the stream keeps
 * flowing in real-time. A dropped frame is better than a delayed one.
 *
 * The actual protocol stack is:
 *   UDP → ICE (connectivity) → DTLS (encryption) → SRTP (media transport)
 *
 * ── THE CONNECTION FLOW ──
 *
 * 1. Get camera/mic access (getUserMedia)
 * 2. Create RTCPeerConnection (the WebRTC engine)
 * 3. Add local media tracks to the connection
 * 4. Exchange SDP (Session Description Protocol) — what media each peer supports
 * 5. Exchange ICE candidates — potential network paths between peers
 * 6. ICE finds a working path → DTLS handshake → media flows!
 *
 * ============================================================================
 */

import { useState, useRef, useCallback } from "react";
import { createSignalingClient } from "../utils/signalingClient";

export function useWebRTC() {
  // ── State exposed to the UI ──
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceGatheringState, setIceGatheringState] = useState("new");
  const [signalingState, setSignalingState] = useState("stable");
  const [iceCandidates, setIceCandidates] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState(null);

  // ── Refs for mutable objects that shouldn't trigger re-renders ──
  const peerConnectionRef = useRef(null);
  const signalingClientRef = useRef(null);
  const localStreamRef = useRef(null);

  /**
   * Helper: Add an entry to the event log.
   * The ConnectionLog component displays these so you can watch
   * the WebRTC handshake happen in real time.
   */
  const addLog = useCallback((entry) => {
    setEventLog((prev) => [...prev, entry]);
  }, []);

  /**
   * ========================================================================
   * STEP 1: Get User Media (Camera + Microphone)
   * ========================================================================
   *
   * navigator.mediaDevices.getUserMedia() asks the browser for access to
   * the camera and microphone. The browser shows a permission prompt.
   *
   * It returns a MediaStream — an object containing MediaStreamTracks:
   *   - One audio track (from your microphone)
   *   - One video track (from your camera)
   *
   * These tracks will be added to the RTCPeerConnection so the remote
   * peer can receive them.
   */
  const acquireMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      addLog({ timestamp: new Date(), event: "MEDIA", detail: "Acquired local camera and microphone" });
      return stream;
    } catch (err) {
      addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to access media: ${err.message}` });
      throw err;
    }
  }, [addLog]);

  /**
   * ========================================================================
   * STEP 2: Create RTCPeerConnection
   * ========================================================================
   *
   * RTCPeerConnection is THE core WebRTC object. It handles everything:
   *   - ICE candidate gathering (finding network paths to the other peer)
   *   - SDP negotiation (agreeing on codecs and media formats)
   *   - DTLS handshake (setting up encryption — all WebRTC media is encrypted!)
   *   - SRTP media transport (sending encrypted audio/video over UDP)
   *
   * ── ICE SERVERS ──
   *
   * We configure STUN (Session Traversal Utilities for NAT) servers.
   *
   * STUN servers help peers discover their PUBLIC IP address.
   * Your computer knows it's 192.168.1.10 (local), but the other peer
   * needs to reach you at your public IP (e.g., 203.0.113.5).
   *
   * How STUN works:
   * 1. Your browser sends a packet to the STUN server
   * 2. The STUN server sees your public IP:port (from the packet's source)
   * 3. It sends that information back to you
   * 4. Now you know your "server-reflexive" address — your public-facing IP
   *
   * TURN (Traversal Using Relays around NAT) servers are the fallback.
   * When STUN fails (both peers behind symmetric NAT), TURN relays all
   * media traffic through itself. Slower, but always works.
   * We don't configure TURN here — STUN works for local network testing.
   */
  const createPeerConnection = useCallback(
    (signalingClient) => {
      const config = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      };

      addLog({
        timestamp: new Date(),
        event: "WEBRTC",
        detail: "Creating RTCPeerConnection with STUN servers (stun.l.google.com)",
      });

      const pc = new RTCPeerConnection(config);

      /**
       * ====================================================================
       * STEP 3: Add Local Tracks
       * ====================================================================
       *
       * Each media track (audio, video) is added to the peer connection.
       * This tells WebRTC what media we want to SEND to the remote peer.
       *
       * When we create the SDP offer later, it will include descriptions
       * of these tracks — codec preferences, resolution, etc.
       */
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        addLog({
          timestamp: new Date(),
          event: "WEBRTC",
          detail: `Added ${stream.getTracks().length} local tracks (${stream.getTracks().map((t) => t.kind).join(" + ")})`,
        });
      }

      /**
       * ====================================================================
       * STEP 4: Listen for Remote Tracks
       * ====================================================================
       *
       * When the remote peer adds their tracks and the connection succeeds,
       * the 'track' event fires. The event includes a MediaStream that
       * we attach to the remote <video> element.
       *
       * Note: We set the <video> element's srcObject (not src).
       * MediaStreams are not URL-based — they're live data.
       */
      pc.ontrack = (event) => {
        addLog({
          timestamp: new Date(),
          event: "WEBRTC",
          detail: `Remote track received (${event.track.kind})`,
        });
        setRemoteStream(event.streams[0]);

        /**
         * Listen for the remote video track being muted/unmuted or ended.
         *
         * When the remote peer stops their camera (replaceTrack(null)),
         * the track fires a "mute" event. When they re-acquire the camera
         * and replaceTrack(newTrack), it fires "unmute".
         *
         * Without this, the remote <video> element just freezes on the
         * last frame — because the stream object still exists, the UI
         * keeps rendering the <video> element with stale data.
         */
        if (event.track.kind === "video") {
          setIsRemoteVideoEnabled(true);
          event.track.onmute = () => setIsRemoteVideoEnabled(false);
          event.track.onunmute = () => setIsRemoteVideoEnabled(true);
          event.track.onended = () => setIsRemoteVideoEnabled(false);
        }
      };

      /**
       * ====================================================================
       * STEP 5: ICE Candidate Handling
       * ====================================================================
       *
       * ICE = Interactive Connectivity Establishment
       *
       * The browser gathers "candidates" — potential network paths:
       *
       *   1. HOST candidates: Your local IP addresses (192.168.x.x)
       *      → Works if both peers are on the same local network
       *
       *   2. SERVER-REFLEXIVE (srflx) candidates: Your public IP (via STUN)
       *      → Works when at least one peer has a permissive NAT
       *
       *   3. RELAY candidates: A TURN server address (fallback)
       *      → Always works, but all traffic goes through the TURN server
       *
       * Each candidate is sent to the remote peer through our signaling server.
       * The remote peer adds it with addIceCandidate() and tries to reach us
       * through that path.
       *
       * This is called "TRICKLE ICE" — candidates are sent as they're discovered,
       * rather than waiting for all candidates before sending the SDP.
       * This speeds up connection establishment significantly.
       */
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalingClient.sendIceCandidate(event.candidate);

          // Parse the candidate string to extract useful info for the UI
          const parts = event.candidate.candidate.split(" ");
          const candidateInfo = {
            type: parts[7] || "unknown", // host, srflx, or relay
            protocol: parts[2] || "unknown", // udp or tcp
            address: parts[4] || "unknown",
            port: parts[5] || "unknown",
            raw: event.candidate.candidate,
          };

          setIceCandidates((prev) => [...prev, candidateInfo]);
        }
      };

      /**
       * ====================================================================
       * STEP 6: Monitor Connection State Changes
       * ====================================================================
       *
       * RTCPeerConnection has THREE separate state machines running:
       *
       * 1. connectionState — The overall connection state:
       *    new → connecting → connected → disconnected → failed → closed
       *
       * 2. iceGatheringState — ICE candidate discovery progress:
       *    new → gathering → complete
       *
       * 3. signalingState — The SDP offer/answer negotiation state:
       *    stable → have-local-offer → have-remote-offer → stable (again)
       *
       * These run CONCURRENTLY. You'll see iceGatheringState go through
       * its full cycle while connectionState is still "connecting".
       */
      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        addLog({
          timestamp: new Date(),
          event: "STATE",
          detail: `Connection state: ${pc.connectionState}`,
        });
      };

      pc.onicegatheringstatechange = () => {
        setIceGatheringState(pc.iceGatheringState);
        addLog({
          timestamp: new Date(),
          event: "ICE",
          detail: `ICE gathering state: ${pc.iceGatheringState}`,
        });
      };

      pc.onsignalingstatechange = () => {
        setSignalingState(pc.signalingState);
        addLog({
          timestamp: new Date(),
          event: "STATE",
          detail: `Signaling state: ${pc.signalingState}`,
        });
      };

      peerConnectionRef.current = pc;
      return pc;
    },
    [addLog]
  );

  /**
   * ========================================================================
   * STEP 7: The Offer/Answer Exchange (SDP Negotiation)
   * ========================================================================
   *
   * SDP = Session Description Protocol
   *
   * SDP describes what media each peer can send and receive:
   *   - Supported codecs (VP8, VP9, H.264 for video; Opus for audio)
   *   - Media directions (sendrecv = both send and receive)
   *   - ICE credentials (ufrag/pwd for the ICE connectivity checks)
   *   - DTLS fingerprints (for the encryption handshake)
   *
   * SDP predates WebRTC by decades — it was originally designed for SIP
   * (Session Initiation Protocol) used in VoIP.
   *
   * The exchange follows JSEP (JavaScript Session Establishment Protocol):
   *
   *   Peer A (initiator)          Signaling Server          Peer B
   *   ──────────────────          ────────────────          ──────
   *   createOffer()
   *   setLocalDescription(offer)
   *   ─── offer ──────────────────>─── offer ──────────────>
   *                                                         setRemoteDescription(offer)
   *                                                         createAnswer()
   *                                                         setLocalDescription(answer)
   *                                <── answer ──────────────── answer ──
   *   setRemoteDescription(answer)
   *
   *   At this point both peers know each other's capabilities.
   *   ICE connectivity checks determine the best network path.
   *   Once a path is found → DTLS handshake → media flows!
   */

  /**
   * Step 7a: Create and send an SDP Offer.
   * Called when WE are the initiator (we were in the room first).
   */
  const createOffer = useCallback(
    async (pc, signalingClient) => {
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Creating SDP offer..." });

      // createOffer() generates an SDP based on the tracks we added
      const offer = await pc.createOffer();

      // setLocalDescription() applies the SDP and starts ICE gathering
      await pc.setLocalDescription(offer);
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set local description (offer)" });

      // Send the offer to the remote peer through the signaling server
      signalingClient.sendOffer(pc.localDescription);
    },
    [addLog]
  );

  /**
   * Step 7b: Handle a received SDP Offer and create an Answer.
   * Called when WE are the second peer (the other peer sent us their offer).
   */
  const handleOffer = useCallback(
    async (pc, signalingClient, offer) => {
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Received offer — creating answer..." });

      // setRemoteDescription() tells our peer connection what the other peer wants
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set remote description (offer)" });

      // createAnswer() generates our SDP response
      const answer = await pc.createAnswer();

      // setLocalDescription() applies our answer and starts our ICE gathering
      await pc.setLocalDescription(answer);
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set local description (answer)" });

      // Send the answer back through the signaling server
      signalingClient.sendAnswer(pc.localDescription);
    },
    [addLog]
  );

  /**
   * Step 7c: Handle a received SDP Answer.
   * Called when WE are the initiator and the other peer responded to our offer.
   */
  const handleAnswer = useCallback(
    async (pc, answer) => {
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Applying remote answer" });

      // Now both peers have each other's SDP. Negotiation is complete!
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set remote description (answer) — SDP negotiation complete!" });
    },
    [addLog]
  );

  /**
   * Step 7d: Handle a received ICE Candidate.
   * The remote peer discovered a potential network path and sent it to us.
   */
  const handleIceCandidate = useCallback(
    async (pc, candidate) => {
      try {
        // addIceCandidate() tells our peer connection to try this network path
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to add ICE candidate: ${err.message}` });
      }
    },
    [addLog]
  );

  /**
   * ========================================================================
   * START CALL — Ties everything together
   * ========================================================================
   */
  const startCall = useCallback(
    async (targetRoomId) => {
      /**
       * CLEANUP FIRST: If there's any leftover state from a previous call
       * (e.g., user left and rejoined quickly), clean it up before starting.
       * Without this, stale peer connections or media streams from the
       * previous session can leak through, causing "ghost" duplicates.
       */
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (signalingClientRef.current) {
        signalingClientRef.current.disconnect();
        signalingClientRef.current = null;
      }

      setRoomId(targetRoomId);
      setEventLog([]);
      setIceCandidates([]);
      setConnectionState("new");
      setIceGatheringState("new");
      setSignalingState("stable");
      setRemoteStream(null);
      setLocalStream(null);

      // Step 1: Get camera and microphone
      const stream = await acquireMedia();

      /**
       * Connect to the signaling server and set up message handlers.
       * The signaling server tells us when a peer joins/leaves and
       * relays SDP offers, answers, and ICE candidates.
       *
       * IMPORTANT: We use peerConnectionRef (not a local variable) to track
       * the RTCPeerConnection. A local `let pc` variable inside this closure
       * can get out of sync with the ref — if hangUp() nulls the ref but the
       * closure still holds the old local variable, stale callbacks fire on a
       * "ghost" connection. Using the ref as the single source of truth avoids this.
       */
      const signalingClient = createSignalingClient(targetRoomId, {
        onLog: addLog,

        onJoined: (info) => {
          setInCall(true);
          if (info.peerCount === 2) {
            // We're the second peer — the other peer will send us an offer.
            // We create our RTCPeerConnection now so we're ready to receive it.
            createPeerConnection(signalingClient);
          }
        },

        onPeerJoined: () => {
          /**
           * Someone joined our room — WE are the initiator.
           * Create the RTCPeerConnection and send an SDP offer.
           *
           * The server only sends "peer-joined" to the peer who was
           * already in the room. This prevents both peers from creating
           * offers simultaneously (called "glare").
           */
          const pc = createPeerConnection(signalingClient);
          createOffer(pc, signalingClient);
        },

        onOffer: (message) => {
          if (!peerConnectionRef.current) createPeerConnection(signalingClient);
          handleOffer(peerConnectionRef.current, signalingClient, message.sdp);
        },

        onAnswer: (message) => {
          if (peerConnectionRef.current) handleAnswer(peerConnectionRef.current, message.sdp);
        },

        onIceCandidate: (message) => {
          if (peerConnectionRef.current) handleIceCandidate(peerConnectionRef.current, message.candidate);
        },

        onPeerLeft: () => {
          // The remote peer disconnected — clean up the peer connection
          addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Peer disconnected — closing peer connection" });
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
          setRemoteStream(null);
          setConnectionState("disconnected");
        },

        onRoomFull: () => {
          // Clean up — we can't join this room
          stream.getTracks().forEach((t) => t.stop());
          setLocalStream(null);
          localStreamRef.current = null;
          setInCall(false);
        },
      });

      signalingClientRef.current = signalingClient;
    },
    [acquireMedia, createPeerConnection, createOffer, handleOffer, handleAnswer, handleIceCandidate, addLog]
  );

  /**
   * ========================================================================
   * STEP 8: Hang Up / Cleanup
   * ========================================================================
   *
   * Clean up everything:
   * 1. Close the RTCPeerConnection (stops ICE, DTLS, media transport)
   * 2. Stop all local media tracks (releases camera and microphone)
   * 3. Disconnect from the signaling server
   *
   * After this, media stops flowing and all resources are released.
   */
  const hangUp = useCallback(() => {
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local media tracks (release camera/mic)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Disconnect from signaling server
    if (signalingClientRef.current) {
      signalingClientRef.current.disconnect();
      signalingClientRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("new");
    setIceGatheringState("new");
    setSignalingState("stable");
    setIceCandidates([]);
    setInCall(false);
    setRoomId(null);

    addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Call ended — all resources released" });
  }, [addLog]);

  /**
   * Toggle audio/video by STOPPING and RE-ACQUIRING tracks.
   *
   * WHY NOT just track.enabled = false?
   * ────────────────────────────────────
   * Setting track.enabled = false tells WebRTC to send silence (audio) or
   * black frames (video) instead of real data. But the track is still ALIVE —
   * the browser keeps the hardware open. That's why the green camera light
   * stays on even when you "turn off" the camera.
   *
   * To truly release the hardware (and turn off the green light), you must
   * call track.stop(). This ends the track permanently — it cannot be
   * re-enabled. To turn the camera back on, you need a fresh getUserMedia()
   * call, which gives you a brand-new track.
   *
   * But there's a catch: the RTCPeerConnection is already sending the OLD
   * track to the remote peer. If we just get a new track, the remote peer
   * won't see it. We need to REPLACE the old track on the peer connection's
   * sender using RTCRtpSender.replaceTrack(). This swaps the media source
   * without renegotiating SDP — no new offer/answer exchange needed!
   */
  const toggleAudio = useCallback(async () => {
    if (!localStreamRef.current) return;

    const currentTrack = localStreamRef.current.getAudioTracks()[0];

    if (currentTrack && isAudioEnabled) {
      // TURN OFF: Stop the track to release the microphone hardware
      currentTrack.stop();
      localStreamRef.current.removeTrack(currentTrack);

      // Replace the track on the sender with null so the remote peer knows audio stopped
      if (peerConnectionRef.current) {
        const audioSender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track === currentTrack || s.track?.kind === "audio");
        if (audioSender) {
          await audioSender.replaceTrack(null);
        }
      }

      setIsAudioEnabled(false);
    } else if (!isAudioEnabled) {
      // TURN ON: Get a fresh audio track from the microphone
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = newStream.getAudioTracks()[0];

        // Add the new track to our local stream
        localStreamRef.current.addTrack(newTrack);

        // Replace the track on the peer connection sender so the remote peer hears us again
        if (peerConnectionRef.current) {
          const audioSender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track?.kind === "audio" || (!s.track && s.kind === "audio"));
          if (audioSender) {
            await audioSender.replaceTrack(newTrack);
          }
        }

        setIsAudioEnabled(true);
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to re-acquire microphone: ${err.message}` });
      }
    }
  }, [isAudioEnabled, addLog]);

  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;

    const currentTrack = localStreamRef.current.getVideoTracks()[0];

    if (currentTrack && isVideoEnabled) {
      // TURN OFF: Stop the track to release the camera hardware (green light goes off)
      currentTrack.stop();
      localStreamRef.current.removeTrack(currentTrack);

      // Replace the track on the sender with null so the remote peer's track
      // fires a "mute" event — otherwise their <video> just freezes on the last frame
      if (peerConnectionRef.current) {
        const videoSender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track === currentTrack || s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(null);
        }
      }

      setIsVideoEnabled(false);

      // Update the displayed local stream so the UI reflects the change
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } else if (!isVideoEnabled) {
      // TURN ON: Get a fresh video track from the camera
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];

        // Add the new track to our local stream
        localStreamRef.current.addTrack(newTrack);

        // Replace the track on the peer connection sender so the remote peer sees us again
        if (peerConnectionRef.current) {
          const videoSender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track?.kind === "video" || (!s.track && s.kind === "video"));
          if (videoSender) {
            await videoSender.replaceTrack(newTrack);
          }
        }

        setIsVideoEnabled(true);
        // Update the displayed local stream with the new track
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to re-acquire camera: ${err.message}` });
      }
    }
  }, [isVideoEnabled, addLog]);

  return {
    localStream,
    remoteStream,
    connectionState,
    iceGatheringState,
    signalingState,
    iceCandidates,
    eventLog,
    inCall,
    roomId,
    startCall,
    hangUp,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    isRemoteVideoEnabled,
  };
}
