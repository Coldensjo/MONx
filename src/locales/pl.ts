// Polish. Keys are the English source strings.
//
// Polish takes four plural categories through Intl.PluralRules — `_one` (1),
// `_few` (2–4, and 22–24, 32–34 …), `_many` (0, 5–21, and most of the rest) and
// `_other` (fractions). A count-bearing key needs all four.
//
// Engine vocabulary is left in English throughout: `raceid`, `typeex`, flag
// names, CONST_ME_* effects, item names and lint codes are what the server
// reads and what the community writes, so translating them would only make the
// file harder to match against the corpus.

const pl: Record<string, string> = {
	// --- Compass ------------------------------------------------------------
	'compass-N': 'N',
	'compass-E': 'W',
	'compass-S': 'S',
	'compass-W': 'Z',

	// --- Plurals ------------------------------------------------------------
	'{{count}} error_one': '{{count}} błąd',
	'{{count}} error_few': '{{count}} błędy',
	'{{count}} error_many': '{{count}} błędów',
	'{{count}} warning_one': '{{count}} ostrzeżenie',
	'{{count}} warning_few': '{{count}} ostrzeżenia',
	'{{count}} warning_many': '{{count}} ostrzeżeń',
	'{{count}} silent-data-loss issue_one': '{{count}} cicha utrata danych',
	'{{count}} silent-data-loss issue_few': '{{count}} ciche utraty danych',
	'{{count}} silent-data-loss issue_many': '{{count}} cichych utrat danych',
	'{{count}} lint_one': '{{count}} uwaga',
	'{{count}} lint_few': '{{count}} uwagi',
	'{{count}} lint_many': '{{count}} uwag',
	'Fix all ({{count}})_one': 'Napraw wszystko ({{count}})',
	'Fix all ({{count}})_few': 'Napraw wszystko ({{count}})',
	'Fix all ({{count}})_many': 'Napraw wszystko ({{count}})',
	'Fixed {{count}} lint_one': 'Naprawiono {{count}} uwagę',
	'Fixed {{count}} lint_few': 'Naprawiono {{count}} uwagi',
	'Fixed {{count}} lint_many': 'Naprawiono {{count}} uwag',
	'Fixed {{count}} lint across {{files}}_one': 'Naprawiono {{count}} uwagę w {{files}}',
	'Fixed {{count}} lint across {{files}}_few': 'Naprawiono {{count}} uwagi w {{files}}',
	'Fixed {{count}} lint across {{files}}_many': 'Naprawiono {{count}} uwag w {{files}}',
	'Fixed {{count}} lint, {{manual}} need a manual fix_one':
		'Naprawiono {{count}} uwagę, {{manual}} wymaga ręcznej poprawki',
	'Fixed {{count}} lint, {{manual}} need a manual fix_few':
		'Naprawiono {{count}} uwagi, {{manual}} wymaga ręcznej poprawki',
	'Fixed {{count}} lint, {{manual}} need a manual fix_many':
		'Naprawiono {{count}} uwag, {{manual}} wymaga ręcznej poprawki',
	'Exported {{count}} lint_one': 'Wyeksportowano {{count}} uwagę',
	'Exported {{count}} lint_few': 'Wyeksportowano {{count}} uwagi',
	'Exported {{count}} lint_many': 'Wyeksportowano {{count}} uwag',

	'{{count}} file_one': '{{count}} pliku',
	'{{count}} file_few': '{{count}} plikach',
	'{{count}} file_many': '{{count}} plikach',
	'{{count}} monster_one': '{{count}} potwora',
	'{{count}} monster_few': '{{count}} potworach',
	'{{count}} monster_many': '{{count}} potworach',
	'{{count}} item_one': '{{count}} przedmiot',
	'{{count}} item_few': '{{count}} przedmioty',
	'{{count}} item_many': '{{count}} przedmiotów',
	'{{count}} entry_one': '{{count}} wpis',
	'{{count}} entry_few': '{{count}} wpisy',
	'{{count}} entry_many': '{{count}} wpisów',
	'{{count}} tile_one': '{{count}} pole',
	'{{count}} tile_few': '{{count}} pola',
	'{{count}} tile_many': '{{count}} pól',
	'{{count}} change_one': '{{count}} zmiana',
	'{{count}} change_few': '{{count}} zmiany',
	'{{count}} change_many': '{{count}} zmian',
	'{{count}} spell_one': '{{count}} zaklęcie',
	'{{count}} spell_few': '{{count}} zaklęcia',
	'{{count}} spell_many': '{{count}} zaklęć',
	'{{count}} drop_one': '{{count}} łup',
	'{{count}} drop_few': '{{count}} łupy',
	'{{count}} drop_many': '{{count}} łupów',
	'{{count}} line_one': '{{count}} linia',
	'{{count}} line_few': '{{count}} linie',
	'{{count}} line_many': '{{count}} linii',
	'{{count}} soul_one': '{{count}} dusza',
	'{{count}} soul_few': '{{count}} dusze',
	'{{count}} soul_many': '{{count}} dusz',
	'{{count}} charge_one': '{{count}} ładunek',
	'{{count}} charge_few': '{{count}} ładunki',
	'{{count}} charge_many': '{{count}} ładunków',
	'{{count}} slot_one': '{{count}} slot',
	'{{count}} slot_few': '{{count}} sloty',
	'{{count}} slot_many': '{{count}} slotów',

	'{{count}} minute ago_one': '{{count}} minutę temu',
	'{{count}} minute ago_few': '{{count}} minuty temu',
	'{{count}} minute ago_many': '{{count}} minut temu',
	'{{count}} hour ago_one': '{{count}} godzinę temu',
	'{{count}} hour ago_few': '{{count}} godziny temu',
	'{{count}} hour ago_many': '{{count}} godzin temu',
	'{{count}} day ago_one': '{{count}} dzień temu',
	'{{count}} day ago_few': '{{count}} dni temu',
	'{{count}} day ago_many': '{{count}} dni temu',

	'{{count}} field differs._one': '{{count}} pole się różni.',
	'{{count}} field differs._few': '{{count}} pola się różnią.',
	'{{count}} field differs._many': '{{count}} pól się różni.',
	'{{count}} entry across {{files}} change._one': 'Zmieni się {{count}} wpis w {{files}}.',
	'{{count}} entry across {{files}} change._few': 'Zmienią się {{count}} wpisy w {{files}}.',
	'{{count}} entry across {{files}} change._many': 'Zmieni się {{count}} wpisów w {{files}}.',
	'{{count}} entry stops dropping entirely._one': '{{count}} wpis przestanie wypadać całkowicie.',
	'{{count}} entry stops dropping entirely._few': '{{count}} wpisy przestaną wypadać całkowicie.',
	'{{count}} entry stops dropping entirely._many': '{{count}} wpisów przestanie wypadać całkowicie.',
	'{{count}} entry never drops — see lints._one': '{{count}} wpis nigdy nie wypada — zobacz uwagi.',
	'{{count}} entry never drops — see lints._few': '{{count}} wpisy nigdy nie wypadają — zobacz uwagi.',
	'{{count}} entry never drops — see lints._many': '{{count}} wpisów nigdy nie wypada — zobacz uwagi.',
	'{{count}} item is unpriced and excluded from gp totals._one':
		'{{count}} przedmiot nie ma ceny i jest pominięty w sumach gp.',
	'{{count}} item is unpriced and excluded from gp totals._few':
		'{{count}} przedmioty nie mają ceny i są pominięte w sumach gp.',
	'{{count}} item is unpriced and excluded from gp totals._many':
		'{{count}} przedmiotów nie ma ceny i jest pominiętych w sumach gp.',
	'{{count}} monster matches, {{changed}}._one': 'Pasuje {{count}} potwór, {{changed}}.',
	'{{count}} monster matches, {{changed}}._few': 'Pasują {{count}} potwory, {{changed}}.',
	'{{count}} monster matches, {{changed}}._many': 'Pasuje {{count}} potworów, {{changed}}.',
	'{{count}} monster matches — none of them change at these settings._one':
		'Pasuje {{count}} potwór — żaden się nie zmieni przy tych ustawieniach.',
	'{{count}} monster matches — none of them change at these settings._few':
		'Pasują {{count}} potwory — żaden się nie zmieni przy tych ustawieniach.',
	'{{count}} monster matches — none of them change at these settings._many':
		'Pasuje {{count}} potworów — żaden się nie zmieni przy tych ustawieniach.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._one':
		'{{count}} z nich dodaje lub usuwa węzeł zamiast zmieniać go w miejscu, więc ten plik przesunie każdy wiersz poniżej edycji.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._few':
		'{{count}} z nich dodają lub usuwają węzeł zamiast zmieniać go w miejscu, więc te pliki przesuną każdy wiersz poniżej edycji.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._many':
		'{{count}} z nich dodaje lub usuwa węzeł zamiast zmieniać go w miejscu, więc te pliki przesuną każdy wiersz poniżej edycji.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._one':
		'{{count}} był już id bez informacji, czym jest; zyska tylko komentarz.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._few':
		'{{count}} były już id bez informacji, czym są; zyskają tylko komentarz.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._many':
		'{{count}} było już id bez informacji, czym są; zyskają tylko komentarz.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._one':
		'{{count}} nazwa nie pasuje do żadnego wpisu items.xml i zostaje nietknięta — MONx nigdy nie wymyśla id przedmiotu. Pierwsza: {{list}}.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._few':
		'{{count}} nazwy nie pasują do żadnego wpisu items.xml i zostają nietknięte — MONx nigdy nie wymyśla id przedmiotu. Pierwsze: {{list}}.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._many':
		'{{count}} nazw nie pasuje do żadnego wpisu items.xml i zostaje nietkniętych — MONx nigdy nie wymyśla id przedmiotu. Pierwsze: {{list}}.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._one':
		'{{count}} wpis łupu w {{files}} stanie się id z komentarzem nazywającym przedmiot.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._few':
		'{{count}} wpisy łupu w {{files}} staną się id z komentarzem nazywającym przedmiot.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._many':
		'{{count}} wpisów łupu w {{files}} stanie się id z komentarzem nazywającym przedmiot.',
	'{{count}} item in the tray._one': '{{count}} przedmiot na tacy.',
	'{{count}} item in the tray._few': '{{count}} przedmioty na tacy.',
	'{{count}} item in the tray._many': '{{count}} przedmiotów na tacy.',
	'Clear {{count}} item from Loot?_one': 'Usunąć {{count}} przedmiot z tacy łupu?',
	'Clear {{count}} item from Loot?_few': 'Usunąć {{count}} przedmioty z tacy łupu?',
	'Clear {{count}} item from Loot?_many': 'Usunąć {{count}} przedmiotów z tacy łupu?',
	'Add {{count}} item to Loot_one': 'Dodaj przedmiot do łupu',
	'Add {{count}} item to Loot_few': 'Dodaj {{count}} przedmioty do łupu',
	'Add {{count}} item to Loot_many': 'Dodaj {{count}} przedmiotów do łupu',
	'Added {{count}} item to Loot_one': 'Dodano {{count}} przedmiot do łupu',
	'Added {{count}} item to Loot_few': 'Dodano {{count}} przedmioty do łupu',
	'Added {{count}} item to Loot_many': 'Dodano {{count}} przedmiotów do łupu',
	'Added {{count}} item to favourites_one': 'Dodano {{count}} przedmiot do ulubionych',
	'Added {{count}} item to favourites_few': 'Dodano {{count}} przedmioty do ulubionych',
	'Added {{count}} item to favourites_many': 'Dodano {{count}} przedmiotów do ulubionych',
	'Add {{count}} item to favourites_one': 'Dodaj {{count}} przedmiot do ulubionych',
	'Add {{count}} item to favourites_few': 'Dodaj {{count}} przedmioty do ulubionych',
	'Add {{count}} item to favourites_many': 'Dodaj {{count}} przedmiotów do ulubionych',
	'Removed {{count}} item from favourites_one': 'Usunięto {{count}} przedmiot z ulubionych',
	'Removed {{count}} item from favourites_few': 'Usunięto {{count}} przedmioty z ulubionych',
	'Removed {{count}} item from favourites_many': 'Usunięto {{count}} przedmiotów z ulubionych',
	'Remove {{count}} item from favourites_one': 'Usuń {{count}} przedmiot z ulubionych',
	'Remove {{count}} item from favourites_few': 'Usuń {{count}} przedmioty z ulubionych',
	'Remove {{count}} item from favourites_many': 'Usuń {{count}} przedmiotów z ulubionych',
	'Add {{count}} item to loot for {{monster}}_one': 'Dodaj {{count}} przedmiot do łupu {{monster}}',
	'Add {{count}} item to loot for {{monster}}_few': 'Dodaj {{count}} przedmioty do łupu {{monster}}',
	'Add {{count}} item to loot for {{monster}}_many': 'Dodaj {{count}} przedmiotów do łupu {{monster}}',
	'Added {{count}} loot entry to {{monster}}_one': 'Dodano {{count}} wpis łupu do {{monster}}',
	'Added {{count}} loot entry to {{monster}}_few': 'Dodano {{count}} wpisy łupu do {{monster}}',
	'Added {{count}} loot entry to {{monster}}_many': 'Dodano {{count}} wpisów łupu do {{monster}}',
	'{{count}} tab has unsaved changes. Close and discard them?_one':
		'{{count}} karta ma niezapisane zmiany. Zamknąć i je odrzucić?',
	'{{count}} tab has unsaved changes. Close and discard them?_few':
		'{{count}} karty mają niezapisane zmiany. Zamknąć i je odrzucić?',
	'{{count}} tab has unsaved changes. Close and discard them?_many':
		'{{count}} kart ma niezapisane zmiany. Zamknąć i je odrzucić?',
	'Cut-off point set — {{count}} monster marked_one': 'Ustawiono punkt odcięcia — oznaczono {{count}} potwora',
	'Cut-off point set — {{count}} monster marked_few': 'Ustawiono punkt odcięcia — oznaczono {{count}} potwory',
	'Cut-off point set — {{count}} monster marked_many': 'Ustawiono punkt odcięcia — oznaczono {{count}} potworów',
	'Exported {{count}} change_one': 'Wyeksportowano {{count}} zmianę',
	'Exported {{count}} change_few': 'Wyeksportowano {{count}} zmiany',
	'Exported {{count}} change_many': 'Wyeksportowano {{count}} zmian',
	'Exported {{count}} change — cut-off point moved to now_one':
		'Wyeksportowano {{count}} zmianę — punkt odcięcia przesunięto na teraz',
	'Exported {{count}} change — cut-off point moved to now_few':
		'Wyeksportowano {{count}} zmiany — punkt odcięcia przesunięto na teraz',
	'Exported {{count}} change — cut-off point moved to now_many':
		'Wyeksportowano {{count}} zmian — punkt odcięcia przesunięto na teraz',
	'{{count}} change across {{monsters}}._one': '{{count}} zmiana w {{monsters}}.',
	'{{count}} change across {{monsters}}._few': '{{count}} zmiany w {{monsters}}.',
	'{{count}} change across {{monsters}}._many': '{{count}} zmian w {{monsters}}.',
	'and {{count}} more not listed — they change too_one': 'i jeszcze 1 niewymieniony — też się zmieni',
	'and {{count}} more not listed — they change too_few': 'i jeszcze {{count}} niewymienione — też się zmienią',
	'and {{count}} more not listed — they change too_many': 'i jeszcze {{count}} niewymienionych — też się zmienią',
	'and {{count}} more entries not listed — they are scaled too_one':
		'i jeszcze 1 niewymieniony wpis — też zostanie przeskalowany',
	'and {{count}} more entries not listed — they are scaled too_few':
		'i jeszcze {{count}} niewymienione wpisy — też zostaną przeskalowane',
	'and {{count}} more entries not listed — they are scaled too_many':
		'i jeszcze {{count}} niewymienionych wpisów — też zostaną przeskalowane',
	'{{count}} tile hit_one': '{{count}} trafione pole',
	'{{count}} tile hit_few': '{{count}} trafione pola',
	'{{count}} tile hit_many': '{{count}} trafionych pól',
	'{{count}} tile away — drag to move_one': '{{count}} pole dalej — przeciągnij, aby przesunąć',
	'{{count}} tile away — drag to move_few': '{{count}} pola dalej — przeciągnij, aby przesunąć',
	'{{count}} tile away — drag to move_many': '{{count}} pól dalej — przeciągnij, aby przesunąć',
	'Changed {{count}} monster_one': 'Zmieniono {{count}} potwora',
	'Changed {{count}} monster_few': 'Zmieniono {{count}} potwory',
	'Changed {{count}} monster_many': 'Zmieniono {{count}} potworów',
	'Scaled {{count}} loot chance across {{files}}_one': 'Przeskalowano {{count}} szansę łupu w {{files}}',
	'Scaled {{count}} loot chance across {{files}}_few': 'Przeskalowano {{count}} szanse łupu w {{files}}',
	'Scaled {{count}} loot chance across {{files}}_many': 'Przeskalowano {{count}} szans łupu w {{files}}',
	'Pinned {{count}} loot entry across {{files}}_one': 'Przypięto {{count}} wpis łupu w {{files}}',
	'Pinned {{count}} loot entry across {{files}}_few': 'Przypięto {{count}} wpisy łupu w {{files}}',
	'Pinned {{count}} loot entry across {{files}}_many': 'Przypięto {{count}} wpisów łupu w {{files}}',
	'Loaded “{{name}}” — {{count}} item_one': 'Wczytano „{{name}}” — {{count}} przedmiot',
	'Loaded “{{name}}” — {{count}} item_few': 'Wczytano „{{name}}” — {{count}} przedmioty',
	'Loaded “{{name}}” — {{count}} item_many': 'Wczytano „{{name}}” — {{count}} przedmiotów',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_one':
		'Wczytano „{{name}}” — {{count}} przedmiot, {{missing}} spoza tego obszaru roboczego',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_few':
		'Wczytano „{{name}}” — {{count}} przedmioty, {{missing}} spoza tego obszaru roboczego',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_many':
		'Wczytano „{{name}}” — {{count}} przedmiotów, {{missing}} spoza tego obszaru roboczego',
	'{{count}} of them are ambiguous names the server drops today._one':
		'{{count}} z nich to niejednoznaczna nazwa, którą serwer dziś odrzuca.',
	'{{count}} of them are ambiguous names the server drops today._few':
		'{{count}} z nich to niejednoznaczne nazwy, które serwer dziś odrzuca.',
	'{{count}} of them are ambiguous names the server drops today._many':
		'{{count}} z nich to niejednoznaczne nazwy, które serwer dziś odrzuca.',
	'and {{count}} more_one': 'i jeszcze {{count}}',
	'and {{count}} more_few': 'i jeszcze {{count}}',
	'and {{count}} more_many': 'i jeszcze {{count}}',
	'{{count}} unticked._one': '{{count}} odznaczony.',
	'{{count}} unticked._few': '{{count}} odznaczone.',
	'{{count}} unticked._many': '{{count}} odznaczonych.',
	'{{count}} selected_one': 'zaznaczono {{count}}',
	'{{count}} selected_few': 'zaznaczono {{count}}',
	'{{count}} selected_many': 'zaznaczono {{count}}',
	'{{count}} immune_one': '{{count}} odporność',
	'{{count}} immune_few': '{{count}} odporności',
	'{{count}} immune_many': '{{count}} odporności',
	'Log capped at the first {{count}} kills._one': 'Dziennik ograniczony do pierwszego zabójstwa.',
	'Log capped at the first {{count}} kills._few': 'Dziennik ograniczony do pierwszych {{count}} zabójstw.',
	'Log capped at the first {{count}} kills._many': 'Dziennik ograniczony do pierwszych {{count}} zabójstw.',
	'Across {{count}} sessions, min / median / max_one': 'W {{count}} sesji: min / mediana / maks.',
	'Across {{count}} sessions, min / median / max_few': 'W {{count}} sesjach: min / mediana / maks.',
	'Across {{count}} sessions, min / median / max_many': 'W {{count}} sesjach: min / mediana / maks.',
	'Across {{count}} runs, min / median / max_one': 'W {{count}} przebiegu: min / mediana / maks.',
	'Across {{count}} runs, min / median / max_few': 'W {{count}} przebiegach: min / mediana / maks.',
	'Across {{count}} runs, min / median / max_many': 'W {{count}} przebiegach: min / mediana / maks.',
	'Presets ({{count}})_one': 'Zestawy ({{count}})',
	'Presets ({{count}})_few': 'Zestawy ({{count}})',
	'Presets ({{count}})_many': 'Zestawy ({{count}})',
	'Ignored ({{count}}) — pick one to restore_one': 'Ignorowane ({{count}}) — wybierz, aby przywrócić',
	'Ignored ({{count}}) — pick one to restore_few': 'Ignorowane ({{count}}) — wybierz, aby przywrócić',
	'Ignored ({{count}}) — pick one to restore_many': 'Ignorowane ({{count}}) — wybierz, aby przywrócić',
	'Copied {{count}} {{block}} from {{monster}}_one': 'Skopiowano {{count}} {{block}} z {{monster}}',
	'Copied {{count}} {{block}} from {{monster}}_few': 'Skopiowano {{count}} {{block}} z {{monster}}',
	'Copied {{count}} {{block}} from {{monster}}_many': 'Skopiowano {{count}} {{block}} z {{monster}}',
	'Added {{count}} {{block}} from {{monster}}_one': 'Dodano {{count}} {{block}} z {{monster}}',
	'Added {{count}} {{block}} from {{monster}}_few': 'Dodano {{count}} {{block}} z {{monster}}',
	'Added {{count}} {{block}} from {{monster}}_many': 'Dodano {{count}} {{block}} z {{monster}}',
	'Replaced with {{count}} {{block}} from {{monster}}_one': 'Zastąpiono {{count}} {{block}} z {{monster}}',
	'Replaced with {{count}} {{block}} from {{monster}}_few': 'Zastąpiono {{count}} {{block}} z {{monster}}',
	'Replaced with {{count}} {{block}} from {{monster}}_many': 'Zastąpiono {{count}} {{block}} z {{monster}}',
	'Replace with {{count}} {{block}} from {{monster}}_one': 'Zastąp {{count}} {{block}} z {{monster}}',
	'Replace with {{count}} {{block}} from {{monster}}_few': 'Zastąp {{count}} {{block}} z {{monster}}',
	'Replace with {{count}} {{block}} from {{monster}}_many': 'Zastąp {{count}} {{block}} z {{monster}}',
	'Add {{count}} {{block}} from {{monster}} to what is here_one':
		'Dodaj {{count}} {{block}} z {{monster}} do tego, co tu jest',
	'Add {{count}} {{block}} from {{monster}} to what is here_few':
		'Dodaj {{count}} {{block}} z {{monster}} do tego, co tu jest',
	'Add {{count}} {{block}} from {{monster}} to what is here_many':
		'Dodaj {{count}} {{block}} z {{monster}} do tego, co tu jest',
	'{{count}} of max {{max}}_one': '{{count}} z maks. {{max}}',
	'{{count}} of max {{max}}_few': '{{count}} z maks. {{max}}',
	'{{count}} of max {{max}}_many': '{{count}} z maks. {{max}}',
	'Change {{count}}_one': 'Zmień {{count}}',
	'Change {{count}}_few': 'Zmień {{count}}',
	'Change {{count}}_many': 'Zmień {{count}}',
	'Scale {{count}}_one': 'Przeskaluj {{count}}',
	'Scale {{count}}_few': 'Przeskaluj {{count}}',
	'Scale {{count}}_many': 'Przeskaluj {{count}}',
	'Pin {{count}}_one': 'Przypnij {{count}}',
	'Pin {{count}}_few': 'Przypnij {{count}}',
	'Pin {{count}}_many': 'Przypnij {{count}}',

	// --- Titlebar and shell --------------------------------------------------
	'Unsaved changes': 'Niezapisane zmiany',
	'Editing under {{engine}} rules': 'Edycja według reguł {{engine}}',
	'Editing under {{engine}} rules — detection was not confident':
		'Edycja według reguł {{engine}} — wykrycie nie było pewne',
	'Switch to light mode': 'Przełącz na tryb jasny',
	'Switch to dark mode': 'Przełącz na tryb ciemny',
	'Toggle theme': 'Przełącz motyw',
	Minimize: 'Minimalizuj',
	Maximize: 'Maksymalizuj',
	Close: 'Zamknij',
	'You have unsaved changes. Close the workspace anyway?':
		'Masz niezapisane zmiany. Zamknąć obszar roboczy mimo to?',
	'You have unsaved changes. Quit anyway?': 'Masz niezapisane zmiany. Zakończyć mimo to?',

	// --- Landing -------------------------------------------------------------
	Language: 'Język',
	Folders: 'Foldery',
	'Saved workspaces': 'Zapisane obszary robocze',
	Rename: 'Zmień nazwę',
	'Forget this workspace': 'Zapomnij ten obszar roboczy',
	'Monsters folder': 'Folder potworów',
	'Items folder': 'Folder przedmiotów',
	'Client folder': 'Folder klienta',
	'Spells folder': 'Folder zaklęć',
	'data/items — items.otb + items.xml': 'data/items — items.otb + items.xml',
	'data/spells — optional, enables ### spell verification':
		'data/spells — opcjonalny, włącza weryfikację zaklęć ###',
	optional: 'opcjonalne',
	Engine: 'Silnik',
	'auto-detect': 'wykryj automatycznie',
	chosen: 'wybrany',
	'detected from {{evidence}}': 'wykryto na podstawie: {{evidence}}',
	'the corpus': 'korpusu',
	detected: 'wykryto',
	'uncertain — check this': 'niepewne — sprawdź to',
	'no previews': 'bez podglądów',
	'No item database or client files — monsters open and save normally, but nothing is drawn and loot ids stay numbers.':
		'Brak bazy przedmiotów i plików klienta — potwory otwierają się i zapisują normalnie, ale nic nie jest rysowane, a id łupu pozostają liczbami.',
	'Opening…': 'Otwieranie…',
	'Checking…': 'Sprawdzanie…',
	'Open workspace': 'Otwórz obszar roboczy',
	'Workspace name': 'Nazwa obszaru roboczego',
	'Save these folders under a name, to open in one click':
		'Zapisz te foldery pod nazwą, aby otwierać je jednym kliknięciem',
	'Save workspace': 'Zapisz obszar roboczy',
	Recent: 'Ostatnie',

	// --- Engines -------------------------------------------------------------
	Ironcore: 'Ironcore',
	'TheForgottenServer 1.x': 'TheForgottenServer 1.x',
	TheVioletProject: 'TheVioletProject',
	Nostalrius: 'Nostalrius',
	'Canary / OTServBR': 'Canary / OTServBR',
	BlackTek: 'BlackTek',
	'raceid, species, the pacifist system, CONST_ME_* effects':
		'raceid, species, system pacyfisty, efekty CONST_ME_*',
	'raceId + <bestiary>, short-name effects, no pacifist system':
		'raceId + <bestiary>, krótkie nazwy efektów, brak systemu pacyfisty',
	'7.x: <targetstrategy>, delay=, melee skill progression':
		'7.x: <targetstrategy>, delay=, progresja umiejętności walki wręcz',
	'7.x: melee on <attacks>, no spell interval, count= conditions':
		'7.x: walka wręcz w <attacks>, brak interwału zaklęć, warunki count=',
	'Lua monsters, bestiary + bosstiary, COMBAT_* damage types':
		'Potwory w Lua, bestiary + bosstiary, typy obrażeń COMBAT_*',
	'TFS 1.x in Lua: flags table, top-level numerics':
		'TFS 1.x w Lua: tabela flag, liczby na najwyższym poziomie',

	// --- Navigation and views ------------------------------------------------
	Monsters: 'Potwory',
	Items: 'Przedmioty',
	Outfits: 'Wygląd',
	Effects: 'Efekty',
	Missiles: 'Pociski',
	Workspace: 'Obszar roboczy',
	Monster: 'Potwór',
	'Select a monster': 'Wybierz potwora',

	// --- Menus and commands --------------------------------------------------
	File: 'Plik',
	Edit: 'Edycja',
	Tools: 'Narzędzia',
	Linter: 'Linter',
	Preferences: 'Preferencje',
	View: 'Widok',
	'Editor tabs': 'Karty edytora',
	'Save monster': 'Zapisz potwora',
	'Go to monster…': 'Przejdź do potwora…',
	'New monster…': 'Nowy potwór…',
	'Duplicate monster': 'Duplikuj potwora',
	'Rename monster…': 'Zmień nazwę potwora…',
	'Delete monster…': 'Usuń potwora…',
	'Show monster in folder': 'Pokaż potwora w folderze',
	'Close workspace': 'Zamknij obszar roboczy',
	Undo: 'Cofnij',
	Redo: 'Ponów',
	'Fix every fixable lint': 'Napraw każdą naprawialną uwagę',
	'Add the loot tray to this monster': 'Dodaj tacę łupu do tego potwora',
	'Go to Monsters': 'Przejdź do Potworów',
	'Go to Items': 'Przejdź do Przedmiotów',
	'Go to Outfits': 'Przejdź do Wyglądów',
	'Go to Effects': 'Przejdź do Efektów',
	'Go to Missiles': 'Przejdź do Pocisków',
	'Search monsters': 'Szukaj potworów',
	'Toggle the lint drawer': 'Przełącz szufladę uwag',
	'Next monster in the list': 'Następny potwór na liście',
	'Previous monster in the list': 'Poprzedni potwór na liście',
	'Next editor tab': 'Następna karta edytora',
	'Previous editor tab': 'Poprzednia karta edytora',
	'Close editor tab': 'Zamknij kartę edytora',
	'Jump to {{tab}}': 'Przejdź do: {{tab}}',
	'Pin ambiguous loot ids…': 'Przypnij niejednoznaczne id łupu…',
	'Pin all loot ids…': 'Przypnij wszystkie id łupu…',
	'Scale loot chances…': 'Przeskaluj szanse łupu…',
	'Batch edit fields…': 'Edycja zbiorcza pól…',
	'Compare monsters…': 'Porównaj potwory…',
	'Export lint report…': 'Eksportuj raport uwag…',
	'Export patch notes…': 'Eksportuj notatki o zmianach…',
	'Set patch notes cut-off point': 'Ustaw punkt odcięcia notatek o zmianach',
	'Set patch notes cut-off point — last set {{when}}':
		'Ustaw punkt odcięcia notatek o zmianach — ostatnio {{when}}',
	'{{action}} — save first': '{{action}} — najpierw zapisz',
	'Show {{severity}} lints': 'Pokaż uwagi: {{severity}}',
	'Show {{severity}}': 'Pokaż: {{severity}}',
	'Preferences…': 'Preferencje…',
	'Filtered monsters…': 'Odfiltrowane potwory…',
	'Hotkeys…': 'Skróty klawiszowe…',
	'Show every editor tab': 'Pokaż każdą kartę edytora',
	'Nothing ignored': 'Nic nie jest ignorowane',
	'Stop ignoring everything': 'Przestań wszystko ignorować',

	// --- Tabs and editor shell -----------------------------------------------
	'{{file}} — preview; double-click to keep open':
		'{{file}} — podgląd; kliknij dwukrotnie, aby zostawić otwarte',
	'Close {{file}}': 'Zamknij {{file}}',
	'Close all except this one': 'Zamknij wszystkie oprócz tej',
	'Close all to the left': 'Zamknij wszystkie po lewej',
	'Close all to the right': 'Zamknij wszystkie po prawej',
	'Close all': 'Zamknij wszystkie',
	'{{file}} has unsaved changes. Close and discard them?':
		'{{file}} ma niezapisane zmiany. Zamknąć i je odrzucić?',
	'Read-only — this file cannot be written back without losing something. Fix the reported problems to enable editing.':
		'Tylko do odczytu — tego pliku nie da się zapisać bez utraty danych. Napraw zgłoszone problemy, aby włączyć edycję.',
	Save: 'Zapisz',
	'Saving…': 'Zapisywanie…',
	'Saved {{file}}': 'Zapisano {{file}}',

	// --- Monster list ---------------------------------------------------------
	'Search name, file, species, raceid': 'Szukaj nazwy, pliku, gatunku, raceid',
	'Clear search': 'Wyczyść wyszukiwanie',
	'Filter the list': 'Filtruj listę',
	Filters: 'Filtry',
	'Clear all': 'Wyczyść wszystko',
	'Search filters': 'Szukaj filtrów',
	'No matching filters': 'Brak pasujących filtrów',
	'No monsters match.': 'Żaden potwór nie pasuje.',
	New: 'Nowy',
	'Not registered in monsters.xml': 'Niezarejestrowany w monsters.xml',
	orphan: 'sierota',
	Duplicate: 'Duplikuj',
	'Rename…': 'Zmień nazwę…',
	'Reveal in folder': 'Pokaż w folderze',
	'Delete…': 'Usuń…',
	'New monster': 'Nowy potwór',
	Name: 'Nazwa',
	Group: 'Grupa',
	'(none)': '(brak)',
	Cancel: 'Anuluj',
	Create: 'Utwórz',
	'Rename {{name}}': 'Zmień nazwę: {{name}}',
	'Renaming rewrites the monsters.xml entry as well as the file on disk.':
		'Zmiana nazwy przepisuje wpis w monsters.xml oraz plik na dysku.',
	'Delete {{name}}?': 'Usunąć {{name}}?',
	'{{file}} is removed from disk and from monsters.xml. Anything summoning it, or referencing it from an outfit spell, will silently stop working.':
		'{{file}} zostanie usunięty z dysku i z monsters.xml. Wszystko, co go przywołuje lub odwołuje się do niego z zaklęcia wyglądu, po cichu przestanie działać.',
	Delete: 'Usuń',
	'Created {{file}}': 'Utworzono {{file}}',
	'Renamed to {{name}}': 'Zmieniono nazwę na {{name}}',
	'Duplicated to {{file}}': 'Zduplikowano do {{file}}',
	'Deleted {{file}}': 'Usunięto {{file}}',

	// --- Create wizard --------------------------------------------------------
	// The kind labels double as a noun inside the "similar to" blurb, where they
	// arrive lower-cased. The blurb quotes {{kind}} rather than declining it, so
	// the nominative the button shows is the only form any of them needs.
	'What kind of monster is it?': 'Jakiego rodzaju to potwór?',
	'Ordinary monster': 'Zwykły potwór',
	'Hostile, attackable, drops loot': 'Wrogi, można go zaatakować, zostawia łup',
	'Rarer, tougher, unsummonable': 'Rzadszy, mocniejszy, nie do przywołania',
	'Summoned minion': 'Przywoływany sługa',
	'Summonable and convinceable': 'Można go przywołać i przekonać',
	'Harmless critter': 'Nieszkodliwe stworzonko',
	'Not hostile, pushable, no loot': 'Niewrogie, można je przepchnąć, bez łupu',
	'This is the only question with no drawn answer — it picks which monsters everything else is drawn from.':
		'To jedyne pytanie bez wylosowanej odpowiedzi — decyduje, z których potworów losowana jest cała reszta.',
	monster: 'potwór',

	'Is it similar to anything else?': 'Czy jest podobny do czegoś innego?',
	'Optional. Name a few and the immunities, the melee, the drops and the power level all come off them; name none and the wizard draws from every {{kind}} in the corpus.':
		'Opcjonalne. Wskaż kilka, a odporności, walka wręcz, łupy i poziom mocy zostaną wzięte z nich; nie wskazuj żadnego, a kreator losuje spośród wszystkich potworów rodzaju „{{kind}}” w korpusie.',
	'Everything from here is drawn from these {{count}}._one': 'Wszystko od tego miejsca bierze się z tego jednego.',
	'Everything from here is drawn from these {{count}}._few': 'Wszystko od tego miejsca bierze się z tych {{count}}.',
	'Everything from here is drawn from these {{count}}._many':
		'Wszystko od tego miejsca bierze się z tych {{count}}.',
	'Search the corpus…': 'Szukaj w korpusie…',
	'{{n}} of {{max}}': '{{n}} z {{max}}',
	'Nothing in this corpus matches.': 'Nic w tym korpusie nie pasuje.',
	'{{name}} — {{exp}} exp': '{{name}} — {{exp}} exp',

	'What does it look like?': 'Jak wygląda?',
	'Draw another': 'Wylosuj inny',
	'Pick an outfit…': 'Wybierz wygląd…',
	'Pick a corpse…': 'Wybierz zwłoki…',
	'No client is open, so there is nothing to draw — the outfit is an id, and the server will resolve it.':
		'Żaden klient nie jest otwarty, więc nie ma z czego losować — wygląd to id, a serwer sam je rozwiąże.',
	'The outfit is one no monster in this corpus wears. The corpse is a donor’s, so the item database can resolve it.':
		'Tego wyglądu nie nosi żaden potwór w korpusie. Zwłoki pochodzą od dawcy, więc baza przedmiotów potrafi je rozwiązać.',

	'What is it called?': 'Jak się nazywa?',
	Classic: 'Klasyczne',
	'Corpus style': 'W stylu korpusu',
	'Drawn from the generator’s own word tables.': 'Losowane z własnych tablic słów generatora.',
	'Built from the names this corpus already uses.': 'Zbudowane z nazw, których korpus już używa.',
	'Hide file and group': 'Ukryj plik i grupę',
	'File and group': 'Plik i grupa',

	'How much is a kill worth?': 'Ile warte jest zabicie go?',
	'This corpus has no experience bands to draw from — type the figures yourself.':
		'Ten korpus nie ma przedziałów doświadczenia do losowania — wpisz liczby samodzielnie.',
	'{{count}} monsters — too few to draw a norm from_one': '{{count}} potwór — za mało, by wyznaczyć normę',
	'{{count}} monsters — too few to draw a norm from_few': '{{count}} potwory — za mało, by wyznaczyć normę',
	'{{count}} monsters — too few to draw a norm from_many': '{{count}} potworów — za mało, by wyznaczyć normę',
	'Read off the band at its {{p}}th percentile.': 'Odczytane z przedziału na {{p}}. percentylu.',
	'Draw again': 'Losuj ponownie',

	'How does it attack?': 'Jak atakuje?',
	'What attacks can it use?': 'Jakich ataków może używać?',
	'Does it summon help?': 'Czy przyzywa pomoc?',
	'How many does it summon?': 'Ile ich przyzywa?',
	'Nothing picked — it summons nothing, and the next question is skipped.':
		'Nic nie wybrano — nikogo nie przyzywa, a następne pytanie zostanie pominięte.',
	'Next: how many of each, how often, and with what effect.':
		'Dalej: ile każdego, jak często i z jakim efektem.',
	'On caster': 'Na przyzywającym',
	'Played on the summoner as it calls, rather than on what it called.':
		'Odtwarzany na przyzywającym w chwili wezwania, a nie na przyzwanym.',
	Effect: 'Efekt',
	'Pick effect': 'Wybierz efekt',
	'Pick the monsters it calls for above.': 'Wybierz powyżej potwory, które przyzywa.',
	'Fights in melee': 'Walczy wręcz',
	'Derived: ceil(skill × attack × 0.05 + attack × 0.5). The loader computes it, so there is no field for it.':
		'Wyliczane: ceil(umiejętność × atak × 0,05 + atak × 0,5). Liczy to loader, więc nie ma na to pola.',
	'max {{damage}}': 'maks. {{damage}}',
	'from {{name}}': 'od {{name}}',
	'A melee block is copied off a donor rather than composed, and nothing in this band has one to lend.':
		'Blok walki wręcz jest kopiowany od dawcy, a nie układany, i nic w tym przedziale nie ma go do pożyczenia.',
	'no melee available': 'brak dostępnej walki wręcz',
	Abilities: 'Zdolności',
	'A monster with only melee is a monster — this step is happy with none.':
		'Potwór z samą walką wręcz to nadal potwór — ten krok obejdzie się bez żadnej.',
	'No abilities yet.': 'Jeszcze żadnych zdolności.',
	script: 'skrypt',
	'Remove this ability': 'Usuń tę zdolność',
	'Add an ability': 'Dodaj zdolność',
	'Nothing in this engine’s catalogue names client effect {{id}}.':
		'Nic w katalogu tego silnika nie nazywa efektu klienta {{id}}.',

	'What does it drop, and how often?': 'Co zostawia i jak często?',
	'Nothing drops yet. Pick the items in the browser, then set the odds here.':
		'Na razie nic nie wypada. Wybierz przedmioty w przeglądarce, a szanse ustaw tutaj.',
	'Pick items…': 'Wybierz przedmioty…',
	'How many items a draw proposes': 'Ile przedmiotów proponuje jedno losowanie',
	items: 'przedmiotów',
	'Replaces the table with a fresh draw off the donors': 'Zastępuje tabelę nowym losowaniem od dawców',
	'What does it drop?': 'Co zostawia?',
	'Critters drop nothing. Add loot in the editor if this one should.':
		'Stworzonka nic nie zostawiają. Dodaj łup w edytorze, jeśli to ma go mieć.',
	'No item database is open, so there is no way to tell a real item id from an invented one. Add loot in the editor.':
		'Żadna baza przedmiotów nie jest otwarta, więc nie da się odróżnić prawdziwego id przedmiotu od zmyślonego. Dodaj łup w edytorze.',

	// The review rail. These four are the tail of a figure — "300 hp · 200
	// szybkości" — so they are in the genitive the number governs, not the
	// dictionary form.
	'(unnamed)': '(bez nazwy)',
	speed: 'szybkości',
	armor: 'pancerza',
	defense: 'obrony',
	exp: 'exp',
	'Drawn from': 'Wylosowane z',
	stats: 'statystyki',
	'similar to': 'podobne do',
	donors: 'dawcy',
	look: 'wygląd',
	'unused outfit {{id}}': 'nieużywany wygląd {{id}}',
	'No lint findings': 'Brak uwag',

	// The lead donor, the inference and the two steps that came out of them.
	'Nothing named, so nothing is drawn from a family — the wizard falls back to the whole {{kind}} pool.':
		'Nic nie wskazano, więc nic nie pochodzi z rodziny — kreator wraca do całej puli rodzaju „{{kind}}”.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._one':
		'Wszystko pochodzi od: {{lead}}.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._few':
		'Przedział, odporności, walka wręcz i łupy pochodzą od wszystkich {{count}}; wygląd, zwłoki i rasa od: {{lead}}.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._many':
		'Przedział, odporności, walka wręcz i łupy pochodzą od wszystkich {{count}}; wygląd, zwłoki i rasa od: {{lead}}.',
	'Most like this one': 'Najbardziej podobny do tego',
	'Make this the one it is most like': 'Ustaw jako najbardziej podobnego',
	'The monsters you named have changed since you edited {{what}}.':
		'Wskazane potwory zmieniły się od czasu, gdy edytowałeś {{what}}.',
	'Use theirs': 'Weź od nich',
	'Keep mine': 'Zostaw moje',
	'the outfit': 'wygląd',
	'the corpse': 'zwłoki',
	'the melee': 'walkę wręcz',
	'the resistances': 'odporności',
	'the voices': 'głosy',
	'the summons': 'przywołania',

	'Draw another colouring': 'Wylosuj inne kolory',
	'{{name}}’s, recoloured': 'jak {{name}}, przefarbowany',
	'{{name}}’s': 'jak {{name}}',
	'drawn, recoloured': 'wylosowany, przefarbowany',
	'The outfit, the corpse and the race all come off {{lead}}, because a body from one monster over another’s corpse is a pair this corpus never writes.':
		'Wygląd, zwłoki i rasa pochodzą od: {{lead}} — ciało jednego potwora nad zwłokami innego to para, której ten korpus nigdy nie zapisuje.',
	'Nothing named to copy from, so the outfit is one no monster in this corpus wears.':
		'Nie wskazano nikogo do skopiowania, więc wygląd jest taki, jakiego nie nosi żaden potwór w korpusie.',

	'No attacks yet.': 'Jeszcze żadnych ataków.',
	'Remove this attack': 'Usuń ten atak',
	'Add an attack': 'Dodaj atak',
	'Calls for help': 'Wzywa pomoc',
	'Nothing in this corpus summons anything — name one yourself below.':
		'Nic w tym korpusie niczego nie przywołuje — wpisz coś sam poniżej.',
	'Summons other monsters': 'Przywołuje inne potwory',
	'{{count}} monster summons it_one': 'przywołuje go {{count}} potwór',
	'{{count}} monster summons it_few': 'przywołują go {{count}} potwory',
	'{{count}} monster summons it_many': 'przywołuje go {{count}} potworów',
	'Monster name': 'Nazwa potwora',
	'No monster with this name is registered — the server summons nothing and says nothing.':
		'Żaden potwór o tej nazwie nie jest zarejestrowany — serwer nic nie przywoła i nic nie powie.',
	'at once': 'naraz',
	'How many of this one may be alive at once': 'Ile sztuk tego może żyć jednocześnie',
	'Chance the summon fires on each attempt': 'Szansa, że przywołanie zadziała przy każdej próbie',
	'How often it tries, in milliseconds': 'Jak często próbuje, w milisekundach',
	yours: 'od ciebie',
	'Total across all entries — zero means it never summons, whatever the rows say.':
		'Łącznie ze wszystkich wpisów — zero oznacza, że nigdy nie przywołuje, cokolwiek mówią wiersze.',
	'Add a summon': 'Dodaj przywołanie',

	'How tough is it to hurt?': 'Jak trudno go zranić?',
	'How does it protect itself?': 'Jak się chroni?',
	'Name a monster or two on the second step and this fills itself in.':
		'Wskaż potwora lub dwóch w drugim kroku, a to wypełni się samo.',
	'100 resists everything — an immunity. Negative takes extra damage.':
		'100 odbija wszystko — to odporność. Wartość ujemna oznacza dodatkowe obrażenia.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._one':
		'To, przed czym broni się {{count}} wskazany potwór. 100 to odporność, wartość ujemna to słabość.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._few':
		'Środek tego, przed czym bronią się {{count}} wskazane potwory. 100 to odporność, wartość ujemna to słabość.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._many':
		'Środek tego, przed czym broni się {{count}} wskazanych potworów. 100 to odporność, wartość ujemna to słabość.',
	'Read them again': 'Odczytaj ponownie',
	'Healing, haste, invisibility — what it does to stay alive. None is a valid answer.':
		'Leczenie, przyspieszenie, niewidzialność — to, czym utrzymuje się przy życiu. Brak jest poprawną odpowiedzią.',
	'No defenses yet.': 'Jeszcze żadnych obron.',
	'Remove this defense': 'Usuń tę obronę',
	'Add a defense': 'Dodaj obronę',

	'Does it have anything to say?': 'Czy ma coś do powiedzenia?',
	'None of the monsters you named says anything — write a line yourself below.':
		'Żaden ze wskazanych potworów nic nie mówi — napisz kwestię sam poniżej.',
	'It speaks': 'Mówi',
	'{{count}} of them say it_one': 'mówi to {{count}} z nich',
	'{{count}} of them say it_few': 'mówią to {{count}} z nich',
	'{{count}} of them say it_many': 'mówi to {{count}} z nich',
	'Add a line': 'Dodaj kwestię',
	'Nothing drawn to start from — anything you write here is the whole pool.':
		'Nic nie wylosowano na start — to, co tu napiszesz, jest całą pulą.',
	'Lines two of them share arrive ticked. Anything naming its own speaker is left out.':
		'Kwestie wspólne dla dwóch z nich są od razu zaznaczone. Wszystko, co wymienia własnego mówcę, jest pomijane.',
	'This engine reads no interval or chance on voices, so there is nothing to set.':
		'Ten silnik nie odczytuje interwału ani szansy przy głosach, więc nie ma czego ustawiać.',

	'Drops like nothing in particular.': 'Nie wypada jak nic konkretnego.',
	'Drops like {{names}}': 'Wypada jak u: {{names}}',
	'Drops like something else…': 'Wypada jak coś innego…',
	'Same as before': 'Tak jak wcześniej',
	'How many items a draw proposes — as many as the monsters above drop':
		'Ile przedmiotów proponuje jedno losowanie — tyle, ile zostawiają potwory powyżej',

	'look, corpse, race': 'wygląd, zwłoki, rasa',
	'resistances, melee': 'odporności, walka wręcz',
	drops: 'łupy',

	Back: 'Wstecz',
	'Create blank': 'Utwórz pusty',
	Next: 'Dalej',
	'Creating…': 'Tworzenie…',
	'Create monster': 'Utwórz potwora',
	'Draw everything again': 'Wylosuj wszystko ponownie',
	'Only {{filter}} — click to exclude instead': 'Tylko {{filter}} — kliknij, aby zamiast tego wykluczyć',
	'Excluding {{filter}} — click to clear': 'Wykluczanie {{filter}} — kliknij, aby wyczyścić',
	'Only {{filter}}; click twice to exclude it': 'Tylko {{filter}}; kliknij dwa razy, aby wykluczyć',
	Boss: 'Boss',
	Summonable: 'Przywoływalny',
	'Has loot': 'Ma łup',
	Unregistered: 'Niezarejestrowany',
	'Has lints': 'Ma uwagi',
	'Has errors': 'Ma błędy',
	'Missing raceid': 'Brak raceid',
	Kind: 'Rodzaj',
	Status: 'Stan',
	Race: 'Rasa',
	Species: 'Gatunek',

	// --- Lint drawer ----------------------------------------------------------
	Errors: 'Błędy',
	Warnings: 'Ostrzeżenia',
	Silent: 'Ciche',
	errors: 'błędy',
	warnings: 'ostrzeżenia',
	'silent findings': 'ciche znaleziska',
	'Show errors': 'Pokaż błędy',
	'Show warnings': 'Pokaż ostrzeżenia',
	'Show silent findings': 'Pokaż ciche znaleziska',
	'Review every automatic fix for this monster': 'Przejrzyj każdą automatyczną poprawkę dla tego potwora',
	'Review every automatic fix across the corpus before it is written':
		'Przejrzyj każdą automatyczną poprawkę w całym korpusie, zanim zostanie zapisana',
	'Close lints': 'Zamknij uwagi',
	'No problems found.': 'Nie znaleziono problemów.',
	'Nothing matches the current filter.': 'Nic nie pasuje do bieżącego filtra.',
	'Jump to {{path}}': 'Przejdź do {{path}}',
	'Apply the fix': 'Zastosuj poprawkę',
	Fix: 'Napraw',
	'Ignore {{code}} everywhere': 'Ignoruj {{code}} wszędzie',
	'Copy code': 'Kopiuj kod',
	'Hide lints': 'Ukryj uwagi',
	'Show lints': 'Pokaż uwagi',
	'No lints': 'Brak uwag',
	'{{code}} needs a manual fix': '{{code}} wymaga ręcznej poprawki',
	'{{file}} has unsaved changes — save it first': '{{file}} ma niezapisane zmiany — najpierw go zapisz',
	'Fixed {{code}} in {{file}}': 'Naprawiono {{code}} w {{file}}',
	'Ignoring {{code}} — restore it from the Linter menu':
		'Ignorowanie {{code}} — przywrócisz je z menu Linter',
	'Nothing here has an automatic fix': 'Nic tutaj nie ma automatycznej poprawki',

	// --- Podgląd poprawek ----------------------------------------------------
	'Review fixes': 'Przejrzyj poprawki',
	'Show the diff': 'Pokaż różnice',
	'Hide the diff': 'Ukryj różnice',
	'Rendering…': 'Renderowanie…',
	'No change to the file.': 'Brak zmian w pliku.',
	'Fixing…': 'Naprawianie…',
	manual: 'ręcznie',
	'{{count}} fix_one': '{{count}} poprawka',
	'{{count}} fix_few': '{{count}} poprawki',
	'{{count}} fix_many': '{{count}} poprawek',
	'Apply {{count}} fix_one': 'Zastosuj {{count}} poprawkę',
	'Apply {{count}} fix_few': 'Zastosuj {{count}} poprawki',
	'Apply {{count}} fix_many': 'Zastosuj {{count}} poprawek',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._one':
		'{{count}} poprawka w {{files}} — rozwiń plik, aby zobaczyć dokładnie, co się zmienia.',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._few':
		'{{count}} poprawki w {{files}} — rozwiń plik, aby zobaczyć dokładnie, co się zmienia.',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._many':
		'{{count}} poprawek w {{files}} — rozwiń plik, aby zobaczyć dokładnie, co się zmienia.',
	'{{count}} needs a manual fix and is left alone._one':
		'{{count}} wymaga ręcznej poprawki i pozostaje nietknięta.',
	'{{count}} needs a manual fix and is left alone._few':
		'{{count}} wymagają ręcznej poprawki i pozostają nietknięte.',
	'{{count}} needs a manual fix and is left alone._many':
		'{{count}} wymaga ręcznej poprawki i pozostaje nietkniętych.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._one':
		'{{count}} plik ma niezapisane zmiany i został pominięty — najpierw go zapisz. Pierwszy: {{list}}.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._few':
		'{{count}} pliki mają niezapisane zmiany i zostały pominięte — najpierw je zapisz. Pierwsze: {{list}}.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._many':
		'{{count}} plików ma niezapisane zmiany i zostało pominiętych — najpierw je zapisz. Pierwsze: {{list}}.',
	'{{count}} unchanged line_one': '{{count}} niezmieniony wiersz',
	'{{count}} unchanged line_few': '{{count}} niezmienione wiersze',
	'{{count}} unchanged line_many': '{{count}} niezmienionych wierszy',
	'Could not store the cut-off point': 'Nie udało się zapisać punktu odcięcia',

	// --- Browsers -------------------------------------------------------------
	'Search id (e.g. 2400 or 100-250) or name': 'Szukaj id (np. 2400 lub 100-250) albo nazwy',
	'Search server id or name': 'Szukaj id serwera lub nazwy',
	'Search client id or name': 'Szukaj id klienta lub nazwy',
	'Filter the grid': 'Filtruj siatkę',
	Filter: 'Filtr',
	'Clear filter search': 'Wyczyść wyszukiwanie filtrów',
	Animate: 'Animuj',
	'Zoom out': 'Pomniejsz',
	'Zoom in': 'Powiększ',
	Favourite: 'Ulubiony',
	'No {{what}}.': 'Brak: {{what}}.',
	'nothing to display': 'nic do wyświetlenia',

	// --- Item filters ---------------------------------------------------------
	Special: 'Specjalne',
	Weapons: 'Broń',
	Slot: 'Slot',
	Properties: 'Właściwości',
	Size: 'Rozmiar',
	Features: 'Cechy',
	Favourites: 'Ulubione',
	Pickupable: 'Podnoszalne',
	'Show corpses': 'Pokaż zwłoki',
	'Show corpses with decay': 'Pokaż zwłoki z rozkładem',
	'Not dropped by any monster': 'Nie wypada z żadnego potwora',
	Stackable: 'Stakowalne',
	Container: 'Pojemnik',
	'Weapon (any)': 'Broń (dowolna)',
	Shield: 'Tarcza',
	Ammunition: 'Amunicja',
	Rune: 'Runa',
	'Fluid container': 'Pojemnik na płyn',
	Sword: 'Miecz',
	Club: 'Maczuga',
	Axe: 'Topór',
	Distance: 'Dystansowa',
	Wand: 'Różdżka',
	Helmet: 'Hełm',
	'Armor (body)': 'Zbroja (korpus)',
	Legs: 'Nogawice',
	Boots: 'Buty',
	Ring: 'Pierścień',
	Necklace: 'Naszyjnik',
	Trinket: 'Bibelot',
	'Backpack slot': 'Slot plecaka',
	'Two-handed': 'Dwuręczne',
	'Has attack': 'Ma atak',
	'Has defense': 'Ma obronę',
	'Has armor': 'Ma pancerz',
	'Speed bonus': 'Premia do szybkości',
	'Has charges': 'Ma ładunki',
	Decays: 'Rozkłada się',
	Writable: 'Zapisywalne',
	'Blocks projectiles': 'Blokuje pociski',
	'Field (fire/energy/…)': 'Pole (ogień/energia/…)',
	'Has worth': 'Ma wartość',
	'Has description': 'Ma opis',
	'Ambiguous name': 'Niejednoznaczna nazwa',
	Animated: 'Animowane',
	'32×32': '32×32',
	'64×64': '64×64',
	'64×32 / 32×64': '64×32 / 32×64',
	Directional: 'Kierunkowe',
	'Single direction': 'Jeden kierunek',
	'Has addons': 'Ma dodatki',
	'Has mount variant': 'Ma wariant wierzchowca',
	Colourable: 'Kolorowalne',

	// --- Item tooltips and context menus ---------------------------------------
	'{{weight}} oz': '{{weight}} oz',
	'worth {{worth}} gp': 'wartość {{worth}} gp',
	'decays in {{seconds}}s': 'rozkłada się w {{seconds}}s',
	'Used by…': 'Używany przez…',
	'Used by — {{item}}': 'Używany przez — {{item}}',
	'Scanning the corpus…': 'Skanowanie korpusu…',
	'No monster references this item.': 'Żaden potwór nie odwołuje się do tego przedmiotu.',
	'Dropped as loot': 'Wypada jako łup',
	'Corpse of': 'Zwłoki',
	'Worn as typeex': 'Noszony jako typeex',
	'Scale drop chance…': 'Przeskaluj szansę wypadnięcia…',
	'Save the open monster first': 'Najpierw zapisz otwartego potwora',
	'Copy id {{id}}': 'Kopiuj id {{id}}',
	'Copy name': 'Kopiuj nazwę',
	'Copied {{value}}': 'Skopiowano {{value}}',
	'Copied “{{value}}”': 'Skopiowano „{{value}}”',
	'Set as corpse for {{monster}}': 'Ustaw jako zwłoki dla {{monster}}',
	'Set as outfit (typeex) for {{monster}}': 'Ustaw jako wygląd (typeex) dla {{monster}}',
	'Set as outfit for {{monster}}': 'Ustaw jako wygląd dla {{monster}}',
	'Outfit of {{monster}} set to {{outfit}}': 'Wygląd {{monster}} ustawiono na {{outfit}}',
	'Outfit (typeex) of {{monster}} set to {{item}}': 'Wygląd (typeex) {{monster}} ustawiono na {{item}}',
	'Corpse of {{monster}} set to {{item}}': 'Zwłoki {{monster}} ustawiono na {{item}}',
	'Set {{thing}} as the effect for…': 'Ustaw {{thing}} jako efekt dla…',
	'Set {{thing}} as the missile for…': 'Ustaw {{thing}} jako pocisk dla…',
	'This effect has no XML name — it cannot be used from a monster file.':
		'Ten efekt nie ma nazwy XML — nie da się go użyć z pliku potwora.',
	'This missile has no XML name — it cannot be used from a monster file.':
		'Ten pocisk nie ma nazwy XML — nie da się go użyć z pliku potwora.',
	'No monster open.': 'Żaden potwór nie jest otwarty.',
	'{{monster}} has no spells that take effects.': '{{monster}} nie ma zaklęć przyjmujących efekty.',
	'Effect of {{spell}} set to {{effect}}': 'Efekt {{spell}} ustawiono na {{effect}}',
	'Missile of {{spell}} set to {{effect}}': 'Pocisk {{spell}} ustawiono na {{effect}}',
	'{{spell}} (attack)': '{{spell}} (atak)',
	'{{spell}} (defense)': '{{spell}} (obrona)',
	unnamed: 'bez nazwy',
	spell: 'zaklęcie',

	// --- Loot tray ------------------------------------------------------------
	'Right-click selected items above to add them here.':
		'Kliknij prawym przyciskiem zaznaczone przedmioty powyżej, aby dodać je tutaj.',
	'Add loot': 'Dodaj łup',
	'Add loot to {{monster}}': 'Dodaj łup do {{monster}}',
	'Clear the Loot section': 'Wyczyść sekcję Łup',
	Clear: 'Wyczyść',
	'Clear loot': 'Wyczyść łup',
	'Save this tray under a name': 'Zapisz tę tacę pod nazwą',
	'Save preset': 'Zapisz zestaw',
	'No presets saved yet': 'Nie zapisano jeszcze żadnych zestawów',
	'Load a preset into the tray': 'Wczytaj zestaw na tacę',
	'No presets': 'Brak zestawów',
	'Delete a preset': 'Usuń zestaw',
	'Save loot preset': 'Zapisz zestaw łupu',
	'An existing name is overwritten.': 'Istniejąca nazwa zostanie nadpisana.',
	'Loot presets': 'Zestawy łupu',
	'Load into the tray': 'Wczytaj na tacę',
	Load: 'Wczytaj',
	'Delete “{{name}}”': 'Usuń „{{name}}”',
	'No presets left.': 'Nie ma już zestawów.',
	Done: 'Gotowe',
	'Saved “{{name}}” — {{items}}': 'Zapisano „{{name}}” — {{items}}',

	// --- Preferences ----------------------------------------------------------
	'Applies immediately. Only the interface is translated — monster data, item names and engine values are left exactly as the server writes them.':
		'Działa natychmiast. Tłumaczony jest tylko interfejs — dane potworów, nazwy przedmiotów i wartości silnika zostają dokładnie takie, jak zapisuje je serwer.',
	'Open a monster on': 'Otwórz potwora na',
	'Jumped to without animation, every time a monster is opened or a tab is activated.':
		'Przeskok bez animacji, za każdym razem gdy potwór zostaje otwarty lub karta aktywowana.',
	Tabs: 'Karty',
	'A hidden tab keeps its data — the file is written whole either way. {{tab}} is hidden by default.':
		'Ukryta karta zachowuje swoje dane — plik i tak zapisywany jest w całości. {{tab}} jest domyślnie ukryta.',
	'Restore defaults': 'Przywróć domyślne',

	// --- Hotkeys --------------------------------------------------------------
	Hotkeys: 'Skróty klawiszowe',
	'Click a slot, then press the keys. {{cancel}} cancels, {{clear}} clears. Every command takes a primary and a secondary binding.':
		'Kliknij pole, a potem naciśnij klawisze. {{cancel}} anuluje, {{clear}} czyści. Każde polecenie ma przypisanie główne i dodatkowe.',
	'Taken from “{{command}}”.': 'Zabrane z „{{command}}”.',
	'Search commands': 'Szukaj poleceń',
	Primary: 'Główne',
	Secondary: 'Dodatkowe',
	'Set the primary hotkey': 'Ustaw główny skrót',
	'Set the secondary hotkey': 'Ustaw dodatkowy skrót',
	'Press a key — Esc cancels, Backspace clears':
		'Naciśnij klawisz — Esc anuluje, Backspace czyści',
	'Press a key…': 'Naciśnij klawisz…',
	'Back to the default binding': 'Powrót do domyślnego przypisania',
	'No command matches.': 'Żadne polecenie nie pasuje.',
	'Reset all': 'Zresetuj wszystko',

	// --- Quick open -----------------------------------------------------------
	'No monster matches.': 'Żaden potwór nie pasuje.',
	move: 'przejdź',
	open: 'otwórz',
	close: 'zamknij',

	// --- Compare --------------------------------------------------------------
	'Compare monsters': 'Porównaj potwory',
	'Swap sides': 'Zamień strony',
	'Reading both monsters…': 'Wczytywanie obu potworów…',
	'These two agree on every field MONx models.':
		'Te dwa zgadzają się w każdym polu, które MONx modeluje.',
	'Differences only': 'Tylko różnice',
	'Nothing differs.': 'Nic się nie różni.',
	yes: 'tak',
	no: 'nie',
	Identity: 'Tożsamość',
	Combat: 'Walka',
	Flags: 'Flagi',
	Immunities: 'Odporności',
	Elements: 'Żywioły',
	Attacks: 'Ataki',
	Defenses: 'Obrona',
	Loot: 'Łup',
	Summons: 'Przywołania',
	Voices: 'Głosy',
	Blood: 'Krew',
	'Race id': 'Race id',
	'Race id (raceId)': 'Race id (raceId)',
	Registered: 'Zarejestrowany',
	'Max summons': 'Maks. przywołań',
	'Pacifist line': 'Kwestia pacyfisty',
	'Leash line': 'Kwestia smyczy',
	Lines: 'Kwestie',

	// --- Sections -------------------------------------------------------------
	Look: 'Wygląd',
	Bestiary: 'Bestiariusz',
	'Target strategy': 'Strategia celu',
	Resistances: 'Odporności żywiołów',
	'Pacifist & Events': 'Pacyfista i zdarzenia',
	attacks: 'ataków',
	defenses: 'obron',
	resistances: 'odporności',
	loot: 'wpisów łupu',
	summons: 'przywołań',
	voices: 'kwestii',
	'Copy this monster’s {{block}}': 'Kopiuj {{block}} tego potwora',
	'No {{block}} copied': 'Nie skopiowano: {{block}}',
	'That {{block}} block could not be read': 'Nie udało się odczytać bloku: {{block}}',

	// --- Identity -------------------------------------------------------------
	Description: 'Opis',
	'defaults to “a {{name}}”': 'domyślnie „a {{name}}”',
	'Shown when a player looks at the monster. Include the article yourself.':
		'Pokazywane, gdy gracz patrzy na potwora. Rodzajnik dopisz samodzielnie.',
	'Editor metadata only — the server never reads it. Used here for grouping.':
		'Wyłącznie metadane edytora — serwer ich nie czyta. Używane tutaj do grupowania.',
	Experience: 'Doświadczenie',
	'raw XP, before rateExp · {{souls}}': 'surowe XP, przed rateExp · {{souls}}',
	Speed: 'Szybkość',
	immobile: 'nieruchomy',
	'Mana cost': 'Koszt many',
	'Summonable or convinceable with no mana cost — the loader warns about this.':
		'Przywoływalny lub przekonywalny bez kosztu many — loader o tym ostrzega.',
	'Mana to summon or convince this monster.': 'Mana potrzebna do przywołania lub przekonania tego potwora.',
	'next free: {{id}}': 'następne wolne: {{id}}',
	'Another monster already uses this raceid.': 'Inny potwór już używa tego raceid.',
	'Use {{id}}': 'Użyj {{id}}',
	'Controls blood splash, corpse decay and undead checks.':
		'Steruje plamą krwi, rozkładem zwłok i sprawdzeniami nieumarłych.',
	Skull: 'Czaszka',
	Script: 'Skrypt',
	'A .lua file in monster/scripts/ providing onThink, onCreatureAppear and friends.':
		'Plik .lua w monster/scripts/ dostarczający onThink, onCreatureAppear i podobne.',

	// --- Look -----------------------------------------------------------------
	'item {{id}}': 'przedmiot {{id}}',
	'type {{id}}': 'typ {{id}}',
	'typeex {{id}}': 'typeex {{id}}',
	'raceid {{id}}': 'raceid {{id}}',
	Mode: 'Tryb',
	'The parser takes type first; the two are mutually exclusive.':
		'Parser bierze najpierw type; oba wykluczają się wzajemnie.',
	'Outfit (type)': 'Wygląd (type)',
	'A client outfit with colours and addons': 'Wygląd klienta z kolorami i dodatkami',
	'Item (typeex)': 'Przedmiot (typeex)',
	'An item used as the body — statues, fires, spinning swords':
		'Przedmiot użyty jako ciało — posągi, ogniska, wirujące miecze',
	Item: 'Przedmiot',
	'Browse the Items grid, then right-click one to set it as the outfit':
		'Przeglądaj siatkę Przedmiotów, potem kliknij prawym, aby ustawić jako wygląd',
	'Select item': 'Wybierz przedmiot',
	Outfit: 'Wygląd',
	'Under {{attr}} the engine ignores head, body, legs, feet and addons entirely. They are kept in the file but have no effect.':
		'Przy {{attr}} silnik całkowicie ignoruje głowę, korpus, nogi, stopy i dodatki. Zostają w pliku, ale nie mają efektu.',
	Colours: 'Kolory',
	Head: 'Głowa',
	Body: 'Korpus',
	Feet: 'Stopy',
	'{{part}} colour {{value}}': '{{part}} — kolor {{value}}',
	Addons: 'Dodatki',
	First: 'Pierwszy',
	Second: 'Drugi',
	Mount: 'Wierzchowiec',
	'Read in both modes.': 'Czytane w obu trybach.',
	Corpse: 'Zwłoki',
	'Corpse item': 'Przedmiot zwłok',
	'no corpse': 'brak zwłok',
	'Browse the Items grid filtered to corpses, then right-click one to set it':
		'Przeglądaj siatkę Przedmiotów odfiltrowaną do zwłok, potem kliknij prawym, aby ustawić',
	'Select corpse': 'Wybierz zwłoki',
	'No corpse': 'Brak zwłok',
	'Corpse action id': 'Action id zwłok',
	'Ironcore — stamped on the corpse so quest scripts can hook it. Only applied when non-zero.':
		'Ironcore — odciśnięte na zwłokach, aby skrypty zadań mogły się podpiąć. Stosowane tylko przy wartości niezerowej.',
	Health: 'Zdrowie',
	'Max health': 'Maks. zdrowie',
	'Lock now to max': 'Zrównaj now z maks.',
	'Allow a damaged-on-spawn monster': 'Pozwól na potwora rannego przy pojawieniu',
	'damaged on spawn': 'ranny przy pojawieniu',
	locked: 'zablokowane',
	'Health on spawn': 'Zdrowie przy pojawieniu',
	'Above max — the loader clamps it down and warns. Shown as written.':
		'Powyżej maksimum — loader obcina wartość i ostrzega. Pokazane tak, jak zapisano.',

	// --- Combat ---------------------------------------------------------------
	'armor {{armor}} · defense {{defense}}': 'pancerz {{armor}} · obrona {{defense}}',
	Behaviour: 'Zachowanie',
	'Pushing and movement': 'Popychanie i ruch',
	Terrain: 'Teren',
	'Pacifist (Ironcore)': 'Pacyfista (Ironcore)',
	'{{note}} (Ironcore)': '{{note}} (Ironcore)',
	'“Pushes creatures” forces “pushable by players” off at load — the value written here will not survive.':
		'„Popycha stworzenia” wymusza wyłączenie „popychalny przez graczy” przy wczytaniu — zapisana tu wartość nie przetrwa.',
	'Target change': 'Zmiana celu',
	Interval: 'Interwał',
	ms: 'ms',
	'Milliseconds between target-reselection rolls.': 'Milisekundy między rzutami na ponowny wybór celu.',
	Chance: 'Szansa',
	'Zero disables retargeting entirely, and also the step-aside behaviour in onWalk.':
		'Zero całkowicie wyłącza zmianę celu, a także odsuwanie się w onWalk.',
	Melee: 'Walka wręcz',
	'On this engine melee lives on <attacks>, not in a spell block. Both skill and attack are needed.':
		'W tym silniku walka wręcz mieszka w <attacks>, nie w bloku zaklęcia. Potrzebne są zarówno skill, jak i attack.',
	Skill: 'Umiejętność',
	Attack: 'Atak',
	'Max damage': 'Maks. obrażenia',
	derived: 'wyliczone',
	Poison: 'Trucizna',
	'optional, on hit': 'opcjonalne, przy trafieniu',
	'Defense stats': 'Statystyki obrony',
	'Armor reduces melee and physical hits; defense is only consulted on hits that check it, i.e. melee.':
		'Pancerz redukuje trafienia wręcz i fizyczne; obrona liczy się tylko przy trafieniach, które ją sprawdzają, czyli wręcz.',
	Armor: 'Pancerz',
	Defense: 'Obrona',
	'Show pacifist system (Ironcore)': 'Pokaż system pacyfisty (Ironcore)',
	'Hide pacifist system (Ironcore)': 'Ukryj system pacyfisty (Ironcore)',
	'A dormant monster that only fights back once struck. The sub-flags do nothing without Pacifist.':
		'Uśpiony potwór, który walczy dopiero po uderzeniu. Podflagi nic nie robią bez Pacyfisty.',
	'Pacifist forces {{flag}} to 0 during load — writing both as 1 will not survive.':
		'Pacyfista wymusza {{flag}} na 0 przy wczytaniu — zapisanie obu jako 1 nie przetrwa.',

	// --- Resistances ----------------------------------------------------------
	Normal: 'Normalny',
	Immune: 'Odporny',
	Percent: 'Procent',
	'Bundles the matching condition immunity too': 'Dołącza też pasującą odporność na warunek',
	'takes 0 — and the matching condition too': 'przyjmuje 0 — i pasujący warunek też',
	'Condition immunities': 'Odporności na warunki',
	'These have no element equivalent — the only way to grant them is here.':
		'Nie mają odpowiednika żywiołowego — jedyny sposób ich nadania jest tutaj.',
	'Apply the usual set': 'Zastosuj zwykły zestaw',
	'Can see invisible creatures': 'Widzi niewidzialne stworzenia',
	'Positive resists, negative takes extra. Element percent is applied after armour, and magic penetration eats into positive values for energy, fire, earth, ice, holy and death only.':
		'Dodatnie oznacza odporność, ujemne dodatkowe obrażenia. Procent żywiołu stosowany jest po pancerzu, a przebicie magiczne zjada wartości dodatnie tylko dla energii, ognia, ziemi, lodu, świętości i śmierci.',
	Physical: 'Fizyczne',
	Energy: 'Energia',
	Earth: 'Ziemia',
	Fire: 'Ogień',
	Ice: 'Lód',
	Holy: 'Świętość',
	Death: 'Śmierć',
	Drown: 'Utonięcie',
	'Life drain': 'Wysysanie życia',
	'Mana drain': 'Wysysanie many',

	// --- Loot -----------------------------------------------------------------
	'Select for delete / scale': 'Zaznacz do usunięcia / skalowania',
	'Hide details': 'Ukryj szczegóły',
	'Show subtype, action id and text': 'Pokaż subtype, action id i tekst',
	'id {{id}}': 'id {{id}}',
	unresolved: 'nierozwiązane',
	'This name belongs to more than one item, so the server drops the entry. Pin it to a single id.':
		'Ta nazwa należy do więcej niż jednego przedmiotu, więc serwer odrzuca wpis. Przypnij ją do jednego id.',
	'ambiguous — pin id': 'niejednoznaczne — przypnij id',
	'Hard maximum 100 — a larger value makes the server drop the whole entry':
		'Twarde maksimum 100 — większa wartość sprawia, że serwer odrzuca cały wpis',
	Remove: 'Usuń',
	Subtype: 'Podtyp',
	'fluid, charges': 'płyn, ładunki',
	'Action id': 'Action id',
	'Spelled actionId — the lower-case spelling is silently ignored by the server.':
		'Pisane actionId — pisownia małą literą jest po cichu ignorowana przez serwer.',
	Text: 'Tekst',
	Comment: 'Komentarz',
	'Written after the entry as an XML comment. Set to the item name when the entry is added by id.':
		'Zapisywany po wpisie jako komentarz XML. Ustawiany na nazwę przedmiotu, gdy wpis dodano po id.',
	'Drop an item onto this row to nest it inside the container.':
		'Upuść przedmiot na ten wiersz, aby zagnieździć go w pojemniku.',
	'Simulate a hunting session over this loot — runs on the unsaved buffer':
		'Symuluj sesję polowania na tym łupie — działa na niezapisanym buforze',
	'Simulate…': 'Symuluj…',
	'No loot. Drop items here from the Items browser.':
		'Brak łupu. Upuść tutaj przedmioty z przeglądarki Przedmiotów.',
	'Scale chances to': 'Przeskaluj szanse do',
	Apply: 'Zastosuj',
	'Clear selection': 'Wyczyść zaznaczenie',
	'Search items…': 'Szukaj przedmiotów…',
	'Add item': 'Dodaj przedmiot',
	'Rarest last': 'Najrzadsze na końcu',
	'Sort by chance': 'Sortuj po szansie',
	'Chance is out of 100,000 in the file; shown here as a percent.':
		'Szansa jest podana na 100 000 w pliku; tutaj pokazana jako procent.',
	never: 'nigdy',
	always: 'zawsze',
	'1 in {{odds}}': '1 na {{odds}}',
	entry: 'wpis',

	// --- Summons --------------------------------------------------------------
	'Summons never drop loot and never grant experience.':
		'Przywołania nigdy nie zostawiają łupu ani nie dają doświadczenia.',
	'Max live summons': 'Maks. żywych przywołań',
	'Zero means the monster can never summon, whatever the entries below say.':
		'Zero oznacza, że potwór nigdy nie przywoła, cokolwiek mówią wpisy poniżej.',
	'Total across all entries, clamped to 100.': 'Suma wszystkich wpisów, ograniczona do 100.',
	'No summons. Drag a monster here from the list.':
		'Brak przywołań. Przeciągnij tu potwora z listy.',
	'No monster with this name is registered — the server does not check this, so at runtime it silently summons nothing.':
		'Żaden potwór o tej nazwie nie jest zarejestrowany — serwer tego nie sprawdza, więc w czasie działania po cichu nie przywoła nic.',
	Max: 'Maks.',
	'Per-entry cap; inherits the section maximum when absent.':
		'Limit dla wpisu; przy braku dziedziczy maksimum sekcji.',
	'Force placement': 'Wymuś umieszczenie',
	'Ironcore — places the summon even on an occupied or blocked tile':
		'Ironcore — umieszcza przywołanie nawet na zajętym lub zablokowanym polu',
	'Effect at the summon': 'Efekt przy przywołanym',
	'Defaults to a teleport effect.': 'Domyślnie efekt teleportacji.',
	'Effect at the summoner': 'Efekt przy przywołującym',
	'A casting telegraph on the summoner’s own tile.':
		'Zapowiedź rzucania na własnym polu przywołującego.',
	'(default teleport)': '(domyślna teleportacja)',
	'Add summon': 'Dodaj przywołanie',

	// --- Voices ---------------------------------------------------------------
	'{{seconds}} s': '{{seconds}} s',
	'Silent monster — nothing will ever be said.': 'Milczący potwór — nic nigdy nie zostanie powiedziane.',
	'≈ {{rate}} voices per minute — a {{chance}}% roll every {{interval}}.':
		'≈ {{rate}} kwestii na minutę — rzut {{chance}}% co {{interval}}.',
	'No voice lines.': 'Brak kwestii.',
	'What it says': 'Co mówi',
	Yell: 'Krzyk',
	'Heard further away; conventionally written in upper case':
		'Słyszalne z dalszej odległości; zwyczajowo pisane wielkimi literami',
	'Add line': 'Dodaj kwestię',

	// --- Pacifist & events ------------------------------------------------------
	'{{pacifist}} pacifist · {{events}} events': '{{pacifist}} pacyfisty · {{events}} zdarzeń',
	'Pacifist lines (Ironcore)': 'Kwestie pacyfisty (Ironcore)',
	'Said once when it wakes, and when it walks past its leash radius. Neither is part of the random voice pool.':
		'Wypowiadane raz przy przebudzeniu oraz przy wyjściu poza promień smyczy. Żadne nie należy do losowej puli kwestii.',
	'Only spoken by a pacifist monster — turn Pacifist on in Combat, or these never fire.':
		'Wypowiadane tylko przez potwora-pacyfistę — włącz Pacyfistę w sekcji Walka, inaczej nigdy nie zadziałają.',
	'On waking': 'Przy przebudzeniu',
	'Said when first attacked': 'Wypowiadane przy pierwszym ataku',
	'On leashing': 'Przy smyczy',
	'Said when it walks too far': 'Wypowiadane, gdy odejdzie za daleko',
	'Creature events': 'Zdarzenia stworzenia',
	'Registered from creaturescripts — onKill, onDeath, onPrepareDeath and friends. Not the same thing as the monster script in Identity. Names are not checked: what registers them is Lua, which MONx cannot see.':
		'Rejestrowane z creaturescripts — onKill, onDeath, onPrepareDeath i podobne. To nie to samo co skrypt potwora w sekcji Tożsamość. Nazwy nie są sprawdzane: rejestruje je Lua, której MONx nie widzi.',
	'No events registered.': 'Nie zarejestrowano zdarzeń.',
	EventName: 'NazwaZdarzenia',
	'Add event': 'Dodaj zdarzenie',

	// --- Bestiary ---------------------------------------------------------------
	'no class': 'brak klasy',
	'not tracked': 'nieśledzone',
	'This monster has no bestiary entry.': 'Ten potwór nie ma wpisu w bestiariuszu.',
	'Add one': 'Dodaj',
	Class: 'Klasa',
	Difficulty: 'Trudność',
	Occurrence: 'Występowanie',
	Prowess: 'Sprawność',
	Expertise: 'Biegłość',
	Mastery: 'Mistrzostwo',
	'Charm points': 'Punkty charmów',
	Locations: 'Lokacje',

	// --- Target strategy ---------------------------------------------------------
	'weights total 100': 'wagi sumują się do 100',
	'weights total {{total}}': 'wagi sumują się do {{total}}',
	Nearest: 'Najbliższy',
	'closest enemy': 'najbliższy wróg',
	Weakest: 'Najsłabszy',
	'lowest health': 'najniższe zdrowie',
	'Most damage': 'Najwięcej obrażeń',
	'biggest threat so far': 'dotąd największe zagrożenie',
	Random: 'Losowy',
	'anyone in range': 'ktokolwiek w zasięgu',
	'The four weights add up to {{total}}. The server expects exactly 100 and complains on load.':
		'Cztery wagi sumują się do {{total}}. Serwer oczekuje dokładnie 100 i narzeka przy wczytaniu.',

	// --- Spells -----------------------------------------------------------------
	'No attacks — this monster cannot hurt anything.':
		'Brak ataków — ten potwór nie może nikogo zranić.',
	'No defenses.': 'Brak obrony.',
	'Add attack': 'Dodaj atak',
	'Add defense': 'Dodaj obronę',
	Spell: 'Zaklęcie',
	'Watch this spell play out': 'Obejrzyj, jak to zaklęcie przebiega',
	Visualize: 'Wizualizuj',
	'{{spell}} — shadowed': '{{spell}} — przesłonięte',
	'A registered spell named “{{name}}” exists and wins the lookup — this no longer means {{spell}}.':
		'Istnieje zarejestrowane zaklęcie o nazwie „{{name}}” i wygrywa wyszukiwanie — to już nie oznacza {{spell}}.',
	'This name also exists as a built-in; the registered spell wins.':
		'Ta nazwa istnieje też jako wbudowana; zarejestrowane zaklęcie wygrywa.',
	'Identical to {{spell}} — two spellings of one spell.':
		'Identyczne z {{spell}} — dwie pisownie jednego zaklęcia.',
	'Registered spell — the loader takes it from {{file}} and ignores geometry and effects. Only interval, chance, range, min and max still apply.':
		'Zarejestrowane zaklęcie — loader bierze je z {{file}} i ignoruje geometrię oraz efekty. Nadal działają tylko interval, chance, range, min i max.',
	'Scripted spell — {{attr}} is ignored and the Lua file decides the behaviour.':
		'Zaklęcie skryptowe — {{attr}} jest ignorowane, a o zachowaniu decyduje plik Lua.',
	'Ironcore tracks the cooldown per spell, so a long ultimate does not block the other attacks.':
		'Ironcore śledzi odnowienie osobno dla każdego zaklęcia, więc długie ultimate nie blokuje pozostałych ataków.',
	Delay: 'Opóźnienie',
	'Read in place of chance — writing both means this one is ignored.':
		'Czytane zamiast chance — zapisanie obu oznacza, że to zostanie zignorowane.',
	'A non-melee spell without a chance logs a warning.':
		'Zaklęcie inne niż wręcz bez chance zapisuje ostrzeżenie w logu.',
	Range: 'Zasięg',
	tiles: 'pól',
	'Forced to 1 for melee.': 'Wymuszone na 1 dla walki wręcz.',
	'Zero means line of sight only. Clamped to 22.':
		'Zero oznacza tylko linię wzroku. Ograniczone do 22.',
	'Melee damage': 'Obrażenia wręcz',
	'Skill and attack replace min/max: max = ceil(skill × attack × 0.05 + attack × 0.5).':
		'Skill i attack zastępują min/max: max = ceil(skill × attack × 0.05 + attack × 0.5).',
	'Skill factor': 'Współczynnik umiejętności',
	'Per-level multiplier, in thousandths. Clamped up to 1000.':
		'Mnożnik na poziom, w tysięcznych. Ograniczony do 1000.',
	'Next level at': 'Następny poziom przy',
	'Hits needed for the next skill level.': 'Trafienia potrzebne do następnego poziomu umiejętności.',
	'Level step': 'Krok poziomu',
	'Skill gained per level.': 'Umiejętność zyskiwana na poziom.',
	'Poison cycles': 'Cykle trucizny',
	'Adds a poison condition alongside any other.': 'Dodaje warunek zatrucia obok każdego innego.',
	'Condition on hit': 'Warunek przy trafieniu',
	'One condition per melee block — the loader takes the first it finds, in the order fire, poison, energy, drown, freeze, dazzle, curse, bleed.':
		'Jeden warunek na blok walki wręcz — loader bierze pierwszy znaleziony, w kolejności fire, poison, energy, drown, freeze, dazzle, curse, bleed.',
	'Damage per tick': 'Obrażenia na tik',
	'Bleed ignores the value — the loader never reads it, so this produces a zero-damage bleed.':
		'Krwawienie ignoruje tę wartość — loader jej nie czyta, więc powstaje krwawienie bez obrażeń.',
	Tick: 'Tik',
	'Per-tick damage above; this is the interval between ticks.':
		'Obrażenia na tik powyżej; to jest odstęp między tikami.',
	'The loader swaps min and max when |min| > |max|. Write them in canonical order.':
		'Loader zamienia min i max, gdy |min| > |max|. Zapisz je w kolejności kanonicznej.',
	'Larger than the per-tick damage — the engine silently ignores it.':
		'Większe niż obrażenia na tik — silnik po cichu to ignoruje.',
	'Immediate damage on application.': 'Natychmiastowe obrażenia przy nałożeniu.',
	'Fires along the monster’s facing': 'Strzela wzdłuż kierunku zwrócenia potwora',
	'Filled circle': 'Wypełnione koło',
	'Hollow ring': 'Pusty pierścień',
	'Min damage': 'Min. obrażenia',
	'Min healed': 'Min. leczenie',
	'Max healed': 'Maks. leczenie',
	'Damage is negative.': 'Obrażenia są ujemne.',
	'Healing takes positive values.': 'Leczenie przyjmuje wartości dodatnie.',
	Count: 'Liczba',
	'Required — a condition spell without it is rejected and never loads.':
		'Wymagane — zaklęcie warunkowe bez tego jest odrzucane i nigdy się nie wczytuje.',
	'First tick': 'Pierwszy tik',
	Duration: 'Czas trwania',
	'Speed change': 'Zmiana szybkości',
	'Leave blank to use a random min–max range instead.':
		'Zostaw puste, aby zamiast tego użyć losowego zakresu min–max.',
	Min: 'Min',
	'A min of 0 with no speedchange is a hard error — the block fails to load.':
		'Min równe 0 bez speedchange to twardy błąd — blok się nie wczyta.',
	'Defaults to min when absent.': 'Przy braku domyślnie równe min.',
	Variation: 'Wahanie',
	'Spread around the delta above.': 'Rozrzut wokół delty powyżej.',
	'Positive hastes and turns the spell non-aggressive — a self-buff that belongs in Defenses. Negative paralyses, and is clamped at −1000 (−100% speed).':
		'Dodatnia wartość przyspiesza i czyni zaklęcie nieagresywnym — to wzmocnienie własne, które należy do Obrony. Ujemna paraliżuje i jest ograniczona do −1000 (−100% szybkości).',
	'This one is positive but sits in Attacks.': 'To jest dodatnie, a mimo to leży w Atakach.',
	Drunkenness: 'Upojenie',
	'Default 25.': 'Domyślnie 25.',
	'The monster name is resolved at load time — an unknown name silently produces no condition at all.':
		'Nazwa potwora jest rozwiązywana przy wczytaniu — nieznana nazwa po cichu nie tworzy żadnego warunku.',
	'Look like monster': 'Wyglądaj jak potwór',
	'monster name': 'nazwa potwora',
	'…or item id': '…albo id przedmiotu',
	Area: 'Obszar',
	'One shape only — if several are present the last one silently wins.':
		'Tylko jeden kształt — jeśli jest ich kilka, po cichu wygrywa ostatni.',
	Length: 'Długość',
	'A beam forces the spell to fire in the facing direction.':
		'Wiązka wymusza rzucenie zaklęcia w kierunku, w którym potwór jest zwrócony.',
	Spread: 'Rozrzut',
	'0 is a straight beam, 3 the classic wave.': '0 to prosta wiązka, 3 to klasyczna fala.',
	Radius: 'Promień',
	'Centre on the target': 'Wyśrodkuj na celu',
	'Single target': 'Pojedynczy cel',
	Beam: 'Wiązka',
	Projectile: 'Pocisk',
	'Magic effect': 'Efekt magiczny',
	'Draw the projectile to every tile of the area': 'Rysuj pocisk do każdego pola obszaru',
	'Cast in the facing direction': 'Rzucaj w kierunku zwrócenia',

	// --- Spell stage ------------------------------------------------------------
	Pause: 'Pauza',
	Play: 'Odtwórz',
	'Cast now': 'Rzuć teraz',
	'Reset the target': 'Zresetuj cel',
	'Real cooldown': 'Prawdziwe odnowienie',
	'from spells.xml': 'z spells.xml',
	'not used — cast on itself': 'nieużywane — rzucane na siebie',
	'none — nothing travels': 'brak — nic nie leci',
	'none — the hit is invisible': 'brak — trafienie jest niewidzialne',
	none: 'brak',
	'chance failed': 'rzut nieudany',
	'cooldown {{ms}} ms': 'odnowienie {{ms}} ms',
	'cooldown {{ms}} ms (compressed)': 'odnowienie {{ms}} ms (skrócone)',
	projectile: 'pocisk',
	impact: 'trafienie',
	'on itself': 'na siebie',
	'{{rate}}/min': '{{rate}}/min',
	'≈{{amount}} healed/min': '≈{{amount}} leczenia/min',
	'≈{{amount}} dmg/min': '≈{{amount}} obrażeń/min',
	'The target is {{distance}} tiles away but {{attr}} is {{range}} — the monster never casts this from here.':
		'Cel jest {{distance}} pól dalej, ale {{attr}} wynosi {{range}} — potwór nigdy nie rzuci tego stąd.',
	'The area does not cover the monster itself.': 'Obszar nie obejmuje samego potwora.',
	'The area does not cover the target.': 'Obszar nie obejmuje celu.',
	'A beam fires along the facing only.': 'Wiązka strzela wyłącznie wzdłuż kierunku zwrócenia.',
	'A {{node}} rolls in {{callback}} with the monster as both caster and target, so it lands on itself — {{range}} and {{target}} have nothing to act on.':
		'{{node}} losuje w {{callback}} z potworem jako rzucającym i celem naraz, więc trafia w siebie — {{range}} i {{target}} nie mają na czym działać.',
	'Registered spell — only interval, chance and range are known here; the shape and effects come from spells.xml.':
		'Zaklęcie zarejestrowane — znane są tu tylko interval, chance i range; kształt oraz efekty pochodzą z spells.xml.',
	'Scripted spell — the Lua decides the shape and effects, so only the cadence is re-enacted.':
		'Zaklęcie skryptowe — o kształcie i efektach decyduje Lua, więc odtwarzany jest tylko rytm.',

	// --- Preview panel ------------------------------------------------------------
	'Play animation': 'Odtwórz animację',
	'Pause animation': 'Wstrzymaj animację',
	North: 'Północ',
	East: 'Wschód',
	South: 'Południe',
	West: 'Zachód',
	Derived: 'Wyliczone',
	'Max melee': 'Maks. wręcz',
	'Melee and physical hits only (§23)': 'Tylko trafienia wręcz i fizyczne (§23)',
	'Melee hits only (§23)': 'Tylko trafienia wręcz (§23)',
	'Loot value': 'Wartość łupu',
	'Expected value per kill, where item worth is known':
		'Wartość oczekiwana na zabójstwo, tam gdzie znana jest wartość przedmiotu',
	'+{{count}} unpriced': '+{{count}} bez ceny',
	'never summons': 'nigdy nie przywołuje',
	capped: 'ograniczone',
	'Effective HP': 'Efektywne HP',
	immune: 'odporny',
	'blocked 100%': 'zablokowane 100%',
	'Edit in the Loot tab': 'Edytuj w karcie Łup',
	'Drag items from the Items browser to add loot':
		'Przeciągnij przedmioty z przeglądarki Przedmiotów, aby dodać łup',
	Balance: 'Balans',
	'XP {{xp}} → band {{band}}': 'XP {{xp}} → przedział {{band}}',
	HP: 'HP',
	'vs median': 'vs mediana',

	// --- Fields --------------------------------------------------------------------
	'Drag to reorder': 'Przeciągnij, aby zmienić kolejność',
	'Corpus default is {{value}} — click to use it':
		'Domyślna wartość korpusu to {{value}} — kliknij, aby jej użyć',
	'Search…': 'Szukaj…',
	'No match': 'Brak dopasowania',
	'Select…': 'Wybierz…',
	'Pick an item…': 'Wybierz przedmiot…',
	'Searching…': 'Szukanie…',
	'Corpses only': 'Tylko zwłoki',
	ambiguous: 'niejednoznaczne',
	'More than one item owns this name — the entry must be pinned to an id':
		'Więcej niż jeden przedmiot ma tę nazwę — wpis musi zostać przypięty do id',
	'Ironcore-only effect — a stock client renders nothing.':
		'Efekt wyłącznie Ironcore — standardowy klient nic nie narysuje.',
	'Decay cycle': 'Cykl rozkładu',
	'{{time}} total': 'łącznie {{time}}',
	'The last stage has no decayTo — it stays on the ground forever.':
		'Ostatni etap nie ma decayTo — zostaje na ziemi na zawsze.',
	gone: 'zniknęło',
	'Browse outfits…': 'Przeglądaj wyglądy…',
	normal: 'normalnie',
	'takes {{pct}}%': 'przyjmuje {{pct}}%',

	// --- Batch edit ------------------------------------------------------------------
	'Batch edit': 'Edycja zbiorcza',
	'Which monsters': 'Które potwory',
	'Name contains': 'Nazwa zawiera',
	Any: 'Dowolne',
	to: 'do',
	'0 = no bound': '0 = bez ograniczenia',
	'Has flag': 'Ma flagę',
	'at value': 'o wartości',
	any: 'dowolna',
	'In monsters.xml': 'W monsters.xml',
	Orphan: 'Sierota',
	'No loot': 'Brak łupu',
	'What to change': 'Co zmienić',
	'Set to': 'Ustaw na',
	'Scale by': 'Przeskaluj o',
	'Removes the value entirely.': 'Całkowicie usuwa wartość.',
	Fields: 'Pola',
	'Race (blood)': 'Rasa (krew)',
	'Name description': 'Opis nazwy',
	'Previewing…': 'Podgląd…',
	'Select all': 'Zaznacz wszystko',
	'Select none': 'Odznacz wszystko',
	removed: 'usunięte',
	new: 'nowe',
	'Every changed file is backed up to {{folder}} before it is rewritten.':
		'Każdy zmieniony plik jest kopiowany do {{folder}} przed nadpisaniem.',
	Change: 'Zmień',
	'Changing…': 'Zmienianie…',

	// --- Scale loot -------------------------------------------------------------------
	'Scale loot chances': 'Przeskaluj szanse łupu',
	'Every item in the corpus': 'Każdy przedmiot w korpusie',
	'Multiply by': 'Pomnóż przez',
	'Never scale a drop down to never — floor it at 0.001% instead':
		'Nigdy nie skaluj wypadania do zera — zamiast tego ogranicz od dołu do 0,001%',
	'Every loot chance in the corpus is matched. Pick an item to scale just that drop.':
		'Dopasowana jest każda szansa łupu w korpusie. Wybierz przedmiot, aby przeskalować tylko ten łup.',
	'Every monster dropping this item is matched, nested container entries included.':
		'Dopasowany jest każdy potwór upuszczający ten przedmiot, wraz z zagnieżdżonymi wpisami pojemników.',
	'Matched entries become a flat {{percent}}% drop.':
		'Dopasowane wpisy stają się stałym wypadaniem {{percent}}%.',
	'Matched chances are multiplied, then clamped to 0–100%.':
		'Dopasowane szanse są mnożone, a potem ograniczane do 0–100%.',
	'Entries that would not change are left untouched.':
		'Wpisy, które by się nie zmieniły, zostają nietknięte.',
	'Pick a factor other than 100% to see what changes.':
		'Wybierz współczynnik inny niż 100%, aby zobaczyć, co się zmieni.',
	'Nothing changes at these settings.': 'Przy tych ustawieniach nic się nie zmieni.',
	Scale: 'Przeskaluj',
	'Scaling…': 'Skalowanie…',

	// --- Pin loot ----------------------------------------------------------------------
	'Pin ambiguous loot ids': 'Przypnij niejednoznaczne id łupu',
	'Pin all loot ids': 'Przypnij wszystkie id łupu',
	'No loot entry names an ambiguous item. Nothing to pin.':
		'Żaden wpis łupu nie nazywa niejednoznacznego przedmiotu. Nie ma czego przypinać.',
	'Every loot entry is already pinned to an id and named.':
		'Każdy wpis łupu jest już przypięty do id i nazwany.',
	Pin: 'Przypnij',
	'Pinning…': 'Przypinanie…',

	// --- Patch notes ---------------------------------------------------------------------
	'Export patch notes': 'Eksportuj notatki o zmianach',
	'Reading the corpus…': 'Wczytywanie korpusu…',
	'No cut-off point is set for this workspace yet. Set one now, edit monsters as usual, and come back here — the notes will cover everything between the two.':
		'Dla tego obszaru roboczego nie ustawiono jeszcze punktu odcięcia. Ustaw go teraz, edytuj potwory jak zwykle i wróć tutaj — notatki obejmą wszystko pomiędzy.',
	'Set cut-off point': 'Ustaw punkt odcięcia',
	'Cut-off point:': 'Punkt odcięcia:',
	'just now': 'przed chwilą',
	'The open monster has unsaved edits. Notes are read from disk, so those are not included yet.':
		'Otwarty potwór ma niezapisane zmiany. Notatki czytane są z dysku, więc te jeszcze się nie liczą.',
	'No monster has changed since the cut-off point. Move it to now if you are starting a new round of edits.':
		'Żaden potwór nie zmienił się od punktu odcięcia. Przesuń go na teraz, jeśli zaczynasz nową rundę edycji.',
	added: 'dodany',
	updated: 'zmieniony',
	'Set a new cut-off point here after exporting':
		'Ustaw tutaj nowy punkt odcięcia po eksporcie',
	'Start the next span from now': 'Rozpocznij następny okres od teraz',
	'Set cut-off to now': 'Ustaw odcięcie na teraz',
	Copy: 'Kopiuj',
	'Export…': 'Eksportuj…',
	'Exporting…': 'Eksportowanie…',
	'Patch notes copied': 'Skopiowano notatki o zmianach',

	// --- Loot simulator -------------------------------------------------------------------
	'Loot simulator — {{monster}}': 'Symulator łupu — {{monster}}',
	'Hunt for a stretch of time; kills follow from the cadence':
		'Poluj przez pewien czas; liczba zabójstw wynika z tempa',
	'By time': 'Według czasu',
	'Kill a fixed number of monsters instantly — no clock, no cadence':
		'Zabij ustaloną liczbę potworów natychmiast — bez zegara, bez tempa',
	'By kills': 'Według zabójstw',
	Session: 'Sesja',
	'Session length in minutes': 'Długość sesji w minutach',
	min: 'min',
	'Per kill': 'Na zabójstwo',
	'Fight duration in seconds': 'Czas walki w sekundach',
	'Between kills': 'Między zabójstwami',
	'Walking, respawn, targeting': 'Chodzenie, respawn, namierzanie',
	Kills: 'Zabójstwa',
	'Monsters killed per run, instantly': 'Potwory zabite na przebieg, natychmiast',
	'Loot rate': 'Mnożnik łupu',
	'Server loot-rate multiplier; chances clamp at 100%':
		'Serwerowy mnożnik łupu; szanse ograniczone do 100%',
	Sessions: 'Sesje',
	Runs: 'Przebiegi',
	'1 is a single concrete hunt; more shows the spread':
		'1 to jedno konkretne polowanie; więcej pokazuje rozrzut',
	Seed: 'Ziarno',
	'0 rolls a fresh seed each run; any other value reproduces a run exactly':
		'0 losuje nowe ziarno przy każdym przebiegu; każda inna wartość odtwarza przebieg dokładnie',
	'{{kills}} kills per session at one kill every {{cadence}}s':
		'{{kills}} zabójstw na sesję, po jednym co {{cadence}}s',
	'{{kills}} kills per run, killed instantly — no clock, so totals are per run':
		'{{kills}} zabójstw na przebieg, natychmiast — bez zegara, więc sumy są na przebieg',
	'seed {{seed}}': 'ziarno {{seed}}',
	'gp/h': 'gp/h',
	'gp per run': 'gp na przebieg',
	'per session': 'na sesję',
	'kills per run': 'zabójstw na przebieg',
	'gp per kill': 'gp na zabójstwo',
	'expected gp/h': 'oczekiwane gp/h',
	'expected gp per run': 'oczekiwane gp na przebieg',
	Totals: 'Sumy',
	'Corpse log': 'Dziennik zwłok',
	'Kill-by-kill corpses of the first session': 'Zwłoki zabójstwo po zabójstwie z pierwszej sesji',
	gp: 'gp',
	'over {{count}}': 'w {{count}}',
	'No kills in the session.': 'Brak zabójstw w sesji.',
	Total: 'Suma',
	Drops: 'Wypadnięcia',
	'1st drop': 'Pierwsze wypadnięcie',
	Value: 'Wartość',
	'Dropped on {{drops}} of {{kills}} kills': 'Wypadło przy {{drops}} z {{kills}} zabójstw',
	'vs {{chance}}': 'vs {{chance}}',
	'Median first drop: kill {{kill}}; dropped in {{hit}} of {{total}} sessions':
		'Mediana pierwszego wypadnięcia: zabójstwo {{kill}}; wypadło w {{hit}} z {{total}} sesji',
	'Never dropped': 'Nigdy nie wypadło',
	'kill {{kill}}': 'zabójstwo {{kill}}',
	unpriced: 'bez ceny',
	'Nothing dropped.': 'Nic nie wypadło.',
	'How these numbers are produced': 'Jak powstają te liczby',
	'Per-session totals are averages over the runs. The model mirrors the documented loader rules; the per-entry uniform roll and 1–countmax stack count are inferred from the TFS lineage, not Ironcore source.':
		'Sumy na sesję to średnie z przebiegów. Model odwzorowuje udokumentowane reguły loadera; jednostajny rzut na wpis oraz liczność stosu 1–countmax wywnioskowano z linii TFS, a nie ze źródeł Ironcore.',
	Simulate: 'Symuluj',
	'Simulate again': 'Symuluj ponownie',
	'Resolving items…': 'Rozwiązywanie przedmiotów…',

	// --- UI inspector -----------------------------------------------------------------------
	Copied: 'Skopiowano',
	'Hold {{key}} · click to copy': 'Przytrzymaj {{key}} · kliknij, aby skopiować',

	// --- Landing credit ---------------------------------------------------------------------
	by: 'autor:',
	'built with Claude': 'zbudowane z Claude',
	// --- Balance overview -------------------------------------------------------------------
	'Balance overview': 'Przegląd balansu',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._one':
		'{{count}} potwór z doświadczeniem powyżej zera, pogrupowany według wartości zabicia. Mediany pochodzą z tego korpusu — nic nie jest porównywane z innym serwerem.',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._few':
		'{{count}} potwory z doświadczeniem powyżej zera, pogrupowane według wartości zabicia. Mediany pochodzą z tego korpusu — nic nie jest porównywane z innym serwerem.',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._many':
		'{{count}} potworów z doświadczeniem powyżej zera, pogrupowanych według wartości zabicia. Mediany pochodzą z tego korpusu — nic nie jest porównywane z innym serwerem.',
	Bosses: 'Bossowie',
	'Monsters flagged isboss': 'Potwory z flagą isboss',
	Passive: 'Pasywne',
	'Monsters that write hostile="0". A monster with no hostile flag at all is not counted as passive — most of TVP’s corpus omits it.':
		'Potwory, które zapisują hostile="0". Potwór bez flagi hostile w ogóle nie liczy się jako pasywny — większość korpusu TVP jej nie zapisuje.',
	'Monsters flagged summonable, which is what a summon is': 'Potwory z flagą summonable, czyli to, czym jest przywołaniec',
	'Immune to damage': 'Odporne na obrażenia',
	'Not attackable, or immune to every damage type this engine offers by immunity or by a 100% element — nothing can hurt it':
		'Nie da się go zaatakować albo jest odporny na każdy typ obrażeń tego silnika, przez odporność albo element 100% — nic nie może go zranić',
	'{{count}} monster left out_one': 'pominięto {{count}} potwora',
	'{{count}} monster left out_few': 'pominięto {{count}} potwory',
	'{{count}} monster left out_many': 'pominięto {{count}} potworów',
	'Sort the monsters in the open band by this — again to reverse it, a third time for the outliers':
		'Sortuj potwory w otwartym przedziale według tej kolumny — ponownie, aby odwrócić, trzeci raz, aby wrócić do odstających',
	Band: 'Przedział',
	'Show the monsters in this band, furthest from the middle first': 'Pokaż potwory w tym przedziale, najdalsze od środka na początku',
	'Too few to draw a median from': 'Za mało, by wyznaczyć medianę',
	'No monsters in this band.': 'Brak potworów w tym przedziale.',
	'{{label}} {{value}} — {{pct}}% of the band is at or below it': '{{label}} {{value}} — {{pct}}% przedziału jest na tym poziomie lub niżej',
	// --- Filtered monsters ------------------------------------------------------------------
	'Filtered monsters': 'Odfiltrowane potwory',
	'Show all again': 'Pokaż wszystkie ponownie',
	'Nothing is filtered. A monster ticked here disappears from the whole app — every list, every tool, every lint — and stays gone after a restart.':
		'Nic nie jest odfiltrowane. Potwór zaznaczony tutaj znika z całej aplikacji — z każdej listy, każdego narzędzia, każdego lintu — i pozostaje ukryty po restarcie.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._one':
		'{{count}} potwór jest odfiltrowany z tego korpusu w całej aplikacji i pozostanie taki po restarcie.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._few':
		'{{count}} potwory są odfiltrowane z tego korpusu w całej aplikacji i pozostaną takie po restarcie.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._many':
		'{{count}} potworów jest odfiltrowanych z tego korpusu w całej aplikacji i pozostanie takich po restarcie.',

	// --- Custom effects ---------------------------------------------------------------------
	'Custom effects': 'Efekty własne',
	'Custom effects…': 'Efekty własne…',
	'MONx knows the effects {{engine}} ships, read from its own source. Anything your server adds on top is listed here, after which it appears in the picker like any other and stops being reported as unknown. Declarations are remembered per engine.':
		'MONx zna efekty dostarczane przez {{engine}}, odczytane z jego własnych źródeł. Wszystko, co Twój serwer dodaje ponad to, wypisujesz tutaj — potem pojawia się w wyborze jak każdy inny i przestaje być zgłaszane jako nieznane. Deklaracje są zapamiętywane osobno dla każdego silnika.',
	'Magic effects': 'Efekty magiczne',
	'Shoot effects': 'Efekty pocisków',
	'Value written to the file': 'Wartość zapisywana w pliku',
	'Client id': 'Id klienta',
	Label: 'Etykieta',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._one':
		'Nic jeszcze nie zadeklarowano. {{engine}} dostarcza {{count}} taki efekt sam z siebie.',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._few':
		'Nic jeszcze nie zadeklarowano. {{engine}} dostarcza {{count}} takie efekty sam z siebie.',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._many':
		'Nic jeszcze nie zadeklarowano. {{engine}} dostarcza {{count}} takich efektów sam z siebie.',
	'(uses the value)': '(używa wartości)',
	'{{engine}} already ships this name — the shipped entry wins and this row does nothing.':
		'{{engine}} już dostarcza tę nazwę — wpis z silnika ma pierwszeństwo, a ten wiersz nic nie robi.',
	'Declared twice — only the first is used.': 'Zadeklarowane dwa razy — używany jest tylko pierwszy wpis.',
	'Declare an effect': 'Zadeklaruj efekt',
	'An id of 0 is allowed — the effect is named and lints clean, but has no sprite to preview. Nothing here changes what MONx writes: the value was always emitted exactly as typed.':
		'Id równe 0 jest dozwolone — efekt ma nazwę i nie zgłasza uwag, ale nie ma sprite’a do podglądu. Nic tutaj nie zmienia tego, co MONx zapisuje: wartość zawsze była zapisywana dokładnie tak, jak wpisana.',
	"Not in this engine's catalogue — kept exactly as written. Declare it under Preferences → Custom effects to name it and stop the warning.":
		'Nie ma tego w katalogu tego silnika — zapisane dokładnie tak, jak wpisano. Zadeklaruj to w Preferencje → Efekty własne, aby nadać temu nazwę i wyłączyć ostrzeżenie.',
	'A custom effect you declared, not one this engine ships.':
		'Efekt własny z Twojej deklaracji — nie jest dostarczany przez ten silnik.',

	// --- Changed outside MONx ---------------------------------------------------------------
	'Changed outside MONx': 'Zmienione poza MONx',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._one':
		'{{count}} plik został zmieniony przez inny program i ma tu też niezapisane zmiany. Wczytanie odrzuci Twoje zmiany; zachowanie ich oznacza, że następny zapis nadpisze to, co jest na dysku.',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._few':
		'{{count}} pliki zostały zmienione przez inny program i mają tu też niezapisane zmiany. Wczytanie odrzuci Twoje zmiany; zachowanie ich oznacza, że następny zapis nadpisze to, co jest na dysku.',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._many':
		'{{count}} plików zostało zmienionych przez inny program i ma tu też niezapisane zmiany. Wczytanie odrzuci Twoje zmiany; zachowanie ich oznacza, że następny zapis nadpisze to, co jest na dysku.',
	'Load from disk': 'Wczytaj z dysku',
	'Keep all mine': 'Zostaw wszystkie moje',
	'{{file}} was deleted outside MONx — unsaved changes to it are gone':
		'Plik {{file}} został usunięty poza MONx — niezapisane zmiany w nim przepadły',

	// --- Saving -----------------------------------------------------------------------------
	'Save all': 'Zapisz wszystko',
	'Balance overview…': 'Przegląd balansu…',
	'Saved {{count}} file_one': 'Zapisano {{count}} plik',
	'Saved {{count}} file_few': 'Zapisano {{count}} pliki',
	'Saved {{count}} file_many': 'Zapisano {{count}} plików',
	'Wrote {{count}} file, then failed on {{error}}_one': 'Zapisano {{count}} plik, potem błąd: {{error}}',
	'Wrote {{count}} file, then failed on {{error}}_few': 'Zapisano {{count}} pliki, potem błąd: {{error}}',
	'Wrote {{count}} file, then failed on {{error}}_many': 'Zapisano {{count}} plików, potem błąd: {{error}}',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_one':
		'Zapisano {{count}} plik, potem nie udało się z {{failures}} kolejnymi (pierwszy: {{error}})',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_few':
		'Zapisano {{count}} pliki, potem nie udało się z {{failures}} kolejnymi (pierwszy: {{error}})',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_many':
		'Zapisano {{count}} plików, potem nie udało się z {{failures}} kolejnymi (pierwszy: {{error}})',
	'Add {{count}} item to the new monster_one': 'Dodaj {{count}} przedmiot do nowego potwora',
	'Add {{count}} item to the new monster_few': 'Dodaj {{count}} przedmioty do nowego potwora',
	'Add {{count}} item to the new monster_many': 'Dodaj {{count}} przedmiotów do nowego potwora',

	// --- Balance readings -------------------------------------------------------------------
	// Polish writes an ordinal as the figure followed by a full stop, so the
	// English "st/nd/rd/th" suffix is dropped rather than translated.
	'{{pct}}{{suffix}}': '{{pct}}.',
	median: 'mediana',
	n: 'n',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._one':
		'Tylko {{count}} potwór w tym przedziale — za mało, by mediana coś znaczyła, więc nic nie jest uznawane za nietypowe.',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._few':
		'Tylko {{count}} potwory w tym przedziale — za mało, by mediana coś znaczyła, więc nic nie jest uznawane za nietypowe.',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._many':
		'Tylko {{count}} potworów w tym przedziale — za mało, by mediana coś znaczyła, więc nic nie jest uznawane za nietypowe.',
	'Health sits with band {{band}} — the experience may be low for it.':
		'Punkty życia pasują do przedziału {{band}} — doświadczenie może być jak na to za niskie.',
	'Health sits with band {{band}} — the experience may be high for it.':
		'Punkty życia pasują do przedziału {{band}} — doświadczenie może być jak na to za wysokie.',

	// --- Spells -----------------------------------------------------------------------------
	'as written': 'jak wpisano',
};

export default pl;
