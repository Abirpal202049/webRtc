import { useWebRTC } from "./hooks/useWebRTC";
import RoomJoin from "./components/RoomJoin";
import VideoPanel from "./components/VideoPanel";
import ControlBar from "./components/ControlBar";
import ConnectionLog from "./components/ConnectionLog";
import StateIndicator from "./components/StateIndicator";
import { Copy, Check } from "lucide-react";
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
  } = useWebRTC();

  const [copied, setCopied] = useState(false);

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
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 className="text-sm font-semibold text-white">WebRTC Learning Lab</h1>
        <button
          onClick={copyRoomId}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono px-3 py-1.5 rounded-lg transition-colors"
        >
          Room: {roomId}
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* Video area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <VideoPanel
              localStream={localStream}
              remoteStream={remoteStream}
              connectionState={connectionState}
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

        {/* Debug / Educational panel */}
        <div className="lg:w-96 flex flex-col gap-4 overflow-y-auto">
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
