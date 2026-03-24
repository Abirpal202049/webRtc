import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, Loader } from "lucide-react";

/**
 * LobbyView — The joiner's waiting room before admission.
 *
 * Shows a camera preview so the joiner can check their appearance
 * and toggle audio/video before entering the call. Displays the
 * admission status and an "Ask to join" button.
 */
export default function LobbyView({
  meetingCode,
  previewStream,
  admissionStatus,
  isAudioEnabled,
  isVideoEnabled,
  toggleAudio,
  toggleVideo,
  onAskToJoin,
  onGoHome,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && previewStream) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  const hasVideo = previewStream && previewStream.getVideoTracks().length > 0;

  return (
    <div className="min-h-dvh bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Meeting code */}
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-1">Joining meeting</p>
          <p className="text-xl font-mono text-white tracking-wider">{meetingCode}</p>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
          {hasVideo ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoOff className="w-16 h-16 text-gray-600" />
            </div>
          )}
          {/* Keep video element for audio even when video is off */}
          {!hasVideo && previewStream && (
            <video ref={videoRef} autoPlay playsInline muted className="hidden" />
          )}
        </div>

        {/* Audio/Video toggles */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isAudioEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
            }`}
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isVideoEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
            }`}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>

        {/* Action / Status area */}
        {admissionStatus === "idle" && (
          <button
            onClick={onAskToJoin}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Ask to join
          </button>
        )}

        {admissionStatus === "waiting" && (
          <div className="text-center py-3 space-y-2">
            <Loader className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
            <p className="text-sm text-gray-300">Waiting for the host to let you in...</p>
          </div>
        )}

        {admissionStatus === "room-not-found" && (
          <div className="text-center py-3 space-y-3">
            <p className="text-sm text-gray-300">The host hasn't started this meeting yet.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={onAskToJoin}
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-4 rounded-lg transition-colors"
              >
                Try again
              </button>
              <button
                onClick={onGoHome}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 px-4 rounded-lg transition-colors"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {admissionStatus === "denied" && (
          <div className="text-center py-3 space-y-3">
            <p className="text-sm text-red-400">Your request to join was denied.</p>
            <button
              onClick={onGoHome}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-4 rounded-lg transition-colors"
            >
              Go back to home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
