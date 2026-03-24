/**
 * ============================================================================
 * useWebRTC — The Core WebRTC Hook (Phase 2: Role-Aware)
 * ============================================================================
 *
 * This hook encapsulates the entire WebRTC peer-to-peer connection lifecycle.
 *
 * Phase 2 changes:
 * - Supports two roles: "creator" (host) and "joiner"
 * - Creator: creates the room, waits for join requests, admits/denies
 * - Joiner: requests to join, waits for admission, then WebRTC begins
 * - Accepts an existingStream to reuse the lobby camera preview
 *
 * ── WHY UDP? ──
 *
 * WebRTC sends media over UDP (User Datagram Protocol), not TCP.
 * TCP guarantees delivery: if a packet is lost, it retransmits and waits.
 * For live video, this causes stuttering. UDP drops lost packets and moves on.
 * A dropped frame is better than a delayed one.
 *
 * The protocol stack: UDP → ICE → DTLS (encryption) → SRTP (media)
 *
 * ── THE CONNECTION FLOW ──
 *
 * 1. Creator starts room, joiner requests admission
 * 2. Creator admits → signaling triggers WebRTC handshake
 * 3. getUserMedia (or reuse existing stream from lobby)
 * 4. Create RTCPeerConnection with STUN servers
 * 5. Add local tracks, exchange SDP offer/answer
 * 6. Exchange ICE candidates → connection established → media flows!
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

  // ── Phase 2: Admission state ──
  const [pendingJoinRequests, setPendingJoinRequests] = useState([]);
  const [admissionStatus, setAdmissionStatus] = useState("idle"); // idle | waiting | admitted | denied | room-not-found

  // ── Screen sharing state ──
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  // ── Refs ──
  const peerConnectionRef = useRef(null);
  const signalingClientRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const savedCameraTrackRef = useRef(null);

  const addLog = useCallback((entry) => {
    setEventLog((prev) => [...prev, entry]);
  }, []);

  /**
   * STEP 1: Get User Media (or reuse an existing stream from the lobby).
   */
  const acquireMedia = useCallback(async (existingStream) => {
    if (existingStream) {
      setLocalStream(existingStream);
      localStreamRef.current = existingStream;
      addLog({ timestamp: new Date(), event: "MEDIA", detail: "Reusing camera/mic from lobby preview" });
      return existingStream;
    }

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
   * STEP 2: Create RTCPeerConnection with STUN servers.
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
        detail: "Creating RTCPeerConnection with STUN servers",
      });

      const pc = new RTCPeerConnection(config);

      // STEP 3: Add local tracks
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

      // STEP 4: Listen for remote tracks
      pc.ontrack = (event) => {
        addLog({
          timestamp: new Date(),
          event: "WEBRTC",
          detail: `Remote track received (${event.track.kind})`,
        });
        setRemoteStream(event.streams[0]);

        if (event.track.kind === "video") {
          setIsRemoteVideoEnabled(true);
          event.track.onmute = () => setIsRemoteVideoEnabled(false);
          event.track.onunmute = () => setIsRemoteVideoEnabled(true);
          event.track.onended = () => setIsRemoteVideoEnabled(false);
        }
      };

      // STEP 5: ICE candidate handling (trickle ICE)
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalingClient.sendIceCandidate(event.candidate);

          const parts = event.candidate.candidate.split(" ");
          setIceCandidates((prev) => [
            ...prev,
            {
              type: parts[7] || "unknown",
              protocol: parts[2] || "unknown",
              address: parts[4] || "unknown",
              port: parts[5] || "unknown",
            },
          ]);
        }
      };

      // STEP 6: Monitor connection state changes
      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        addLog({ timestamp: new Date(), event: "STATE", detail: `Connection state: ${pc.connectionState}` });
      };

      pc.onicegatheringstatechange = () => {
        setIceGatheringState(pc.iceGatheringState);
        addLog({ timestamp: new Date(), event: "ICE", detail: `ICE gathering state: ${pc.iceGatheringState}` });
      };

      pc.onsignalingstatechange = () => {
        setSignalingState(pc.signalingState);
        addLog({ timestamp: new Date(), event: "STATE", detail: `Signaling state: ${pc.signalingState}` });
      };

      peerConnectionRef.current = pc;
      return pc;
    },
    [addLog]
  );

  // ── SDP Offer/Answer (unchanged from Phase 1) ──

  const createOffer = useCallback(
    async (pc, signalingClient) => {
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Creating SDP offer..." });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set local description (offer)" });
      signalingClient.sendOffer(pc.localDescription);
    },
    [addLog]
  );

  const handleOffer = useCallback(
    async (pc, signalingClient, offer) => {
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Received offer — creating answer..." });
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Set local description (answer)" });
      signalingClient.sendAnswer(pc.localDescription);
    },
    [addLog]
  );

  const handleAnswer = useCallback(
    async (pc, answer) => {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      addLog({ timestamp: new Date(), event: "WEBRTC", detail: "SDP negotiation complete!" });
    },
    [addLog]
  );

  const handleIceCandidate = useCallback(
    async (pc, candidate) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to add ICE candidate: ${err.message}` });
      }
    },
    [addLog]
  );

  /**
   * ========================================================================
   * START CALL — Phase 2: Role-aware
   * ========================================================================
   *
   * @param {object} options
   * @param {string} options.roomId - The meeting code
   * @param {string} options.role - "creator" or "joiner"
   * @param {MediaStream} [options.existingStream] - Reuse lobby preview stream
   */
  const startCall = useCallback(
    async ({ roomId, role, existingStream }) => {
      // Cleanup any leftover state
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current && !existingStream) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (signalingClientRef.current) {
        signalingClientRef.current.disconnect();
        signalingClientRef.current = null;
      }

      setEventLog([]);
      setIceCandidates([]);
      setConnectionState("new");
      setIceGatheringState("new");
      setSignalingState("stable");
      setRemoteStream(null);
      setIsRemoteVideoEnabled(false);
      setPendingJoinRequests([]);
      setAdmissionStatus("idle");

      // Get media
      await acquireMedia(existingStream);

      const signalingClient = createSignalingClient({
        onLog: addLog,

        onConnected: () => {
          if (role === "creator") {
            signalingClient.sendCreate(roomId);
          } else {
            signalingClient.sendJoinRequest(roomId);
          }
        },

        // ── Creator callbacks ──

        onCreated: () => {
          setInCall(true);
        },

        onRoomExists: () => {
          /**
           * Room already exists — another creator owns this room.
           * Instead of showing an error, seamlessly switch to joiner mode.
           * This handles the case where someone copies the full URL
           * (including ?role=creator) and tries to open it.
           */
          addLog({ timestamp: new Date(), event: "SIGNALING", detail: "Room already exists — joining as participant instead" });
          signalingClient.sendJoinRequest(roomId);
        },

        onJoinRequest: (message) => {
          setPendingJoinRequests((prev) => [
            ...prev,
            { pendingId: message.pendingId, displayName: message.displayName },
          ]);
        },

        onPeerJoined: () => {
          // Creator: peer was admitted → start WebRTC
          const pc = createPeerConnection(signalingClient);
          createOffer(pc, signalingClient);
        },

        // ── Joiner callbacks ──

        onWaiting: () => {
          setAdmissionStatus("waiting");
        },

        onAdmitted: () => {
          setAdmissionStatus("admitted");
          setInCall(true);
          // Joiner: create peer connection, wait for the creator's offer
          createPeerConnection(signalingClient);
        },

        onDenied: () => {
          setAdmissionStatus("denied");
        },

        onRoomNotFound: () => {
          setAdmissionStatus("room-not-found");
        },

        onRoomFull: () => {
          addLog({ timestamp: new Date(), event: "ERROR", detail: "Room is full" });
          setAdmissionStatus("denied");
        },

        // ── WebRTC relay (shared) ──

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

        /**
         * Explicit media state from the remote peer.
         * This is MORE reliable than relying on track.onmute/onunmute,
         * which doesn't fire consistently across all browsers when
         * replaceTrack(null) is called.
         */
        onMediaState: (message) => {
          setIsRemoteVideoEnabled(message.video);
        },

        onScreenShareState: (message) => {
          setIsRemoteScreenSharing(message.sharing);
        },

        onPeerLeft: () => {
          addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Peer disconnected" });
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
          // Stop screen share if active when peer leaves
          if (screenTrackRef.current) {
            screenTrackRef.current.stop();
            screenTrackRef.current = null;
          }
          setRemoteStream(null);
          setConnectionState("disconnected");
          setIsRemoteVideoEnabled(false);
          setIsScreenSharing(false);
          setIsRemoteScreenSharing(false);
          savedCameraTrackRef.current = null;
        },
      });

      signalingClientRef.current = signalingClient;
    },
    [acquireMedia, createPeerConnection, createOffer, handleOffer, handleAnswer, handleIceCandidate, addLog]
  );

  /**
   * ── Admission controls (creator only) ──
   */
  const admitJoiner = useCallback((pendingId) => {
    if (signalingClientRef.current) {
      signalingClientRef.current.sendAdmit(pendingId);
      setPendingJoinRequests((prev) => prev.filter((r) => r.pendingId !== pendingId));
    }
  }, []);

  const denyJoiner = useCallback((pendingId) => {
    if (signalingClientRef.current) {
      signalingClientRef.current.sendDeny(pendingId);
      setPendingJoinRequests((prev) => prev.filter((r) => r.pendingId !== pendingId));
    }
  }, []);

  /**
   * ── Hang Up ──
   */
  const hangUp = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    // Stop screen share track if active
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    savedCameraTrackRef.current = null;
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
    setPendingJoinRequests([]);
    setAdmissionStatus("idle");
    setIsRemoteVideoEnabled(false);
    setIsScreenSharing(false);
    setIsRemoteScreenSharing(false);
    setScreenStream(null);

    addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Call ended — all resources released" });
  }, [addLog]);

  /**
   * ── Toggle audio/video ──
   */
  const toggleAudio = useCallback(async () => {
    if (!localStreamRef.current) return;
    const currentTrack = localStreamRef.current.getAudioTracks()[0];

    if (currentTrack && isAudioEnabled) {
      // Find sender BEFORE stopping the track
      let audioSender = null;
      if (peerConnectionRef.current) {
        audioSender = peerConnectionRef.current.getSenders().find((s) => s.track === currentTrack);
        if (!audioSender) {
          audioSender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "audio");
        }
      }

      currentTrack.stop();
      localStreamRef.current.removeTrack(currentTrack);

      if (audioSender) {
        await audioSender.replaceTrack(null);
      }

      setIsAudioEnabled(false);
    } else if (!isAudioEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = newStream.getAudioTracks()[0];
        localStreamRef.current.addTrack(newTrack);
        if (peerConnectionRef.current) {
          const audioTransceiver = peerConnectionRef.current
            .getTransceivers()
            .find((t) => t.sender && t.receiver?.track?.kind === "audio");
          const sender = audioTransceiver?.sender;
          if (sender) await sender.replaceTrack(newTrack);
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
      /**
       * IMPORTANT: Find the sender BEFORE stopping the track.
       * After track.stop(), the browser may detach it from the sender,
       * making sender.track null — which breaks the lookup.
       */
      let videoSender = null;
      if (peerConnectionRef.current) {
        videoSender = peerConnectionRef.current.getSenders().find((s) => s.track === currentTrack);
        if (!videoSender) {
          videoSender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");
        }
      }

      currentTrack.stop();
      localStreamRef.current.removeTrack(currentTrack);

      if (videoSender) {
        await videoSender.replaceTrack(null);
      }

      setIsVideoEnabled(false);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

      // Explicitly tell the remote peer our camera is off
      if (signalingClientRef.current) {
        signalingClientRef.current.sendMediaState(false, isAudioEnabled);
      }
    } else if (!isVideoEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newTrack);
        if (peerConnectionRef.current) {
          const videoTransceiver = peerConnectionRef.current
            .getTransceivers()
            .find((t) => t.sender && t.receiver?.track?.kind === "video");
          const sender = videoTransceiver?.sender;
          if (sender) await sender.replaceTrack(newTrack);
        }
        setIsVideoEnabled(true);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

        // Explicitly tell the remote peer our camera is back on
        if (signalingClientRef.current) {
          signalingClientRef.current.sendMediaState(true, isAudioEnabled);
        }
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to re-acquire camera: ${err.message}` });
      }
    }
  }, [isVideoEnabled, isAudioEnabled, addLog]);

  /**
   * ── Screen Sharing ──
   *
   * Uses getDisplayMedia to capture screen/window/tab, then replaceTrack
   * on the video sender to swap camera for screen. The camera track is
   * saved so it can be restored when sharing stops.
   *
   * The local PiP still shows the camera (localStreamRef is untouched).
   * Only the sender's track changes — the remote peer sees the screen.
   */
  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      // ── START screen share ──
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        setScreenStream(screenStream);

        // Find the VIDEO sender using transceivers (reliable even when track is null)
        if (peerConnectionRef.current) {
          const videoTransceiver = peerConnectionRef.current
            .getTransceivers()
            .find((t) => t.sender && t.receiver?.track?.kind === "video");
          const videoSender = videoTransceiver?.sender
            || peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");

          if (videoSender) {
            savedCameraTrackRef.current = videoSender.track;
            await videoSender.replaceTrack(screenTrack);
          }
        }

        setIsScreenSharing(true);

        // Notify remote peer
        if (signalingClientRef.current) {
          signalingClientRef.current.sendScreenShareState(true);
        }

        addLog({ timestamp: new Date(), event: "MEDIA", detail: "Screen sharing started" });

        /**
         * Listen for the browser's native "Stop sharing" button.
         * When the user clicks it, the track fires 'ended' automatically.
         */
        screenTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        // User cancelled the screen picker — do nothing
        if (err.name !== "NotAllowedError") {
          addLog({ timestamp: new Date(), event: "ERROR", detail: `Screen share failed: ${err.message}` });
        }
      }
    } else {
      // ── STOP screen share ──
      stopScreenShare();
    }
  }, [isScreenSharing, addLog]);

  const stopScreenShare = useCallback(async () => {
    // Stop the screen track
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null; // prevent double-fire
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    // Restore the previous camera track on the video sender
    if (peerConnectionRef.current) {
      const videoTransceiver = peerConnectionRef.current
        .getTransceivers()
        .find((t) => t.sender && t.receiver?.track?.kind === "video");
      const videoSender = videoTransceiver?.sender
        || peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");

      if (videoSender) {
        const savedTrack = savedCameraTrackRef.current;

        if (savedTrack && savedTrack.readyState === "live") {
          // Camera was on before sharing — restore it
          await videoSender.replaceTrack(savedTrack);
        } else if (savedTrack && savedTrack.readyState === "ended") {
          // Camera track was stopped (e.g., toggled off before sharing) — send null
          await videoSender.replaceTrack(null);
          savedCameraTrackRef.current = null;
        } else {
          // Camera was off before sharing — keep it off
          await videoSender.replaceTrack(null);
        }
      }
    }

    savedCameraTrackRef.current = null;
    setIsScreenSharing(false);
    setScreenStream(null);

    // Notify remote peer
    if (signalingClientRef.current) {
      signalingClientRef.current.sendScreenShareState(false);
      // Also re-send camera state so remote knows if camera is on or off
      signalingClientRef.current.sendMediaState(isVideoEnabled, isAudioEnabled);
    }

    addLog({ timestamp: new Date(), event: "MEDIA", detail: "Screen sharing stopped" });
  }, [isVideoEnabled, isAudioEnabled, addLog]);

  return {
    peerConnectionRef,
    localStreamRef,
    localStream,
    remoteStream,
    connectionState,
    iceGatheringState,
    signalingState,
    iceCandidates,
    eventLog,
    inCall,
    isAudioEnabled,
    isVideoEnabled,
    isRemoteVideoEnabled,
    isScreenSharing,
    isRemoteScreenSharing,
    screenStream,
    pendingJoinRequests,
    admissionStatus,
    startCall,
    hangUp,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    admitJoiner,
    denyJoiner,
  };
}
