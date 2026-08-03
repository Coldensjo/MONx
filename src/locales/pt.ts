// Portuguese. Keys are the English source strings.
//
// Portuguese takes `_one`, `_many` and `_other` through Intl.PluralRules; the
// `_many` category only fires for large compact numbers, so `_one` and `_other`
// carry almost everything.
//
// Brazilian spelling throughout — that is where most of the OT server community
// writing these corpora is. Engine vocabulary stays in English: `raceid`,
// `typeex`, flag names, CONST_ME_* effects, item names and lint codes are what
// the server reads and what the community writes.

const pt: Record<string, string> = {
	// --- Compass -------------------------------------------------------------
	'compass-N': 'N',
	'compass-E': 'L',
	'compass-S': 'S',
	'compass-W': 'O',

	// --- Plurals -------------------------------------------------------------
	'{{count}} error_one': '{{count}} erro',
	'{{count}} error_other': '{{count}} erros',
	'{{count}} warning_one': '{{count}} aviso',
	'{{count}} warning_other': '{{count}} avisos',
	'{{count}} silent-data-loss issue_one': '{{count}} perda silenciosa de dados',
	'{{count}} silent-data-loss issue_other': '{{count}} perdas silenciosas de dados',
	'{{count}} lint_one': '{{count}} apontamento',
	'{{count}} lint_other': '{{count}} apontamentos',
	'Fix all ({{count}})_one': 'Corrigir tudo ({{count}})',
	'Fix all ({{count}})_other': 'Corrigir tudo ({{count}})',
	'Fixed {{count}} lint_one': '{{count}} apontamento corrigido',
	'Fixed {{count}} lint_other': '{{count}} apontamentos corrigidos',
	'Fixed {{count}} lint across {{files}}_one': '{{count}} apontamento corrigido em {{files}}',
	'Fixed {{count}} lint across {{files}}_other': '{{count}} apontamentos corrigidos em {{files}}',
	'Fixed {{count}} lint, {{manual}} need a manual fix_one':
		'{{count}} apontamento corrigido, {{manual}} precisa de correção manual',
	'Fixed {{count}} lint, {{manual}} need a manual fix_other':
		'{{count}} apontamentos corrigidos, {{manual}} precisam de correção manual',
	'Exported {{count}} lint_one': '{{count}} apontamento exportado',
	'Exported {{count}} lint_other': '{{count}} apontamentos exportados',

	'{{count}} file_one': '{{count}} arquivo',
	'{{count}} file_other': '{{count}} arquivos',
	'{{count}} monster_one': '{{count}} monstro',
	'{{count}} monster_other': '{{count}} monstros',
	'{{count}} item_one': '{{count}} item',
	'{{count}} item_other': '{{count}} itens',
	'{{count}} entry_one': '{{count}} entrada',
	'{{count}} entry_other': '{{count}} entradas',
	'{{count}} tile_one': '{{count}} quadro',
	'{{count}} tile_other': '{{count}} quadros',
	'{{count}} change_one': '{{count}} alteração',
	'{{count}} change_other': '{{count}} alterações',
	'{{count}} spell_one': '{{count}} magia',
	'{{count}} spell_other': '{{count}} magias',
	'{{count}} drop_one': '{{count}} drop',
	'{{count}} drop_other': '{{count}} drops',
	'{{count}} line_one': '{{count}} fala',
	'{{count}} line_other': '{{count}} falas',
	'{{count}} soul_one': '{{count}} soul',
	'{{count}} soul_other': '{{count}} souls',
	'{{count}} charge_one': '{{count}} carga',
	'{{count}} charge_other': '{{count}} cargas',
	'{{count}} slot_one': '{{count}} slot',
	'{{count}} slot_other': '{{count}} slots',

	'{{count}} minute ago_one': 'há {{count}} minuto',
	'{{count}} minute ago_other': 'há {{count}} minutos',
	'{{count}} hour ago_one': 'há {{count}} hora',
	'{{count}} hour ago_other': 'há {{count}} horas',
	'{{count}} day ago_one': 'há {{count}} dia',
	'{{count}} day ago_other': 'há {{count}} dias',

	'{{count}} field differs._one': '{{count}} campo difere.',
	'{{count}} field differs._other': '{{count}} campos diferem.',
	'{{count}} entry across {{files}} change._one': '{{count}} entrada em {{files}} muda.',
	'{{count}} entry across {{files}} change._other': '{{count}} entradas em {{files}} mudam.',
	'{{count}} entry stops dropping entirely._one': '{{count}} entrada deixa de dropar por completo.',
	'{{count}} entry stops dropping entirely._other': '{{count}} entradas deixam de dropar por completo.',
	'{{count}} entry never drops — see lints._one': '{{count}} entrada nunca dropa — veja os apontamentos.',
	'{{count}} entry never drops — see lints._other':
		'{{count}} entradas nunca dropam — veja os apontamentos.',
	'{{count}} item is unpriced and excluded from gp totals._one':
		'{{count}} item não tem preço e fica de fora dos totais em gp.',
	'{{count}} item is unpriced and excluded from gp totals._other':
		'{{count}} itens não têm preço e ficam de fora dos totais em gp.',
	'{{count}} monster matches, {{changed}}._one': '{{count}} monstro corresponde, {{changed}}.',
	'{{count}} monster matches, {{changed}}._other': '{{count}} monstros correspondem, {{changed}}.',
	'{{count}} monster matches — none of them change at these settings._one':
		'{{count}} monstro corresponde — nenhum muda com estas configurações.',
	'{{count}} monster matches — none of them change at these settings._other':
		'{{count}} monstros correspondem — nenhum muda com estas configurações.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._one':
		'{{count}} deles adiciona ou remove um nó em vez de alterá-lo no lugar, então esse arquivo desloca cada linha abaixo da edição.',
	'{{count}} of them adds or removes a node rather than changing one in place, so those files shift every line below the edit._other':
		'{{count}} deles adicionam ou removem um nó em vez de alterá-lo no lugar, então esses arquivos deslocam cada linha abaixo da edição.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._one':
		'{{count}} já era um id sem nada dizendo o que é; ganha apenas o comentário.',
	'{{count}} was already an id with nothing saying what it is; it gains only the comment._other':
		'{{count}} já eram ids sem nada dizendo o que são; ganham apenas o comentário.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._one':
		'{{count}} nome não corresponde a nenhuma entrada de items.xml e fica intacto — o MONx nunca inventa um id de item. Primeiro: {{list}}.',
	'{{count}} name matches no items.xml entry and is left untouched — MONx never invents an item id. First: {{list}}._other':
		'{{count}} nomes não correspondem a nenhuma entrada de items.xml e ficam intactos — o MONx nunca inventa um id de item. Primeiros: {{list}}.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._one':
		'{{count}} entrada de loot em {{files}} vira id mais um comentário nomeando o item.',
	'{{count}} loot entry in {{files}} becomes id + a trailing comment naming the item._other':
		'{{count}} entradas de loot em {{files}} viram id mais um comentário nomeando o item.',
	'{{count}} item in the tray._one': '{{count}} item na bandeja.',
	'{{count}} item in the tray._other': '{{count}} itens na bandeja.',
	'Clear {{count}} item from Loot?_one': 'Remover {{count}} item do Loot?',
	'Clear {{count}} item from Loot?_other': 'Remover {{count}} itens do Loot?',
	'Add {{count}} item to Loot_one': 'Adicionar item ao Loot',
	'Add {{count}} item to Loot_other': 'Adicionar {{count}} itens ao Loot',
	'Added {{count}} item to Loot_one': '{{count}} item adicionado ao Loot',
	'Added {{count}} item to Loot_other': '{{count}} itens adicionados ao Loot',
	'Added {{count}} item to favourites_one': '{{count}} item adicionado aos favoritos',
	'Added {{count}} item to favourites_other': '{{count}} itens adicionados aos favoritos',
	'Add {{count}} item to favourites_one': 'Adicionar {{count}} item aos favoritos',
	'Add {{count}} item to favourites_other': 'Adicionar {{count}} itens aos favoritos',
	'Removed {{count}} item from favourites_one': '{{count}} item removido dos favoritos',
	'Removed {{count}} item from favourites_other': '{{count}} itens removidos dos favoritos',
	'Remove {{count}} item from favourites_one': 'Remover {{count}} item dos favoritos',
	'Remove {{count}} item from favourites_other': 'Remover {{count}} itens dos favoritos',
	'Add {{count}} item to loot for {{monster}}_one': 'Adicionar {{count}} item ao loot de {{monster}}',
	'Add {{count}} item to loot for {{monster}}_other': 'Adicionar {{count}} itens ao loot de {{monster}}',
	'Added {{count}} loot entry to {{monster}}_one': '{{count}} entrada de loot adicionada a {{monster}}',
	'Added {{count}} loot entry to {{monster}}_other':
		'{{count}} entradas de loot adicionadas a {{monster}}',
	'{{count}} tab has unsaved changes. Close and discard them?_one':
		'{{count}} aba tem alterações não salvas. Fechar e descartá-las?',
	'{{count}} tab has unsaved changes. Close and discard them?_other':
		'{{count}} abas têm alterações não salvas. Fechar e descartá-las?',
	'Cut-off point set — {{count}} monster marked_one':
		'Ponto de corte definido — {{count}} monstro marcado',
	'Cut-off point set — {{count}} monster marked_other':
		'Ponto de corte definido — {{count}} monstros marcados',
	'Exported {{count}} change_one': '{{count}} alteração exportada',
	'Exported {{count}} change_other': '{{count}} alterações exportadas',
	'Exported {{count}} change — cut-off point moved to now_one':
		'{{count}} alteração exportada — ponto de corte movido para agora',
	'Exported {{count}} change — cut-off point moved to now_other':
		'{{count}} alterações exportadas — ponto de corte movido para agora',
	'{{count}} change across {{monsters}}._one': '{{count}} alteração em {{monsters}}.',
	'{{count}} change across {{monsters}}._other': '{{count}} alterações em {{monsters}}.',
	'and {{count}} more not listed — they change too_one':
		'e mais 1 não listado — ele também muda',
	'and {{count}} more not listed — they change too_other':
		'e mais {{count}} não listados — eles também mudam',
	'and {{count}} more entries not listed — they are scaled too_one':
		'e mais 1 entrada não listada — ela também é escalada',
	'and {{count}} more entries not listed — they are scaled too_other':
		'e mais {{count}} entradas não listadas — elas também são escaladas',
	'{{count}} tile hit_one': '{{count}} quadro atingido',
	'{{count}} tile hit_other': '{{count}} quadros atingidos',
	'{{count}} tile away — drag to move_one': 'a {{count}} quadro — arraste para mover',
	'{{count}} tile away — drag to move_other': 'a {{count}} quadros — arraste para mover',
	'Changed {{count}} monster_one': '{{count}} monstro alterado',
	'Changed {{count}} monster_other': '{{count}} monstros alterados',
	'Scaled {{count}} loot chance across {{files}}_one':
		'{{count}} chance de loot escalada em {{files}}',
	'Scaled {{count}} loot chance across {{files}}_other':
		'{{count}} chances de loot escaladas em {{files}}',
	'Pinned {{count}} loot entry across {{files}}_one':
		'{{count}} entrada de loot fixada em {{files}}',
	'Pinned {{count}} loot entry across {{files}}_other':
		'{{count}} entradas de loot fixadas em {{files}}',
	'Loaded “{{name}}” — {{count}} item_one': '“{{name}}” carregado — {{count}} item',
	'Loaded “{{name}}” — {{count}} item_other': '“{{name}}” carregado — {{count}} itens',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_one':
		'“{{name}}” carregado — {{count}} item, {{missing}} fora deste espaço de trabalho',
	'Loaded “{{name}}” — {{count}} item, {{missing}} not in this workspace_other':
		'“{{name}}” carregado — {{count}} itens, {{missing}} fora deste espaço de trabalho',
	'{{count}} of them are ambiguous names the server drops today._one':
		'{{count}} deles é um nome ambíguo que o servidor descarta hoje.',
	'{{count}} of them are ambiguous names the server drops today._other':
		'{{count}} deles são nomes ambíguos que o servidor descarta hoje.',
	'and {{count}} more_one': 'e mais {{count}}',
	'and {{count}} more_other': 'e mais {{count}}',
	'{{count}} unticked._one': '{{count}} desmarcado.',
	'{{count}} unticked._other': '{{count}} desmarcados.',
	'{{count}} selected_one': '{{count}} selecionado',
	'{{count}} selected_other': '{{count}} selecionados',
	'{{count}} immune_one': '{{count}} imunidade',
	'{{count}} immune_other': '{{count}} imunidades',
	'Log capped at the first {{count}} kills._one': 'Registro limitado à primeira morte.',
	'Log capped at the first {{count}} kills._other': 'Registro limitado às primeiras {{count}} mortes.',
	'Across {{count}} sessions, min / median / max_one': 'Em {{count}} sessão: mín / mediana / máx',
	'Across {{count}} sessions, min / median / max_other': 'Em {{count}} sessões: mín / mediana / máx',
	'Across {{count}} runs, min / median / max_one': 'Em {{count}} rodada: mín / mediana / máx',
	'Across {{count}} runs, min / median / max_other': 'Em {{count}} rodadas: mín / mediana / máx',
	'Presets ({{count}})_one': 'Conjuntos ({{count}})',
	'Presets ({{count}})_other': 'Conjuntos ({{count}})',
	'Ignored ({{count}}) — pick one to restore_one':
		'Ignorados ({{count}}) — escolha um para restaurar',
	'Ignored ({{count}}) — pick one to restore_other':
		'Ignorados ({{count}}) — escolha um para restaurar',
	'Copied {{count}} {{block}} from {{monster}}_one': '{{count}} {{block}} copiado de {{monster}}',
	'Copied {{count}} {{block}} from {{monster}}_other': '{{count}} {{block}} copiados de {{monster}}',
	'Added {{count}} {{block}} from {{monster}}_one': '{{count}} {{block}} adicionado de {{monster}}',
	'Added {{count}} {{block}} from {{monster}}_other': '{{count}} {{block}} adicionados de {{monster}}',
	'Replaced with {{count}} {{block}} from {{monster}}_one':
		'Substituído por {{count}} {{block}} de {{monster}}',
	'Replaced with {{count}} {{block}} from {{monster}}_other':
		'Substituído por {{count}} {{block}} de {{monster}}',
	'Replace with {{count}} {{block}} from {{monster}}_one':
		'Substituir por {{count}} {{block}} de {{monster}}',
	'Replace with {{count}} {{block}} from {{monster}}_other':
		'Substituir por {{count}} {{block}} de {{monster}}',
	'Add {{count}} {{block}} from {{monster}} to what is here_one':
		'Adicionar {{count}} {{block}} de {{monster}} ao que já está aqui',
	'Add {{count}} {{block}} from {{monster}} to what is here_other':
		'Adicionar {{count}} {{block}} de {{monster}} ao que já está aqui',
	'{{count}} of max {{max}}_one': '{{count}} de no máx. {{max}}',
	'{{count}} of max {{max}}_other': '{{count}} de no máx. {{max}}',
	'Change {{count}}_one': 'Alterar {{count}}',
	'Change {{count}}_other': 'Alterar {{count}}',
	'Scale {{count}}_one': 'Escalar {{count}}',
	'Scale {{count}}_other': 'Escalar {{count}}',
	'Pin {{count}}_one': 'Fixar {{count}}',
	'Pin {{count}}_other': 'Fixar {{count}}',

	// --- Titlebar and shell ---------------------------------------------------
	'Unsaved changes': 'Alterações não salvas',
	'Editing under {{engine}} rules': 'Editando sob as regras do {{engine}}',
	'Editing under {{engine}} rules — detection was not confident':
		'Editando sob as regras do {{engine}} — a detecção não foi confiável',
	'Switch to light mode': 'Mudar para o modo claro',
	'Switch to dark mode': 'Mudar para o modo escuro',
	'Switch to lined mode': 'Mudar para o modo linhas',
	'Toggle theme': 'Alternar tema',
	Minimize: 'Minimizar',
	Maximize: 'Maximizar',
	Close: 'Fechar',
	'You have unsaved changes. Close the workspace anyway?':
		'Você tem alterações não salvas. Fechar o espaço de trabalho mesmo assim?',
	'You have unsaved changes. Quit anyway?': 'Você tem alterações não salvas. Sair mesmo assim?',

	// --- Landing ---------------------------------------------------------------
	Language: 'Idioma',
	Folders: 'Pastas',
	'Saved workspaces': 'Espaços de trabalho salvos',
	Rename: 'Renomear',
	'Forget this workspace': 'Esquecer este espaço de trabalho',
	'Monsters folder': 'Pasta de monstros',
	'Items folder': 'Pasta de itens',
	'Client folder': 'Pasta do cliente',
	'Spells folder': 'Pasta de magias',
	'data/items — items.otb + items.xml': 'data/items — items.otb + items.xml',
	'data/spells — optional, enables ### spell verification':
		'data/spells — opcional, habilita a verificação de magias ###',
	optional: 'opcional',
	Engine: 'Engine',
	'auto-detect': 'detectar automaticamente',
	chosen: 'escolhido',
	'detected from {{evidence}}': 'detectado a partir de {{evidence}}',
	'the corpus': 'do corpus',
	detected: 'detectado',
	'uncertain — check this': 'incerto — verifique',
	'no previews': 'sem prévias',
	'No item database or client files — monsters open and save normally, but nothing is drawn and loot ids stay numbers.':
		'Sem base de itens nem arquivos do cliente — os monstros abrem e salvam normalmente, mas nada é desenhado e os ids de loot continuam como números.',
	'Opening…': 'Abrindo…',
	'Checking…': 'Verificando…',
	'Open workspace': 'Abrir espaço de trabalho',
	'Workspace name': 'Nome do espaço de trabalho',
	'Save these folders under a name, to open in one click':
		'Salve estas pastas com um nome, para abrir em um clique',
	'Save workspace': 'Salvar espaço de trabalho',
	Recent: 'Recentes',

	// --- Engines ----------------------------------------------------------------
	Ironcore: 'Ironcore',
	'TheForgottenServer 1.x': 'TheForgottenServer 1.x',
	TheVioletProject: 'TheVioletProject',
	Nostalrius: 'Nostalrius',
	'Canary / OTServBR': 'Canary / OTServBR',
	BlackTek: 'BlackTek',
	'raceid, species, the pacifist system, CONST_ME_* effects':
		'raceid, species, o sistema pacifista, efeitos CONST_ME_*',
	'raceId + <bestiary>, short-name effects, no pacifist system':
		'raceId + <bestiary>, efeitos com nome curto, sem sistema pacifista',
	'7.x: <targetstrategy>, delay=, melee skill progression':
		'7.x: <targetstrategy>, delay=, progressão de skill corpo a corpo',
	'7.x: melee on <attacks>, no spell interval, count= conditions':
		'7.x: corpo a corpo em <attacks>, sem intervalo de magia, condições count=',
	'Lua monsters, bestiary + bosstiary, COMBAT_* damage types':
		'Monstros em Lua, bestiary + bosstiary, tipos de dano COMBAT_*',
	'TFS 1.x in Lua: flags table, top-level numerics':
		'TFS 1.x em Lua: tabela de flags, numéricos no nível superior',

	// --- Navigation and views -----------------------------------------------------
	Monsters: 'Monstros',
	Items: 'Itens',
	Outfits: 'Outfits',
	Effects: 'Efeitos',
	Missiles: 'Projéteis',
	Workspace: 'Espaço de trabalho',
	Monster: 'Monstro',
	'Select a monster': 'Selecione um monstro',

	// --- Menus and commands --------------------------------------------------------
	File: 'Arquivo',
	Edit: 'Editar',
	Tools: 'Ferramentas',
	Linter: 'Linter',
	Preferences: 'Preferências',
	View: 'Exibir',
	'Editor tabs': 'Abas do editor',
	'Save monster': 'Salvar monstro',
	'Go to monster…': 'Ir para o monstro…',
	'New monster…': 'Novo monstro…',
	'Duplicate monster': 'Duplicar monstro',
	'Rename monster…': 'Renomear monstro…',
	'Delete monster…': 'Excluir monstro…',
	'Show monster in folder': 'Mostrar monstro na pasta',
	'Close workspace': 'Fechar espaço de trabalho',
	Undo: 'Desfazer',
	Redo: 'Refazer',
	'Fix every fixable lint': 'Corrigir todo apontamento corrigível',
	'Add the loot tray to this monster': 'Adicionar a bandeja de loot a este monstro',
	'Go to Monsters': 'Ir para Monstros',
	'Go to Items': 'Ir para Itens',
	'Go to Outfits': 'Ir para Outfits',
	'Go to Effects': 'Ir para Efeitos',
	'Go to Missiles': 'Ir para Projéteis',
	'Search monsters': 'Buscar monstros',
	'Toggle the lint drawer': 'Alternar a gaveta de apontamentos',
	'Next monster in the list': 'Próximo monstro da lista',
	'Previous monster in the list': 'Monstro anterior da lista',
	'Next editor tab': 'Próxima aba do editor',
	'Previous editor tab': 'Aba anterior do editor',
	'Close editor tab': 'Fechar aba do editor',
	'Jump to {{tab}}': 'Ir para {{tab}}',
	'Pin ambiguous loot ids…': 'Fixar ids de loot ambíguos…',
	'Pin all loot ids…': 'Fixar todos os ids de loot…',
	'Scale loot chances…': 'Escalar chances de loot…',
	'Batch edit fields…': 'Edição em lote de campos…',
	'Compare monsters…': 'Comparar monstros…',
	'Export lint report…': 'Exportar relatório de apontamentos…',
	'Export patch notes…': 'Exportar notas de versão…',
	'Set patch notes cut-off point': 'Definir ponto de corte das notas de versão',
	'Set patch notes cut-off point — last set {{when}}':
		'Definir ponto de corte das notas de versão — definido {{when}}',
	'{{action}} — save first': '{{action}} — salve primeiro',
	'Show {{severity}} lints': 'Mostrar apontamentos: {{severity}}',
	'Show {{severity}}': 'Mostrar {{severity}}',
	'Preferences…': 'Preferências…',
	'Filtered monsters…': 'Monstros filtrados…',
	'Hotkeys…': 'Atalhos…',
	'Show every editor tab': 'Mostrar todas as abas do editor',
	'Nothing ignored': 'Nada ignorado',
	'Stop ignoring everything': 'Parar de ignorar tudo',

	// --- Tabs and editor shell ------------------------------------------------------
	'{{file}} — preview; double-click to keep open':
		'{{file}} — prévia; clique duas vezes para manter aberto',
	'Close {{file}}': 'Fechar {{file}}',
	'Close all except this one': 'Fechar todas exceto esta',
	'Close all to the left': 'Fechar todas à esquerda',
	'Close all to the right': 'Fechar todas à direita',
	'Close all': 'Fechar todas',
	'{{file}} has unsaved changes. Close and discard them?':
		'{{file}} tem alterações não salvas. Fechar e descartá-las?',
	'Read-only — this file cannot be written back without losing something. Fix the reported problems to enable editing.':
		'Somente leitura — este arquivo não pode ser gravado de volta sem perder algo. Corrija os problemas relatados para habilitar a edição.',
	Save: 'Salvar',
	'Saving…': 'Salvando…',
	'Saved {{file}}': '{{file}} salvo',

	// --- Monster list ----------------------------------------------------------------
	'Search name, file, species, raceid': 'Buscar nome, arquivo, espécie, raceid',
	'Clear search': 'Limpar busca',
	'Filter the list': 'Filtrar a lista',
	Filters: 'Filtros',
	'Clear all': 'Limpar tudo',
	'Search filters': 'Buscar filtros',
	'No matching filters': 'Nenhum filtro correspondente',
	'No monsters match.': 'Nenhum monstro corresponde.',
	New: 'Novo',
	'Not registered in monsters.xml': 'Não registrado em monsters.xml',
	orphan: 'órfão',
	Duplicate: 'Duplicar',
	'Rename…': 'Renomear…',
	'Reveal in folder': 'Mostrar na pasta',
	'Delete…': 'Excluir…',
	'New monster': 'Novo monstro',
	Name: 'Nome',
	Group: 'Grupo',
	'(none)': '(nenhum)',
	Cancel: 'Cancelar',
	Create: 'Criar',
	'Rename {{name}}': 'Renomear {{name}}',
	'Renaming rewrites the monsters.xml entry as well as the file on disk.':
		'Renomear reescreve a entrada em monsters.xml e também o arquivo em disco.',
	'Delete {{name}}?': 'Excluir {{name}}?',
	'{{file}} is removed from disk and from monsters.xml. Anything summoning it, or referencing it from an outfit spell, will silently stop working.':
		'{{file}} é removido do disco e de monsters.xml. Qualquer coisa que o invoque, ou que o referencie a partir de uma magia de outfit, vai parar de funcionar silenciosamente.',
	Delete: 'Excluir',
	'Created {{file}}': '{{file}} criado',
	'Renamed to {{name}}': 'Renomeado para {{name}}',
	'Duplicated to {{file}}': 'Duplicado para {{file}}',
	'Deleted {{file}}': '{{file}} excluído',

	// --- Create wizard ---------------------------------------------------------------------
	// The kind labels double as a noun inside the "similar to" blurb, where they
	// arrive lower-cased. The blurb quotes {{kind}} instead of agreeing with it,
	// so the label the button shows is the only form any of them needs.
	'What kind of monster is it?': 'Que tipo de monstro é?',
	'Ordinary monster': 'Monstro comum',
	'Hostile, attackable, drops loot': 'Hostil, atacável, dropa loot',
	'Rarer, tougher, unsummonable': 'Mais raro, mais forte, não invocável',
	'Summoned minion': 'Lacaio invocado',
	'Summonable and convinceable': 'Invocável e convencível',
	'Harmless critter': 'Bicho inofensivo',
	'Not hostile, pushable, no loot': 'Não hostil, empurrável, sem loot',
	'This is the only question with no drawn answer — it picks which monsters everything else is drawn from.':
		'Esta é a única pergunta sem resposta sorteada — ela escolhe de quais monstros todo o resto é sorteado.',
	monster: 'monstro',

	'Is it similar to anything else?': 'Ele é parecido com algum outro?',
	'Optional. Name a few and the immunities, the melee, the drops and the power level all come off them; name none and the wizard draws from every {{kind}} in the corpus.':
		'Opcional. Indique alguns e as imunidades, o corpo a corpo, os drops e o nível de poder saem deles; não indique nenhum e o assistente sorteia entre todos os monstros do tipo “{{kind}}” no corpus.',
	'Everything from here is drawn from these {{count}}._one': 'Tudo daqui em diante sai deste um.',
	'Everything from here is drawn from these {{count}}._other': 'Tudo daqui em diante sai destes {{count}}.',
	'Search the corpus…': 'Buscar no corpus…',
	'{{n}} of {{max}}': '{{n}} de {{max}}',
	'Nothing in this corpus matches.': 'Nada neste corpus corresponde.',
	'{{name}} — {{exp}} exp': '{{name}} — {{exp}} exp',

	'What does it look like?': 'Com o que ele se parece?',
	'Draw another': 'Sortear outro',
	'Pick an outfit…': 'Escolher um outfit…',
	'Pick a corpse…': 'Escolher um corpo…',
	'No client is open, so there is nothing to draw — the outfit is an id, and the server will resolve it.':
		'Nenhum cliente está aberto, então não há o que sortear — o outfit é um id, e o servidor vai resolvê-lo.',
	'The outfit is one no monster in this corpus wears. The corpse is a donor’s, so the item database can resolve it.':
		'O outfit é um que nenhum monstro deste corpus usa. O corpo é de um doador, então a base de itens consegue resolvê-lo.',

	'What is it called?': 'Como ele se chama?',
	Classic: 'Clássico',
	'Corpus style': 'Estilo do corpus',
	'Drawn from the generator’s own word tables.': 'Sorteado das tabelas de palavras do próprio gerador.',
	'Built from the names this corpus already uses.': 'Montado a partir dos nomes que este corpus já usa.',
	'Hide file and group': 'Ocultar arquivo e grupo',
	'File and group': 'Arquivo e grupo',

	'How much is a kill worth?': 'Quanto vale matá-lo?',
	'This corpus has no experience bands to draw from — type the figures yourself.':
		'Este corpus não tem faixas de experiência para sortear — digite os números você mesmo.',
	'{{count}} monsters — too few to draw a norm from_one': '{{count}} monstro — poucos demais para tirar uma norma',
	'{{count}} monsters — too few to draw a norm from_other':
		'{{count}} monstros — poucos demais para tirar uma norma',
	'Read off the band at its {{p}}th percentile.': 'Lido da faixa no percentil {{p}}.',
	'Draw again': 'Sortear de novo',

	'How does it attack?': 'Como ele ataca?',
	'What attacks can it use?': 'Que ataques ele pode usar?',
	'Does it summon help?': 'Ele invoca ajuda?',
	'How many does it summon?': 'Quantos ele invoca?',
	'Nothing picked — it summons nothing, and the next question is skipped.':
		'Nada escolhido — ele não invoca nada, e a próxima pergunta é ignorada.',
	'Next: how many of each, how often, and with what effect.':
		'A seguir: quantos de cada, com que frequência e com qual efeito.',
	'On caster': 'No invocador',
	'Played on the summoner as it calls, rather than on what it called.':
		'Reproduzido no invocador ao chamar, e não no que foi invocado.',
	Effect: 'Efeito',
	'Pick effect': 'Escolher efeito',
	'Pick the monsters it calls for above.': 'Escolha acima os monstros que ele invoca.',
	'Fights in melee': 'Luta corpo a corpo',
	'Derived: ceil(skill × attack × 0.05 + attack × 0.5). The loader computes it, so there is no field for it.':
		'Derivado: ceil(skill × ataque × 0,05 + ataque × 0,5). O loader calcula, então não há campo para isso.',
	'max {{damage}}': 'máx. {{damage}}',
	'from {{name}}': 'de {{name}}',
	'A melee block is copied off a donor rather than composed, and nothing in this band has one to lend.':
		'Um bloco de corpo a corpo é copiado de um doador em vez de composto, e nada nesta faixa tem um para emprestar.',
	'no melee available': 'sem corpo a corpo disponível',
	Abilities: 'Habilidades',
	'A monster with only melee is a monster — this step is happy with none.':
		'Um monstro só com corpo a corpo é um monstro — esta etapa aceita nenhuma.',
	'No abilities yet.': 'Nenhuma habilidade ainda.',
	script: 'script',
	'Remove this ability': 'Remover esta habilidade',
	'Add an ability': 'Adicionar uma habilidade',
	'Nothing in this engine’s catalogue names client effect {{id}}.':
		'Nada no catálogo deste engine nomeia o efeito de cliente {{id}}.',

	'What does it drop, and how often?': 'O que ele dropa, e com que frequência?',
	'Nothing drops yet. Pick the items in the browser, then set the odds here.':
		'Nada dropa ainda. Escolha os itens no navegador e ajuste as chances aqui.',
	'Pick items…': 'Escolher itens…',
	'How many items a draw proposes': 'Quantos itens um sorteio propõe',
	items: 'itens',
	'Replaces the table with a fresh draw off the donors': 'Substitui a tabela por um novo sorteio dos doadores',
	'What does it drop?': 'O que ele dropa?',
	'Critters drop nothing. Add loot in the editor if this one should.':
		'Bichos não dropam nada. Adicione loot no editor se este deveria dropar.',
	'No item database is open, so there is no way to tell a real item id from an invented one. Add loot in the editor.':
		'Nenhuma base de itens está aberta, então não há como distinguir um id de item real de um inventado. Adicione loot no editor.',

	// The review rail. These three trail a figure — "300 hp · 200 de velocidade"
	// — so they carry the preposition the number needs.
	'(unnamed)': '(sem nome)',
	speed: 'de velocidade',
	armor: 'de armadura',
	defense: 'de defesa',
	exp: 'exp',
	'Drawn from': 'Sorteado de',
	stats: 'atributos',
	'similar to': 'parecido com',
	donors: 'doadores',
	look: 'aparência',
	'unused outfit {{id}}': 'outfit {{id}} não usado',
	'No lint findings': 'Nenhum apontamento',

	// The lead donor, the inference and the two steps that came out of them.
	'Nothing named, so nothing is drawn from a family — the wizard falls back to the whole {{kind}} pool.':
		'Nada indicado, então nada é tirado de uma família — o assistente volta para todo o grupo do tipo “{{kind}}”.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._one':
		'Tudo vem de {{lead}}.',
	'The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}._other':
		'A faixa, as resistências, o corpo a corpo e os drops vêm dos {{count}}; o outfit, o corpo e a raça vêm de {{lead}}.',
	'Most like this one': 'Mais parecido com este',
	'Make this the one it is most like': 'Tornar este o mais parecido',
	'The monsters you named have changed since you edited {{what}}.':
		'Os monstros que você indicou mudaram desde que você editou {{what}}.',
	'Use theirs': 'Usar o deles',
	'Keep mine': 'Manter o meu',
	'the outfit': 'o outfit',
	'the corpse': 'o corpo',
	'the melee': 'o corpo a corpo',
	'the resistances': 'as resistências',
	'the voices': 'as falas',
	'the summons': 'as invocações',

	'Draw another colouring': 'Sortear outras cores',
	'{{name}}’s, recoloured': 'de {{name}}, recolorido',
	'{{name}}’s': 'de {{name}}',
	'drawn, recoloured': 'sorteado, recolorido',
	'The outfit, the corpse and the race all come off {{lead}}, because a body from one monster over another’s corpse is a pair this corpus never writes.':
		'O outfit, o corpo e a raça vêm todos de {{lead}}, porque o corpo de um monstro sobre o cadáver de outro é um par que este corpus nunca escreve.',
	'Nothing named to copy from, so the outfit is one no monster in this corpus wears.':
		'Nada indicado para copiar, então o outfit é um que nenhum monstro deste corpus usa.',

	'No attacks yet.': 'Nenhum ataque ainda.',
	'Remove this attack': 'Remover este ataque',
	'Add an attack': 'Adicionar um ataque',
	'Calls for help': 'Chama ajuda',
	'Nothing in this corpus summons anything — name one yourself below.':
		'Nada neste corpus invoca nada — indique um você mesmo abaixo.',
	'Summons other monsters': 'Invoca outros monstros',
	'{{count}} monster summons it_one': '{{count}} monstro o invoca',
	'{{count}} monster summons it_other': '{{count}} monstros o invocam',
	'Monster name': 'Nome do monstro',
	'No monster with this name is registered — the server summons nothing and says nothing.':
		'Nenhum monstro com este nome está registrado — o servidor não invoca nada e não avisa nada.',
	'at once': 'de uma vez',
	'How many of this one may be alive at once': 'Quantos deste podem estar vivos ao mesmo tempo',
	'Chance the summon fires on each attempt': 'Chance de a invocação sair em cada tentativa',
	'How often it tries, in milliseconds': 'Com que frequência ele tenta, em milissegundos',
	yours: 'sua',
	'Total across all entries — zero means it never summons, whatever the rows say.':
		'Total de todas as entradas — zero significa que ele nunca invoca, digam o que disserem as linhas.',
	'Add a summon': 'Adicionar uma invocação',

	'How tough is it to hurt?': 'Quão difícil é feri-lo?',
	'How does it protect itself?': 'Como ele se protege?',
	'Name a monster or two on the second step and this fills itself in.':
		'Indique um monstro ou dois na segunda etapa e isto se preenche sozinho.',
	'100 resists everything — an immunity. Negative takes extra damage.':
		'100 resiste a tudo — é imunidade. Negativo recebe dano extra.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._one':
		'O que {{count}} monstro indicado resiste. 100 é imunidade; negativo recebe extra.',
	'The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra._other':
		'O meio do que os {{count}} monstros indicados resistem. 100 é imunidade; negativo recebe extra.',
	'Read them again': 'Ler de novo',
	'Healing, haste, invisibility — what it does to stay alive. None is a valid answer.':
		'Cura, haste, invisibilidade — o que ele faz para continuar vivo. Nenhuma é uma resposta válida.',
	'No defenses yet.': 'Nenhuma defesa ainda.',
	'Remove this defense': 'Remover esta defesa',
	'Add a defense': 'Adicionar uma defesa',

	'Does it have anything to say?': 'Ele tem algo a dizer?',
	'None of the monsters you named says anything — write a line yourself below.':
		'Nenhum dos monstros que você indicou diz nada — escreva uma fala você mesmo abaixo.',
	'It speaks': 'Ele fala',
	'{{count}} of them say it_one': '{{count}} deles diz isso',
	'{{count}} of them say it_other': '{{count}} deles dizem isso',
	'Add a line': 'Adicionar uma fala',
	'Nothing drawn to start from — anything you write here is the whole pool.':
		'Nada sorteado para começar — o que você escrever aqui é todo o conjunto.',
	'Lines two of them share arrive ticked. Anything naming its own speaker is left out.':
		'Falas que dois deles compartilham já vêm marcadas. Qualquer uma que cite o próprio falante fica de fora.',
	'This engine reads no interval or chance on voices, so there is nothing to set.':
		'Este engine não lê intervalo nem chance nas falas, então não há o que ajustar.',

	'Drops like nothing in particular.': 'Não dropa como nada em particular.',
	'Drops like {{names}}': 'Dropa como {{names}}',
	'Drops like something else…': 'Dropa como outra coisa…',
	'Same as before': 'Igual a antes',
	'How many items a draw proposes — as many as the monsters above drop':
		'Quantos itens um sorteio propõe — tantos quantos os monstros acima dropam',

	'look, corpse, race': 'aparência, corpo, raça',
	'resistances, melee': 'resistências, corpo a corpo',
	drops: 'drops',

	Back: 'Voltar',
	'Create blank': 'Criar vazio',
	Next: 'Avançar',
	'Creating…': 'Criando…',
	'Create monster': 'Criar monstro',
	'Draw everything again': 'Sortear tudo de novo',
	'Only {{filter}} — click to exclude instead': 'Apenas {{filter}} — clique para excluir em vez disso',
	'Excluding {{filter}} — click to clear': 'Excluindo {{filter}} — clique para limpar',
	'Only {{filter}}; click twice to exclude it': 'Apenas {{filter}}; clique duas vezes para excluí-lo',
	Boss: 'Boss',
	Summonable: 'Invocável',
	'Has loot': 'Tem loot',
	Unregistered: 'Não registrado',
	'Has lints': 'Tem apontamentos',
	'Has errors': 'Tem erros',
	'Missing raceid': 'Sem raceid',
	Kind: 'Tipo',
	Status: 'Situação',
	Race: 'Raça',
	Species: 'Espécie',

	// --- Lint drawer -------------------------------------------------------------------
	Errors: 'Erros',
	Warnings: 'Avisos',
	Silent: 'Silenciosos',
	errors: 'erros',
	warnings: 'avisos',
	'silent findings': 'achados silenciosos',
	'Show errors': 'Mostrar erros',
	'Show warnings': 'Mostrar avisos',
	'Show silent findings': 'Mostrar achados silenciosos',
	'Review every automatic fix for this monster':
		'Revisar todas as correções automáticas deste monstro',
	'Review every automatic fix across the corpus before it is written':
		'Revisar todas as correções automáticas em todo o corpus antes de gravá-las',
	'Close lints': 'Fechar apontamentos',
	'No problems found.': 'Nenhum problema encontrado.',
	'Nothing matches the current filter.': 'Nada corresponde ao filtro atual.',
	'Jump to {{path}}': 'Ir para {{path}}',
	'Apply the fix': 'Aplicar a correção',
	Fix: 'Corrigir',
	'Ignore {{code}} everywhere': 'Ignorar {{code}} em todo lugar',
	'Copy code': 'Copiar código',
	'Hide lints': 'Ocultar apontamentos',
	'Show lints': 'Mostrar apontamentos',
	'No lints': 'Sem apontamentos',
	'{{code}} needs a manual fix': '{{code}} precisa de correção manual',
	'{{file}} has unsaved changes — save it first': '{{file}} tem alterações não salvas — salve primeiro',
	'Fixed {{code}} in {{file}}': '{{code}} corrigido em {{file}}',
	'Ignoring {{code}} — restore it from the Linter menu':
		'Ignorando {{code}} — restaure pelo menu Linter',
	'Nothing here has an automatic fix': 'Nada aqui tem correção automática',

	// --- Prévia das correções -----------------------------------------------------------
	'Review fixes': 'Revisar correções',
	'Show the diff': 'Mostrar as diferenças',
	'Hide the diff': 'Ocultar as diferenças',
	'Rendering…': 'Renderizando…',
	'No change to the file.': 'Nenhuma alteração no arquivo.',
	'Fixing…': 'Corrigindo…',
	manual: 'manual',
	'{{count}} fix_one': '{{count}} correção',
	'{{count}} fix_other': '{{count}} correções',
	'Apply {{count}} fix_one': 'Aplicar {{count}} correção',
	'Apply {{count}} fix_other': 'Aplicar {{count}} correções',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._one':
		'{{count}} correção em {{files}} — expanda um arquivo para ver exatamente o que muda.',
	'{{count}} fix in {{files}} — expand a file to see exactly what changes._other':
		'{{count}} correções em {{files}} — expanda um arquivo para ver exatamente o que muda.',
	'{{count}} needs a manual fix and is left alone._one':
		'{{count}} precisa de correção manual e fica intacta.',
	'{{count}} needs a manual fix and is left alone._other':
		'{{count}} precisam de correção manual e ficam intactas.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._one':
		'{{count}} arquivo tem alterações não salvas e ficou de fora — salve-o primeiro. Primeiro: {{list}}.',
	'{{count}} file has unsaved changes and is left out — save it first. First: {{list}}._other':
		'{{count}} arquivos têm alterações não salvas e ficaram de fora — salve-os primeiro. Primeiros: {{list}}.',
	'{{count}} unchanged line_one': '{{count}} linha inalterada',
	'{{count}} unchanged line_other': '{{count}} linhas inalteradas',
	'Could not store the cut-off point': 'Não foi possível armazenar o ponto de corte',

	// --- Browsers -----------------------------------------------------------------------
	'Search id (e.g. 2400 or 100-250) or name': 'Buscar id (ex.: 2400 ou 100-250) ou nome',
	'Search server id or name': 'Buscar id do servidor ou nome',
	'Search client id or name': 'Buscar id do cliente ou nome',
	'Filter the grid': 'Filtrar a grade',
	Filter: 'Filtro',
	'Clear filter search': 'Limpar busca de filtros',
	Animate: 'Animar',
	'Zoom out': 'Diminuir zoom',
	'Zoom in': 'Aumentar zoom',
	Favourite: 'Favorito',
	'No {{what}}.': 'Sem {{what}}.',
	'nothing to display': 'nada para exibir',

	// --- Item filters --------------------------------------------------------------------
	Special: 'Especial',
	Weapons: 'Armas',
	Slot: 'Slot',
	Properties: 'Propriedades',
	Size: 'Tamanho',
	Features: 'Características',
	Favourites: 'Favoritos',
	Pickupable: 'Coletável',
	'Show corpses': 'Mostrar corpos',
	'Show corpses with decay': 'Mostrar corpos que se decompõem',
	'Not dropped by any monster': 'Não dropado por nenhum monstro',
	Stackable: 'Empilhável',
	Container: 'Contêiner',
	'Weapon (any)': 'Arma (qualquer)',
	Shield: 'Escudo',
	Ammunition: 'Munição',
	Rune: 'Runa',
	'Fluid container': 'Recipiente de fluido',
	Sword: 'Espada',
	Club: 'Clava',
	Axe: 'Machado',
	Distance: 'Distância',
	Wand: 'Varinha',
	Helmet: 'Elmo',
	'Armor (body)': 'Armadura (corpo)',
	Legs: 'Perneiras',
	Boots: 'Botas',
	Ring: 'Anel',
	Necklace: 'Colar',
	Trinket: 'Berloque',
	'Backpack slot': 'Slot de mochila',
	'Two-handed': 'Duas mãos',
	'Has attack': 'Tem ataque',
	'Has defense': 'Tem defesa',
	'Has armor': 'Tem armadura',
	'Speed bonus': 'Bônus de velocidade',
	'Has charges': 'Tem cargas',
	Decays: 'Se decompõe',
	Writable: 'Gravável',
	'Blocks projectiles': 'Bloqueia projéteis',
	'Field (fire/energy/…)': 'Campo (fogo/energia/…)',
	'Has worth': 'Tem valor',
	'Has description': 'Tem descrição',
	'Ambiguous name': 'Nome ambíguo',
	Animated: 'Animado',
	'32×32': '32×32',
	'64×64': '64×64',
	'64×32 / 32×64': '64×32 / 32×64',
	Directional: 'Direcional',
	'Single direction': 'Direção única',
	'Has addons': 'Tem addons',
	'Has mount variant': 'Tem variante de montaria',
	Colourable: 'Colorível',

	// --- Item tooltips and context menus ------------------------------------------------------
	'{{weight}} oz': '{{weight}} oz',
	'worth {{worth}} gp': 'vale {{worth}} gp',
	'decays in {{seconds}}s': 'decompõe em {{seconds}}s',
	'Used by…': 'Usado por…',
	'Used by — {{item}}': 'Usado por — {{item}}',
	'Scanning the corpus…': 'Varrendo o corpus…',
	'No monster references this item.': 'Nenhum monstro referencia este item.',
	'Dropped as loot': 'Dropado como loot',
	'Corpse of': 'Corpo de',
	'Worn as typeex': 'Usado como typeex',
	'Scale drop chance…': 'Escalar chance de drop…',
	'Save the open monster first': 'Salve primeiro o monstro aberto',
	'Copy id {{id}}': 'Copiar id {{id}}',
	'Copy name': 'Copiar nome',
	'Copied {{value}}': '{{value}} copiado',
	'Copied “{{value}}”': '“{{value}}” copiado',
	'Set as corpse for {{monster}}': 'Definir como corpo de {{monster}}',
	'Set as outfit (typeex) for {{monster}}': 'Definir como outfit (typeex) de {{monster}}',
	'Set as outfit for {{monster}}': 'Definir como outfit de {{monster}}',
	'Outfit of {{monster}} set to {{outfit}}': 'Outfit de {{monster}} definido como {{outfit}}',
	'Outfit (typeex) of {{monster}} set to {{item}}':
		'Outfit (typeex) de {{monster}} definido como {{item}}',
	'Corpse of {{monster}} set to {{item}}': 'Corpo de {{monster}} definido como {{item}}',
	'Set {{thing}} as the effect for…': 'Definir {{thing}} como o efeito de…',
	'Set {{thing}} as the missile for…': 'Definir {{thing}} como o projétil de…',
	'This effect has no XML name — it cannot be used from a monster file.':
		'Este efeito não tem nome XML — não pode ser usado a partir de um arquivo de monstro.',
	'This missile has no XML name — it cannot be used from a monster file.':
		'Este projétil não tem nome XML — não pode ser usado a partir de um arquivo de monstro.',
	'No monster open.': 'Nenhum monstro aberto.',
	'{{monster}} has no spells that take effects.': '{{monster}} não tem magias que aceitem efeitos.',
	'Effect of {{spell}} set to {{effect}}': 'Efeito de {{spell}} definido como {{effect}}',
	'Missile of {{spell}} set to {{effect}}': 'Projétil de {{spell}} definido como {{effect}}',
	'{{spell}} (attack)': '{{spell}} (ataque)',
	'{{spell}} (defense)': '{{spell}} (defesa)',
	unnamed: 'sem nome',
	spell: 'magia',

	// --- Loot tray -----------------------------------------------------------------------------
	'Right-click selected items above to add them here.':
		'Clique com o botão direito nos itens selecionados acima para adicioná-los aqui.',
	'Add loot': 'Adicionar loot',
	'Add loot to {{monster}}': 'Adicionar loot a {{monster}}',
	'Clear the Loot section': 'Limpar a seção Loot',
	Clear: 'Limpar',
	'Clear loot': 'Limpar loot',
	'Save this tray under a name': 'Salvar esta bandeja com um nome',
	'Save preset': 'Salvar conjunto',
	'No presets saved yet': 'Nenhum conjunto salvo ainda',
	'Load a preset into the tray': 'Carregar um conjunto na bandeja',
	'No presets': 'Sem conjuntos',
	'Delete a preset': 'Excluir um conjunto',
	'Save loot preset': 'Salvar conjunto de loot',
	'An existing name is overwritten.': 'Um nome existente é sobrescrito.',
	'Loot presets': 'Conjuntos de loot',
	'Load into the tray': 'Carregar na bandeja',
	Load: 'Carregar',
	'Delete “{{name}}”': 'Excluir “{{name}}”',
	'No presets left.': 'Não restam conjuntos.',
	Done: 'Concluído',
	'Saved “{{name}}” — {{items}}': '“{{name}}” salvo — {{items}}',

	// --- Preferences ------------------------------------------------------------------------------
	'Applies immediately. Only the interface is translated — monster data, item names and engine values are left exactly as the server writes them.':
		'Aplica-se imediatamente. Apenas a interface é traduzida — dados de monstros, nomes de itens e valores da engine ficam exatamente como o servidor os grava.',
	'Open a monster on': 'Abrir um monstro em',
	'Jumped to without animation, every time a monster is opened or a tab is activated.':
		'Salta sem animação, toda vez que um monstro é aberto ou uma aba é ativada.',
	Tabs: 'Abas',
	'A hidden tab keeps its data — the file is written whole either way. {{tab}} is hidden by default.':
		'Uma aba oculta mantém seus dados — o arquivo é gravado por inteiro de qualquer forma. {{tab}} fica oculta por padrão.',
	'Restore defaults': 'Restaurar padrões',

	// --- Hotkeys -----------------------------------------------------------------------------------
	Hotkeys: 'Atalhos',
	'Click a slot, then press the keys. {{cancel}} cancels, {{clear}} clears. Every command takes a primary and a secondary binding.':
		'Clique num campo e depois pressione as teclas. {{cancel}} cancela, {{clear}} limpa. Todo comando aceita um atalho principal e um secundário.',
	'Taken from “{{command}}”.': 'Tomado de “{{command}}”.',
	'Search commands': 'Buscar comandos',
	Primary: 'Principal',
	Secondary: 'Secundário',
	'Set the primary hotkey': 'Definir o atalho principal',
	'Set the secondary hotkey': 'Definir o atalho secundário',
	'Press a key — Esc cancels, Backspace clears':
		'Pressione uma tecla — Esc cancela, Backspace limpa',
	'Press a key…': 'Pressione uma tecla…',
	'Back to the default binding': 'Voltar ao atalho padrão',
	'No command matches.': 'Nenhum comando corresponde.',
	'Reset all': 'Redefinir tudo',

	// --- Quick open ----------------------------------------------------------------------------------
	'No monster matches.': 'Nenhum monstro corresponde.',
	move: 'navegar',
	open: 'abrir',
	close: 'fechar',

	// --- Compare -------------------------------------------------------------------------------------
	'Compare monsters': 'Comparar monstros',
	'Swap sides': 'Trocar os lados',
	'Reading both monsters…': 'Lendo os dois monstros…',
	'These two agree on every field MONx models.':
		'Estes dois coincidem em todos os campos que o MONx modela.',
	'Differences only': 'Apenas diferenças',
	'Nothing differs.': 'Nada difere.',
	yes: 'sim',
	no: 'não',
	Identity: 'Identidade',
	Combat: 'Combate',
	Flags: 'Flags',
	Immunities: 'Imunidades',
	Elements: 'Elementos',
	Attacks: 'Ataques',
	Defenses: 'Defesas',
	Loot: 'Loot',
	Summons: 'Invocações',
	Voices: 'Falas',
	Blood: 'Sangue',
	'Race id': 'Race id',
	'Race id (raceId)': 'Race id (raceId)',
	Registered: 'Registrado',
	'Max summons': 'Máx. de invocações',
	'Pacifist line': 'Fala de pacifista',
	'Leash line': 'Fala de coleira',
	Lines: 'Falas',

	// --- Sections ---------------------------------------------------------------------------------------
	Look: 'Aparência',
	Bestiary: 'Bestiário',
	'Target strategy': 'Estratégia de alvo',
	Resistances: 'Resistências',
	'Pacifist & Events': 'Pacifista e eventos',
	attacks: 'ataques',
	defenses: 'defesas',
	resistances: 'resistências',
	loot: 'entradas de loot',
	summons: 'invocações',
	voices: 'falas',
	'Copy this monster’s {{block}}': 'Copiar {{block}} deste monstro',
	'No {{block}} copied': 'Nenhum {{block}} copiado',
	'That {{block}} block could not be read': 'Não foi possível ler o bloco de {{block}}',

	// --- Identity -----------------------------------------------------------------------------------------
	Description: 'Descrição',
	'defaults to “a {{name}}”': 'o padrão é “a {{name}}”',
	'Shown when a player looks at the monster. Include the article yourself.':
		'Exibido quando um jogador olha o monstro. Inclua o artigo você mesmo.',
	'Editor metadata only — the server never reads it. Used here for grouping.':
		'Apenas metadados do editor — o servidor nunca lê isto. Usado aqui para agrupar.',
	Experience: 'Experiência',
	'raw XP, before rateExp · {{souls}}': 'XP bruto, antes de rateExp · {{souls}}',
	Speed: 'Velocidade',
	immobile: 'imóvel',
	'Mana cost': 'Custo de mana',
	'Summonable or convinceable with no mana cost — the loader warns about this.':
		'Invocável ou convencível sem custo de mana — o loader avisa sobre isso.',
	'Mana to summon or convince this monster.': 'Mana para invocar ou convencer este monstro.',
	'next free: {{id}}': 'próximo livre: {{id}}',
	'Another monster already uses this raceid.': 'Outro monstro já usa este raceid.',
	'Use {{id}}': 'Usar {{id}}',
	'Controls blood splash, corpse decay and undead checks.':
		'Controla a poça de sangue, a decomposição do corpo e as checagens de morto-vivo.',
	Skull: 'Caveira',
	Script: 'Script',
	'A .lua file in monster/scripts/ providing onThink, onCreatureAppear and friends.':
		'Um arquivo .lua em monster/scripts/ fornecendo onThink, onCreatureAppear e afins.',

	// --- Look ------------------------------------------------------------------------------------------------
	'item {{id}}': 'item {{id}}',
	'type {{id}}': 'type {{id}}',
	'typeex {{id}}': 'typeex {{id}}',
	'raceid {{id}}': 'raceid {{id}}',
	Mode: 'Modo',
	'The parser takes type first; the two are mutually exclusive.':
		'O parser considera type primeiro; os dois são mutuamente exclusivos.',
	'Outfit (type)': 'Outfit (type)',
	'A client outfit with colours and addons': 'Um outfit do cliente com cores e addons',
	'Item (typeex)': 'Item (typeex)',
	'An item used as the body — statues, fires, spinning swords':
		'Um item usado como corpo — estátuas, fogueiras, espadas girando',
	Item: 'Item',
	'Browse the Items grid, then right-click one to set it as the outfit':
		'Navegue pela grade de Itens e clique com o botão direito em um para defini-lo como outfit',
	'Select item': 'Selecionar item',
	Outfit: 'Outfit',
	'Under {{attr}} the engine ignores head, body, legs, feet and addons entirely. They are kept in the file but have no effect.':
		'Sob {{attr}} a engine ignora completamente head, body, legs, feet e addons. Eles permanecem no arquivo, mas não têm efeito.',
	Colours: 'Cores',
	Head: 'Cabeça',
	Body: 'Corpo',
	Feet: 'Pés',
	'{{part}} colour {{value}}': '{{part}} — cor {{value}}',
	Addons: 'Addons',
	First: 'Primeiro',
	Second: 'Segundo',
	Mount: 'Montaria',
	'Read in both modes.': 'Lido nos dois modos.',
	Corpse: 'Corpo',
	'Corpse item': 'Item do corpo',
	'no corpse': 'sem corpo',
	'Browse the Items grid filtered to corpses, then right-click one to set it':
		'Navegue pela grade de Itens filtrada por corpos e clique com o botão direito em um para defini-lo',
	'Select corpse': 'Selecionar corpo',
	'No corpse': 'Sem corpo',
	'Corpse action id': 'Action id do corpo',
	'Ironcore — stamped on the corpse so quest scripts can hook it. Only applied when non-zero.':
		'Ironcore — gravado no corpo para que scripts de quest possam se conectar. Aplicado apenas quando diferente de zero.',
	Health: 'Vida',
	'Max health': 'Vida máxima',
	'Lock now to max': 'Travar now no máximo',
	'Allow a damaged-on-spawn monster': 'Permitir um monstro ferido ao nascer',
	'damaged on spawn': 'ferido ao nascer',
	locked: 'travado',
	'Health on spawn': 'Vida ao nascer',
	'Above max — the loader clamps it down and warns. Shown as written.':
		'Acima do máximo — o loader reduz o valor e avisa. Exibido como está escrito.',

	// --- Combat -----------------------------------------------------------------------------------------------
	'armor {{armor}} · defense {{defense}}': 'armadura {{armor}} · defesa {{defense}}',
	Behaviour: 'Comportamento',
	'Pushing and movement': 'Empurrar e movimento',
	Terrain: 'Terreno',
	'Pacifist (Ironcore)': 'Pacifista (Ironcore)',
	'{{note}} (Ironcore)': '{{note}} (Ironcore)',
	'“Pushes creatures” forces “pushable by players” off at load — the value written here will not survive.':
		'“Empurra criaturas” força “empurrável por jogadores” a ficar desligado no carregamento — o valor gravado aqui não sobrevive.',
	'Target change': 'Troca de alvo',
	Interval: 'Intervalo',
	ms: 'ms',
	'Milliseconds between target-reselection rolls.':
		'Milissegundos entre as rolagens de reescolha de alvo.',
	Chance: 'Chance',
	'Zero disables retargeting entirely, and also the step-aside behaviour in onWalk.':
		'Zero desativa a troca de alvo por completo, e também o desvio lateral em onWalk.',
	Melee: 'Corpo a corpo',
	'On this engine melee lives on <attacks>, not in a spell block. Both skill and attack are needed.':
		'Nesta engine o corpo a corpo fica em <attacks>, não num bloco de magia. Tanto skill quanto attack são necessários.',
	Skill: 'Skill',
	Attack: 'Ataque',
	'Max damage': 'Dano máximo',
	derived: 'derivado',
	Poison: 'Veneno',
	'optional, on hit': 'opcional, ao acertar',
	'Defense stats': 'Estatísticas de defesa',
	'Armor reduces melee and physical hits; defense is only consulted on hits that check it, i.e. melee.':
		'A armadura reduz golpes corpo a corpo e físicos; a defesa só é consultada em golpes que a verificam, ou seja, corpo a corpo.',
	Armor: 'Armadura',
	Defense: 'Defesa',
	'Show pacifist system (Ironcore)': 'Mostrar sistema pacifista (Ironcore)',
	'Hide pacifist system (Ironcore)': 'Ocultar sistema pacifista (Ironcore)',
	'A dormant monster that only fights back once struck. The sub-flags do nothing without Pacifist.':
		'Um monstro dormente que só revida depois de ser atingido. As sub-flags não fazem nada sem o Pacifista.',
	'Pacifist forces {{flag}} to 0 during load — writing both as 1 will not survive.':
		'O Pacifista força {{flag}} para 0 durante o carregamento — gravar ambos como 1 não sobrevive.',

	// --- Resistances -----------------------------------------------------------------------------------------------
	Normal: 'Normal',
	Immune: 'Imune',
	Percent: 'Percentual',
	'Bundles the matching condition immunity too': 'Inclui também a imunidade de condição correspondente',
	'takes 0 — and the matching condition too': 'recebe 0 — e a condição correspondente também',
	'Condition immunities': 'Imunidades a condições',
	'These have no element equivalent — the only way to grant them is here.':
		'Estas não têm equivalente elemental — a única forma de concedê-las é aqui.',
	'Apply the usual set': 'Aplicar o conjunto usual',
	'Can see invisible creatures': 'Enxerga criaturas invisíveis',
	'Positive resists, negative takes extra. Element percent is applied after armour, and magic penetration eats into positive values for energy, fire, earth, ice, holy and death only.':
		'Positivo resiste, negativo recebe dano extra. O percentual elemental é aplicado depois da armadura, e a penetração mágica consome valores positivos apenas para energia, fogo, terra, gelo, sagrado e morte.',
	Physical: 'Físico',
	Energy: 'Energia',
	Earth: 'Terra',
	Fire: 'Fogo',
	Ice: 'Gelo',
	Holy: 'Sagrado',
	Death: 'Morte',
	Drown: 'Afogamento',
	'Life drain': 'Dreno de vida',
	'Mana drain': 'Dreno de mana',

	// --- Loot --------------------------------------------------------------------------------------------------------
	'Select for delete / scale': 'Selecionar para excluir / escalar',
	'Hide details': 'Ocultar detalhes',
	'Show subtype, action id and text': 'Mostrar subtype, action id e texto',
	'id {{id}}': 'id {{id}}',
	unresolved: 'não resolvido',
	'This name belongs to more than one item, so the server drops the entry. Pin it to a single id.':
		'Este nome pertence a mais de um item, então o servidor descarta a entrada. Fixe-a em um único id.',
	'ambiguous — pin id': 'ambíguo — fixe o id',
	'Hard maximum 100 — a larger value makes the server drop the whole entry':
		'Máximo rígido de 100 — um valor maior faz o servidor descartar a entrada inteira',
	Remove: 'Remover',
	Subtype: 'Subtipo',
	'fluid, charges': 'fluido, cargas',
	'Action id': 'Action id',
	'Spelled actionId — the lower-case spelling is silently ignored by the server.':
		'Escrito actionId — a grafia em minúsculas é silenciosamente ignorada pelo servidor.',
	Text: 'Texto',
	Comment: 'Comentário',
	'Written after the entry as an XML comment. Set to the item name when the entry is added by id.':
		'Gravado após a entrada como um comentário XML. Definido com o nome do item quando a entrada é adicionada por id.',
	'Drop an item onto this row to nest it inside the container.':
		'Solte um item nesta linha para aninhá-lo dentro do contêiner.',
	'Simulate a hunting session over this loot — runs on the unsaved buffer':
		'Simular uma sessão de caça sobre este loot — roda sobre o buffer não salvo',
	'Simulate…': 'Simular…',
	'No loot. Drop items here from the Items browser.':
		'Sem loot. Solte itens aqui a partir do navegador de Itens.',
	'Scale chances to': 'Escalar chances para',
	Apply: 'Aplicar',
	'Clear selection': 'Limpar seleção',
	'Search items…': 'Buscar itens…',
	'Add item': 'Adicionar item',
	'Rarest last': 'Mais raros por último',
	'Sort by chance': 'Ordenar por chance',
	'Chance is out of 100,000 in the file; shown here as a percent.':
		'A chance é sobre 100.000 no arquivo; exibida aqui como percentual.',
	never: 'nunca',
	always: 'sempre',
	'1 in {{odds}}': '1 em {{odds}}',
	entry: 'entrada',

	// --- Summons ------------------------------------------------------------------------------------------------------
	'Summons never drop loot and never grant experience.':
		'Invocações nunca dropam loot nem concedem experiência.',
	'Max live summons': 'Máx. de invocações vivas',
	'Zero means the monster can never summon, whatever the entries below say.':
		'Zero significa que o monstro nunca pode invocar, independentemente do que digam as entradas abaixo.',
	'Total across all entries, clamped to 100.': 'Total de todas as entradas, limitado a 100.',
	'No summons. Drag a monster here from the list.':
		'Sem invocações. Arraste um monstro da lista até aqui.',
	'No monster with this name is registered — the server does not check this, so at runtime it silently summons nothing.':
		'Nenhum monstro com este nome está registrado — o servidor não verifica isso, então em tempo de execução ele silenciosamente não invoca nada.',
	Max: 'Máx.',
	'Per-entry cap; inherits the section maximum when absent.':
		'Limite por entrada; herda o máximo da seção quando ausente.',
	'Force placement': 'Forçar posicionamento',
	'Ironcore — places the summon even on an occupied or blocked tile':
		'Ironcore — posiciona a invocação mesmo em um quadro ocupado ou bloqueado',
	'Effect at the summon': 'Efeito no invocado',
	'Defaults to a teleport effect.': 'O padrão é um efeito de teleporte.',
	'Effect at the summoner': 'Efeito no invocador',
	'A casting telegraph on the summoner’s own tile.':
		'Um aviso de conjuração no próprio quadro do invocador.',
	'(default teleport)': '(teleporte padrão)',
	'Add summon': 'Adicionar invocação',

	// --- Voices --------------------------------------------------------------------------------------------------------
	'{{seconds}} s': '{{seconds}} s',
	'Silent monster — nothing will ever be said.': 'Monstro silencioso — nada será dito jamais.',
	'≈ {{rate}} voices per minute — a {{chance}}% roll every {{interval}}.':
		'≈ {{rate}} falas por minuto — uma rolagem de {{chance}}% a cada {{interval}}.',
	'No voice lines.': 'Sem falas.',
	'What it says': 'O que ele diz',
	Yell: 'Grito',
	'Heard further away; conventionally written in upper case':
		'Ouvido de mais longe; por convenção escrito em maiúsculas',
	'Add line': 'Adicionar fala',

	// --- Pacifist & events ------------------------------------------------------------------------------------------------
	'{{pacifist}} pacifist · {{events}} events': '{{pacifist}} pacifista · {{events}} eventos',
	'Pacifist lines (Ironcore)': 'Falas de pacifista (Ironcore)',
	'Said once when it wakes, and when it walks past its leash radius. Neither is part of the random voice pool.':
		'Dito uma vez ao acordar, e ao ultrapassar o raio da coleira. Nenhum dos dois faz parte do conjunto aleatório de falas.',
	'Only spoken by a pacifist monster — turn Pacifist on in Combat, or these never fire.':
		'Dito apenas por um monstro pacifista — ative o Pacifista em Combate, ou estas nunca disparam.',
	'On waking': 'Ao acordar',
	'Said when first attacked': 'Dito ao ser atacado pela primeira vez',
	'On leashing': 'Ao voltar à coleira',
	'Said when it walks too far': 'Dito quando se afasta demais',
	'Creature events': 'Eventos de criatura',
	'Registered from creaturescripts — onKill, onDeath, onPrepareDeath and friends. Not the same thing as the monster script in Identity. Names are not checked: what registers them is Lua, which MONx cannot see.':
		'Registrados a partir de creaturescripts — onKill, onDeath, onPrepareDeath e afins. Não é a mesma coisa que o script do monstro em Identidade. Os nomes não são verificados: quem os registra é o Lua, que o MONx não enxerga.',
	'No events registered.': 'Nenhum evento registrado.',
	EventName: 'NomeDoEvento',
	'Add event': 'Adicionar evento',

	// --- Bestiary ---------------------------------------------------------------------------------------------------------
	'no class': 'sem classe',
	'not tracked': 'não rastreado',
	'This monster has no bestiary entry.': 'Este monstro não tem entrada no bestiário.',
	'Add one': 'Adicionar uma',
	Class: 'Classe',
	Difficulty: 'Dificuldade',
	Occurrence: 'Ocorrência',
	Prowess: 'Proeza',
	Expertise: 'Perícia',
	Mastery: 'Maestria',
	'Charm points': 'Pontos de charm',
	Locations: 'Locais',

	// --- Target strategy -----------------------------------------------------------------------------------------------------
	'weights total 100': 'os pesos somam 100',
	'weights total {{total}}': 'os pesos somam {{total}}',
	Nearest: 'Mais próximo',
	'closest enemy': 'inimigo mais próximo',
	Weakest: 'Mais fraco',
	'lowest health': 'menor vida',
	'Most damage': 'Mais dano',
	'biggest threat so far': 'maior ameaça até agora',
	Random: 'Aleatório',
	'anyone in range': 'qualquer um no alcance',
	'The four weights add up to {{total}}. The server expects exactly 100 and complains on load.':
		'Os quatro pesos somam {{total}}. O servidor espera exatamente 100 e reclama no carregamento.',

	// --- Spells ---------------------------------------------------------------------------------------------------------------
	'No attacks — this monster cannot hurt anything.':
		'Sem ataques — este monstro não consegue ferir nada.',
	'No defenses.': 'Sem defesas.',
	'Add attack': 'Adicionar ataque',
	'Add defense': 'Adicionar defesa',
	Spell: 'Magia',
	'Watch this spell play out': 'Assistir a esta magia acontecer',
	Visualize: 'Visualizar',
	'{{spell}} — shadowed': '{{spell}} — sombreada',
	'A registered spell named “{{name}}” exists and wins the lookup — this no longer means {{spell}}.':
		'Existe uma magia registrada chamada “{{name}}” e ela vence a busca — isto já não significa {{spell}}.',
	'This name also exists as a built-in; the registered spell wins.':
		'Este nome também existe como embutido; a magia registrada vence.',
	'Identical to {{spell}} — two spellings of one spell.':
		'Idêntica a {{spell}} — duas grafias de uma mesma magia.',
	'Registered spell — the loader takes it from {{file}} and ignores geometry and effects. Only interval, chance, range, min and max still apply.':
		'Magia registrada — o loader a pega de {{file}} e ignora geometria e efeitos. Apenas interval, chance, range, min e max continuam valendo.',
	'Scripted spell — {{attr}} is ignored and the Lua file decides the behaviour.':
		'Magia por script — {{attr}} é ignorado e o arquivo Lua decide o comportamento.',
	'Ironcore tracks the cooldown per spell, so a long ultimate does not block the other attacks.':
		'O Ironcore controla o cooldown por magia, então um ultimate longo não bloqueia os outros ataques.',
	Delay: 'Atraso',
	'Read in place of chance — writing both means this one is ignored.':
		'Lido no lugar de chance — gravar os dois faz este ser ignorado.',
	'A non-melee spell without a chance logs a warning.':
		'Uma magia que não seja corpo a corpo sem chance registra um aviso.',
	Range: 'Alcance',
	tiles: 'quadros',
	'Forced to 1 for melee.': 'Forçado para 1 no corpo a corpo.',
	'Zero means line of sight only. Clamped to 22.':
		'Zero significa apenas linha de visão. Limitado a 22.',
	'Melee damage': 'Dano corpo a corpo',
	'Skill and attack replace min/max: max = ceil(skill × attack × 0.05 + attack × 0.5).':
		'Skill e attack substituem min/max: max = ceil(skill × attack × 0.05 + attack × 0.5).',
	'Skill factor': 'Fator de skill',
	'Per-level multiplier, in thousandths. Clamped up to 1000.':
		'Multiplicador por nível, em milésimos. Limitado a 1000.',
	'Next level at': 'Próximo nível em',
	'Hits needed for the next skill level.': 'Golpes necessários para o próximo nível de skill.',
	'Level step': 'Passo de nível',
	'Skill gained per level.': 'Skill ganho por nível.',
	'Poison cycles': 'Ciclos de veneno',
	'Adds a poison condition alongside any other.':
		'Adiciona uma condição de veneno junto de qualquer outra.',
	'Condition on hit': 'Condição ao acertar',
	'One condition per melee block — the loader takes the first it finds, in the order fire, poison, energy, drown, freeze, dazzle, curse, bleed.':
		'Uma condição por bloco corpo a corpo — o loader pega a primeira que encontrar, na ordem fire, poison, energy, drown, freeze, dazzle, curse, bleed.',
	'Damage per tick': 'Dano por tick',
	'Bleed ignores the value — the loader never reads it, so this produces a zero-damage bleed.':
		'O sangramento ignora o valor — o loader nunca o lê, então isso produz um sangramento sem dano.',
	Tick: 'Tick',
	'Per-tick damage above; this is the interval between ticks.':
		'Dano por tick acima; este é o intervalo entre os ticks.',
	'The loader swaps min and max when |min| > |max|. Write them in canonical order.':
		'O loader troca min e max quando |min| > |max|. Escreva-os na ordem canônica.',
	'Larger than the per-tick damage — the engine silently ignores it.':
		'Maior que o dano por tick — a engine ignora isso silenciosamente.',
	'Immediate damage on application.': 'Dano imediato ao aplicar.',
	'Fires along the monster’s facing': 'Dispara na direção em que o monstro está virado',
	'Filled circle': 'Círculo preenchido',
	'Hollow ring': 'Anel vazado',
	'Min damage': 'Dano mínimo',
	'Min healed': 'Cura mínima',
	'Max healed': 'Cura máxima',
	'Damage is negative.': 'O dano é negativo.',
	'Healing takes positive values.': 'A cura usa valores positivos.',
	Count: 'Contagem',
	'Required — a condition spell without it is rejected and never loads.':
		'Obrigatório — uma magia de condição sem isto é rejeitada e nunca carrega.',
	'First tick': 'Primeiro tick',
	Duration: 'Duração',
	'Speed change': 'Alteração de velocidade',
	'Leave blank to use a random min–max range instead.':
		'Deixe em branco para usar um intervalo aleatório mín–máx em vez disso.',
	Min: 'Mín',
	'A min of 0 with no speedchange is a hard error — the block fails to load.':
		'Um mín de 0 sem speedchange é um erro grave — o bloco não carrega.',
	'Defaults to min when absent.': 'O padrão é igual a mín quando ausente.',
	Variation: 'Variação',
	'Spread around the delta above.': 'Dispersão em torno do delta acima.',
	'Positive hastes and turns the spell non-aggressive — a self-buff that belongs in Defenses. Negative paralyses, and is clamped at −1000 (−100% speed).':
		'Positivo acelera e torna a magia não agressiva — um buff próprio que pertence às Defesas. Negativo paralisa, e é limitado a −1000 (−100% de velocidade).',
	'This one is positive but sits in Attacks.': 'Esta é positiva, mas está em Ataques.',
	Drunkenness: 'Embriaguez',
	'Default 25.': 'Padrão 25.',
	'The monster name is resolved at load time — an unknown name silently produces no condition at all.':
		'O nome do monstro é resolvido no carregamento — um nome desconhecido silenciosamente não produz condição alguma.',
	'Look like monster': 'Parecer com o monstro',
	'monster name': 'nome do monstro',
	'…or item id': '…ou id de item',
	Area: 'Área',
	'One shape only — if several are present the last one silently wins.':
		'Apenas uma forma — se houver várias, a última vence silenciosamente.',
	Length: 'Comprimento',
	'A beam forces the spell to fire in the facing direction.':
		'Um feixe força a magia a disparar na direção em que o monstro está virado.',
	Spread: 'Dispersão',
	'0 is a straight beam, 3 the classic wave.': '0 é um feixe reto, 3 é a onda clássica.',
	Radius: 'Raio',
	'Centre on the target': 'Centralizar no alvo',
	'Single target': 'Alvo único',
	Beam: 'Feixe',
	Projectile: 'Projétil',
	'Magic effect': 'Efeito mágico',
	'Draw the projectile to every tile of the area': 'Desenhar o projétil em cada quadro da área',
	'Cast in the facing direction': 'Conjurar na direção em que está virado',

	// --- Spell stage ------------------------------------------------------------------------------------------------------------
	Pause: 'Pausar',
	Play: 'Reproduzir',
	'Cast now': 'Conjurar agora',
	'Reset the target': 'Reiniciar o alvo',
	'Real cooldown': 'Cooldown real',
	'from spells.xml': 'de spells.xml',
	'not used — cast on itself': 'não usado — conjurado em si mesmo',
	'none — nothing travels': 'nenhum — nada viaja',
	'none — the hit is invisible': 'nenhum — o acerto é invisível',
	none: 'nenhum',
	'chance failed': 'a chance falhou',
	'cooldown {{ms}} ms': 'cooldown {{ms}} ms',
	'cooldown {{ms}} ms (compressed)': 'cooldown {{ms}} ms (comprimido)',
	projectile: 'projétil',
	impact: 'impacto',
	'on itself': 'em si mesmo',
	'{{rate}}/min': '{{rate}}/min',
	'≈{{amount}} healed/min': '≈{{amount}} de cura/min',
	'≈{{amount}} dmg/min': '≈{{amount}} de dano/min',
	'The target is {{distance}} tiles away but {{attr}} is {{range}} — the monster never casts this from here.':
		'O alvo está a {{distance}} quadros, mas {{attr}} é {{range}} — o monstro nunca conjura isto daqui.',
	'The area does not cover the monster itself.': 'A área não cobre o próprio monstro.',
	'The area does not cover the target.': 'A área não cobre o alvo.',
	'A beam fires along the facing only.': 'Um feixe dispara apenas ao longo da direção encarada.',
	'A {{node}} rolls in {{callback}} with the monster as both caster and target, so it lands on itself — {{range}} and {{target}} have nothing to act on.':
		'Um {{node}} rola em {{callback}} com o monstro como conjurador e alvo ao mesmo tempo, então acerta a si mesmo — {{range}} e {{target}} não têm sobre o que agir.',
	'Registered spell — only interval, chance and range are known here; the shape and effects come from spells.xml.':
		'Magia registrada — aqui só se conhecem interval, chance e range; a forma e os efeitos vêm de spells.xml.',
	'Scripted spell — the Lua decides the shape and effects, so only the cadence is re-enacted.':
		'Magia por script — o Lua decide a forma e os efeitos, então apenas a cadência é reencenada.',

	// --- Preview panel ------------------------------------------------------------------------------------------------------------
	'Play animation': 'Reproduzir animação',
	'Pause animation': 'Pausar animação',
	North: 'Norte',
	East: 'Leste',
	South: 'Sul',
	West: 'Oeste',
	Derived: 'Derivado',
	'Max melee': 'Máx. corpo a corpo',
	'Melee and physical hits only (§23)': 'Apenas golpes corpo a corpo e físicos (§23)',
	'Melee hits only (§23)': 'Apenas golpes corpo a corpo (§23)',
	'Loot value': 'Valor do loot',
	'Expected value per kill, where item worth is known':
		'Valor esperado por morte, onde o valor do item é conhecido',
	'+{{count}} unpriced': '+{{count}} sem preço',
	'never summons': 'nunca invoca',
	capped: 'limitado',
	'Effective HP': 'HP efetivo',
	immune: 'imune',
	'blocked 100%': 'bloqueado 100%',
	'Edit in the Loot tab': 'Editar na aba Loot',
	'Drag items from the Items browser to add loot':
		'Arraste itens do navegador de Itens para adicionar loot',
	Balance: 'Balanceamento',
	'XP {{xp}} → band {{band}}': 'XP {{xp}} → faixa {{band}}',
	HP: 'HP',
	'vs median': 'vs mediana',

	// --- Fields ---------------------------------------------------------------------------------------------------------------------
	'Drag to reorder': 'Arraste para reordenar',
	'Corpus default is {{value}} — click to use it':
		'O padrão do corpus é {{value}} — clique para usá-lo',
	'Search…': 'Buscar…',
	'No match': 'Sem correspondência',
	'Select…': 'Selecione…',
	'Pick an item…': 'Escolha um item…',
	'Searching…': 'Buscando…',
	'Corpses only': 'Apenas corpos',
	ambiguous: 'ambíguo',
	'More than one item owns this name — the entry must be pinned to an id':
		'Mais de um item tem este nome — a entrada precisa ser fixada em um id',
	'Ironcore-only effect — a stock client renders nothing.':
		'Efeito exclusivo do Ironcore — um cliente padrão não desenha nada.',
	'Decay cycle': 'Ciclo de decomposição',
	'{{time}} total': '{{time}} no total',
	'The last stage has no decayTo — it stays on the ground forever.':
		'O último estágio não tem decayTo — fica no chão para sempre.',
	gone: 'sumiu',
	'Browse outfits…': 'Navegar pelos outfits…',
	normal: 'normal',
	'takes {{pct}}%': 'recebe {{pct}}%',

	// --- Batch edit -----------------------------------------------------------------------------------------------------------------------
	'Batch edit': 'Edição em lote',
	'Which monsters': 'Quais monstros',
	'Name contains': 'Nome contém',
	Any: 'Qualquer',
	to: 'até',
	'0 = no bound': '0 = sem limite',
	'Has flag': 'Tem flag',
	'at value': 'com valor',
	any: 'qualquer',
	'In monsters.xml': 'Em monsters.xml',
	Orphan: 'Órfão',
	'No loot': 'Sem loot',
	'What to change': 'O que alterar',
	'Set to': 'Definir como',
	'Scale by': 'Escalar por',
	'Removes the value entirely.': 'Remove o valor por completo.',
	Fields: 'Campos',
	'Race (blood)': 'Raça (sangue)',
	'Name description': 'Descrição do nome',
	'Previewing…': 'Pré-visualizando…',
	'Select all': 'Selecionar tudo',
	'Select none': 'Desmarcar tudo',
	removed: 'removido',
	new: 'novo',
	'Every changed file is backed up to {{folder}} before it is rewritten.':
		'Todo arquivo alterado tem backup em {{folder}} antes de ser reescrito.',
	Change: 'Alterar',
	'Changing…': 'Alterando…',

	// --- Scale loot --------------------------------------------------------------------------------------------------------------------------
	'Scale loot chances': 'Escalar chances de loot',
	'Every item in the corpus': 'Todo item do corpus',
	'Multiply by': 'Multiplicar por',
	'Never scale a drop down to never — floor it at 0.001% instead':
		'Nunca escalar um drop até nunca — em vez disso, use um piso de 0,001%',
	'Every loot chance in the corpus is matched. Pick an item to scale just that drop.':
		'Toda chance de loot do corpus é considerada. Escolha um item para escalar apenas aquele drop.',
	'Every monster dropping this item is matched, nested container entries included.':
		'Todo monstro que dropa este item é considerado, incluindo entradas aninhadas em contêineres.',
	'Matched entries become a flat {{percent}}% drop.':
		'As entradas correspondentes viram um drop fixo de {{percent}}%.',
	'Matched chances are multiplied, then clamped to 0–100%.':
		'As chances correspondentes são multiplicadas e depois limitadas a 0–100%.',
	'Entries that would not change are left untouched.':
		'Entradas que não mudariam ficam intactas.',
	'Pick a factor other than 100% to see what changes.':
		'Escolha um fator diferente de 100% para ver o que muda.',
	'Nothing changes at these settings.': 'Nada muda com estas configurações.',
	Scale: 'Escalar',
	'Scaling…': 'Escalando…',

	// --- Pin loot -------------------------------------------------------------------------------------------------------------------------------
	'Pin ambiguous loot ids': 'Fixar ids de loot ambíguos',
	'Pin all loot ids': 'Fixar todos os ids de loot',
	'No loot entry names an ambiguous item. Nothing to pin.':
		'Nenhuma entrada de loot nomeia um item ambíguo. Nada a fixar.',
	'Every loot entry is already pinned to an id and named.':
		'Toda entrada de loot já está fixada em um id e nomeada.',
	Pin: 'Fixar',
	'Pinning…': 'Fixando…',

	// --- Patch notes -----------------------------------------------------------------------------------------------------------------------------
	'Export patch notes': 'Exportar notas de versão',
	'Reading the corpus…': 'Lendo o corpus…',
	'No cut-off point is set for this workspace yet. Set one now, edit monsters as usual, and come back here — the notes will cover everything between the two.':
		'Ainda não há ponto de corte definido para este espaço de trabalho. Defina um agora, edite os monstros normalmente e volte aqui — as notas cobrirão tudo entre os dois.',
	'Set cut-off point': 'Definir ponto de corte',
	'Cut-off point:': 'Ponto de corte:',
	'just now': 'agora mesmo',
	'The open monster has unsaved edits. Notes are read from disk, so those are not included yet.':
		'O monstro aberto tem edições não salvas. As notas são lidas do disco, então elas ainda não entram.',
	'No monster has changed since the cut-off point. Move it to now if you are starting a new round of edits.':
		'Nenhum monstro mudou desde o ponto de corte. Mova-o para agora se você está começando uma nova rodada de edições.',
	added: 'adicionado',
	updated: 'alterado',
	'Set a new cut-off point here after exporting':
		'Definir aqui um novo ponto de corte após exportar',
	'Start the next span from now': 'Começar o próximo período a partir de agora',
	'Set cut-off to now': 'Definir o corte para agora',
	Copy: 'Copiar',
	'Export…': 'Exportar…',
	'Exporting…': 'Exportando…',
	'Patch notes copied': 'Notas de versão copiadas',

	// --- Loot simulator ----------------------------------------------------------------------------------------------------------------------------
	'Loot simulator — {{monster}}': 'Simulador de loot — {{monster}}',
	'Hunt for a stretch of time; kills follow from the cadence':
		'Cace por um período; as mortes decorrem da cadência',
	'By time': 'Por tempo',
	'Kill a fixed number of monsters instantly — no clock, no cadence':
		'Mate um número fixo de monstros instantaneamente — sem relógio, sem cadência',
	'By kills': 'Por mortes',
	Session: 'Sessão',
	'Session length in minutes': 'Duração da sessão em minutos',
	min: 'min',
	'Per kill': 'Por morte',
	'Fight duration in seconds': 'Duração da luta em segundos',
	'Between kills': 'Entre mortes',
	'Walking, respawn, targeting': 'Caminhada, respawn, mira',
	Kills: 'Mortes',
	'Monsters killed per run, instantly': 'Monstros mortos por rodada, instantaneamente',
	'Loot rate': 'Taxa de loot',
	'Server loot-rate multiplier; chances clamp at 100%':
		'Multiplicador de loot do servidor; as chances são limitadas a 100%',
	Sessions: 'Sessões',
	Runs: 'Rodadas',
	'1 is a single concrete hunt; more shows the spread':
		'1 é uma caçada concreta; mais mostra a dispersão',
	Seed: 'Semente',
	'0 rolls a fresh seed each run; any other value reproduces a run exactly':
		'0 sorteia uma semente nova a cada rodada; qualquer outro valor reproduz a rodada exatamente',
	'{{kills}} kills per session at one kill every {{cadence}}s':
		'{{kills}} mortes por sessão, uma morte a cada {{cadence}}s',
	'{{kills}} kills per run, killed instantly — no clock, so totals are per run':
		'{{kills}} mortes por rodada, instantâneas — sem relógio, então os totais são por rodada',
	'seed {{seed}}': 'semente {{seed}}',
	'gp/h': 'gp/h',
	'gp per run': 'gp por rodada',
	'per session': 'por sessão',
	'kills per run': 'mortes por rodada',
	'gp per kill': 'gp por morte',
	'expected gp/h': 'gp/h esperado',
	'expected gp per run': 'gp por rodada esperado',
	Totals: 'Totais',
	'Corpse log': 'Registro de corpos',
	'Kill-by-kill corpses of the first session': 'Corpos morte a morte da primeira sessão',
	gp: 'gp',
	'over {{count}}': 'em {{count}}',
	'No kills in the session.': 'Nenhuma morte na sessão.',
	Total: 'Total',
	Drops: 'Drops',
	'1st drop': '1º drop',
	Value: 'Valor',
	'Dropped on {{drops}} of {{kills}} kills': 'Dropou em {{drops}} de {{kills}} mortes',
	'vs {{chance}}': 'vs {{chance}}',
	'Median first drop: kill {{kill}}; dropped in {{hit}} of {{total}} sessions':
		'Mediana do primeiro drop: morte {{kill}}; dropou em {{hit}} de {{total}} sessões',
	'Never dropped': 'Nunca dropou',
	'kill {{kill}}': 'morte {{kill}}',
	unpriced: 'sem preço',
	'Nothing dropped.': 'Nada dropou.',
	'How these numbers are produced': 'Como estes números são produzidos',
	'Per-session totals are averages over the runs. The model mirrors the documented loader rules; the per-entry uniform roll and 1–countmax stack count are inferred from the TFS lineage, not Ironcore source.':
		'Os totais por sessão são médias das rodadas. O modelo espelha as regras documentadas do loader; a rolagem uniforme por entrada e a contagem de pilha 1–countmax são inferidas da linhagem TFS, não do código do Ironcore.',
	Simulate: 'Simular',
	'Simulate again': 'Simular de novo',
	'Resolving items…': 'Resolvendo itens…',

	// --- UI inspector ---------------------------------------------------------------------------------------------------------------------------------
	Copied: 'Copiado',
	'Hold {{key}} · click to copy': 'Segure {{key}} · clique para copiar',

	// --- Landing credit -------------------------------------------------------------------------------------------------------------------------------
	by: 'por',
	'built with Claude': 'construído com Claude',
	// --- Balance overview -------------------------------------------------------------------
	'Balance overview': 'Visão geral do balanceamento',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._one':
		'{{count}} monstro com experiência acima de zero, agrupado pelo que vale uma morte. As medianas são deste corpus — nada aqui é comparado com outro servidor.',
	'{{count}} monster with experience above zero, grouped by what a kill is worth. Medians are this corpus’s own — nothing here is compared against another server._other':
		'{{count}} monstros com experiência acima de zero, agrupados pelo que vale uma morte. As medianas são deste corpus — nada aqui é comparado com outro servidor.',
	Bosses: 'Chefes',
	'Monsters flagged isboss': 'Monstros com a flag isboss',
	Passive: 'Passivos',
	'Monsters that write hostile="0". A monster with no hostile flag at all is not counted as passive — most of TVP’s corpus omits it.':
		'Monstros que escrevem hostile="0". Um monstro sem nenhuma flag hostile não conta como passivo — a maior parte do corpus do TVP a omite.',
	'Monsters flagged summonable, which is what a summon is': 'Monstros com a flag summonable, que é o que uma invocação é',
	'Immune to damage': 'Imunes a dano',
	'Not attackable, or immune to every damage type this engine offers by immunity or by a 100% element — nothing can hurt it':
		'Não pode ser atacado, ou é imune a todos os tipos de dano que este engine oferece, por imunidade ou por um elemento de 100% — nada consegue feri-lo',
	'{{count}} monster left out_one': '{{count}} monstro de fora',
	'{{count}} monster left out_other': '{{count}} monstros de fora',
	'Sort the monsters in the open band by this — again to reverse it, a third time for the outliers':
		'Ordenar os monstros da faixa aberta por esta coluna — de novo para inverter, uma terceira vez para voltar aos destoantes',
	Band: 'Faixa',
	'Show the monsters in this band, furthest from the middle first': 'Mostrar os monstros desta faixa, os mais distantes do meio primeiro',
	'Too few to draw a median from': 'Poucos demais para tirar uma mediana',
	'No monsters in this band.': 'Nenhum monstro nesta faixa.',
	'{{label}} {{value}} — {{pct}}% of the band is at or below it': '{{label}} {{value}} — {{pct}}% da faixa está nesse valor ou abaixo',
	// --- Filtered monsters ------------------------------------------------------------------
	'Filtered monsters': 'Monstros filtrados',
	'Show all again': 'Mostrar todos de novo',
	'Nothing is filtered. A monster ticked here disappears from the whole app — every list, every tool, every lint — and stays gone after a restart.':
		'Nada está filtrado. Um monstro marcado aqui some do aplicativo inteiro — de toda lista, toda ferramenta, todo lint — e continua sumido depois de reiniciar.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._one':
		'{{count}} monstro está filtrado deste corpus em todo o aplicativo, e continua assim depois de reiniciar.',
	'{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart._other':
		'{{count}} monstros estão filtrados deste corpus em todo o aplicativo, e continuam assim depois de reiniciar.',

	// --- Custom effects ---------------------------------------------------------------------
	'Custom effects': 'Efeitos personalizados',
	'Custom effects…': 'Efeitos personalizados…',
	'MONx knows the effects {{engine}} ships, read from its own source. Anything your server adds on top is listed here, after which it appears in the picker like any other and stops being reported as unknown. Declarations are remembered per engine.':
		'O MONx conhece os efeitos que o {{engine}} traz, lidos do código dele mesmo. Tudo o que o seu servidor acrescenta por cima é listado aqui e, feito isso, aparece no seletor como qualquer outro e deixa de ser reportado como desconhecido. As declarações são lembradas por engine.',
	'Magic effects': 'Efeitos mágicos',
	'Shoot effects': 'Efeitos de disparo',
	'Value written to the file': 'Valor escrito no arquivo',
	'Client id': 'Id do cliente',
	Label: 'Rótulo',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._one':
		'Nada declarado ainda. O {{engine}} já traz {{count}} destes por conta própria.',
	'Nothing declared yet. {{engine}} ships {{count}} of these on its own._other':
		'Nada declarado ainda. O {{engine}} já traz {{count}} destes por conta própria.',
	'(uses the value)': '(usa o valor)',
	'{{engine}} already ships this name — the shipped entry wins and this row does nothing.':
		'O {{engine}} já traz esse nome — a entrada dele prevalece e esta linha não faz nada.',
	'Declared twice — only the first is used.': 'Declarado duas vezes — só o primeiro é usado.',
	'Declare an effect': 'Declarar um efeito',
	'An id of 0 is allowed — the effect is named and lints clean, but has no sprite to preview. Nothing here changes what MONx writes: the value was always emitted exactly as typed.':
		'Um id 0 é permitido — o efeito fica nomeado e sem avisos, mas não tem sprite para pré-visualizar. Nada aqui muda o que o MONx escreve: o valor sempre foi gravado exatamente como digitado.',
	"Not in this engine's catalogue — kept exactly as written. Declare it under Preferences → Custom effects to name it and stop the warning.":
		'Não está no catálogo deste engine — mantido exatamente como escrito. Declare-o em Preferências → Efeitos personalizados para dar um nome a ele e parar o aviso.',
	'A custom effect you declared, not one this engine ships.':
		'Um efeito personalizado que você declarou, não um que este engine traz.',

	// --- Changed outside MONx ---------------------------------------------------------------
	'Changed outside MONx': 'Alterado fora do MONx',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._one':
		'{{count}} arquivo foi alterado por outro programa e também tem alterações não salvas aqui. Carregar descarta suas edições; mantê-las significa que o próximo salvamento sobrescreve o que está no disco.',
	'{{count}} file has been changed by another program and also has unsaved changes here. Loading discards your edits; keeping them means the next save overwrites what is on disk._other':
		'{{count}} arquivos foram alterados por outro programa e também têm alterações não salvas aqui. Carregar descarta suas edições; mantê-las significa que o próximo salvamento sobrescreve o que está no disco.',
	'Load from disk': 'Carregar do disco',
	'Keep all mine': 'Manter todos os meus',
	'{{file}} was deleted outside MONx — unsaved changes to it are gone':
		'{{file}} foi apagado fora do MONx — as alterações não salvas nele se perderam',

	// --- Saving -----------------------------------------------------------------------------
	'Save all': 'Salvar tudo',
	'Balance overview…': 'Visão geral do balanceamento…',
	'Saved {{count}} file_one': '{{count}} arquivo salvo',
	'Saved {{count}} file_other': '{{count}} arquivos salvos',
	'Wrote {{count}} file, then failed on {{error}}_one': 'Gravado {{count}} arquivo, depois falhou em {{error}}',
	'Wrote {{count}} file, then failed on {{error}}_other': 'Gravados {{count}} arquivos, depois falhou em {{error}}',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_one':
		'Gravado {{count}} arquivo, depois falhou em mais {{failures}} (primeiro: {{error}})',
	'Wrote {{count}} file, then failed on {{failures}} more (first: {{error}})_other':
		'Gravados {{count}} arquivos, depois falhou em mais {{failures}} (primeiro: {{error}})',
	'Add {{count}} item to the new monster_one': 'Adicionar {{count}} item ao novo monstro',
	'Add {{count}} item to the new monster_other': 'Adicionar {{count}} itens ao novo monstro',

	// --- Balance readings -------------------------------------------------------------------
	// Portuguese forms an ordinal with a masculine indicator, not with the
	// English "st/nd/rd/th", so the suffix is dropped rather than translated.
	'{{pct}}{{suffix}}': '{{pct}}º',
	median: 'mediana',
	n: 'n',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._one':
		'Só {{count}} monstro nesta faixa — poucos demais para uma mediana significar algo, então nada é apontado como fora do comum.',
	'Only {{count}} monster in this band — too few for a median to mean anything, so nothing is called unusual._other':
		'Só {{count}} monstros nesta faixa — poucos demais para uma mediana significar algo, então nada é apontado como fora do comum.',
	'Health sits with band {{band}} — the experience may be low for it.':
		'A vida está na altura da faixa {{band}} — a experiência pode estar baixa para isso.',
	'Health sits with band {{band}} — the experience may be high for it.':
		'A vida está na altura da faixa {{band}} — a experiência pode estar alta para isso.',

	// --- Spells -----------------------------------------------------------------------------
	'as written': 'como escrito',
};

export default pt;
