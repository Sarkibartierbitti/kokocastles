import { Link } from 'react-router-dom';
import type { Channel } from '../types';

interface Props {
  channel: Channel;
  onRemove?: () => void;
}

export default function ChannelCard({ channel, onRemove }: Props) {
  return (
    <div className="koko-card p-4 flex items-center gap-4">
      {channel.thumbnailUrl ? (
        <img src={channel.thumbnailUrl} alt="" className="w-12 h-12 rounded-full ring-1 ring-sky-200" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-koko-sky to-koko-pink" />
      )}
      <div className="flex-1 min-w-0">
        <Link
          to={`/channel/${channel.platform}/${channel.channelId}`}
          className="font-medium hover:underline block truncate"
        >
          {channel.title}
        </Link>
        <div className="text-xs text-slate-500">
          {channel.platform}
          {channel.subscriberCount ? ` · ${channel.subscriberCount.toLocaleString()} subs` : ''}
        </div>
      </div>
      {onRemove ? (
        <button onClick={onRemove} className="koko-btn-ghost text-slate-500 hover:text-red-500" title="remove">
          ✕
        </button>
      ) : null}
    </div>
  );
}
