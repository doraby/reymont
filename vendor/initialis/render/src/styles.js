// The built-in styles, palettes and variation. Style presets are partial overrides of DEFAULTS;
// section presets are those same styles restricted to one section, so you can take Kelmscott's
// ornament with a Deco frame. Only what makes new initials needs this: drawing one doesn't.

import { PARAMS, BY_KEY, DEFAULTS } from './params.js?v=a8136959';
import { rng, gauss, clamp } from './util.js?v=a8136959';

export const PALETTES = [
	{ name: 'Lamp black', paper: '#f3eee3', inkA: '#1a1614', inkB: '#b3301e', inkC: '#2c4a8c' },
	{ name: 'Iron gall', paper: '#efe6d2', inkA: '#3b2a1d', inkB: '#8f2a1a', inkC: '#5f6e34' },
	{ name: 'Prussian', paper: '#f4f0e6', inkA: '#1f4f8f', inkB: '#c33c26', inkC: '#c8a24a' },
	{ name: 'Vermilion', paper: '#f4efe7', inkA: '#e0401f', inkB: '#1c1a18', inkC: '#2f5aa0' },
	{ name: 'Manuscript', paper: '#f1e9d8', inkA: '#1d1a17', inkB: '#b5281c', inkC: '#23458f' },
	{ name: 'Illuminated', paper: '#f3ecdd', inkA: '#1e2f6e', inkB: '#c39a3e', inkC: '#9e2a22' },
	{ name: 'Nouveau', paper: '#efe9da', inkA: '#33402a', inkB: '#c08d3e', inkC: '#8a3c3c' },
	{ name: 'Deco', paper: '#f1ece1', inkA: '#141313', inkB: '#b8913a', inkC: '#2f6b6b' },
	{ name: 'Riso', paper: '#f6f3ec', inkA: '#ff48b0', inkB: '#0078bf', inkC: '#ffcc00' },
	{ name: 'Sepia', paper: '#f2e9d8', inkA: '#5a3b24', inkB: '#a0522d', inkC: '#3a3a3a' },
	{ name: 'Clean', paper: '#ffffff', inkA: '#111111', inkB: '#d0281e', inkC: '#2350b8' },
	{ name: 'Green tile', paper: '#ece6d3', inkA: '#24443a', inkB: '#b2582c', inkC: '#c9a227' },
	{ name: 'Gold leaf', paper: '#f2ead6', inkA: '#1b1712', inkB: '#c9a43c', inkC: '#8c2f2a' },
	{ name: 'Indigo', paper: '#f3eee4', inkA: '#23305e', inkB: '#c0412b', inkC: '#d9a441' },
	// added for INITIĀLIS (scion), chosen from a sheet of candidates: Japanese traditional colours by
	// name (sumi, shikon, kurenai…), Riso Kagaku's Federal Blue, pigments, prints and dyes, and one
	// pigment in three strengths (Celadon)
	{ name: 'Sumi', paper: '#f4f1ea', inkA: '#1c1c1c', inkB: '#00896c', inkC: '#cb1b45' },
	{ name: 'Shikon', paper: '#f3efe8', inkA: '#592c63', inkB: '#8b81c3', inkC: '#838a2d' },
	{ name: 'Kurenai', paper: '#f3efe6', inkA: '#0b346e', inkB: '#cb1b45', inkC: '#ffb11b' },
	{ name: 'Federal', paper: '#f6f3ec', inkA: '#3d5588', inkB: '#f15060', inkC: '#ffb511' },
	{ name: 'Delft', paper: '#f6f4ee', inkA: '#1f3f8f', inkB: '#6f8cc4', inkC: '#2a2a2a' },
	{ name: 'Swiss', paper: '#f5f5f2', inkA: '#111111', inkB: '#e2001a', inkC: '#8a8a8a' },
	{ name: 'Ochre', paper: '#f0e8d4', inkA: '#3a2a1d', inkB: '#c47a2c', inkC: '#6f7d3c' },
	{ name: 'Bagru', paper: '#efe6d0', inkA: '#2f2a26', inkB: '#b04a32', inkC: '#6d7f3a' },
	{ name: 'Minium', paper: '#f2ead9', inkA: '#2b2622', inkB: '#e0603a', inkC: '#4f7a5a' },
	{ name: 'Byzantine', paper: '#f1e9d6', inkA: '#4b1d52', inkB: '#b8902f', inkC: '#1f6b5e' },
	{ name: 'Bauhaus', paper: '#f4f1ea', inkA: '#1e4a9a', inkB: '#e1251b', inkC: '#f2c500' },
	{ name: 'Celadon', paper: '#f1efe6', inkA: '#2f4a3a', inkB: '#5f8a6e', inkC: '#a9c4a8' },
];
const pal = name => { const p = PALETTES.find(q => q.name === name); return { paper: p.paper, inkA: p.inkA, inkB: p.inkB, inkC: p.inkC }; };

