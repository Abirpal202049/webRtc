/**
 * useWebRTCStats — Polls mediasoup transport stats for real-time metrics.
 *
 * Phase 3: Adapted to work with mediasoup send/recv transports.
 * mediasoup transports expose getStats() which returns the same
 * RTCStatsReport format as RTCPeerConnection.getStats().
 *
 * Accepts sendTransportRef and recvTransportRef instead of peerConnectionRef.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const HISTORY_LENGTH = 40; // ~60 seconds at 1.5s intervals
const POLL_INTERVAL = 1500;

function pushHistory(arr, val) {
  const next = [...arr, val ?? 0];
  if (next.length > HISTORY_LENGTH) next.shift();
  return next;
}

export function useWebRTCStats(sendTransportRef, recvTransportRef) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState({
    rtt: [],
    videoSendBitrate: [],
    videoRecvBitrate: [],
    audioJitter: [],
    videoFpsRecv: [],
    packetLoss: [],
    availableBitrate: [],
    qualityLimitation: [],
  });

  const prevRef = useRef(null);
  const prevTimestampRef = useRef(null);

  const collectStats = useCallback(async () => {
    const sendTransport = sendTransportRef?.current;
    const recvTransport = recvTransportRef?.current;

    if (!sendTransport && !recvTransport) return;

    // Collect stats from both transports
    let sendReport = null;
    let recvReport = null;

    try {
      if (sendTransport && sendTransport.connectionState === "connected") {
        sendReport = await sendTransport.getStats();
      }
    } catch { /* transport may be closing */ }

    try {
      if (recvTransport && recvTransport.connectionState === "connected") {
        recvReport = await recvTransport.getStats();
      }
    } catch { /* transport may be closing */ }

    if (!sendReport && !recvReport) return;

    const now = Date.now();
    const prev = prevRef.current;
    const prevTs = prevTimestampRef.current;
    const deltaMs = prevTs ? now - prevTs : 0;

    let activePair = null;
    let outboundVideo = null;
    let outboundAudio = null;
    let inboundVideo = null;
    let inboundAudio = null;

    // Process send transport stats
    const processReport = (report) => {
      if (!report) return;
      report.forEach((stat) => {
        switch (stat.type) {
          case "candidate-pair":
            if (stat.state === "succeeded" && stat.nominated && !activePair) activePair = stat;
            break;
          case "outbound-rtp":
            if (stat.kind === "video" && !outboundVideo) outboundVideo = stat;
            else if (stat.kind === "audio" && !outboundAudio) outboundAudio = stat;
            break;
          case "inbound-rtp":
            if (stat.kind === "video" && !inboundVideo) inboundVideo = stat;
            else if (stat.kind === "audio" && !inboundAudio) inboundAudio = stat;
            break;
        }
      });
    };

    processReport(sendReport);
    processReport(recvReport);

    // Resolve codec names from whichever report has the codec
    const resolveCodec = (codecId) => {
      if (!codecId) return null;
      const codec = sendReport?.get(codecId) || recvReport?.get(codecId);
      return codec?.mimeType?.split("/")[1] || null;
    };

    // Resolve candidate addresses
    let localAddress = null;
    let remoteAddress = null;
    let transportProtocol = null;
    let connectionType = null;

    if (activePair) {
      const report = sendReport || recvReport;
      const localCandidate = report?.get(activePair.localCandidateId);
      const remoteCandidate = report?.get(activePair.remoteCandidateId);
      if (localCandidate) {
        localAddress = `${localCandidate.address}:${localCandidate.port}`;
        transportProtocol = localCandidate.protocol;
        connectionType = localCandidate.candidateType;
      }
      if (remoteCandidate) {
        remoteAddress = `${remoteCandidate.address}:${remoteCandidate.port}`;
      }
    }

    const computeKbps = (currentBytes, prevBytes) => {
      if (!prev || !deltaMs || deltaMs <= 0 || currentBytes == null || prevBytes == null) return null;
      const delta = currentBytes - prevBytes;
      if (delta < 0) return null;
      return (delta * 8) / (deltaMs / 1000) / 1000;
    };

    const computeDelta = (current, previous) => {
      if (current == null || previous == null) return 0;
      const d = current - previous;
      return d < 0 ? 0 : d;
    };

    const videoSendKbps = computeKbps(outboundVideo?.bytesSent, prev?.outboundVideoBytesSent);
    const videoRecvKbps = computeKbps(inboundVideo?.bytesReceived, prev?.inboundVideoBytesReceived);
    const audioSendKbps = computeKbps(outboundAudio?.bytesSent, prev?.outboundAudioBytesSent);
    const audioRecvKbps = computeKbps(inboundAudio?.bytesReceived, prev?.inboundAudioBytesReceived);

    const deltaVideoLost = computeDelta(inboundVideo?.packetsLost, prev?.inboundVideoPacketsLost);
    const deltaVideoRecv = computeDelta(inboundVideo?.packetsReceived, prev?.inboundVideoPacketsReceived);
    const videoLossPercent = (deltaVideoLost + deltaVideoRecv) > 0
      ? (deltaVideoLost / (deltaVideoLost + deltaVideoRecv)) * 100
      : 0;

    const deltaAudioLost = computeDelta(inboundAudio?.packetsLost, prev?.inboundAudioPacketsLost);
    const deltaAudioRecv = computeDelta(inboundAudio?.packetsReceived, prev?.inboundAudioPacketsReceived);
    const audioLossPercent = (deltaAudioLost + deltaAudioRecv) > 0
      ? (deltaAudioLost / (deltaAudioLost + deltaAudioRecv)) * 100
      : 0;

    const rtt = activePair?.currentRoundTripTime != null
      ? activePair.currentRoundTripTime * 1000
      : null;

    const snapshot = {
      rtt,
      availableBitrate: activePair?.availableOutgoingBitrate != null
        ? activePair.availableOutgoingBitrate / 1000
        : null,
      localAddress,
      remoteAddress,
      transportProtocol,
      connectionType,
      videoSendBitrate: videoSendKbps,
      videoFpsSent: outboundVideo?.framesPerSecond ?? null,
      videoWidthSent: outboundVideo?.frameWidth ?? null,
      videoHeightSent: outboundVideo?.frameHeight ?? null,
      videoCodecSent: resolveCodec(outboundVideo?.codecId),
      qualityLimitationReason: outboundVideo?.qualityLimitationReason ?? null,
      framesEncoded: outboundVideo?.framesEncoded ?? null,
      audioSendBitrate: audioSendKbps,
      audioCodecSent: resolveCodec(outboundAudio?.codecId),
      videoRecvBitrate: videoRecvKbps,
      videoFpsReceived: inboundVideo?.framesPerSecond ?? null,
      videoWidthReceived: inboundVideo?.frameWidth ?? null,
      videoHeightReceived: inboundVideo?.frameHeight ?? null,
      videoPacketLossPercent: videoLossPercent,
      videoJitter: inboundVideo?.jitter != null ? inboundVideo.jitter * 1000 : null,
      framesDecoded: inboundVideo?.framesDecoded ?? null,
      framesDropped: inboundVideo?.framesDropped ?? null,
      audioRecvBitrate: audioRecvKbps,
      audioJitter: inboundAudio?.jitter != null ? inboundAudio.jitter * 1000 : null,
      audioPacketLossPercent: audioLossPercent,
      audioCodecReceived: resolveCodec(inboundAudio?.codecId),
      deltaVideoPacketsSent: computeDelta(outboundVideo?.packetsSent, prev?.outboundVideoPacketsSent),
      deltaAudioPacketsSent: computeDelta(outboundAudio?.packetsSent, prev?.outboundAudioPacketsSent),
      deltaVideoPacketsReceived: computeDelta(inboundVideo?.packetsReceived, prev?.inboundVideoPacketsReceived),
      deltaAudioPacketsReceived: computeDelta(inboundAudio?.packetsReceived, prev?.inboundAudioPacketsReceived),
      deltaVideoPacketsLost: computeDelta(inboundVideo?.packetsLost, prev?.inboundVideoPacketsLost),
      deltaAudioPacketsLost: computeDelta(inboundAudio?.packetsLost, prev?.inboundAudioPacketsLost),
    };

    setStats(snapshot);

    setHistory((prev) => ({
      rtt: pushHistory(prev.rtt, rtt),
      videoSendBitrate: pushHistory(prev.videoSendBitrate, videoSendKbps),
      videoRecvBitrate: pushHistory(prev.videoRecvBitrate, videoRecvKbps),
      audioJitter: pushHistory(prev.audioJitter, snapshot.audioJitter),
      videoFpsRecv: pushHistory(prev.videoFpsRecv, snapshot.videoFpsReceived),
      packetLoss: pushHistory(prev.packetLoss, videoLossPercent),
      availableBitrate: pushHistory(prev.availableBitrate, snapshot.availableBitrate),
      qualityLimitation: pushHistory(prev.qualityLimitation, snapshot.qualityLimitationReason || "none"),
    }));

    prevRef.current = {
      outboundVideoBytesSent: outboundVideo?.bytesSent,
      outboundAudioBytesSent: outboundAudio?.bytesSent,
      inboundVideoBytesReceived: inboundVideo?.bytesReceived,
      inboundAudioBytesReceived: inboundAudio?.bytesReceived,
      outboundVideoPacketsSent: outboundVideo?.packetsSent,
      outboundAudioPacketsSent: outboundAudio?.packetsSent,
      inboundVideoPacketsReceived: inboundVideo?.packetsReceived,
      inboundAudioPacketsReceived: inboundAudio?.packetsReceived,
      inboundVideoPacketsLost: inboundVideo?.packetsLost,
      inboundAudioPacketsLost: inboundAudio?.packetsLost,
    };
    prevTimestampRef.current = now;
  }, [sendTransportRef, recvTransportRef]);

  useEffect(() => {
    const interval = setInterval(collectStats, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      prevRef.current = null;
      prevTimestampRef.current = null;
    };
  }, [collectStats]);

  // Reset when transports drop
  useEffect(() => {
    const send = sendTransportRef?.current;
    const recv = recvTransportRef?.current;
    if (!send && !recv) {
      setStats(null);
      setHistory({
        rtt: [],
        videoSendBitrate: [],
        videoRecvBitrate: [],
        audioJitter: [],
        videoFpsRecv: [],
        packetLoss: [],
        availableBitrate: [],
        qualityLimitation: [],
      });
      prevRef.current = null;
      prevTimestampRef.current = null;
    }
  }, [sendTransportRef?.current, recvTransportRef?.current]);

  return { stats, history };
}
