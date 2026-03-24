import { useEffect, useRef, useState } from "react";

/**
 * PopoutPage — Full-screen video player for screen share pop-out.
 *
 * This page is opened via window.open from the main meeting page.
 * It reads the remote MediaStream from window.opener.__popoutStream,
 * which is set by the VideoPanel before opening this window.
 *
 * The page is minimal — just a black background with the video.
 */
export default function PopoutPage() {
  const videoRef = useRef(null);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    const tryAttachStream = () => {
      // Read the stream from the opener window's global
      const stream = window.opener?.__popoutStream;
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasStream(true);
        return true;
      }
      return false;
    };

    // Try immediately
    if (tryAttachStream()) return;

    // Retry a few times in case of timing
    const interval = setInterval(() => {
      if (tryAttachStream()) {
        clearInterval(interval);
      }
    }, 100);

    // Give up after 5 seconds
    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Listen for stream updates from opener
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === "popout-stream-ended") {
        window.close();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="h-screen w-screen bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
      {!hasStream && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
          Connecting to screen share...
        </div>
      )}
    </div>
  );
}
