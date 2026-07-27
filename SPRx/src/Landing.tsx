import { FolderOpen, History, Loader2 } from 'lucide-react';

interface Props {
	recent: string[];
	error: string | null;
	opening: boolean;
	dropActive: boolean;
	onPick: () => void;
	onOpenRecent: (path: string) => void;
}

export default function Landing({ recent, error, opening, dropActive, onPick, onOpenRecent }: Props) {
	return (
		<div className={`ss-landing ${dropActive ? 'ss-drop-active' : ''}`}>
			<img src="/icon.png" alt="" className="ss-landing-icon" width={40} height={40} />

			{error && <div className="ss-landing-error">{error}</div>}

			<button className="ss-btn ss-btn-primary" onClick={onPick} disabled={opening}>
				{opening ? <Loader2 size={15} className="ss-spin" /> : <FolderOpen size={15} />}
				{opening ? 'Opening…' : 'Open client files'}
			</button>

			{recent.length > 0 && (
				<div className="ss-recent">
					<div className="ss-recent-label">Recent</div>
					{recent.map(path => (
						<button key={path} className="ss-recent-row" onClick={() => onOpenRecent(path)} disabled={opening}>
							<History size={14} />
							<span className="ss-recent-path">{path}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
