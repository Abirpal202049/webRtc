import { useState } from "react";
import { Globe, ChevronDown, ChevronRight, Info, X, Shield, Wifi, Radio } from "lucide-react";

/**
 * IceCandidateExplorer — Deep dive into ICE candidate discovery and selection.
 *
 * All data from RTCStatsReport: local-candidate, remote-candidate, candidate-pair.
 * Shows every candidate discovered, which pairs were tried, which won.
 */

const TYPE_INFO = {
  host: {
    label: "Host",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    icon: Wifi,
    desc: "Direct local network address. Fastest path — no intermediary servers. Works when both sides are on the same network or have permissive NAT.",
  },
  srflx: {
    label: "Server Reflexive",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    icon: Globe,
    desc: "Your public IP address discovered via STUN server. The STUN server acts like a mirror — your packet bounces off it and comes back with your public address attached. Most common type for cross-network calls.",
  },
  relay: {
    label: "Relay (TURN)",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    icon: Radio,
    desc: "Traffic relayed through a TURN server. Slowest path because ALL data goes through the relay — but it works when direct connections are blocked by firewalls or symmetric NAT.",
  },
  prflx: {
    label: "Peer Reflexive",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    icon: Shield,
    desc: "Discovered during connectivity checks (not from STUN). When ICE sends test packets, the other side sometimes discovers a new address it didn't know about — that's a peer-reflexive candidate.",
  },
};

const PAIR_STATE_COLORS = {
  succeeded: "text-green-400",
  waiting: "text-yellow-400",
  "in-progress": "text-blue-400",
  failed: "text-red-400",
  frozen: "text-gray-500",
  cancelled: "text-gray-600",
};

