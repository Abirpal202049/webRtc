/**
 * usePeerStats — Collects real-time per-peer metrics from mediasoup consumers.
 *
 * For each remote participant, polls their consumer(s) via consumer.getStats()
 * and also polls the local producer(s) for outbound stats.
 *
 * Returns a Map<peerId, PeerStats> where PeerStats contains:
 * - videoBitrate (kbps received from this peer)
 * - audioBitrate (kbps received from this peer)
 * - packetLoss (% for this peer's video)
 * - jitter (ms for this peer's video)
 * - framesPerSecond
 * - codec
 *
 * Also returns aggregate outbound stats (your upload to the SFU).
 */

import { useState, useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL = 1500;

export function usePeerStats(participants, audioProducerRef, videoProducerRef, sendTransportRef) {
  const [peerStats, setPeerStats] = useState(new Map());
  const [outboundStats, setOutboundStats] = useState(null);
  const prevRef = useRef(new Map()); // Map<consumerId, { bytes, packets, lost, ts }>
  const prevOutboundRef = useRef(null);

  const collectStats = useCallback(async () => {
    const nextStats = new Map();
    const nextPrev = new Map();

    // ── Per-peer inbound stats (from consumers) ──
    for (const [peerId, peer] of participants) {
      let totalVideoBitrate = 0;
      let totalAudioBitrate = 0;
      let videoPacketLoss = 0;
      let videoJitter = null;
      let videoFps = null;
      let videoCodec = null;
      let videoResolution = null;
      let totalBytesReceived = 0;
      let totalPacketsReceived = 0;
      let totalPacketsLost = 0;

      for (const [consumerId, consumer] of peer.consumers) {
        if (consumer.closed) continue;

        let report;
        try {
          report = await consumer.getStats();
        } catch {
          continue;
        }

        let inboundRtp = null;
        report.forEach((stat) => {
          if (stat.type === "inbound-rtp") {
            inboundRtp = stat;
          }
        });

        if (!inboundRtp) continue;

        const now = Date.now();
        const prev = prevRef.current.get(consumerId);
        const deltaMs = prev ? now - prev.ts : 0;

        // Compute bitrate delta
        if (prev && deltaMs > 0) {
          const deltaBytes = (inboundRtp.bytesReceived || 0) - (prev.bytes || 0);
          const kbps = deltaBytes > 0 ? (deltaBytes * 8) / (deltaMs / 1000) / 1000 : 0;

          if (consumer.kind === "video") {
            totalVideoBitrate += kbps;
          } else {
            totalAudioBitrate += kbps;
          }
        }

        // Packet loss delta
        if (prev && deltaMs > 0) {
          const deltaLost = (inboundRtp.packetsLost || 0) - (prev.lost || 0);
          const deltaRecv = (inboundRtp.packetsReceived || 0) - (prev.packets || 0);
          if (consumer.kind === "video" && (deltaLost + deltaRecv) > 0) {
            videoPacketLoss = (deltaLost / (deltaLost + deltaRecv)) * 100;
          }
        }

        if (consumer.kind === "video") {
          videoJitter = inboundRtp.jitter != null ? inboundRtp.jitter * 1000 : null;
          videoFps = inboundRtp.framesPerSecond ?? null;

          // Resolve codec
          if (inboundRtp.codecId) {
            const codec = report.get(inboundRtp.codecId);
            videoCodec = codec?.mimeType?.split("/")[1] || null;
          }

          if (inboundRtp.frameWidth && inboundRtp.frameHeight) {
            videoResolution = `${inboundRtp.frameWidth}x${inboundRtp.frameHeight}`;
          }
        }

        totalBytesReceived += inboundRtp.bytesReceived || 0;
        totalPacketsReceived += inboundRtp.packetsReceived || 0;
        totalPacketsLost += inboundRtp.packetsLost || 0;

        // Store for next delta
        nextPrev.set(consumerId, {
          bytes: inboundRtp.bytesReceived || 0,
          packets: inboundRtp.packetsReceived || 0,
          lost: inboundRtp.packetsLost || 0,
          ts: Date.now(),
        });
      }

      nextStats.set(peerId, {
        displayName: peer.displayName || "Guest",
        videoBitrate: totalVideoBitrate,
        audioBitrate: totalAudioBitrate,
        totalBitrate: totalVideoBitrate + totalAudioBitrate,
        packetLoss: videoPacketLoss,
        jitter: videoJitter,
        fps: videoFps,
        codec: videoCodec,
        resolution: videoResolution,
        bytesReceived: totalBytesReceived,
        packetsReceived: totalPacketsReceived,
        packetsLost: totalPacketsLost,
        isVideoEnabled: peer.isVideoEnabled !== false,
        isAudioEnabled: peer.isAudioEnabled !== false,
      });
    }

    prevRef.current = nextPrev;
    setPeerStats(nextStats);

    // ── Outbound stats (your upload to SFU) ──
    const sendTransport = sendTransportRef?.current;
    if (sendTransport && sendTransport.connectionState === "connected") {
      try {
        const report = await sendTransport.getStats();
        let outVideo = null;
        let outAudio = null;
        let activePair = null;

        report.forEach((stat) => {
          if (stat.type === "outbound-rtp" && stat.kind === "video") outVideo = stat;
          if (stat.type === "outbound-rtp" && stat.kind === "audio") outAudio = stat;
          if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) activePair = stat;
        });

        const now = Date.now();
        const prev = prevOutboundRef.current;
        const deltaMs = prev ? now - prev.ts : 0;

        let videoBitrate = 0;
        let audioBitrate = 0;

        if (prev && deltaMs > 0) {
          if (outVideo) {
            const deltaBytes = (outVideo.bytesSent || 0) - (prev.videoBytes || 0);
            videoBitrate = deltaBytes > 0 ? (deltaBytes * 8) / (deltaMs / 1000) / 1000 : 0;
          }
          if (outAudio) {
            const deltaBytes = (outAudio.bytesSent || 0) - (prev.audioBytes || 0);
            audioBitrate = deltaBytes > 0 ? (deltaBytes * 8) / (deltaMs / 1000) / 1000 : 0;
          }
        }

        prevOutboundRef.current = {
          videoBytes: outVideo?.bytesSent || 0,
          audioBytes: outAudio?.bytesSent || 0,
          ts: now,
        };

        setOutboundStats({
          videoBitrate,
          audioBitrate,
          totalBitrate: videoBitrate + audioBitrate,
          fps: outVideo?.framesPerSecond ?? null,
          resolution: outVideo?.frameWidth ? `${outVideo.frameWidth}x${outVideo.frameHeight}` : null,
          rtt: activePair?.currentRoundTripTime != null ? activePair.currentRoundTripTime * 1000 : null,
          packetsSent: (outVideo?.packetsSent || 0) + (outAudio?.packetsSent || 0),
        });
      } catch {
        // transport may be closing
      }
    }
  }, [participants, sendTransportRef]);

  useEffect(() => {
    const interval = setInterval(collectStats, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [collectStats]);

  // Reset when participants change drastically
  useEffect(() => {
    if (participants.size === 0) {
      setPeerStats(new Map());
      setOutboundStats(null);
      prevRef.current = new Map();
      prevOutboundRef.current = null;
    }
  }, [participants.size]);

  return { peerStats, outboundStats };
}
