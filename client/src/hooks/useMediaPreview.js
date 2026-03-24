/**
 * useMediaPreview — Lightweight hook for camera/mic preview in the lobby.
 *
 * This is used in the LobbyView so the joiner can see themselves and
 * toggle audio/video BEFORE entering the call. It manages getUserMedia
 * independently of any WebRTC peer connection.
 *
 * When the joiner is admitted, the preview stream is handed off to
 * useWebRTC via startCall({ existingStream }) to avoid a second
 * getUserMedia call (which could trigger another permission prompt).
 */

import { useState, useRef, useCallback, useEffect } from "react";

export function useMediaPreview() {
  const [previewStream, setPreviewStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const streamRef = useRef(null);

  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      setPreviewStream(stream);
      return stream;
    } catch (err) {
      console.error("Failed to access media:", err.message);
      throw err;
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setPreviewStream(null);
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!streamRef.current) return;

    const currentTrack = streamRef.current.getAudioTracks()[0];

    if (currentTrack && isAudioEnabled) {
      currentTrack.stop();
      streamRef.current.removeTrack(currentTrack);
      setIsAudioEnabled(false);
    } else if (!isAudioEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = newStream.getAudioTracks()[0];
        streamRef.current.addTrack(newTrack);
        setIsAudioEnabled(true);
      } catch (err) {
        console.error("Failed to re-acquire microphone:", err.message);
      }
    }
  }, [isAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    if (!streamRef.current) return;

    const currentTrack = streamRef.current.getVideoTracks()[0];

    if (currentTrack && isVideoEnabled) {
      currentTrack.stop();
      streamRef.current.removeTrack(currentTrack);
      setIsVideoEnabled(false);
      setPreviewStream(new MediaStream(streamRef.current.getTracks()));
    } else if (!isVideoEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        streamRef.current.addTrack(newTrack);
        setIsVideoEnabled(true);
        setPreviewStream(new MediaStream(streamRef.current.getTracks()));
      } catch (err) {
        console.error("Failed to re-acquire camera:", err.message);
      }
    }
  }, [isVideoEnabled]);

  /**
   * Return the raw stream ref so MeetingPage can hand it off to useWebRTC
   * without going through React state (which could be stale).
   */
  const getStream = useCallback(() => streamRef.current, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    previewStream,
    isAudioEnabled,
    isVideoEnabled,
    startPreview,
    stopPreview,
    toggleAudio,
    toggleVideo,
    getStream,
  };
}
