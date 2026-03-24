/**
 * ============================================================================
 * useMediasoup — SFU-based Multi-Party WebRTC Hook (Phase 3)
 * ============================================================================
 *
 * Replaces useWebRTC for multi-party calls via mediasoup SFU.
 *
 * Key differences from useWebRTC (Phase 2):
 * - No direct RTCPeerConnection management — mediasoup-client handles it
 * - Each participant has a Device → SendTransport → Producers (upload)
 *   and a RecvTransport → Consumers (download)
 * - Supports up to 10 participants instead of 2
 * - Maintains a `participants` Map instead of a single `remoteStream`
 *
 * The admission control flow is preserved: creator creates room, joiners
 * request admission, creator admits/denies, then mediasoup setup begins.
 * ============================================================================
 */

import { useState, useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import { createSignalingClient } from "../utils/signalingClient";

export function useMediasoup() {
  // ── State exposed to the UI ──
  const [localStream, setLocalStream] = useState(null);
  const [participants, setParticipants] = useState(new Map());
  const [connectionState, setConnectionState] = useState("new");
  const [eventLog, setEventLog] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [myPeerId, setMyPeerId] = useState(null);

  // ── Admission state ──
  const [pendingJoinRequests, setPendingJoinRequests] = useState([]);
  const [admissionStatus, setAdmissionStatus] = useState("idle");

  // ── Screen sharing state ──
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  // ── Refs ──
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const signalingClientRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioProducerRef = useRef(null);
  const videoProducerRef = useRef(null);
  const screenProducerRef = useRef(null);
  const myPeerIdRef = useRef(null);
  const pendingProduceCallbacks = useRef(new Map());
  const pendingConsumeCallbacks = useRef(new Map());
  const pendingTransportCallbacks = useRef({});
  const iceServersRef = useRef(null);

  const addLog = useCallback((entry) => {
    setEventLog((prev) => [...prev, entry]);
  }, []);

  // ── Helpers ──

  const updateParticipant = useCallback((peerId, updater) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      const current = next.get(peerId) || {
        displayName: "Guest",
        audioTrack: null,
        videoTrack: null,
        screenTrack: null,
        isVideoEnabled: true,
        isAudioEnabled: true,
        isScreenSharing: false,
        consumers: new Map(),
      };
      next.set(peerId, updater(current));
      return next;
    });
  }, []);

  const removeParticipant = useCallback((peerId) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      const peer = next.get(peerId);
      if (peer) {
        // Close consumer tracks
        for (const [, consumer] of peer.consumers) {
          consumer.close();
        }
      }
      next.delete(peerId);
      return next;
    });
  }, []);

  /**
   * Acquire local media (camera + mic) or reuse an existing stream from lobby.
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
   * Initialize mediasoup Device and create send/receive transports.
   */
  const initMediasoup = useCallback(async (signalingClient, rtpCapabilities, iceServers) => {
    const device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;
    iceServersRef.current = iceServers || null;

    addLog({ timestamp: new Date(), event: "MEDIASOUP", detail: "Device loaded with router capabilities" });

    // Request send transport
    signalingClient.sendCreateTransport("send");

    // Request recv transport
    signalingClient.sendCreateTransport("recv");
  }, [addLog]);

  /**
   * Set up a mediasoup transport (send or recv) from server-provided params.
   */
  const setupTransport = useCallback((signalingClient, params) => {
    const device = deviceRef.current;
    if (!device) return;

    const transportOptions = {
      id: params.transportId,
      iceParameters: params.iceParameters,
      iceCandidates: params.iceCandidates,
      dtlsParameters: params.dtlsParameters,
      iceServers: iceServersRef.current || undefined,
    };

    let transport;
    if (params.direction === "send") {
      transport = device.createSendTransport(transportOptions);
      sendTransportRef.current = transport;
    } else {
      transport = device.createRecvTransport(transportOptions);
      recvTransportRef.current = transport;
    }

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      try {
        signalingClient.sendConnectTransport(transport.id, dtlsParameters);
        // Resolve immediately — the server will process asynchronously
        callback();
      } catch (err) {
        errback(err);
      }
    });

    if (params.direction === "send") {
      transport.on("produce", ({ kind, rtpParameters, appData }, callback) => {
        // Store callback to resolve when server responds with producerId
        const requestId = Math.random().toString(36).slice(2);
        pendingProduceCallbacks.current.set(requestId, callback);
        signalingClient.sendProduce(transport.id, kind, rtpParameters, appData);
      });
    }

    transport.on("connectionstatechange", (state) => {
      addLog({ timestamp: new Date(), event: "MEDIASOUP", detail: `${params.direction} transport: ${state}` });
      if (params.direction === "send") {
        setConnectionState(state);
      }
    });

    // Resolve pending transport setup if both are ready
    if (params.direction === "send" && pendingTransportCallbacks.current.onSendReady) {
      pendingTransportCallbacks.current.onSendReady();
      delete pendingTransportCallbacks.current.onSendReady;
    }
    if (params.direction === "recv" && pendingTransportCallbacks.current.onRecvReady) {
      pendingTransportCallbacks.current.onRecvReady();
      delete pendingTransportCallbacks.current.onRecvReady;
    }
  }, [addLog]);

  /**
   * Start producing local audio/video tracks into the SFU.
   */
  const startProducing = useCallback(async () => {
    const stream = localStreamRef.current;
    const sendTransport = sendTransportRef.current;
    if (!stream || !sendTransport) return;

    // Produce audio
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { type: "audio" },
        });
        audioProducerRef.current = audioProducer;
        addLog({ timestamp: new Date(), event: "MEDIASOUP", detail: "Audio producer created" });
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Audio produce failed: ${err.message}` });
      }
    }

    // Produce video with simulcast (3 spatial layers for bandwidth adaptation)
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 },
            { maxBitrate: 300000, scaleResolutionDownBy: 2 },
            { maxBitrate: 900000 },
          ],
          appData: { type: "video" },
        });
        videoProducerRef.current = videoProducer;
        addLog({ timestamp: new Date(), event: "MEDIASOUP", detail: "Video producer created (simulcast: 3 layers)" });
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Video produce failed: ${err.message}` });
      }
    }
  }, [addLog]);

  /**
   * Consume a remote producer — called when we learn about a new producer.
   */
  const consumeProducer = useCallback(async (signalingClient, producerId, peerId, kind, appData) => {
    const device = deviceRef.current;
    const recvTransport = recvTransportRef.current;
    if (!device || !recvTransport) return;

    signalingClient.sendConsume(
      producerId,
      device.rtpCapabilities,
      recvTransport.id
    );

    // Store a callback that will be resolved when server responds
    pendingConsumeCallbacks.current.set(producerId, {
      peerId,
      kind,
      appData,
    });
  }, []);

  /**
   * Handle the server's "consumed" response — finish setting up the consumer.
   */
  const handleConsumed = useCallback(async (signalingClient, message) => {
    const recvTransport = recvTransportRef.current;
    if (!recvTransport) return;

    const { consumerId, producerId, kind, rtpParameters } = message;
    const meta = pendingConsumeCallbacks.current.get(producerId);
    pendingConsumeCallbacks.current.delete(producerId);

    const consumer = await recvTransport.consume({
      id: consumerId,
      producerId,
      kind,
      rtpParameters,
    });

    // Resume the consumer (it starts paused)
    signalingClient.sendResumeConsumer(consumerId);

    const track = consumer.track;
    const peerId = meta?.peerId;
    const appDataType = meta?.appData?.type || message.appData?.type;

    if (peerId) {
      updateParticipant(peerId, (prev) => {
        const consumers = new Map(prev.consumers);
        consumers.set(consumerId, consumer);

        if (appDataType === "screen") {
          return { ...prev, screenTrack: track, isScreenSharing: true, consumers };
        } else if (kind === "audio") {
          return { ...prev, audioTrack: track, consumers };
        } else {
          return { ...prev, videoTrack: track, consumers };
        }
      });
    }

    addLog({ timestamp: new Date(), event: "MEDIASOUP", detail: `Consuming ${kind} from peer ${peerId}` });
  }, [addLog, updateParticipant]);

  // ========================================================================
  // START CALL — Role-aware, connects to SFU
  // ========================================================================

  const startCall = useCallback(
    async ({ roomId, role, existingStream, displayName, maxParticipants }) => {
      // Cleanup previous state
      if (sendTransportRef.current) {
        sendTransportRef.current.close();
        sendTransportRef.current = null;
      }
      if (recvTransportRef.current) {
        recvTransportRef.current.close();
        recvTransportRef.current = null;
      }
      if (localStreamRef.current && !existingStream) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (signalingClientRef.current) {
        signalingClientRef.current.disconnect();
        signalingClientRef.current = null;
      }

      deviceRef.current = null;
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      screenProducerRef.current = null;
      pendingProduceCallbacks.current.clear();
      pendingConsumeCallbacks.current.clear();

      setEventLog([]);
      setConnectionState("new");
      setParticipants(new Map());
      setPendingJoinRequests([]);
      setAdmissionStatus("idle");
      setIsScreenSharing(false);
      setScreenStream(null);

      await acquireMedia(existingStream);

      let transportReadyCount = 0;
      const waitForTransportsReady = () =>
        new Promise((resolve) => {
          const check = () => {
            transportReadyCount++;
            if (transportReadyCount >= 2) resolve();
          };
          pendingTransportCallbacks.current.onSendReady = check;
          pendingTransportCallbacks.current.onRecvReady = check;
        });

      const signalingClient = createSignalingClient({
        onLog: addLog,

        onConnected: () => {
          if (role === "creator") {
            signalingClient.sendCreate(roomId, displayName, maxParticipants);
          } else {
            signalingClient.sendJoinRequest(roomId, displayName);
          }
        },

        // ── Creator callbacks ──

        onCreated: async (message) => {
          setMyPeerId(message.peerId);
          myPeerIdRef.current = message.peerId;
          setInCall(true);

          // Start mediasoup setup
          signalingClient.sendGetRouterRtpCapabilities();
        },

        onRoomExists: () => {
          addLog({ timestamp: new Date(), event: "SIGNALING", detail: "Room already exists — joining as participant instead" });
          signalingClient.sendJoinRequest(roomId, displayName);
        },

        onJoinRequest: (message) => {
          setPendingJoinRequests((prev) => [
            ...prev,
            { pendingId: message.pendingId, displayName: message.displayName },
          ]);
        },

        // ── Joiner callbacks ──

        onWaiting: () => {
          setAdmissionStatus("waiting");
        },

        onAdmitted: async (message) => {
          setAdmissionStatus("admitted");
          setMyPeerId(message.peerId);
          myPeerIdRef.current = message.peerId;
          setInCall(true);

          // Start mediasoup setup
          signalingClient.sendGetRouterRtpCapabilities();
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

        onRoomClosed: () => {
          addLog({ timestamp: new Date(), event: "SIGNALING", detail: "Room was closed by the host" });
          setConnectionState("disconnected");
          setInCall(false);
        },

        // ── mediasoup callbacks ──

        onRouterRtpCapabilities: async (message) => {
          await initMediasoup(signalingClient, message.rtpCapabilities, message.iceServers);
        },

        onTransportCreated: (message) => {
          setupTransport(signalingClient, message);

          // When both transports are ready, start producing
          if (sendTransportRef.current && recvTransportRef.current) {
            startProducing();
          }
        },

        onProduced: (message) => {
          // Resolve the pending produce callback (mediasoup-client needs the producerId)
          const callbacks = pendingProduceCallbacks.current;
          // The most recent pending callback is the one for this produce
          for (const [requestId, callback] of callbacks) {
            callback({ id: message.producerId });
            callbacks.delete(requestId);
            break; // resolve the first (oldest) pending callback
          }
        },

        onConsumed: (message) => {
          handleConsumed(signalingClient, message);
        },

        onNewProducer: (message) => {
          // A remote peer started producing — consume it
          consumeProducer(
            signalingClient,
            message.producerId,
            message.peerId,
            message.kind,
            message.appData
          );
        },

        onProducerClosed: (message) => {
          // Remove the track from the participant
          const { consumerId, producerId } = message;
          setParticipants((prev) => {
            const next = new Map(prev);
            for (const [peerId, peer] of next) {
              if (peer.consumers.has(consumerId)) {
                const consumer = peer.consumers.get(consumerId);
                const consumers = new Map(peer.consumers);
                consumers.delete(consumerId);

                const updated = { ...peer, consumers };
                if (consumer.kind === "audio") {
                  updated.audioTrack = null;
                } else if (consumer.appData?.type === "screen" || peer.screenTrack === consumer.track) {
                  updated.screenTrack = null;
                  updated.isScreenSharing = false;
                } else {
                  updated.videoTrack = null;
                }

                consumer.close();
                next.set(peerId, updated);
                break;
              }
            }
            return next;
          });
        },

        onProducerPaused: (message) => {
          // Find which participant this consumer belongs to
          setParticipants((prev) => {
            const next = new Map(prev);
            for (const [peerId, peer] of next) {
              if (peer.consumers.has(message.consumerId)) {
                const consumer = peer.consumers.get(message.consumerId);
                if (consumer.kind === "video") {
                  next.set(peerId, { ...peer, isVideoEnabled: false });
                }
                break;
              }
            }
            return next;
          });
        },

        onProducerResumed: (message) => {
          setParticipants((prev) => {
            const next = new Map(prev);
            for (const [peerId, peer] of next) {
              if (peer.consumers.has(message.consumerId)) {
                const consumer = peer.consumers.get(message.consumerId);
                if (consumer.kind === "video") {
                  next.set(peerId, { ...peer, isVideoEnabled: true });
                }
                break;
              }
            }
            return next;
          });
        },

        // ── Peer events ──

        onPeerJoined: (message) => {
          updateParticipant(message.peerId, (prev) => ({
            ...prev,
            displayName: message.displayName || "Guest",
          }));
        },

        onExistingPeers: async (message) => {
          // Wait for transports to be ready before consuming
          const waitAndConsume = async () => {
            // Small delay to ensure transports are set up
            const waitForRecvTransport = () =>
              new Promise((resolve) => {
                const check = () => {
                  if (recvTransportRef.current && deviceRef.current) {
                    resolve();
                  } else {
                    setTimeout(check, 100);
                  }
                };
                check();
              });

            await waitForRecvTransport();

            for (const peer of message.peers) {
              updateParticipant(peer.peerId, (prev) => ({
                ...prev,
                displayName: peer.displayName,
              }));

              for (const producer of peer.producers) {
                consumeProducer(
                  signalingClient,
                  producer.producerId,
                  peer.peerId,
                  producer.kind,
                  producer.appData
                );
              }
            }
          };

          waitAndConsume();
        },

        onPeerLeft: (message) => {
          removeParticipant(message.peerId);
          addLog({ timestamp: new Date(), event: "WEBRTC", detail: `Peer ${message.peerId} disconnected` });
        },

        // ── Media state ──

        onMediaState: (message) => {
          updateParticipant(message.peerId, (prev) => ({
            ...prev,
            isVideoEnabled: message.video,
            isAudioEnabled: message.audio,
          }));
        },

        onScreenShareState: (message) => {
          updateParticipant(message.peerId, (prev) => ({
            ...prev,
            isScreenSharing: message.sharing,
          }));
        },
      });

      signalingClientRef.current = signalingClient;
    },
    [acquireMedia, initMediasoup, setupTransport, startProducing, consumeProducer, handleConsumed, updateParticipant, removeParticipant, addLog]
  );

  // ── Admission controls (creator only) ──

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

  // ── Hang Up ──

  const hangUp = useCallback(() => {
    if (screenProducerRef.current) {
      screenProducerRef.current.close();
      screenProducerRef.current = null;
    }
    if (audioProducerRef.current) {
      audioProducerRef.current.close();
      audioProducerRef.current = null;
    }
    if (videoProducerRef.current) {
      videoProducerRef.current.close();
      videoProducerRef.current = null;
    }
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (signalingClientRef.current) {
      signalingClientRef.current.disconnect();
      signalingClientRef.current = null;
    }

    deviceRef.current = null;
    setLocalStream(null);
    setParticipants(new Map());
    setConnectionState("new");
    setInCall(false);
    setPendingJoinRequests([]);
    setAdmissionStatus("idle");
    setIsAudioEnabled(true);
    setIsVideoEnabled(true);
    setIsScreenSharing(false);
    setScreenStream(null);
    setMyPeerId(null);
    myPeerIdRef.current = null;

    addLog({ timestamp: new Date(), event: "WEBRTC", detail: "Call ended — all resources released" });
  }, [addLog]);

  // ── Toggle Audio ──

  const toggleAudio = useCallback(async () => {
    const producer = audioProducerRef.current;

    if (isAudioEnabled && producer) {
      // Mute: pause the producer
      await producer.pause();
      signalingClientRef.current?.sendPauseProducer(producer.id);
      setIsAudioEnabled(false);
    } else if (!isAudioEnabled && producer) {
      // Unmute: resume the producer
      await producer.resume();
      signalingClientRef.current?.sendResumeProducer(producer.id);
      setIsAudioEnabled(true);
    } else if (!isAudioEnabled && !producer) {
      // Re-acquire mic and produce
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = newStream.getAudioTracks()[0];
        localStreamRef.current?.addTrack(newTrack);

        if (sendTransportRef.current) {
          const newProducer = await sendTransportRef.current.produce({
            track: newTrack,
            appData: { type: "audio" },
          });
          audioProducerRef.current = newProducer;
        }
        setIsAudioEnabled(true);
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to re-acquire microphone: ${err.message}` });
      }
    }
  }, [isAudioEnabled, addLog]);

  // ── Toggle Video ──

  const toggleVideo = useCallback(async () => {
    const producer = videoProducerRef.current;

    if (isVideoEnabled && producer) {
      // Turn off: close the producer and stop the track
      producer.close();
      videoProducerRef.current = null;

      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
      }

      signalingClientRef.current?.sendCloseProducer(producer.id);
      setIsVideoEnabled(false);
      setLocalStream(new MediaStream(localStreamRef.current?.getTracks() || []));

      // Notify peers
      signalingClientRef.current?.sendMediaState(false, isAudioEnabled);
    } else if (!isVideoEnabled) {
      // Turn on: re-acquire camera and produce
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        localStreamRef.current?.addTrack(newTrack);

        if (sendTransportRef.current) {
          const newProducer = await sendTransportRef.current.produce({
            track: newTrack,
            appData: { type: "video" },
          });
          videoProducerRef.current = newProducer;
        }

        setIsVideoEnabled(true);
        setLocalStream(new MediaStream(localStreamRef.current?.getTracks() || []));

        // Notify peers
        signalingClientRef.current?.sendMediaState(true, isAudioEnabled);
      } catch (err) {
        addLog({ timestamp: new Date(), event: "ERROR", detail: `Failed to re-acquire camera: ${err.message}` });
      }
    }
  }, [isVideoEnabled, isAudioEnabled, addLog]);

  // ── Screen Sharing ──

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      // START screen share
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = displayStream.getVideoTracks()[0];
        setScreenStream(displayStream);

        // Produce screen track as a separate producer
        if (sendTransportRef.current) {
          const screenProducer = await sendTransportRef.current.produce({
            track: screenTrack,
            appData: { type: "screen" },
          });
          screenProducerRef.current = screenProducer;
        }

        setIsScreenSharing(true);
        signalingClientRef.current?.sendScreenShareState(true);
        addLog({ timestamp: new Date(), event: "MEDIA", detail: "Screen sharing started" });

        // Listen for browser's "Stop sharing" button
        screenTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        if (err.name !== "NotAllowedError") {
          addLog({ timestamp: new Date(), event: "ERROR", detail: `Screen share failed: ${err.message}` });
        }
      }
    } else {
      stopScreenShare();
    }
  }, [isScreenSharing, addLog]);

  const stopScreenShare = useCallback(() => {
    if (screenProducerRef.current) {
      const producerId = screenProducerRef.current.id;
      screenProducerRef.current.close();
      screenProducerRef.current = null;
      signalingClientRef.current?.sendCloseProducer(producerId);
    }

    setIsScreenSharing(false);
    setScreenStream(null);
    signalingClientRef.current?.sendScreenShareState(false);
    addLog({ timestamp: new Date(), event: "MEDIA", detail: "Screen sharing stopped" });
  }, [addLog]);

  return {
    // Refs for stats collection
    sendTransportRef,
    recvTransportRef,
    localStreamRef,
    audioProducerRef,
    videoProducerRef,
    signalingClientRef,
    // State
    localStream,
    participants,
    connectionState,
    eventLog,
    inCall,
    myPeerId,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenStream,
    pendingJoinRequests,
    admissionStatus,
    // Actions
    startCall,
    hangUp,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    admitJoiner,
    denyJoiner,
  };
}