const CLEANINK = { wobble: 0, sketch: 1, rough: 0.1, edge: 0.05, speckle: 0, dirt: 0, mottle: 0.03, grain: 0.25, misreg: 0, bleed: 0, spread: 0 };

export const PRESETS = [
	{
		name: 'Kelmscott', note: 'William Morris, 1890s: white letter and acanthus on solid black',
		p: {
			font: 'cormorant-garamond-700', size: 0.64, lFill: 'paper', lInline: 2.2, lInlineOff: 6, letterGap: 9,
			frame: 'rect', fMargin: 40, fRules: 2, fW1: 0, fGap: 9, fW2: 2.2, fRuleColor: 'paper', fBorder: 'A', fField: 'A',
			orn: 'grow', oSeeds: 'gaps', oSeedCount: 4, oDensity: 0.88, oSprout: 0.8, oMargin: 5.5, oStemW: 11, oTaper: 0.35, oThin: 0.2, oCurl: 0.8, oTurns: 1.1, oLeafSide: 'outer',
			oBranch: 0.55, oDepth: 3, oLeaf: 'acanthus', oLeafSize: 1.1, oLeafEvery: 0.62, oLeafW: 0.6, oLobes: 4, oLobeDepth: 0.42, oLeafCurl: 0.5,
			oFlower: 'rosette', oFlowerChance: 0.18, oFlowerSize: 1.1, oBerries: 0.5, oDots: 0.3, oTerminal: 'leaf',
			oFill: 'paper', oStroke: 'none', oDetail: 'veins', oDetailW: 1.5,
			rough: 0.25, edge: 0.12, spread: 0.02, grain: 0.4, mottle: 0.08, ...pal('Lamp black'),
		},
	},
	{
		name: 'Kelmscott red', note: 'the same foliage drawn as red line on cream, boxed twice with an offset',
		p: {
			font: 'cormorant-garamond-700', size: 0.62, lFill: 'A', lOutline: 0, letterGap: 10,
			frame: 'rect', fMargin: 70, fRules: 2, fW1: 3, fGap: 5, fW2: 1.6, fField: 'paper', fShadow: 16, fShadowAngle: 45, fShadowStyle: 'line',
			orn: 'grow', oSeeds: 'gaps', oDensity: 0.9, oMargin: 4.5, oStemW: 7, oCurl: 0.7, oTurns: 1.1, oBranch: 0.6, oLeaf: 'acanthus', oLeafSize: 1, oLobes: 5,
			oFlower: 'rosette', oFlowerChance: 0.2, oBerries: 0.3, oDots: 0.3, oTerminal: 'leaf',
			oFill: 'paper', oStroke: 'A', oStrokeW: 2, oDetail: 'vein', oDetailW: 1.4,
			rough: 0.2, edge: 0.18, grain: 0.35, ...pal('Vermilion'),
		},
	},
	{
		name: 'Engraved', note: 'Renaissance line initial: open letter, mirrored scrolls, one thin rule',
		p: {
			font: 'cinzel-900', size: 0.6, lFill: 'paper', lOutline: 3, lInline: 1.6, lInlineOff: 8, lOutlineColor: 'A', letterGap: 12,
			frame: 'rect', fMargin: 50, fRules: 1, fW1: 2.6, fField: 'paper',
			orn: 'grow', oSym: 'mirror', oSeeds: 'root', oSeedCount: 1, oDensity: 0.62, oSprout: 0.8, oMargin: 9, oStemW: 6.5, oCurl: 0.76, oTurns: 1.35,
			oBranch: 0.5, oLeaf: 'acanthus', oLeafSize: 1.25, oLeafW: 0.55, oLobes: 3, oLeafCurl: 0.7, oFlower: 'rosette', oFlowerChance: 0.35, oPetals: 5,
			oBerries: 0.35, oDots: 0.15, oTerminal: 'flower',
			oFill: 'paper', oStroke: 'A', oStrokeW: 2, oDetail: 'inline', oDetailW: 1.3,
			wobble: 1.2, wobbleScale: 90, rough: 0.3, edge: 0.22, grain: 0.35, ...pal('Prussian'),
		},
	},
	{
		name: 'Ratdolt', note: 'Venice, 1470s woodcut: white rinceau vines on black, no letter detail',
		p: {
			font: 'cinzel-700', size: 0.66, lFill: 'paper', letterGap: 10,
			frame: 'rect', fMargin: 45, fRules: 1, fW1: 3, fField: 'A',
			orn: 'grow', oSeeds: 'corners', oSeedCount: 2, oUndulate: 0.7, oDensity: 0.8, oSprout: 0.9, oMargin: 6.5, oStemW: 7.5, oTaper: 0.3, oThin: 0.25, oCurl: 0.82, oTurns: 1.4,
			oBranch: 0.55, oDepth: 3, oLeaf: 'trefoil', oLeafSize: 0.85, oLeafEvery: 0.45, oFlower: 'bud', oFlowerChance: 0.3, oFlowerSize: 0.8,
			oBerries: 0.2, oDots: 0.3, oTerminal: 'flower', oFill: 'paper', oDetail: 'none',
			rough: 0.55, roughScale: 10, edge: 0.4, edgeScale: 5, spread: -0.02, speckle: 0.12, grain: 0.5, ...pal('Lamp black'),
		},
	},
	{
		name: 'Criblé', note: 'dotted metal-cut ground, about 1500',
		p: {
			font: 'eb-garamond-700', size: 0.66, lFill: 'paper', lOutline: 1.5, lOutlineColor: 'A', letterGap: 10,
			frame: 'rect', fMargin: 45, fRules: 2, fW1: 3, fGap: 5, fW2: 1.5, fField: 'A', fPattern: 'stipple', fPatScale: 11, fPatW: 5.5, fPatColor: 'paper',
			orn: 'grow', oSeeds: 'gaps', oDensity: 0.4, oSprout: 0.9, oMargin: 9, oStemW: 7, oCurl: 0.7, oLeaf: 'ovate', oLeafSize: 1.1, oFlower: 'rosette', oFlowerChance: 0.3,
			oBerries: 0, oDots: 0, oTerminal: 'leaf', oFill: 'paper', oStroke: 'A', oStrokeW: 1.2, oDetail: 'vein',
			rough: 0.35, edge: 0.25, speckle: 0.1, ...pal('Lamp black'),
		},
	},
	{
		name: 'Ruled ground', note: 'sixteenth-century Basel: outlined foliage on a ground of fine horizontal rules',
		p: {
			font: 'cinzel-700', size: 0.62, lFill: 'paper', lOutline: 2.4, lShadow: 'drop', lShadowLen: 9, lShadowAngle: 45, lShadowColor: 'A', letterGap: 14,
			frame: 'rect', fMargin: 45, fRules: 1, fW1: 3.2, fField: 'paper', fPattern: 'hatch', fPatAngle: 0, fPatScale: 4.6, fPatW: 1.1, fPatColor: 'A',
			orn: 'grow', oSym: 'mirror', oSeeds: 'root', oSeedCount: 1, oDensity: 0.6, oMargin: 8, oStemW: 7, oCurl: 0.75, oTurns: 1.3,
			oLeaf: 'acanthus', oLeafSize: 1.3, oLobes: 3, oLeafCurl: 0.6, oFlower: 'pomegranate', oFlowerChance: 0.5, oFlowerSize: 1.1, oTerminal: 'flower',
			oBerries: 0.2, oDots: 0, oFill: 'paper', oStroke: 'A', oStrokeW: 1.6, oDetail: 'hatch', oDetailW: 1,
			rough: 0.3, edge: 0.2, wobble: 0.6, ...pal('Lamp black'),
		},
	},
	{
		name: 'Lombardic penwork', note: 'Gothic manuscript versal: blue letter, red pen-flourishing, beads and echoes',
		p: {
			font: 'macondo-swash-caps-400', size: 0.56, lFill: 'C', lFil: 'beads', lFilScale: 0.8, lFilInset: 6, letterGap: 22,
			lEcho: 2, lEchoGap: 7, lEchoW: 1, lEchoColor: 'B',
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 190, oSeeds: 'letter', oSeedCount: 5, oDensity: 0.55, oSprout: 0.9, oMargin: 4, oStemW: 1.1, oTaper: 0.2,
			oCurl: 0.95, oTurns: 1.8, oBranch: 0.35, oDepth: 2, oLength: 0.8, oLeaf: 'none', oFlower: 'none', oBeads: 0.55, oBerries: 0.6, oBerrySize: 0.4,
			oDots: 0.35, oTerminal: 'ball', oFill: 'B', oStroke: 'none', oDetail: 'none',
			wobble: 0.8, wobbleScale: 60, rough: 0.2, edge: 0.1, grain: 0.45, ...pal('Manuscript'),
		},
	},
	{
		name: 'Puzzle initial', note: 'litterae duplices: a red and blue letter split by a white meander',
		p: {
			font: 'uncial-antiqua-400', size: 0.62, lFill: 'split', lSplit: 'meander', lSplitFreq: 4, lSplitGap: 5, lSplitA: 'B', lSplitB: 'C', letterGap: 20,
			lEcho: 1, lEchoGap: 8, lEchoW: 1.1, lEchoColor: 'B',
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 160, oSeeds: 'letter', oSeedCount: 4, oDensity: 0.45, oMargin: 4, oStemW: 1, oTaper: 0.2, oCurl: 0.95, oTurns: 2,
			oBranch: 0.3, oDepth: 2, oLength: 0.7, oLeaf: 'none', oFlower: 'none', oBeads: 0.4, oBerries: 0.4, oBerrySize: 0.35, oDots: 0.2, oTerminal: 'ball',
			oFill: 'C', oDetail: 'none',
			wobble: 0.7, rough: 0.2, edge: 0.1, ...pal('Manuscript'),
		},
	},
	{
		name: 'Insular dots', note: 'Lindisfarne-style: a black uncial ringed with red dots, spirals in the counters',
		p: {
			font: 'uncial-antiqua-400', size: 0.62, lFill: 'A', letterGap: 8, lEcho: 3, lEchoGap: 10, lEchoW: 2.6, lEchoStyle: 'dots', lEchoColor: 'B',
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'counters', oHalo: 220, oSeeds: 'gaps', oDensity: 0.6, oMargin: 4, oStemW: 2.2, oTaper: 0.3, oCurl: 0.98, oTurns: 2.4, oBranch: 0.2, oDepth: 1,
			oLeaf: 'none', oFlower: 'none', oBerries: 0, oDots: 0.4, oBerrySize: 0.6, oTerminal: 'ball', oFill: 'B', oDetail: 'none',
			wobble: 0.6, rough: 0.2, edge: 0.12, grain: 0.5, ...pal('Manuscript'),
		},
	},
	{
		name: 'Gothic gilt', note: 'illuminated: gold blackletter on a blue diapered ground',
		p: {
			font: 'unifrakturmaguntia-400', size: 0.7, lFill: 'B', lOutline: 1.4, lOutlineColor: 'A', letterGap: 0, lHalo: 4, lHaloColor: 'paper',
			frame: 'rect', fMargin: 45, fRules: 2, fW1: 5, fGap: 4, fW2: 1.5, fRuleColor: 'B', fField: 'A', fPattern: 'diaper', fPatScale: 18, fPatW: 1.1, fPatColor: 'paper',
			orn: 'none',
			rough: 0.15, edge: 0.08, grain: 0.35, mottle: 0.12, ...pal('Illuminated'),
		},
	},
	{
		name: 'Victorian filigree', note: 'a heavy black capital with white scrollwork cut inside it',
		p: {
			font: 'metamorphous-400', size: 0.62, embolden: 7, lFill: 'A', lFil: 'scroll', lFilScale: 1, lFilInset: 5, lOutline: 0, lEcho: 1, lEchoGap: 7, lEchoW: 1.3, letterGap: 16,
			frame: 'none', fMargin: 40,
			orn: 'grow', oRegion: 'halo', oHalo: 120, oSeeds: 'letter', oSeedCount: 3, oDensity: 0.08, oSprout: 0.2, oMargin: 6, oStemW: 2.4, oCurl: 0.9, oTurns: 1.5,
			oBranch: 0.3, oDepth: 1, oLength: 0.6, oLeaf: 'trefoil', oLeafSize: 0.6, oLeafEvery: 0.4, oFlower: 'none', oBerries: 0, oDots: 0, oTerminal: 'ball', oFill: 'A', oDetail: 'none',
			...CLEANINK, rough: 0.12, edge: 0.08, ...pal('Clean'), paper: '#f6f3ec',
		},
	},
	{
		name: 'Victorian flourish', note: 'a thin modern capital with curly sprigs and a dotted echo',
		p: {
			font: 'bodoni-moda-400', size: 0.5, lFill: 'A', letterGap: 16, lEcho: 1, lEchoGap: 9, lEchoW: 1.1, lEchoStyle: 'dots',
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 200, oSeeds: 'letter', oSeedCount: 4, oDensity: 0, oSprout: 0, oMargin: 7, oStemW: 3, oTaper: 0.45, oThin: 0.3, oCurl: 0.92,
			oTurns: 1.25, oBranch: 0.3, oDepth: 1, oLength: 0.55, oLeaf: 'trefoil', oLeafSize: 0.65, oLeafEvery: 0.72, oFlower: 'none', oBerries: 0, oDots: 0,
			oTerminal: 'ball', oFill: 'A', oDetail: 'none', oContrast: 0.2, oPenAngle: 30,
			wobble: 0.5, rough: 0.12, edge: 0.08, ...pal('Lamp black'), paper: '#f5f2ea',
		},
	},
	{
		name: 'Fraktur cadel', note: 'blackletter with broad-pen strapwork swinging out from its strokes',
		p: {
			font: 'unifrakturcook-700', size: 0.6, lFill: 'A', letterGap: 10,
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 260, oSeeds: 'letter', oSeedCount: 5, oDensity: 0.12, oSprout: 0.4, oMargin: 7, oStemW: 15, oTaper: 0.25, oThin: 0.3, oCurl: 0.55,
			oTurns: 1.2, oLength: 1.6, oBranch: 0.25, oDepth: 1, oLeaf: 'none', oFlower: 'none', oBerries: 0, oDots: 0, oTerminal: 'curl',
			oFill: 'A', oDetail: 'none', oContrast: 0.9, oPenAngle: 40,
			wobble: 0.6, rough: 0.15, edge: 0.1, ...pal('Iron gall'),
		},
	},
	{
		name: 'Blackletter woodcut', note: 'white fraktur on black with crude white vines, heavily printed',
		p: {
			font: 'unifrakturcook-700', size: 0.66, lFill: 'paper', letterGap: 9,
			frame: 'rect', fMargin: 42, fRules: 2, fW1: 6, fGap: 5, fW2: 2, fField: 'A', fRuleColor: 'A',
			orn: 'grow', oSeeds: 'gaps', oDensity: 0.7, oMargin: 7, oStemW: 6, oCurl: 0.7, oTurns: 1.1, oLeaf: 'lance', oLeafSize: 1.1, oLeafW: 0.45,
			oFlower: 'star', oFlowerChance: 0.25, oPetals: 5, oBerries: 0.3, oDots: 0.3, oTerminal: 'leaf', oFill: 'paper', oDetail: 'vein', oDetailW: 1.6,
			wobble: 1.5, wobbleScale: 50, rough: 0.7, roughScale: 9, edge: 0.45, speckle: 0.3, spread: 0.03, grain: 0.6, ...pal('Lamp black'),
		},
	},
	{
		name: 'Art Nouveau', note: 'long whiplash stems and tulips under a round arch, coloured with a dark line',
		p: {
			font: 'cinzel-decorative-700', size: 0.5, dy: 0.06, lFill: 'A', lHalo: 6, lHaloColor: 'paper', letterGap: 14,
			frame: 'arch', fMargin: 40, fRules: 2, fW1: 5, fGap: 6, fW2: 2, fField: 'paper',
			orn: 'grow', oSym: 'mirror', oSeeds: 'root', oSeedCount: 2, oDensity: 0.45, oSprout: 0.5, oMargin: 7, oStemW: 4, oTaper: 0.4, oCurl: 0.25, oTurns: 0.8,
			oWander: 0.6, oLength: 2.2, oBranch: 0.28, oDepth: 2, oLeaf: 'teardrop', oLeafSize: 1.4, oLeafW: 0.7, oLeafEvery: 0.35,
			oFlower: 'tulip', oFlowerChance: 0.6, oFlowerSize: 1.3, oBerries: 0, oDots: 0, oTerminal: 'flower',
			oFill: 'B', oStroke: 'A', oStrokeW: 1.4, oDetail: 'vein', oDetailW: 1, oDetailColor: 'A',
			wobble: 0.4, rough: 0.15, misreg: 1.2, ...pal('Nouveau'),
		},
	},
	{
		name: 'Art Deco', note: 'geometric letter on a gold sunburst, octagonal rules, quarter-round corners',
		p: {
			font: 'federo-400', size: 0.6, embolden: 2, lFill: 'paper', lInline: 1.5, lInlineOff: 6, lInlineColor: 'B', lEcho: 2, lEchoGap: 8, lEchoW: 1.4, lEchoColor: 'B', letterGap: 26,
			frame: 'octagon', fMargin: 40, fRules: 3, fW1: 3, fGap: 5, fW2: 1.5, fRuleColor: 'B', fField: 'A', fPattern: 'rays', fPatScale: 18, fPatColor: 'B', fCorner: 'quarter', fCornerSize: 26,
			orn: 'none',
			...CLEANINK, ...pal('Deco'),
		},
	},
	{
		name: 'Wood type', note: 'nineteenth-century poster capital: red, inline, hatched extruded shadow',
		p: {
			font: 'abril-fatface-400', size: 0.6, lFill: 'B', lOutline: 2.5, lOutlineColor: 'A', lInline: 1.6, lInlineOff: 7, lInlineColor: 'paper',
			lShadow: 'extrude', lShadowLen: 22, lShadowAngle: 45, lShadowFill: 'hatch', lPatScale: 8, lShadowColor: 'A', letterGap: 14,
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 120, oSeeds: 'letter', oSeedCount: 4, oDensity: 0.06, oSprout: 0, oMargin: 7, oStemW: 3, oCurl: 0.85, oTurns: 1.3, oLength: 0.5,
			oBranch: 0.2, oDepth: 1, oLeaf: 'lance', oLeafSize: 0.7, oLeafEvery: 0.4, oFlower: 'none', oBerries: 0, oDots: 0, oTerminal: 'ball', oFill: 'A', oDetail: 'none',
			rough: 0.3, edge: 0.25, speckle: 0.25, misreg: 2, grain: 0.5, ...pal('Lamp black'),
		},
	},
	{
		name: 'Monogram', note: 'two script capitals in a beaded oval, engraved stationery',
		p: {
			text: 'AE', font: 'pinyon-script-400', size: 0.72, tracking: -0.32, lWeave: 'weave', lWeaveGap: 5, lFill: 'A', letterGap: 14,
			frame: 'circle', fMargin: 70, fRules: 2, fW1: 1.6, fGap: 9, fW2: 1, fBand: 'beads', fField: 'paper',
			orn: 'grow', oSeeds: 'gaps', oDensity: 0.1, oSprout: 0.6, oMargin: 8, oStemW: 1.5, oCurl: 0.85, oTurns: 1.3, oLength: 0.6, oBranch: 0.3, oDepth: 1,
			oLeaf: 'willow', oLeafSize: 0.8, oLeafEvery: 0.6, oFlower: 'none', oBerries: 0, oDots: 0, oTerminal: 'ball', oFill: 'A', oDetail: 'none', oContrast: 0.5,
			...CLEANINK, ...pal('Prussian'),
		},
	},
	{
		name: 'Arts & Crafts tile', note: 'a green ground, cream vines with orange flowers, beaded border',
		p: {
			font: 'linden-hill-400', size: 0.62, embolden: 3, lFill: 'B', lOutline: 2, lOutlineColor: 'paper', letterGap: 10,
			frame: 'rounded', fMargin: 40, fRules: 2, fW1: 4, fGap: 10, fW2: 2, fBand: 'pearls', fRuleColor: 'A', fField: 'A',
			orn: 'grow', oSeeds: 'gaps', oDensity: 0.8, oMargin: 6, oStemW: 6, oCurl: 0.6, oTurns: 1, oLeaf: 'ivy', oLobes: 5, oLeafSize: 1.2, oLeafEvery: 0.5,
			oFlower: 'daisy', oFlowerChance: 0.35, oBerries: 0.35, oDots: 0.4, oTerminal: 'flower',
			oFill: 'paper', oDetail: 'vein', oDetailW: 1.4,
			rough: 0.15, edge: 0.1, mottle: 0.12, ...pal('Green tile'),
		},
	},
	{
		name: 'Modern ornate', note: 'a fat Didone with leafy filigree, a hairline echo and calligraphic swashes',
		p: {
			font: 'playfair-display-900', size: 0.6, lFill: 'A', lFil: 'leafy', lFilScale: 0.9, lFilInset: 5, lEcho: 1, lEchoGap: 8, lEchoW: 1, lEchoColor: 'B', letterGap: 16,
			frame: 'none', fMargin: 30,
			orn: 'grow', oRegion: 'halo', oHalo: 180, oSeeds: 'letter', oSeedCount: 4, oDensity: 0.1, oSprout: 0.3, oMargin: 6, oStemW: 3, oTaper: 0.5, oCurl: 0.8, oTurns: 1.4,
			oLength: 0.8, oBranch: 0.35, oDepth: 2, oLeaf: 'lance', oLeafSize: 0.75, oLeafEvery: 0.5, oFlower: 'none', oBerries: 0.3, oBerrySize: 0.5, oDots: 0, oTerminal: 'ball',
			oFill: 'B', oDetail: 'none', oContrast: 0.75, oPenAngle: 35,
			...CLEANINK, ...pal('Clean'),
		},
	},
	// --- generative ---
	{
		name: 'Pointillé', note: 'pod leaves and dot rings on hairline vines, the gaps stippled finer and finer',
		p: {
			font: 'cormorant-garamond-700', size: 0.62, lFill: 'A', letterGap: 14,
			frame: 'rect', fMargin: 45, fRules: 2, fW1: 2.5, fGap: 5, fW2: 1, fField: 'paper',
			orn: 'grow', oSeeds: 'gaps', oSeedCount: 4, oDensity: 0.45, oSprout: 0.7, oMargin: 7, oStemW: 2.2, oTaper: 0.4, oCurl: 0.85, oTurns: 1.3, oBranch: 0.45,
			oLeaf: 'pod', oLeafSize: 0.9, oLeafEvery: 0.6, oLeafSide: 'outer', oFlower: 'dotring', oFlowerChance: 0.3, oPetals: 9, oBerries: 0.2, oDots: 0, oTerminal: 'ball',
			oFill: 'A', oDetail: 'none',
			tKind: 'stipple', tScale: 7, tSize: 2.4, tGap: 5, tGrade: -0.85,
			...CLEANINK, grain: 0.3, ...pal('Lamp black'),
		},
	},
	{
		name: 'Klimt', note: 'black spirals, dot leaves and target flowers on a gold ground',
		p: {
			font: 'linden-hill-400', size: 0.64, embolden: 3, lFill: 'paper', lOutline: 2.4, lOutlineColor: 'A', letterGap: 10,
			frame: 'rect', fMargin: 40, fRules: 2, fW1: 3, fGap: 5, fW2: 1.5, fField: 'B', fRuleColor: 'A',
			orn: 'grow', oSeeds: 'gaps', oSeedCount: 5, oDensity: 0.7, oSprout: 0.9, oMargin: 6, oStemW: 4, oTaper: 0.5, oCurl: 0.98, oTurns: 2.6, oBranch: 0.4, oDepth: 2,
			oLeaf: 'dot', oLeafSize: 0.7, oLeafEvery: 0.5, oLeafW: 0.6, oFlower: 'target', oFlowerChance: 0.35, oFlowerSize: 1, oBerries: 0.4, oDots: 0.3, oTerminal: 'ball',
			oFill: 'A', oDetail: 'veins', oDetailW: 1.4,
			tKind: 'bubbles', tBubble: 'ring', tScale: 6, tSize: 1.6, tGap: 3,
			rough: 0.12, mottle: 0.18, grain: 0.35, ...pal('Gold leaf'),
		},
	},
	{
		name: 'Op ripple', note: 'the letter’s distance field drawn as contour lines, op-art style',
		p: {
			font: 'abril-fatface-400', size: 0.6, lFill: 'A', letterGap: 6,
			frame: 'none', fMargin: 40, orn: 'none',
			tKind: 'ripples', tScale: 10, tSize: 2.6, tGap: 6,
			...CLEANINK, ...pal('Clean'),
		},
	},
	{
		name: 'Coral', note: 'reaction–diffusion coral grown around a white letter',
		p: {
			font: 'playfair-display-900', size: 0.6, lFill: 'paper', letterGap: 10,
			frame: 'rect', fMargin: 40, fRules: 1, fW1: 4, fField: 'A',
			orn: 'none',
			tKind: 'coral', tCoral: 'coral', tScale: 12, tGap: 6, tColor: 'paper',
			rough: 0.15, edge: 0.1, grain: 0.4, ...pal('Vermilion'),
		},
	},
	{
		name: 'Pebbles', note: 'Voronoi pebbles packed round a letter in a circle',
		p: {
			font: 'cinzel-900', size: 0.56, lFill: 'B', lOutline: 2, lOutlineColor: 'A', letterGap: 8,
			frame: 'circle', fMargin: 40, fRules: 1, fW1: 3, fField: 'paper',
			orn: 'none',
			tKind: 'cells', tCell: 'pebble', tScale: 24, tSize: 4, tGap: 5,
			rough: 0.15, edge: 0.12, wobble: 0.8, ...pal('Indigo'),
		},
	},
	{
		name: 'Truchet', note: 'quarter-circle tiles running behind a geometric capital',
		p: {
			font: 'federo-400', size: 0.62, embolden: 5, lFill: 'A', letterGap: 14,
			frame: 'rect', fMargin: 40, fRules: 1, fW1: 3, fField: 'paper',
			orn: 'none',
			tKind: 'truchet', tTruchet: 'arcs', tScale: 30, tSize: 3, tGap: 5, tColor: 'C',
			...CLEANINK, ...pal('Riso'),
		},
	},
	{
		name: 'Aura', note: 'strokes radiating off a red letter, thinning as they go',
		p: {
			font: 'unifrakturcook-700', size: 0.58, lFill: 'B', letterGap: 6,
			frame: 'none', fMargin: 30,
			orn: 'none', oRegion: 'halo', oHalo: 230,
			tKind: 'fur', tScale: 11, tSize: 2.6, tGap: 5, tGrade: -0.7, tTwist: 0.15,
			wobble: 0.6, rough: 0.12, ...pal('Lamp black'),
		},
	},
	{
		name: 'Paisley', note: 'boteh commas on dotted stems with dot-ring flowers, tiny dots in between',
		p: {
			font: 'cinzel-decorative-700', size: 0.56, lFill: 'B', lOutline: 2, lOutlineColor: 'A', lHalo: 4, letterGap: 12,
			frame: 'rounded', fMargin: 40, fRules: 2, fW1: 4, fGap: 6, fW2: 1.5, fBand: 'dots', fField: 'paper',
			orn: 'grow', oSeeds: 'gaps', oSeedCount: 4, oDensity: 0.6, oSprout: 0.8, oMargin: 6, oStemW: 4, oStemStyle: 'dotted', oCurl: 0.85, oTurns: 1.2, oBranch: 0.5,
			oLeaf: 'comma', oLeafSize: 1.75, oLeafW: 0.7, oLeafEvery: 0.6, oLeafSide: 'outer', oFlower: 'dotring', oFlowerChance: 0.4, oPetals: 10, oBerries: 0.2, oDots: 0, oTerminal: 'leaf',
			oFill: 'A', oDetail: 'inline', oDetailW: 1.8, oDetailColor: 'paper',
			tKind: 'stipple', tScale: 6, tSize: 1.8, tGap: 4, tColor: 'B',
			rough: 0.1, mottle: 0.1, misreg: 1, ...pal('Indigo'),
		},
	},
	{
		name: 'Seed heads', note: 'mid-century: ginkgo fans and phyllotaxis seed heads on double-line stems',
		p: {
			font: 'della-respira-400', size: 0.62, embolden: 4, lFill: 'A', letterGap: 14,
			frame: 'rect', fMargin: 45, fRules: 1, fW1: 2, fField: 'paper',
			orn: 'grow', oSeeds: 'root', oSeedCount: 2, oSym: 'none', oDensity: 0.55, oSprout: 0.7, oMargin: 8, oStemW: 3.4, oStemStyle: 'solid', oTaper: 0.3, oCurl: 0.45, oTurns: 0.9, oWander: 0.3,
			oLength: 1.4, oBranch: 0.4, oDepth: 2, oLeaf: 'fan', oLeafSize: 1.2, oLeafW: 0.6, oLeafEvery: 0.45, oFlower: 'phyllo', oFlowerChance: 0.7, oFlowerSize: 1.6,
			oBerries: 0, oDots: 0, oTerminal: 'flower', oFill: 'B', oDetail: 'vein', oDetailW: 1, oDetailColor: 'paper',
			rough: 0.12, misreg: 1.5, ...pal('Nouveau'),
		},
	},
	{
		name: 'Frost', note: 'dendritic growth: straight branching needles, white on blue',
		p: {
			font: 'cinzel-700', size: 0.62, lFill: 'paper', letterGap: 8,
			frame: 'rect', fMargin: 40, fRules: 1, fW1: 3, fField: 'C', fRuleColor: 'C',
			orn: 'grow', oSeeds: 'letter', oSeedCount: 8, oDensity: 0.85, oSprout: 1, oMargin: 4, oStemW: 3, oTaper: 0.6, oThin: 0.5, oCurl: 0.08, oTurns: 0.5, oWander: 0.9,
			oBranch: 0.88, oDepth: 4, oBranchAngle: 55, oLength: 0.9, oLeaf: 'needles', oLeafSize: 0.5, oLeafEvery: 0.25, oFlower: 'star', oFlowerChance: 0.1, oFlowerSize: 0.6, oPetals: 6,
			oBerries: 0, oDots: 0.4, oTerminal: 'point', oFill: 'paper', oDetail: 'none',
			rough: 0.15, edge: 0.1, grain: 0.3, ...pal('Lamp black'),
		},
	},

];

