import { Wifi, Radio, Signal } from "lucide-react";

/**
 * StateIndicator — Shows the three WebRTC state machines visually.
 *
 * WebRTC has THREE independent state machines running concurrently:
 *
 * 1. Connection State — The overall peer connection lifecycle:
 *    new → connecting → connected → disconnected/failed/closed
 *
 * 2. ICE Gathering State — Discovery of network path candidates:
 *    new → gathering → complete
 *
 * 3. Signaling State — The SDP offer/answer negotiation:
 *    stable → have-local-offer / have-remote-offer → stable (again)
 *
 * Watching these change in real-time helps you understand the
 * concurrent nature of the WebRTC connection process.
 */

const stateColors = {
  // Connection states
  new: "bg-gray-600",
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  disconnected: "bg-red-500",
  failed: "bg-red-600",
  closed: "bg-gray-600",

  // ICE gathering states
  gathering: "bg-yellow-500",
  complete: "bg-green-500",

  // Signaling states
  stable: "bg-green-500",
  "have-local-offer": "bg-yellow-500",
  "have-remote-offer": "bg-yellow-500",
  "have-local-pranswer": "bg-yellow-500",
  "have-remote-pranswer": "bg-yellow-500",
};

function StateBadge({ icon: Icon, label, state }) {
  const color = stateColors[state] || "bg-gray-600";

  return (
    <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="text-xs text-gray-400">{label}:</span>
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs text-white font-mono">{state}</span>
      </span>
    </div>
  );
}

export default function StateIndicator({
  connectionState,
  iceGatheringState,
  signalingState,
  iceCandidates,
}) {
  return (
    <div className="space-y-3">
      {/* State badges */}
      <div className="flex flex-wrap gap-2">
        <StateBadge icon={Wifi} label="Connection" state={connectionState} />
        <StateBadge icon={Radio} label="ICE Gathering" state={iceGatheringState} />
        <StateBadge icon={Signal} label="Signaling" state={signalingState} />
      </div>

      {/* ICE Candidates list */}
      {iceCandidates.length > 0 && (
        <div className="bg-gray-800/30 rounded-lg p-3">
          <h4 className="text-xs font-medium text-gray-400 mb-2">
            ICE Candidates Gathered ({iceCandidates.length})
          </h4>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {iceCandidates.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    c.type === "host"
                      ? "bg-blue-500/20 text-blue-400"
                      : c.type === "srflx"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-orange-500/20 text-orange-400"
                  }`}
                >
                  {c.type}
                </span>
                <span className="text-gray-500">{c.protocol}</span>
                <span className="text-gray-300">
                  {c.address}:{c.port}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
