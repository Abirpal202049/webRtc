/**
 * useWebRTCStats — Polls RTCPeerConnection.getStats() for real-time metrics.
 *
 * All data comes from the browser's internal WebRTC statistics API.
 * Nothing is hardcoded — every number is a live measurement.
 *
 * The getStats() API returns an RTCStatsReport (a Map of stat objects).
 * Each object has a `type` field: "candidate-pair", "outbound-rtp",
 * "inbound-rtp", "codec", "local-candidate", "remote-candidate", etc.
 *
 * We poll at 1.5-second intervals and compute:
 * - Bitrates by delta-ing bytesSent/bytesReceived between polls
 * - Packet loss as a percentage of total packets
 * - History arrays (last 30 samples = ~45 seconds) for sparklines
 */

import { useState, useEffect, useRef, useCallback } from "react";

const HISTORY_LENGTH = 30;
const POLL_INTERVAL = 1500;

function pushHistory(arr, val) {
  const next = [...arr, val ?? 0];
  if (next.length > HISTORY_LENGTH) next.shift();
  return next;
}

export function useWebRTCStats(peerConnectionRef) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState({
    rtt: [],
    videoSendBitrate: [],
    videoRecvBitrate: [],
    audioJitter: [],
    videoFpsRecv: [],
    packetLoss: [],
  });

  const prevRef = useRef(null);
  const prevTimestampRef = useRef(null);

  const collectStats = useCallback(async () => {
    const pc = peerConnectionRef?.current;
    if (!pc || pc.connectionState !== "connected") {
      return;
    }

    let report;
    try {
      report = await pc.getStats();
    } catch {
      return;
    }

    const now = Date.now();
    const prev = prevRef.current;
    const prevTs = prevTimestampRef.current;
    const deltaMs = prevTs ? now - prevTs : 0;

    // Categorize stats
    let activePair = null;
    let outboundVideo = null;
    let outboundAudio = null;
    let inboundVideo = null;
    let inboundAudio = null;

    report.forEach((stat) => {
      switch (stat.type) {
        case "candidate-pair":
          if (stat.state === "succeeded" && stat.nominated) activePair = stat;
          break;
        case "outbound-rtp":
          if (stat.kind === "video") outboundVideo = stat;
          else if (stat.kind === "audio") outboundAudio = stat;
          break;
        case "inbound-rtp":
          if (stat.kind === "video") inboundVideo = stat;
          else if (stat.kind === "audio") inboundAudio = stat;
          break;
      }
    });

    // Resolve codec names
    const resolveCodec = (codecId) => {
      if (!codecId) return null;
      const codec = report.get(codecId);
      return codec?.mimeType?.split("/")[1] || null;
    };

    // Resolve candidate addresses
    let localAddress = null;
    let remoteAddress = null;
    let transportProtocol = null;
    let connectionType = null;

    if (activePair) {
      const localCandidate = report.get(activePair.localCandidateId);
      const remoteCandidate = report.get(activePair.remoteCandidateId);
      if (localCandidate) {
        localAddress = `${localCandidate.address}:${localCandidate.port}`;
        transportProtocol = localCandidate.protocol;
        connectionType = localCandidate.candidateType;
      }
      if (remoteCandidate) {
        remoteAddress = `${remoteCandidate.address}:${remoteCandidate.port}`;
      }
    }

    // Compute bitrates (delta bytes * 8 / delta seconds / 1000 = kbps)
    const computeKbps = (currentBytes, prevBytes) => {
      if (!prev || !deltaMs || deltaMs <= 0 || currentBytes == null || prevBytes == null) return null;
      const delta = currentBytes - prevBytes;
      if (delta < 0) return null;
      return (delta * 8) / (deltaMs / 1000) / 1000;
    };

    // Compute packet deltas for the packet visualizer
    const computeDelta = (current, previous) => {
      if (current == null || previous == null) return 0;
      const d = current - previous;
      return d < 0 ? 0 : d;
    };

    const videoSendKbps = computeKbps(outboundVideo?.bytesSent, prev?.outboundVideoBytesSent);
    const videoRecvKbps = computeKbps(inboundVideo?.bytesReceived, prev?.inboundVideoBytesReceived);
    const audioSendKbps = computeKbps(outboundAudio?.bytesSent, prev?.outboundAudioBytesSent);
    const audioRecvKbps = computeKbps(inboundAudio?.bytesReceived, prev?.inboundAudioBytesReceived);

    // Packet loss — INTERVAL-BASED (last 1.5s), not cumulative session average.
    // Cumulative averages hide real-time spikes. If you lost 5 packets out of
    // 50,000 total, cumulative shows 0.01%. But if those 5 were all in the
    // last 1.5s out of 100 received, the real-time loss is 5% — that's what matters.
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
      // Transport
      rtt,
      availableBitrate: activePair?.availableOutgoingBitrate != null
        ? activePair.availableOutgoingBitrate / 1000
        : null,
      localAddress,
      remoteAddress,
      transportProtocol,
      connectionType,

      // Outbound video
      videoSendBitrate: videoSendKbps,
      videoFpsSent: outboundVideo?.framesPerSecond ?? null,
      videoWidthSent: outboundVideo?.frameWidth ?? null,
      videoHeightSent: outboundVideo?.frameHeight ?? null,
      videoCodecSent: resolveCodec(outboundVideo?.codecId),
      qualityLimitationReason: outboundVideo?.qualityLimitationReason ?? null,
      framesEncoded: outboundVideo?.framesEncoded ?? null,

      // Outbound audio
      audioSendBitrate: audioSendKbps,
      audioCodecSent: resolveCodec(outboundAudio?.codecId),

      // Inbound video
      videoRecvBitrate: videoRecvKbps,
      videoFpsReceived: inboundVideo?.framesPerSecond ?? null,
      videoWidthReceived: inboundVideo?.frameWidth ?? null,
      videoHeightReceived: inboundVideo?.frameHeight ?? null,
      videoPacketLossPercent: videoLossPercent,
      videoJitter: inboundVideo?.jitter != null ? inboundVideo.jitter * 1000 : null,
      framesDecoded: inboundVideo?.framesDecoded ?? null,
      framesDropped: inboundVideo?.framesDropped ?? null,

      // Inbound audio
      audioRecvBitrate: audioRecvKbps,
      audioJitter: inboundAudio?.jitter != null ? inboundAudio.jitter * 1000 : null,
      audioPacketLossPercent: audioLossPercent,
      audioCodecReceived: resolveCodec(inboundAudio?.codecId),

      // Packet deltas (for packet visualizer)
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
    }));

    // Store raw values for next delta calculation
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
  }, [peerConnectionRef]);

  useEffect(() => {
    const interval = setInterval(collectStats, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      prevRef.current = null;
      prevTimestampRef.current = null;
    };
  }, [collectStats]);

  // Reset when connection drops
  useEffect(() => {
    const pc = peerConnectionRef?.current;
    if (!pc) {
      setStats(null);
      setHistory({
        rtt: [],
        videoSendBitrate: [],
        videoRecvBitrate: [],
        audioJitter: [],
        videoFpsRecv: [],
        packetLoss: [],
      });
      prevRef.current = null;
      prevTimestampRef.current = null;
    }
  }, [peerConnectionRef?.current]);

  return { stats, history };
}
