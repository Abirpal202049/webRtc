import { UserRoundPlus, Check, X } from "lucide-react";

/**
 * JoinRequestNotification — Shown to the creator when someone wants to join.
 *
 * Displays a floating notification for each pending join request.
 * The creator can accept or decline each request.
 */
export default function JoinRequestNotification({ requests, onAdmit, onDeny }) {
  if (requests.length === 0) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-80">
      {requests.map((req) => (
        <div
          key={req.pendingId}
          className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
              <UserRoundPlus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {req.displayName || "Someone"} wants to join
              </p>
              <p className="text-xs text-gray-400">Waiting for your approval</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onAdmit(req.pendingId)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
            <button
              onClick={() => onDeny(req.pendingId)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
