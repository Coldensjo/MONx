import { useTranslation } from 'react-i18next';
import { getLocale, LOCALES, setLocale, type Locale } from './i18n';

// The language picker: one flag per language, each a button. A dropdown hides
// the choice behind a click and reads in whatever language is already active,
// which is the wrong shape for the one control someone who cannot read the
// current language needs to find.
//
// Flags are inline SVG rather than emoji on purpose. Windows ships no glyphs for
// the regional-indicator pairs, so 🇬🇧🇵🇱🇵🇹 renders there as the bare letters
// "GB PL PT" — and this is a Windows-first app.
//
// They are drawn simplified for a 14px row: the Union Jack's diagonals are
// centred rather than offset (the pale is under a pixel at this size) and
// Portugal's armillary sphere is two rings. Both read correctly as flags; at
// this scale the detail would be mud.

function Flag({ locale, size }: { locale: Locale; size: number }) {
	// A common 3:2 box for all three, so the row is even. Poland is 8:5 and the
	// UK 2:1 in reality; matching the box matters more than matching the ratio
	// when they sit side by side.
	const box = { width: size * 1.5, height: size, viewBox: '0 0 24 16' };
	switch (locale) {
		case 'en':
			return (
				<svg {...box} aria-hidden="true">
					<rect width="24" height="16" fill="#012169" />
					<path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="3.4" />
					<path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.7" />
					<path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5.4" />
					<path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3.2" />
				</svg>
			);
		case 'pl':
			return (
				<svg {...box} aria-hidden="true">
					<rect width="24" height="8" fill="#fff" />
					<rect y="8" width="24" height="8" fill="#dc143c" />
				</svg>
			);
		case 'pt':
			return (
				<svg {...box} aria-hidden="true">
					<rect width="24" height="16" fill="#da291c" />
					<rect width="9.6" height="16" fill="#046a38" />
					<circle cx="9.6" cy="8" r="3.8" fill="#ffe900" />
					<circle cx="9.6" cy="8" r="2.4" fill="#da291c" />
					<circle cx="9.6" cy="8" r="1" fill="#fff" />
				</svg>
			);
	}
}

/**
 * Three flag buttons. Lives in the titlebar, which is on screen on the landing
 * screen and in the workspace alike, and again in Preferences where anyone
 * looking for a setting will go first.
 */
export default function LanguagePicker({ size = 14 }: { size?: number }) {
	const { t } = useTranslation();
	const active = getLocale();
	return (
		<div className="mx-lang" role="group" aria-label={t('Language')}>
			{LOCALES.map(l => (
				<button
					key={l.key}
					type="button"
					className="mx-lang-flag"
					// The endonym is the tooltip: "Polski" is what a Polish speaker is
					// scanning for, and it needs no translation to be readable.
					title={l.label}
					aria-label={l.label}
					aria-pressed={l.key === active}
					data-on={l.key === active ? 'true' : undefined}
					onClick={() => setLocale(l.key)}
				>
					<Flag locale={l.key} size={size} />
				</button>
			))}
		</div>
	);
}
