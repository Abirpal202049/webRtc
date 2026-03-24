/**
 * useIceStats — Extracts ICE candidate and candidate-pair data from transport stats.
 *
 * Polls the send transport's RTCStatsReport and extracts:
 * - All local-candidate entries (your network interfaces)
 * - All remote-candidate entries (the SFU server's addresses)
 * - All candidate-pair entries (attempted connections between local ↔ remote)
 * - The winning (nominated + succeeded) pair with RTT
 */

import { useState, useEffect, useCallback, useRef } from "react";

const POLL_INTERVAL = 3000; // ICE doesn't change often

export function useIceStats(sendTransportRef) {
  const [iceData, setIceData] = useState(null);
  const hasCollected = useRef(false);

  const collectIce = useCallback(async () => {
    const transport = sendTransportRef?.current;
    if (!transport) return;

    // Only collect once connected (ICE candidates are stable after that)
    if (transport.connectionState !== "connected" && hasCollected.current) return;

    let report;
    try {
      report = await transport.getStats();
    } catch {
      return;
    }

    const localCandidates = [];
    const remoteCandidates = [];
    const candidatePairs = [];
    let activePair = null;

    report.forEach((stat) => {
      if (stat.type === "local-candidate") {
        localCandidates.push({
          id: stat.id,
          address: stat.address,
          port: stat.port,
          protocol: stat.protocol,
          candidateType: stat.candidateType,
          priority: stat.priority,
          url: stat.url || null, // STUN/TURN server URL
          networkType: stat.networkType || null,
        });
      }

      if (stat.type === "remote-candidate") {
        remoteCandidates.push({
          id: stat.id,
          address: stat.address,
          port: stat.port,
          protocol: stat.protocol,
          candidateType: stat.candidateType,
          priority: stat.priority,
        });
      }

      if (stat.type === "candidate-pair") {
        const pair = {
          id: stat.id,
          localCandidateId: stat.localCandidateId,
          remoteCandidateId: stat.remoteCandidateId,
          state: stat.state,
          nominated: stat.nominated || false,
          priority: stat.priority,
          rtt: stat.currentRoundTripTime != null ? stat.currentRoundTripTime * 1000 : null,
          bytesSent: stat.bytesSent || 0,
          bytesReceived: stat.bytesReceived || 0,
          requestsSent: stat.requestsSent || 0,
          responsesReceived: stat.responsesReceived || 0,
          consentRequestsSent: stat.consentRequestsSent || 0,
        };
        candidatePairs.push(pair);

        if (stat.state === "succeeded" && stat.nominated) {
          activePair = pair;
        }
      }
    });

    // Sort by priority (higher = better)
    localCandidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    remoteCandidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    setIceData({
      localCandidates,
      remoteCandidates,
      candidatePairs,
      activePair,
      activePairLocal: activePair ? localCandidates.find((c) => c.id === activePair.localCandidateId) : null,
      activePairRemote: activePair ? remoteCandidates.find((c) => c.id === activePair.remoteCandidateId) : null,
    });

    hasCollected.current = true;
  }, [sendTransportRef]);

  useEffect(() => {
    const interval = setInterval(collectIce, POLL_INTERVAL);
    collectIce(); // initial
    return () => clearInterval(interval);
  }, [collectIce]);

  return iceData;
}
