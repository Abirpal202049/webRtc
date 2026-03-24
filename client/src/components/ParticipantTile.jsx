import { useEffect, useRef } from "react";
import { UserRound, VideoOff, MicOff, MonitorUp } from "lucide-react";

/**
 * ParticipantTile — Renders a single participant's video/audio in the grid.
 */
export default function ParticipantTile({
  displayName,
  videoTrack,
  audioTrack,
  isVideoEnabled,
  isAudioEnabled,
  isLocal,
  isScreenSharing,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      if (videoTrack) {
        videoRef.current.srcObject = new MediaStream([videoTrack]);
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [videoTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (audioTrack && !isLocal) {
        audioRef.current.srcObject = new MediaStream([audioTrack]);
      } else {
        audioRef.current.srcObject = null;
      }
    }
  }, [audioTrack, isLocal]);

  const showVideo = videoTrack && isVideoEnabled;

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden">
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""} ${showVideo ? "" : "hidden"}`}
      />

      {/* Hidden audio element for remote participants */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {/* Placeholder when video is off */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          {videoTrack === null && !isLocal ? (
            <VideoOff className="w-10 h-10 sm:w-12 sm:h-12 opacity-40" />
          ) : (
            <UserRound className="w-10 h-10 sm:w-12 sm:h-12 opacity-40" />
          )}
        </div>
      )}

      {/* Bottom bar: name + indicators */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-xs font-medium truncate max-w-[120px]">
            {isLocal ? "You" : displayName || "Guest"}
          </span>
          {isScreenSharing && (
            <MonitorUp className="w-3 h-3 text-blue-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isAudioEnabled && (
            <div className="bg-red-500/80 rounded-full p-0.5">
              <MicOff className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