function CandidateCard({ candidate, isWinner }) {
  const typeInfo = TYPE_INFO[candidate.candidateType] || TYPE_INFO.host;
  const Icon = typeInfo.icon;

  return (
    <div className={`${typeInfo.bg} ${typeInfo.border} border rounded-lg px-2.5 py-1.5 ${isWinner ? "ring-1 ring-green-500/50" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3 h-3 ${typeInfo.color}`} />
          <span className={`text-[10px] font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
          {isWinner && <span className="text-[8px] bg-green-500/20 text-green-400 px-1 rounded">ACTIVE</span>}
        </div>
        <span className="text-[9px] text-gray-500 font-mono">{candidate.protocol?.toUpperCase()}</span>
      </div>
      <div className="text-[10px] font-mono text-gray-300 mt-0.5">
        {candidate.address}:{candidate.port}
      </div>
      {candidate.priority && (
        <div className="text-[8px] text-gray-600 mt-0.5">
          Priority: {candidate.priority.toLocaleString()}
          {candidate.url && <span className="ml-2">via {candidate.url}</span>}
        </div>
      )}
    </div>
  );
}

export default function IceCandidateExplorer({ iceData }) {
  const [expanded, setExpanded] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);

  if (!iceData) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">ICE Candidates</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">Waiting for ICE gathering...</p>
      </div>
    );
  }

  const { localCandidates, remoteCandidates, candidatePairs, activePair, activePairLocal, activePairRemote } = iceData;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">ICE Candidates</span>
          <span className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">
            {localCandidates.length}L / {remoteCandidates.length}R / {candidatePairs.length} pairs
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowInfo(!showInfo)} className="text-gray-600 hover:text-gray-400 p-0.5">
            <Info className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 p-0.5">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 text-[11px] text-gray-300 leading-relaxed">
          <div className="flex justify-between items-start mb-1">
            <span className="font-semibold text-white">How ICE Works</span>
            <button onClick={() => setShowInfo(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="mb-1">
            ICE (Interactive Connectivity Establishment) finds a network path between you and the SFU server.
            It gathers all possible addresses (candidates) from your local interfaces, STUN servers, and TURN relays.
          </p>
          <p className="mb-1">
            Then it tests every combination (candidate pair) by sending connectivity checks.
            The pair with the best RTT that actually works gets "nominated" as the active path.
          </p>
          <p>
            <span className="text-green-400">Host</span> = fastest (direct).
            <span className="text-blue-400"> Server-reflexive</span> = common (via STUN).
            <span className="text-yellow-400"> Relay</span> = fallback (via TURN, adds latency).
          </p>
        </div>
      )}

      {expanded && (
        <div className="space-y-3">
          {/* Active pair highlight */}
          {activePair && activePairLocal && activePairRemote && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2.5">
              <p className="text-[10px] font-medium text-green-400 mb-1.5">
                Winning Pair {activePair.rtt != null && `· RTT ${activePair.rtt.toFixed(1)}ms`}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[8px] text-gray-500 mb-0.5">You (Local)</p>
                  <CandidateCard candidate={activePairLocal} isWinner />
                </div>
                <div className="text-gray-600 text-[10px] font-mono shrink-0">
                  ←→
                </div>
                <div className="flex-1">
                  <p className="text-[8px] text-gray-500 mb-0.5">SFU Server (Remote)</p>
                  <CandidateCard candidate={activePairRemote} isWinner />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[9px] font-mono">
                <div className="text-center">
                  <div className="text-gray-500">Bytes Sent</div>
                  <div className="text-gray-300">{(activePair.bytesSent / 1024).toFixed(0)} KB</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">Bytes Received</div>
                  <div className="text-gray-300">{(activePair.bytesReceived / 1024).toFixed(0)} KB</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">Checks Sent</div>
                  <div className="text-gray-300">{activePair.requestsSent}</div>
                </div>
              </div>
            </div>
          )}

          {/* Local candidates */}
          <div>
            <p className="text-[10px] font-medium text-gray-400 mb-1">Your Candidates ({localCandidates.length})</p>
            <div className="space-y-1">
              {localCandidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  isWinner={activePairLocal?.id === c.id}
                />
              ))}
            </div>
          </div>

          {/* Remote candidates */}
          <div>
            <p className="text-[10px] font-medium text-gray-400 mb-1">SFU Server Candidates ({remoteCandidates.length})</p>
            <div className="space-y-1">
              {remoteCandidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  isWinner={activePairRemote?.id === c.id}
                />
              ))}
            </div>
          </div>

          {/* All candidate pairs */}
          <div>
            <p className="text-[10px] font-medium text-gray-400 mb-1">Candidate Pairs ({candidatePairs.length})</p>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {candidatePairs.map((pair) => {
                const local = localCandidates.find((c) => c.id === pair.localCandidateId);
                const remote = remoteCandidates.find((c) => c.id === pair.remoteCandidateId);
                const isActive = activePair?.id === pair.id;

                return (
                  <div
                    key={pair.id}
                    className={`flex items-center justify-between text-[9px] font-mono px-2 py-1 rounded ${
                      isActive ? "bg-green-500/10 border border-green-500/20" : "bg-gray-800/30"
                    }`}
                  >
                    <span className="text-gray-400 truncate max-w-[80px]">
                      {local?.address}:{local?.port}
                    </span>
                    <span className="text-gray-600 mx-1">↔</span>
                    <span className="text-gray-400 truncate max-w-[80px]">
                      {remote?.address}:{remote?.port}
                    </span>
                    <span className={`ml-1 ${PAIR_STATE_COLORS[pair.state] || "text-gray-500"}`}>
                      {pair.state}
                    </span>
                    {pair.nominated && <span className="text-green-500 ml-1">★</span>}
                    {pair.rtt != null && (
                      <span className="text-gray-500 ml-1">{pair.rtt.toFixed(0)}ms</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Type legend */}
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(TYPE_INFO).map(([key, info]) => (
              <div key={key} className="flex items-center gap-1 text-[8px]">
                <div className={`w-1.5 h-1.5 rounded-full ${info.color.replace("text-", "bg-")}`} />
                <span className="text-gray-500">{info.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
