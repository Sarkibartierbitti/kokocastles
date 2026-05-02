import { Link } from 'react-router-dom';
import type { OutlierFlag } from '../types';

interface Props {
  flag: OutlierFlag;
  triageHook?: string;
}

export default function VideoCard({ flag, triageHook }: Props) {
  const { video, isOutlier, ratio } = flag;
  return (
    <Link
      to={`/video/${video.platform}/${video.videoId}`}
      className="koko-card overflow-hidden block hover:shadow-md transition"
    >
      <div className="relative aspect-video bg-sky-100">
        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        {isOutlier ? (
          <span className="koko-badge bg-koko-pink-deep text-white absolute top-2 left-2">
            outlier · {ratio.toFixed(1)}×
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <div className="text-sm font-medium line-clamp-2">{video.title}</div>
        <div className="mt-1 text-xs text-slate-500 flex items-center gap-2">
          <span>{video.viewCount.toLocaleString()} views</span>
          <span>·</span>
          <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
        </div>
        {triageHook ? (
          <div className="mt-2 text-xs text-slate-600 italic line-clamp-2">"{triageHook}"</div>
        ) : null}
      </div>
    </Link>
  );
}
