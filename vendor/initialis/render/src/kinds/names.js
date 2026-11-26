// Every kind the renderer comes with, by family, in the order the settings list them (after 'none'
// where there is one). The order matters: variation picks a kind by its place in its list, so a
// new one goes on the end. Each is a module of its own, kinds/<family>/<name>.js (kinds.js).

export const NAMES = {
	// ground and letter fills: hatch to ice lie over the shape; contour to mycelium follow it
	pattern: ['hatch', 'cross', 'waves', 'dots', 'stipple', 'checker', 'diaper', 'scales', 'rays', 'rings', 'grid',
		'seigaiha', 'asanoha', 'kikko', 'shippo', 'frets', 'ice', 'contour', 'engrave', 'halftone', 'mosaic', 'wash', 'frost', 'mycelium'],
	frame: ['rect', 'rounded', 'circle', 'arch', 'pointed', 'shield', 'lozenge', 'octagon', 'quatrefoil', 'scallop'],
	band: ['beads', 'pearls', 'dots', 'dentil', 'zigzag', 'wave', 'rope', 'checker', 'laurel'],
	corner: ['dots', 'rosettes', 'squares', 'quarter'],
	texture: ['stipple', 'bubbles', 'ripples', 'streams', 'fur', 'cells', 'truchet', 'coral'],
	leaf: ['acanthus', 'lance', 'willow', 'ovate', 'teardrop', 'oak', 'ivy', 'trefoil', 'cinquefoil', 'fern', 'dot', 'pod', 'dotted', 'comma', 'fan', 'needles', 'heart'],
	flower: ['rosette', 'daisy', 'rose', 'star', 'phyllo', 'target', 'burst', 'dotring', 'quatre', 'tulip', 'bell', 'bud', 'pomegranate', 'thistle'],
};

// the setting(s) that name a kind of each family
export const PARAMS_OF = { pattern: ['lPattern', 'fPattern'], frame: ['frame'], band: ['fBand'], corner: ['fCorner'], texture: ['tKind'], leaf: ['oLeaf'], flower: ['oFlower'] };

// patterns worked out from the shape they fill (its mask) rather than lying over it, and flowers
// that sit on the end of a stem, pointing along it. Known before their modules load, because the
// field asks of initials it hasn't drawn (does it grow in?); a module of your own says so itself
// (follows: true, head: true) and is added when it registers.
export const FOLLOWS = new Set(['contour', 'engrave', 'halftone', 'mosaic', 'wash', 'frost', 'mycelium']);
export const HEADS = new Set(['tulip', 'bell', 'bud', 'pomegranate', 'thistle']);