export function presetParams(preset, keep = {}) {
	return { ...DEFAULTS, ...preset.p, ...keep };
}

// a preset restricted to one section's keys
export function sectionPreset(preset, section) {
	const out = {};
	const full = presetParams(preset);
	for (const p of PARAMS) if (p.section === section && p.key !== 'text' && p.key !== 'seed') out[p.key] = full[p.key];
	return out;
}

// --- variation ---

function jitterHex(hex, r, amt) {
	let v = parseInt(hex.slice(1), 16);
	let R = (v >> 16) & 255, G = (v >> 8) & 255, B = v & 255;
	const j = () => gauss(r) * 40 * amt;
	const l = gauss(r) * 25 * amt;
	R = clamp(Math.round(R + j() + l), 0, 255); G = clamp(Math.round(G + j() + l), 0, 255); B = clamp(Math.round(B + j() + l), 0, 255);
	return '#' + ((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1);
}

// nudge params: amount 0..1, only in the given sections
export function mutate(P, amount, sections, seed, fonts) {
	const r = rng(seed);
	const out = { ...P };
	const secs = new Set(sections);
	for (const p of PARAMS) {
		if (!secs.has(p.section)) continue;
		if (p.key === 'text') continue;
		const spec = p.spec;
		if (p.key === 'seed') { out.seed = (r() * 1e6) | 0; continue; }
		if (p.key === 'font') {
			if (fonts && r() < amount * 0.45) {
				const cur = fonts.find(f => f.id === P.font);
				const pool = r() < 0.6 && cur ? fonts.filter(f => f.group === cur.group) : fonts;
				out.font = pool[(r() * pool.length) | 0].id;
			}
			continue;
		}
		if (p.key === 'lInflate' && !P.lInflate) continue;
		// blowing up is parked: mutation leaves a letter as cut, and only the knob blows it up
		if (p.key === 'lBlob' && !P.lBlob) continue;
		if (Array.isArray(spec) && typeof spec[0] === 'number') {
			const [mn, mx, st] = spec;
			if (r() > 0.25 + amount * 0.6) continue;
			let v = P[p.key] + gauss(r) * (mx - mn) * 0.22 * amount;
			v = clamp(Math.round(v / st) * st, mn, mx);
			out[p.key] = +v.toFixed(4);
		} else if (Array.isArray(spec)) {
			if (r() < amount * 0.28) out[p.key] = spec[(r() * spec.length) | 0];
		} else if (spec === 'bool') {
			if (r() < amount * 0.2) out[p.key] = !P[p.key];
		} else if (spec === 'color') {
			if (r() < 0.5) out[p.key] = jitterHex(P[p.key], r, amount);
		}
	}
	if (secs.has('colour') && r() < amount * 0.35) Object.assign(out, pal(PALETTES[(r() * PALETTES.length) | 0].name));
	return out;
}

// a jump: one section taken from a random style, the rest kept
export function crossbreed(P, sections, seed) {
	const r = rng(seed);
	const out = { ...P };
	for (const s of sections) {
		const pre = PRESETS[(r() * PRESETS.length) | 0];
		Object.assign(out, sectionPreset(pre, s));
	}
	out.seed = (r() * 1e6) | 0;
	return out;
}

export function sweepValues(key, n, P) {
	const p = BY_KEY[key];
	const spec = p.spec;
	if (Array.isArray(spec) && typeof spec[0] === 'number') {
		const [mn, mx, st] = spec;
		const out = [];
		for (let i = 0; i < n; i++) out.push(+(Math.round((mn + (mx - mn) * i / (n - 1)) / st) * st).toFixed(4));
		return [...new Set(out)];
	}
	if (Array.isArray(spec)) return spec.slice();
	if (spec === 'bool') return [false, true];
	if (spec === 'seed') return Array.from({ length: n }, (_, i) => P.seed + i + 1);
	return [P[key]];
}
