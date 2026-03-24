import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, PhoneOff, Users } from "lucide-react";

export default function ControlBar({
  toggleAudio,
  toggleVideo,
  toggleScreenShare,
  hangUp,
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  participantCount,
}) {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4 py-3 sm:py-4">
      {/* Participant count */}
      {participantCount > 0 && (
        <div className="flex items-center gap-1 text-gray-400 text-xs font-medium mr-2">
          <Users className="w-4 h-4" />
          <span>{participantCount}</span>
        </div>
      )}

      {/* Mic toggle */}
      <button
        onClick={toggleAudio}
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
          isAudioEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-white"
            : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
        }`}
        title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Camera toggle */}
      <button
        onClick={toggleVideo}
        disabled={isScreenSharing}
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
          isScreenSharing
            ? "bg-gray-800 text-gray-600 cursor-not-allowed"
            : isVideoEnabled
              ? "bg-gray-700 hover:bg-gray-600 text-white"
              : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
        }`}
        title={isScreenSharing ? "Camera disabled during screen share" : isVideoEnabled ? "Turn off camera" : "Turn on camera"}
      >
        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>

      {/* Screen share toggle */}
      <button
        onClick={toggleScreenShare}
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
          isScreenSharing
            ? "bg-blue-600 hover:bg-blue-500 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-white"
        }`}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
      >
        {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
      </button>

      {/* Hang up */}
      <button
        onClick={hangUp}
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white transition-colors"
        title="End call"
      >
        <PhoneOff className="w-6 h-6" />
      </button>
    </div>
  );
}
