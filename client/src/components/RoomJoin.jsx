import { useState } from "react";
import { Video, Users, Shuffle } from "lucide-react";

/**
 * RoomJoin — The lobby screen where users enter a room ID.
 *
 * A "room" is NOT a WebRTC concept. It's our application logic.
 * WebRTC doesn't know about rooms, usernames, or any of that.
 * The room ID is simply how we tell the signaling server
 * "connect me with the other peer who used this same ID."
 */
export default function RoomJoin({ onJoin }) {
  const [roomId, setRoomId] = useState("");

  const generateRandomId = () => {
    const id = Math.random().toString(36).substring(2, 8);
    setRoomId(id);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      onJoin(roomId.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">WebRTC Learning Lab</h1>
          <p className="text-gray-400">
            Peer-to-peer video calling — no media server involved
          </p>
        </div>

        {/* Join Form */}
        <form onSubmit={handleJoin} className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Room ID
          </label>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter a room ID"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={generateRandomId}
              className="px-3 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
              title="Generate random ID"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={!roomId.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Users className="w-5 h-5" />
            Join Room
          </button>

          {/* Educational note */}
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-blue-400 font-medium">How it works: </span>
              Share this Room ID with another person. When you both join the same
              room, the signaling server connects you, and WebRTC establishes a
              direct peer-to-peer connection for video and audio.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
