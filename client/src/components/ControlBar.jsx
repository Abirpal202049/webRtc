import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";

export default function ControlBar({
  toggleAudio,
  toggleVideo,
  hangUp,
  isAudioEnabled,
  isVideoEnabled,
}) {
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      {/* Mic toggle */}
      <button
        onClick={toggleAudio}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
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
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
          isVideoEnabled
            ? "bg-gray-700 hover:bg-gray-600 text-white"
            : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
        }`}
        title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
      >
        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>

      {/* Hang up */}
      <button
        onClick={hangUp}
        className="w-14 h-14 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white transition-colors"
        title="End call"
      >
        <PhoneOff className="w-6 h-6" />
      </button>
    </div>
  );
}
