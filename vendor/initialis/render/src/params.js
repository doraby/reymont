// Every knob, grouped into the parts of an initial, with the stage it affects:
//   geo   regrow the scene (layout, ornament)
//   paint repaint the coverage canvas
//   ink   only the printing pass (instant)
// The built-in styles, palettes and variation are in styles.js.

import { NAMES } from './kinds/names.js?v=a8136959';

const SLOT = ['A', 'B', 'C', 'paper'];
const SLOTN = ['none', 'A', 'B', 'C', 'paper'];
const SLOTAUTO = ['auto', 'A', 'B', 'C', 'paper'];

export const SECTIONS = [
	{ id: 'letter', name: 'Letter' },
	{ id: 'frame', name: 'Frame' },
	{ id: 'orn', name: 'Ornament' },
	{ id: 'tex', name: 'Texture' },
	{ id: 'ink', name: 'Ink' },
	{ id: 'colour', name: 'Colour' },
];

// [key, section, stage, default, spec, label, group?, when?]
// spec: [min, max, step] for numbers, array of options for selects, 'text' | 'font' | 'color' | 'bool' | 'seed'
const S = [
	['text', 'letter', 'geo', 'A', 'text', 'letters'],
	['font', 'letter', 'geo', 'cormorant-garamond-700', 'font', 'font'],
	['size', 'letter', 'geo', 0.66, [0.2, 1.3, 0.01], 'size'],
	['dx', 'letter', 'geo', 0, [-0.35, 0.35, 0.005], 'shift x'],
	['dy', 'letter', 'geo', 0, [-0.35, 0.35, 0.005], 'shift y'],
	['lLayout', 'letter', 'geo', 'row', ['row', 'stack'], 'monogram', 'layout', P => [...P.text].length > 1],
	['tracking', 'letter', 'geo', -0.05, [-0.6, 0.4, 0.01], 'overlap', 'layout', P => [...P.text].length > 1],
	['lWeave', 'letter', 'geo', 'none', ['none', 'stack', 'weave'], 'interlace', 'layout', P => [...P.text].length > 1],
	['lWeaveGap', 'letter', 'paint', 6, [0, 30, 0.5], 'interlace gap', 'layout', P => [...P.text].length > 1 && P.lWeave !== 'none'],
	['lWeaveFlip', 'letter', 'geo', false, 'bool', 'flip crossings', 'layout', P => [...P.text].length > 1 && P.lWeave === 'weave'],
	['embolden', 'letter', 'geo', 0, [-6, 24, 0.5], 'embolden'],
	['lInflate', 'letter', 'geo', 0, [0, 40, 0.5], 'inflate'],
	// blown up the among way (blob/blob.js): strokes inflate inside the frame, pressing on its walls
	['lBlob', 'letter', 'geo', 0, [0, 6, 0.05], 'blow up', 'blow up'],
	['lBlobWeight', 'letter', 'geo', 1.3, [0.4, 3, 0.01], 'blob weight', 'blow up', P => P.lBlob > 0],
	['lBlobPart', 'letter', 'geo', 30, [0, 120, 1], 'between strokes', 'blow up', P => P.lBlob > 0],
	['lBlobCounter', 'letter', 'geo', 40, [0, 120, 1], 'counters', 'blow up', P => P.lBlob > 0],
	['lBlobFillet', 'letter', 'geo', 0.25, [0, 1, 0.01], 'fillet', 'blow up', P => P.lBlob > 0],
	['lBlobRoom', 'letter', 'geo', 30, [0, 200, 1], 'room round it', 'blow up', P => P.lBlob > 0],
	['letterGap', 'letter', 'geo', 12, [0, 80, 1], 'keep-away'],
	['lFill', 'letter', 'paint', 'paper', ['A', 'B', 'C', 'paper', 'none', 'pattern', 'split'], 'fill', 'fill'],
	['lPattern', 'letter', 'paint', 'hatch', NAMES.pattern, 'pattern', 'fill', P => P.lFill === 'pattern'],
	['lPatScale', 'letter', 'paint', 8, [2, 40, 0.5], 'spacing', 'fill', P => P.lFill === 'pattern' || P.lShadowFill === 'hatch'],
	['lPatAngle', 'letter', 'paint', 45, [0, 180, 1], 'angle', 'fill', P => P.lFill === 'pattern'],
	['lPatW', 'letter', 'paint', 1.4, [0.3, 8, 0.1], 'weight', 'fill', P => P.lFill === 'pattern'],
	['lPatColor', 'letter', 'paint', 'A', SLOT, 'pattern ink', 'fill', P => P.lFill === 'pattern'],
	['lPatBg', 'letter', 'paint', 'paper', SLOTN, 'under', 'fill', P => P.lFill === 'pattern'],
	['lSplit', 'letter', 'geo', 'wave', ['straight', 'wave', 'zigzag', 'meander'], 'split', 'fill', P => P.lFill === 'split'],
	['lSplitPos', 'letter', 'geo', 0, [-0.3, 0.3, 0.01], 'split at', 'fill', P => P.lFill === 'split'],
	['lSplitFreq', 'letter', 'geo', 3, [1, 12, 0.5], 'teeth', 'fill', P => P.lFill === 'split'],
	['lSplitGap', 'letter', 'paint', 4, [0, 16, 0.25], 'split gap', 'fill', P => P.lFill === 'split'],
	['lSplitA', 'letter', 'paint', 'B', SLOT, 'left ink', 'fill', P => P.lFill === 'split'],
	['lSplitB', 'letter', 'paint', 'C', SLOT, 'right ink', 'fill', P => P.lFill === 'split'],
	['lFil', 'letter', 'geo', 'none', ['none', 'scroll', 'leafy', 'beads'], 'filigree', 'inside'],
	['lFilScale', 'letter', 'geo', 1, [0.4, 2.5, 0.05], 'filigree scale', 'inside', P => P.lFil !== 'none'],
	['lFilInset', 'letter', 'geo', 5, [1, 30, 0.5], 'filigree inset', 'inside', P => P.lFil !== 'none'],
	['lFilColor', 'letter', 'paint', 'auto', SLOTAUTO, 'filigree ink', 'inside', P => P.lFil !== 'none'],
	['lInline', 'letter', 'paint', 0, [0, 10, 0.25], 'inline', 'lines'],
	['lInlineOff', 'letter', 'paint', 7, [1, 40, 0.5], 'inline inset', 'lines', P => P.lInline > 0],
	['lInlineColor', 'letter', 'paint', 'auto', SLOTAUTO, 'inline ink', 'lines', P => P.lInline > 0],
	['lOutline', 'letter', 'paint', 0, [0, 14, 0.25], 'outline', 'lines'],
	['lOutlineColor', 'letter', 'paint', 'A', SLOT, 'outline ink', 'lines', P => P.lOutline > 0],
	['lEcho', 'letter', 'geo', 0, [0, 5, 1], 'echoes', 'lines'],
	['lEchoGap', 'letter', 'geo', 10, [2, 40, 0.5], 'echo gap', 'lines', P => P.lEcho > 0],
	['lEchoW', 'letter', 'paint', 1.4, [0.3, 8, 0.1], 'echo weight', 'lines', P => P.lEcho > 0],
	['lEchoStyle', 'letter', 'geo', 'line', ['line', 'dots', 'dashes'], 'echo style', 'lines', P => P.lEcho > 0],
	['lEchoColor', 'letter', 'paint', 'A', SLOT, 'echo ink', 'lines', P => P.lEcho > 0],
	['lHalo', 'letter', 'geo', 0, [0, 40, 0.5], 'halo', 'halo'],
	['lHaloColor', 'letter', 'paint', 'paper', SLOTN, 'halo ink', 'halo', P => P.lHalo > 0],
	['lShadow', 'letter', 'geo', 'none', ['none', 'drop', 'extrude'], 'shadow', 'shadow'],
	['lShadowLen', 'letter', 'geo', 18, [1, 90, 0.5], 'depth', 'shadow', P => P.lShadow !== 'none'],
	['lShadowAngle', 'letter', 'geo', 45, [0, 360, 5], 'direction', 'shadow', P => P.lShadow !== 'none'],
	['lShadowFill', 'letter', 'paint', 'solid', ['solid', 'hatch', 'outline'], 'shadow fill', 'shadow', P => P.lShadow !== 'none'],
	['lShadowColor', 'letter', 'paint', 'A', SLOT, 'shadow ink', 'shadow', P => P.lShadow !== 'none'],

	['frame', 'frame', 'geo', 'rect', ['none', ...NAMES.frame], 'shape'],
	['fMargin', 'frame', 'geo', 40, [0, 200, 1], 'margin'],
	['fRules', 'frame', 'geo', 2, [0, 3, 1], 'rules', 'rules', P => P.frame !== 'none'],
	['fW1', 'frame', 'geo', 12, [0, 50, 0.5], 'outer rule', 'rules', P => P.frame !== 'none' && P.fRules > 0],
	['fGap', 'frame', 'geo', 8, [1, 60, 0.5], 'rule gap', 'rules', P => P.frame !== 'none' && P.fRules > 1],
	['fW2', 'frame', 'geo', 2.5, [0, 20, 0.25], 'inner rules', 'rules', P => P.frame !== 'none' && P.fRules > 1],
	['fRuleStyle', 'frame', 'paint', 'solid', ['solid', 'double', 'beads', 'dashed'], 'rule style', 'rules', P => P.frame !== 'none' && P.fRules > 0],
	['fRuleColor', 'frame', 'paint', 'A', SLOT, 'rule ink', 'rules', P => P.frame !== 'none' && P.fRules > 0],
	['fBand', 'frame', 'paint', 'none', ['none', ...NAMES.band], 'band', 'rules', P => P.frame !== 'none' && P.fRules > 1],
	['fBorder', 'frame', 'paint', 'none', SLOTN, 'border ink', 'ground', P => P.frame !== 'none'],
	['fField', 'frame', 'paint', 'A', SLOT, 'ground', 'ground', P => P.frame !== 'none'],
	['fPattern', 'frame', 'paint', 'none', ['none', ...NAMES.pattern], 'ground pattern', 'ground', P => P.frame !== 'none'],
	['fPatScale', 'frame', 'paint', 7, [2, 60, 0.5], 'spacing', 'ground', P => P.frame !== 'none' && P.fPattern !== 'none'],
	['fPatAngle', 'frame', 'paint', 0, [0, 180, 1], 'angle', 'ground', P => P.frame !== 'none' && P.fPattern !== 'none'],
	['fPatW', 'frame', 'paint', 1.2, [0.3, 10, 0.1], 'weight', 'ground', P => P.frame !== 'none' && P.fPattern !== 'none'],
	['fPatColor', 'frame', 'paint', 'paper', SLOT, 'pattern ink', 'ground', P => P.frame !== 'none' && P.fPattern !== 'none'],
	['fShadow', 'frame', 'paint', 0, [0, 70, 0.5], 'offset box', 'shadow', P => P.frame !== 'none'],
	['fShadowAngle', 'frame', 'paint', 45, [0, 360, 5], 'direction', 'shadow', P => P.frame !== 'none' && P.fShadow > 0],
	['fShadowStyle', 'frame', 'paint', 'line', ['line', 'solid', 'hatch'], 'box style', 'shadow', P => P.frame !== 'none' && P.fShadow > 0],
	['fShadowColor', 'frame', 'paint', 'A', SLOT, 'box ink', 'shadow', P => P.frame !== 'none' && P.fShadow > 0],
	['fCorner', 'frame', 'geo', 'none', ['none', ...NAMES.corner], 'corners', 'corners', P => P.frame !== 'none'],
	['fCornerSize', 'frame', 'geo', 22, [6, 70, 0.5], 'corner size', 'corners', P => P.frame !== 'none' && P.fCorner !== 'none'],
	['fCornerColor', 'frame', 'paint', 'auto', SLOTAUTO, 'corner ink', 'corners', P => P.frame !== 'none' && P.fCorner !== 'none'],

	['orn', 'orn', 'geo', 'grow', ['grow', 'none'], 'ornament'],
	['seed', 'orn', 'geo', 1, 'seed', 'seed', null, P => P.orn !== 'none'],
	['oRegion', 'orn', 'geo', 'field', ['field', 'halo', 'counters'], 'grows in', 'where', P => P.orn !== 'none' || P.tKind !== 'none'],
	['oHalo', 'orn', 'geo', 140, [20, 400, 1], 'reach', 'where', P => (P.orn !== 'none' || P.tKind !== 'none') && P.oRegion !== 'field'],
	['oSeeds', 'orn', 'geo', 'gaps', ['gaps', 'frame', 'corners', 'root', 'letter'], 'starts from', 'where', P => P.orn !== 'none'],
	['oSeedCount', 'orn', 'geo', 3, [0, 12, 1], 'starts', 'where', P => P.orn !== 'none'],
	['oSym', 'orn', 'geo', 'none', ['none', 'mirror'], 'symmetry', 'where', P => P.orn !== 'none'],
	['oDensity', 'orn', 'geo', 0.75, [0, 1, 0.01], 'density', 'where', P => P.orn !== 'none'],
	['oSprout', 'orn', 'geo', 0.85, [0, 1, 0.01], 'sprouting', 'where', P => P.orn !== 'none'],
	['oMargin', 'orn', 'geo', 7, [1.5, 40, 0.5], 'spacing', 'stems', P => P.orn !== 'none'],
	['oStemStyle', 'orn', 'paint', 'solid', ['solid', 'dotted', 'beaded', 'dashed', 'double', 'thorny'], 'stem drawn', 'stems', P => P.orn !== 'none'],
	['oStemW', 'orn', 'geo', 9, [0.6, 32, 0.2], 'stem width', 'stems', P => P.orn !== 'none'],
	['oTaper', 'orn', 'geo', 0.55, [0, 1, 0.01], 'taper', 'stems', P => P.orn !== 'none'],
	['oCurl', 'orn', 'geo', 0.65, [0, 1, 0.01], 'curl', 'stems', P => P.orn !== 'none'],
	['oTurns', 'orn', 'geo', 1.1, [0.2, 3, 0.05], 'turns', 'stems', P => P.orn !== 'none'],
	['oUndulate', 'orn', 'geo', 0, [0, 1, 0.01], 'undulate', 'stems', P => P.orn !== 'none'],
	['oWander', 'orn', 'geo', 0.25, [0, 1, 0.01], 'wander', 'stems', P => P.orn !== 'none'],
	['oLength', 'orn', 'geo', 1, [0.2, 3, 0.05], 'length', 'stems', P => P.orn !== 'none'],
	['oBranch', 'orn', 'geo', 0.5, [0, 1, 0.01], 'branching', 'stems', P => P.orn !== 'none'],
	['oDepth', 'orn', 'geo', 3, [0, 5, 1], 'branch depth', 'stems', P => P.orn !== 'none' && P.oBranch > 0],
	['oThin', 'orn', 'geo', 0.5, [0, 1, 0.01], 'branch thinning', 'stems', P => P.orn !== 'none'],
	['oBranchAngle', 'orn', 'geo', 40, [10, 90, 1], 'branch angle', 'stems', P => P.orn !== 'none' && P.oBranch > 0],
	['oTerminal', 'orn', 'geo', 'flower', ['curl', 'ball', 'leaf', 'flower', 'point'], 'stem ends', 'stems', P => P.orn !== 'none'],
	['oLeaf', 'orn', 'geo', 'acanthus', ['none', ...NAMES.leaf], 'leaf', 'leaves', P => P.orn !== 'none'],
	['oLeafSize', 'orn', 'geo', 1, [0.2, 3, 0.05], 'leaf size', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLeafEvery', 'orn', 'geo', 0.55, [0, 1, 0.01], 'leafiness', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLeafW', 'orn', 'geo', 0.55, [0.15, 1.2, 0.01], 'leaf width', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLobes', 'orn', 'geo', 4, [1, 9, 1], 'lobes', 'leaves', P => P.orn !== 'none' && ['acanthus', 'oak', 'ivy'].includes(P.oLeaf)],
	['oLobeDepth', 'orn', 'geo', 0.45, [0, 0.9, 0.01], 'lobe depth', 'leaves', P => P.orn !== 'none' && ['acanthus', 'oak'].includes(P.oLeaf)],
	['oSerr', 'orn', 'geo', 0, [0, 1, 0.01], 'serration', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLeafCurl', 'orn', 'geo', 0.4, [0, 1.5, 0.01], 'leaf curl', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLeafAngle', 'orn', 'geo', 45, [10, 90, 1], 'leaf angle', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oLeafSide', 'orn', 'geo', 'alt', ['alt', 'outer'], 'leaf side', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oFillLeaves', 'orn', 'geo', true, 'bool', 'leaves in gaps', 'leaves', P => P.orn !== 'none' && P.oLeaf !== 'none'],
	['oFlower', 'orn', 'geo', 'rosette', ['none', ...NAMES.flower], 'flower', 'flowers', P => P.orn !== 'none'],
	['oFlowerChance', 'orn', 'geo', 0.3, [0, 1, 0.01], 'how many', 'flowers', P => P.orn !== 'none' && P.oFlower !== 'none'],
	['oFlowerSize', 'orn', 'geo', 1, [0.3, 3, 0.05], 'flower size', 'flowers', P => P.orn !== 'none' && P.oFlower !== 'none'],
	['oPetals', 'orn', 'geo', 6, [3, 12, 1], 'petals', 'flowers', P => P.orn !== 'none' && ['rosette', 'daisy', 'star', 'burst', 'dotring'].includes(P.oFlower)],
	['oBerries', 'orn', 'geo', 0.4, [0, 1, 0.01], 'berries', 'flowers', P => P.orn !== 'none'],
	['oBerrySize', 'orn', 'geo', 1, [0.2, 3, 0.05], 'berry size', 'flowers', P => P.orn !== 'none'],
	['oDots', 'orn', 'geo', 0.5, [0, 1, 0.01], 'dots in gaps', 'flowers', P => P.orn !== 'none'],
	['oBeads', 'orn', 'geo', 0, [0, 1, 0.01], 'penwork beads', 'flowers', P => P.orn !== 'none'],
	['oFill', 'orn', 'paint', 'paper', SLOTN, 'fill', 'drawn as', P => P.orn !== 'none'],
	['oStroke', 'orn', 'paint', 'none', SLOTN, 'outline', 'drawn as', P => P.orn !== 'none'],
	['oStrokeW', 'orn', 'paint', 1.5, [0.3, 8, 0.1], 'outline weight', 'drawn as', P => P.orn !== 'none' && P.oStroke !== 'none'],
	['oDetail', 'orn', 'geo', 'veins', ['none', 'vein', 'veins', 'hatch', 'inline'], 'detail', 'drawn as', P => P.orn !== 'none'],
	['oDetailW', 'orn', 'paint', 1.6, [0, 6, 0.1], 'detail weight', 'drawn as', P => P.orn !== 'none' && P.oDetail !== 'none'],
	['oDetailColor', 'orn', 'paint', 'auto', SLOTAUTO, 'detail ink', 'drawn as', P => P.orn !== 'none' && P.oDetail !== 'none'],
	['oContrast', 'orn', 'paint', 0, [0, 1, 0.01], 'pen contrast', 'drawn as', P => P.orn !== 'none'],
	['oPenAngle', 'orn', 'paint', 35, [0, 180, 1], 'pen angle', 'drawn as', P => P.orn !== 'none' && P.oContrast > 0],

	['tKind', 'tex', 'geo', 'none', ['none', ...NAMES.texture], 'texture'],
	['tWhere', 'tex', 'geo', 'gaps', ['gaps', 'ground'], 'grows', null, P => P.tKind !== 'none'],
	['tScale', 'tex', 'geo', 9, [2, 60, 0.5], 'spacing', null, P => P.tKind !== 'none'],
	['tSize', 'tex', 'geo', 2.4, [0.3, 14, 0.1], 'size', null, P => P.tKind !== 'none'],
	['tGap', 'tex', 'geo', 4, [0, 30, 0.5], 'gap', null, P => P.tKind !== 'none'],
	['tGrade', 'tex', 'geo', 0, [-1, 1, 0.01], 'grade', null, P => ['stipple', 'fur'].includes(P.tKind)],
	['tShape', 'tex', 'geo', 'dot', ['dot', 'ring', 'cross', 'star', 'dash'], 'mark', null, P => P.tKind === 'stipple'],
	['tBubble', 'tex', 'geo', 'solid', ['solid', 'ring', 'target'], 'bubbles', null, P => P.tKind === 'bubbles'],
	['tCell', 'tex', 'geo', 'pebble', ['pebble', 'shard', 'outline'], 'cells', null, P => P.tKind === 'cells'],
	['tTruchet', 'tex', 'geo', 'arcs', ['arcs', 'diagonal', 'triangles'], 'tiles', null, P => P.tKind === 'truchet'],
	['tCoral', 'tex', 'geo', 'coral', ['coral', 'spots', 'maze', 'holes', 'worms'], 'pattern', null, P => P.tKind === 'coral'],
	['tTwist', 'tex', 'geo', 0.3, [0, 1, 0.01], 'twist', null, P => ['streams', 'fur'].includes(P.tKind) || (P.tKind === 'stipple' && P.tShape === 'dash')],
	['tColor', 'tex', 'paint', 'auto', SLOTAUTO, 'ink', null, P => P.tKind !== 'none'],

	['wobble', 'ink', 'paint', 0, [0, 14, 0.1], 'hand wobble', 'hand'],
	['wobbleScale', 'ink', 'paint', 70, [10, 400, 1], 'wobble size', 'hand', P => P.wobble > 0],
	['sketch', 'ink', 'paint', 1, [1, 3, 1], 'sketch passes', 'hand'],
	['rough', 'ink', 'ink', 0.2, [0, 2, 0.01], 'roughness', 'print'],
	['roughScale', 'ink', 'ink', 14, [3, 80, 0.5], 'rough size', 'print', P => P.rough > 0],
	['spread', 'ink', 'ink', 0, [-0.4, 0.4, 0.005], 'spread', 'print'],
	['bleed', 'ink', 'ink', 0, [0, 10, 0.1], 'squash', 'print'],
	['edge', 'ink', 'ink', 0.15, [0, 1, 0.01], 'ragged edge', 'print'],
	['edgeScale', 'ink', 'ink', 6, [1, 40, 0.5], 'edge grain', 'print', P => P.edge > 0],
	['speckle', 'ink', 'ink', 0, [0, 1, 0.01], 'speckle', 'print'],
	['dirt', 'ink', 'ink', 0, [0, 1, 0.01], 'dirt', 'print'],
	['mottle', 'ink', 'ink', 0.08, [0, 0.6, 0.01], 'mottle', 'print'],
	['grain', 'ink', 'ink', 0.4, [0, 2, 0.01], 'paper grain', 'print'],
	['misreg', 'ink', 'ink', 0, [0, 10, 0.1], 'misregister', 'print'],

	['paper', 'colour', 'ink', '#f3eee3', 'color', 'paper'],
	['inkA', 'colour', 'ink', '#1a1614', 'color', 'ink A'],
	['inkB', 'colour', 'ink', '#b3301e', 'color', 'ink B'],
	['inkC', 'colour', 'ink', '#2c4a8c', 'color', 'ink C'],
];

const row = ([key, section, stage, def, spec, label, group, when]) => ({ key, section, stage, def, spec, label, group: group || null, when: when || null });
export const PARAMS = S.map(row);
export const BY_KEY = Object.fromEntries(PARAMS.map(p => [p.key, p]));
export const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p.key, p.def]));
// settings a kind module brings with it (kinds.js register), rows as above; one already here stays
export function addParams(rows) {
	for (const r of rows) {
		if (BY_KEY[r[0]]) continue;
		const p = row(r);
		PARAMS.push(p);
		BY_KEY[p.key] = p;
		DEFAULTS[p.key] = p.def;
	}
}
