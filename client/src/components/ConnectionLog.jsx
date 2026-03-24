import { useEffect, useRef, useState } from "react";
import { ScrollText, ChevronDown, ChevronUp } from "lucide-react";

/**
 * ConnectionLog — Real-time event log for the WebRTC handshake.
 *
 * This is the KEY educational component. It shows every step of the
 * WebRTC connection process as it happens:
 *   - Signaling events (connecting to server, joining rooms)
 *   - SDP exchange (offers, answers)
 *   - ICE candidate discovery and exchange
 *   - State machine transitions
 *
 * Watch this panel as the connection is established to see the full
 * WebRTC lifecycle unfold in real time.
 */

const eventColors = {
  SIGNALING: "text-blue-400",
  WEBRTC: "text-cyan-400",
  ICE: "text-green-400",
  STATE: "text-yellow-400",
  MEDIA: "text-purple-400",
  ERROR: "text-red-400",
};

export default function ConnectionLog({ eventLog }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [eventLog, isExpanded]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">
            Connection Log
          </span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {eventLog.length} events
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Log entries */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pb-3 space-y-0.5"
        >
          {eventLog.length === 0 ? (
            <p className="text-xs text-gray-600 py-2">
              Events will appear here as the WebRTC connection is established...
            </p>
          ) : (
            eventLog.map((entry, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono leading-relaxed">
                <span className="text-gray-600 shrink-0">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                <span
                  className={`shrink-0 w-20 text-right ${eventColors[entry.event] || "text-gray-400"}`}
                >
                  {entry.event}
                </span>
                <span className="text-gray-300">{entry.detail}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
