import { useWebRTC } from "./hooks/useWebRTC";
import RoomJoin from "./components/RoomJoin";
import VideoPanel from "./components/VideoPanel";
import ControlBar from "./components/ControlBar";
import ConnectionLog from "./components/ConnectionLog";
import StateIndicator from "./components/StateIndicator";
import { Copy, Check, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function App() {
  const {
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
  } = useWebRTC();

  const [copied, setCopied] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Show the lobby if not in a call
  if (!inCall) {
    return <RoomJoin onJoin={startCall} />;
  }

  // In-call UI
  return (
    <div className="h-dvh bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-800 shrink-0">
        <h1 className="text-xs sm:text-sm font-semibold text-white">WebRTC Learning Lab</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={copyRoomId}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] sm:text-xs font-mono px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-colors"
          >
            Room: {roomId}
            {copied ? (
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            )}
          </button>
          {/* Debug toggle — visible on mobile, hidden on desktop (always shown there) */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="lg:hidden flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] sm:text-xs px-2 py-1 sm:py-1.5 rounded-lg transition-colors"
          >
            Debug
            {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4 min-h-0">
        {/* Video area — takes full space on mobile */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <VideoPanel
              localStream={localStream}
              remoteStream={remoteStream}
              connectionState={connectionState}
              isRemoteVideoEnabled={isRemoteVideoEnabled}
            />
          </div>
          <ControlBar
            toggleAudio={toggleAudio}
            toggleVideo={toggleVideo}
            hangUp={hangUp}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
          />
        </div>

        {/* Debug / Educational panel — hidden on mobile unless toggled, always visible on desktop */}
        <div
          className={`${
            showDebug ? "flex" : "hidden"
          } lg:flex lg:w-96 flex-col gap-2 sm:gap-4 overflow-y-auto max-h-[40vh] lg:max-h-none shrink-0`}
        >
          <StateIndicator
            connectionState={connectionState}
            iceGatheringState={iceGatheringState}
            signalingState={signalingState}
            iceCandidates={iceCandidates}
          />
          <ConnectionLog eventLog={eventLog} />
        </div>
      </div>
    </div>
  );
}
